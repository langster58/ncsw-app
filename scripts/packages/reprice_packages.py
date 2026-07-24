#!/usr/bin/env python3
"""Reprice every package row from CURRENT product prices — the cascade.

Run after any price change in subwoofers / amps / DSPs / component sets /
sub_enclosures / labor_items / materials. Each package's price_breakdown
holds the line structure (collection + slug + qty); this script refreshes
every line's unit cost from its collection, recomputes labor from
labor_items, and rewrites price_total / price_installed / price_breakdown.
Packages hold no price truth of their own.

Usage: python3 reprice_packages.py [--dry-run]
"""
import json
import os
import sys

import psycopg2

PRICE_COL = {
    'subwoofers': 'price', 'mono_amps': 'price', 'multichannel_amps': 'price',
    'component_sets': 'price', 'two_way_component_sets': 'price',
    'materials': 'unit_cost',
}


def main():
    dry = '--dry-run' in sys.argv
    conn = psycopg2.connect(os.environ['DATABASE_URL'])
    cur = conn.cursor()

    def unit_price(collection, slug):
        if collection == 'dsp_processors':
            cur.execute("select column_name from information_schema.columns where table_name='dsp_processors' and column_name='price'")
            if not cur.fetchone():
                return 0.0
        col = PRICE_COL.get(collection, 'price')
        cur.execute(f"select {col} from {collection} where slug=%s", (slug,))
        row = cur.fetchone()
        return float(row[0]) if row and row[0] is not None else None

    def enclosure_price(slug):
        # Separate-item price for the enclosure (box price today; TBD/0 for custom
        # until priced). labor_hours is a build estimate, not customer price.
        cur.execute("select coalesce(materials_cost,0) from sub_enclosures where slug=%s", (slug,))
        row = cur.fetchone()
        return float(row[0]) if row else 0.0

    cur.execute("select total_cost from labor_items where slug='labor-base-install'")
    base_labor = float(cur.fetchone()[0])
    cur.execute("select total_cost from labor_items where slug='labor-extra-amp-install'")
    extra_amp_labor = float(cur.fetchone()[0])

    cur.execute("select id, sku, price_installed, price_breakdown from packages where price_breakdown is not null")
    changed = 0
    for pid, sku, old_installed, bd in cur.fetchall():
        if isinstance(bd, str):
            bd = json.loads(bd)
        parts = 0.0
        n_amps = 0
        for line in bd['components']:
            if line['collection'] == 'sub_enclosures':
                # Enclosure is a separately-priced item; installation is a flat
                # fee, so enclosure fabrication is NOT hourly labor. Line carries
                # the enclosure's own price (box price where set; 0/TBD for custom
                # until the enclosure collections are priced).
                line['unit'] = enclosure_price(line['slug'])
                parts += line['unit']
                continue
            p = unit_price(line['collection'], line['slug'])
            if p is None:
                print(f'!! {sku}: {line["collection"]}/{line["slug"]} missing — skipped row')
                parts = None
                break
            line['unit'] = p
            parts += p * line.get('qty', 1)
            if line['collection'] in ('mono_amps', 'multichannel_amps'):
                n_amps += line.get('qty', 1)
        if parts is None:
            continue
        materials = 0.0
        for line in bd.get('materials_kit', []):
            p = unit_price('materials', line['slug'])
            if p is not None:
                line['unit'] = p
                materials += p * line.get('qty', 1)
        labor = base_labor + extra_amp_labor * max(0, n_amps - 1)
        bd['labor'] = {'base': base_labor, 'extra_amps': extra_amp_labor * max(0, n_amps - 1)}
        bd['materials_total'] = round(materials, 2)
        bd['priced_at'] = 'reprice'
        installed = round(parts + labor + materials, 2)
        if old_installed is None or abs(float(old_installed) - installed) >= 0.01:
            changed += 1
            if not dry:
                cur.execute(
                    "update packages set price_total=%s, price_installed=%s, price_breakdown=%s where id=%s",
                    (round(parts, 2), installed, json.dumps(bd), pid))
            else:
                print(f'{sku}: {old_installed} -> {installed}')
    if not dry:
        conn.commit()
    print(f'{"would update" if dry else "updated"} {changed} package rows')


if __name__ == '__main__':
    main()
