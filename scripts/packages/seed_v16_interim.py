#!/usr/bin/env python3
"""Interim package seed from the v16 matrix (2026-05-18 CSV).

Pulls a browsable set of packages into the `packages` collection until the
real curation pass replaces them. Wiring rules (the durable part):

- Every component is stored as a slug FK into its product collection; the
  package holds NO price of its own as truth. `price_total`/`price_installed`
  are caches computed here from the CURRENT DB prices (never the CSV's — the
  CSV is 14 months old); `price_breakdown` records the arithmetic per line.
  Re-run `reprice_packages.py` after any product price change to cascade.
- Only rows whose every component resolves to a live DB row are eligible
  (name drift handled by a small alias map; genuinely absent products are
  skipped, never substituted).
- Fit key: `vehicle_category` uses the envelope classes (truck/trunk/cargo)
  that `vehicles.vehicle_category` already carries. A package fits every
  class whose sealed-cap (truck 1.0 / trunk 2.0 / cargo 4.0 ft3) holds its
  enclosure volume (from the resolved `sub_enclosures` row) -> one packages
  row per fitting class.
- Labor cascades from `labor_items` (base install + per-extra-amp +
  enclosure hours x rate); materials from the `materials` defaults.

Selection: v16 'Two Way' topology rows only (front-sub rows carry a price
with no product identity -> unwireable), deduped to the cheapest build per
(tier, alignment, sub size, sub count) family at current DB prices.
`ncsw_pick` flags the cheapest package per (class, tier) so the PLP's
default picks filter has content.

Usage: python3 seed_v16_interim.py [--dry-run]
"""
import csv
import json
import os
import re
import sys
import uuid

import psycopg2
import psycopg2.extras

CSV_PATH = '/Volumes/SSD 1TB/Database/data/packages/ncsw_packages_v16_2026-05-18.csv'
SEED_TAG = 'v16-interim-2026-07'
CLASS_CAPS = {'truck': 1.0, 'trunk': 2.0, 'cargo': 4.0}
CLASS_SUFFIX = {'truck': 'TRK', 'trunk': 'TRN', 'cargo': 'CGO'}

ALIAS = {
    'sub': {
        'sisql12': 'stereointegritysql12', 'sisql15': 'stereointegritysql15',
        'audiofroggb10': 'audiofroggb10d2', 'audiofroggb12': 'audiofroggb12d2',
        'jl10w6': 'jl10w6v3', 'jl12w6': 'jl12w6v3',
        'jl10w7': 'jl10w7ae', 'jl12w7': 'jl12w7ae',
    },
    'dsp': {'helixdspmini': 'helixdspminimk2'},
    'set': {'sim22tm65': 'stereointegritym22tm65'},
}


def norm(s):
    s = s.lower().replace('v.', 'v').replace(' audio', '').replace('car ', '')
    return re.sub(r'[^a-z0-9]', '', s)


def main():
    dry = '--dry-run' in sys.argv
    conn = psycopg2.connect(os.environ['DATABASE_URL'])
    cur = conn.cursor()

    def catalog(table):
        cur.execute(f"select slug, brand, model, price from {table}")
        out = {}
        for slug, brand, model, price in cur.fetchall():
            out[norm(f'{brand} {model}')] = (slug, f'{brand} {model}', float(price) if price is not None else None)
        return out

    cat = {
        'sub': catalog('subwoofers'),
        'mono': catalog('mono_amps'),
        'multi': catalog('multichannel_amps'),
        'dsp': catalog('dsp_processors'),
        'set': catalog('component_sets'),
    }

    def resolve(kind, name):
        key = norm(name)
        key = ALIAS.get(kind, {}).get(key, key)
        hit = cat[kind].get(key)
        return hit if hit and hit[2] is not None else None

    # DSP price: dsp_processors has no price column in some revisions; fall back
    cur.execute("select column_name from information_schema.columns where table_name='dsp_processors' and column_name='price'")
    if not cur.fetchone():
        cur.execute("select slug, brand, model from dsp_processors")
        cat['dsp'] = {norm(f'{b} {m}'): (s, f'{b} {m}', None) for s, b, m in cur.fetchall()}

    # enclosures: prefer prefab for sealed (entry pricing), fab otherwise
    cur.execute("select slug, type, size, driver_count, volume_cuft, coalesce(price,0) from sub_enclosures where slug not like 'zen-%'")
    enc_rows = {}
    for slug, etype, size, count, vol, price in cur.fetchall():
        enc_rows[(etype, str(size), int(count), slug.endswith('-prefab'))] = (slug, float(vol or 0), float(price))

    def enclosure(alignment, size, count):
        for prefab in ((True, False) if alignment == 'sealed' else (False,)):
            hit = enc_rows.get((alignment, size, count, prefab))
            if hit:
                return hit
        return None

    # One flat installation fee — no per-amp adder.
    cur.execute("select total_cost from labor_items where slug='labor-base-install'")
    base_labor = float(cur.fetchone()[0])
    # Standard install-materials kit: explicit quantities over DB unit costs so
    # material price changes cascade like everything else. Quantities are the
    # interim standard-install assumption; edit here, re-run to reprice.
    KIT = [('mat-4awg-ofc-power', 20), ('mat-16awg-ofc-speaker', 60),
           ('mat-d4s-rca-4ch-20ft', 1), ('mat-anl-fuse-holder', 1),
           ('mat-distribution-block', 1)]
    kit_lines = []
    default_materials = 0.0
    for slug, qty in KIT:
        cur.execute("select line_item, unit_cost from materials where slug=%s", (slug,))
        line_item, unit_cost = cur.fetchone()
        kit_lines.append({'collection': 'materials', 'slug': slug, 'name': line_item,
                          'qty': qty, 'unit': float(unit_cost)})
        default_materials += float(unit_cost) * qty

    # ---- pull candidate rows: fully-resolvable Two Way builds -----------------
    families = {}  # (tier, alignment, size, count) -> cheapest candidate
    for r in csv.DictReader(open(CSV_PATH)):
        if r['topology'] != 'Two Way' or r['front_sub_included'] == 'Yes':
            continue
        m = re.match(r'(\d)x(\d+) (Single|Dual) (Sealed|Ported)', f"{r['sub_count']}x{r['sub_size']} {r['enclosure_config']}")
        if not m:
            continue
        count, size, alignment = int(r['sub_count']), r['sub_size'], m.group(4).lower()
        sub = resolve('sub', f"{r['sub_brand']} {r['sub_model']}")
        mono = resolve('mono', f"{r['amp_mono_brand']} {r['amp_mono_model']}")
        multi = resolve('multi', f"{r['amp_front_brand']} {r['amp_front_model']}")
        dsp = resolve('dsp', f"{r['dsp_brand']} {r['dsp_model']}")
        fstage = resolve('set', f"{r['front_stage_brand']} {r['front_stage_model']}")
        enc = enclosure(alignment, size, count)
        if not all([sub, mono, multi, dsp, fstage, enc]):
            continue
        mono_count = int(r['amp_mono_count'] or 1)
        parts = (sub[2] * count + mono[2] * mono_count + multi[2]
                 + (dsp[2] or 0) + fstage[2] + enc[2])
        key = (r['front_stage_tier'], alignment, size, count)
        if key not in families or parts < families[key]['parts']:
            families[key] = dict(row=r, sub=sub, mono=mono, multi=multi, dsp=dsp,
                                 fstage=fstage, enc=enc, parts=parts,
                                 mono_count=mono_count, alignment=alignment,
                                 size=size, count=count)

    print(f'families selected: {len(families)}')

    # ---- expand to (family x fitting class) rows ------------------------------
    inserts = []
    for (tier, alignment, size, count), f in sorted(families.items()):
        enc_slug, enc_vol, enc_price = f['enc']
        # One flat installation fee covers the whole install. The enclosure is a
        # separately-priced item (box price today; TBD for custom).
        labor = base_labor
        parts = f['parts']
        installed = parts + labor + default_materials
        breakdown = {
            'components': [
                {'collection': 'subwoofers', 'slug': f['sub'][0], 'name': f['sub'][1], 'qty': count, 'unit': f['sub'][2]},
                {'collection': 'mono_amps', 'slug': f['mono'][0], 'name': f['mono'][1], 'qty': f['mono_count'], 'unit': f['mono'][2]},
                {'collection': 'multichannel_amps', 'slug': f['multi'][0], 'name': f['multi'][1], 'qty': 1, 'unit': f['multi'][2]},
                {'collection': 'dsp_processors', 'slug': f['dsp'][0], 'name': f['dsp'][1], 'qty': 1, 'unit': f['dsp'][2] or 0},
                {'collection': 'component_sets', 'slug': f['fstage'][0], 'name': f['fstage'][1], 'qty': 1, 'unit': f['fstage'][2]},
                {'collection': 'sub_enclosures', 'slug': enc_slug, 'qty': 1, 'unit': enc_price},
            ],
            'labor': {'base': base_labor},
            'materials_kit': kit_lines,
            'materials_total': round(default_materials, 2),
            'priced_at': 'seed',
        }
        cfg = f"{count}×{size}"
        display = f"{tier} Two-Way · {cfg} {alignment.capitalize()}"
        summary = (f"{f['sub'][1]}{' x2' if count == 2 else ''} in a {alignment} enclosure · "
                   f"{f['fstage'][1]} front stage · {f['dsp'][1]}")
        for cls, cap in CLASS_CAPS.items():
            if enc_vol > cap:
                continue
            inserts.append(dict(
                id=str(uuid.uuid4()),
                # alignment letter keeps SKUs unique: sealed and ported families
                # can select v16 rows sharing one system_id
                sku=f"{f['row']['system_id']}-{alignment[0].upper()}-{CLASS_SUFFIX[cls]}",
                vehicle_category=cls,
                sub_id=f['sub'][0], sub_count=count, sub_enclosure_id=enc_slug,
                mono_amp_id=f['mono'][0], multichannel_amp_id=f['multi'][0],
                dsp_id=f['dsp'][0], component_set_id=f['fstage'][0],
                set_collection='component_sets',
                display_name=display, topology='2-way', bass_alignment=alignment,
                summary=summary, price_total=round(parts, 2),
                price_installed=round(installed, 2),
                price_breakdown=json.dumps(breakdown), seed_source=SEED_TAG,
                tier=tier,
            ))

    # ncsw_pick: cheapest per (class, tier)
    best = {}
    for i, row in enumerate(inserts):
        key = (row['vehicle_category'], row['tier'])
        if key not in best or row['price_installed'] < inserts[best[key]]['price_installed']:
            best[key] = i
    for i in best.values():
        inserts[i]['ncsw_pick'] = True

    n_picks = sum(1 for r in inserts if r.get('ncsw_pick'))
    print(f'package rows to insert: {len(inserts)} ({n_picks} ncsw_pick)')
    for cls in CLASS_CAPS:
        n = sum(1 for r in inserts if r['vehicle_category'] == cls)
        print(f'  {cls}: {n}')
    if dry:
        for r in inserts[:6]:
            print(' ', r['sku'], r['display_name'], r['price_total'], '->', r['price_installed'], r['vehicle_category'], 'pick' if r.get('ncsw_pick') else '')
        return

    cur.execute("delete from packages where seed_source = %s", (SEED_TAG,))
    cols = ['id', 'sku', 'vehicle_category', 'sub_id', 'sub_count', 'sub_enclosure_id',
            'mono_amp_id', 'multichannel_amp_id', 'dsp_id', 'component_set_id',
            'set_collection', 'display_name', 'topology', 'bass_alignment', 'summary',
            'price_total', 'price_installed', 'price_breakdown', 'seed_source', 'ncsw_pick']
    psycopg2.extras.execute_values(
        cur,
        f"insert into packages ({','.join(cols)}) values %s",
        [[r.get(c, False if c == 'ncsw_pick' else None) for c in cols] for r in inserts],
    )
    conn.commit()
    cur.execute("select count(*) from packages")
    print('packages table now:', cur.fetchone()[0])


if __name__ == '__main__':
    main()
