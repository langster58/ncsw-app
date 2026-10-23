#!/usr/bin/env python3
"""Factory-retained packages: the factory front speakers stay, NCSW adds the
front sub, substage, amplification, DSP and tune.

Who gets them: only a car whose configured factory sound system has
factory_audio_systems.keep_factory_drivers = true (a separate factory amplifier
powers the front speakers - Brett's line, 2026-10-22). The site reads that flag
through vehicle_audio_options.factory_audio_system and shows these rows only
then (src/lib/packages.ts).

What they are: one rung per existing 'two-way+front-sub' rung - the same sub
stage, enclosure, fit figures, front sub, amplifiers and DSP - with the
component set removed. The two-way + front sub build is the one whose job the
factory woofer and tweeter take over; the front sub still bridges 80-100 Hz,
and the factory drivers are high-passed above it, so the amplifier and DSP
choices carry over unchanged. Price = the source build minus the component set.
Value and branded builds only - no reference build for this front stage (Brett,
2026-10-22). Run after apply_value_dsp.py so value rows carry the budget DSP.

Idempotent: deletes this seed's rows, then rewrites them from the current
two-way+front-sub rows. Re-run after the two-way+front-sub rows change.

Usage: scripts/directus-api.sh run python3 scripts/packages/gen_factory_retained_packages.py [--dry-run]
"""
import copy
import os
import sys
import uuid

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
import directus_client as dc  # noqa: E402

SEED = 'gen-factory-retained-2026-10'
SRC_TOPOLOGY = 'two-way+front-sub'
TOPOLOGY = 'factory+front-sub'
SET_COLLECTION = 'factory'
TIERS = ('value', 'branded')


def all_items(collection, params):
    out, page = [], 1
    while True:
        p = dict(params, limit=1000, page=page)
        rows = dc.get(f'/items/{collection}', p).get('data', [])
        out += rows
        if len(rows) < 1000:
            return out
        page += 1


def set_prices(rows):
    """Price of each referenced front set, read from its own collection."""
    want = {}
    for r in rows:
        if r.get('component_set_id'):
            want.setdefault(r.get('set_collection') or 'component_sets', set()).add(r['component_set_id'])
    prices = {}
    for coll, slugs in want.items():
        slugs = sorted(slugs)
        for i in range(0, len(slugs), 100):
            got = dc.get(f'/items/{coll}', {'filter[slug][_in]': ','.join(slugs[i:i + 100]),
                                            'fields': 'slug,price', 'limit': 100}).get('data', [])
            for g in got:
                prices[(coll, g['slug'])] = float(g['price'] or 0)
    return prices


def retained(src, prices):
    r = copy.deepcopy(src)
    coll = src.get('set_collection') or 'component_sets'
    bd = r.get('price_breakdown') or {}
    set_cost = None
    comps = bd.get('components')
    if comps:
        keep = []
        for c in comps:
            if c.get('collection') == coll and c.get('slug') == src['component_set_id']:
                set_cost = float(c.get('unit') or 0) * float(c.get('qty') or 1)
            else:
                keep.append(c)
        bd['components'] = keep
    if set_cost is None:
        set_cost = prices.get((coll, src['component_set_id']))
    if set_cost is None:
        return None
    if 'front' in bd:
        bd['front'] = round(float(bd['front']) - set_cost, 2)
    for k in ('front_set_slug', 'front_set_name'):
        bd.pop(k, None)
    bd['front_set_collection'] = SET_COLLECTION
    bd['front_stage'] = 'factory front speakers kept, high-passed above the front sub'
    bd['retained_from_sku'] = src['sku']
    r.update({
        'id': str(uuid.uuid4()),
        'component_set_id': None,
        'set_collection': SET_COLLECTION,
        'topology': TOPOLOGY,
        'sku': src['sku'].replace(f'|{SRC_TOPOLOGY}|', f'|{TOPOLOGY}|'),
        'rung_key': (src.get('rung_key') or '').replace(f'|{SRC_TOPOLOGY}|', f'|{TOPOLOGY}|') or None,
        'summary': ((src.get('summary') or '') + ' · factory front speakers kept').lstrip(' ·'),
        'price_total': round(float(src['price_total']) - set_cost, 2),
        'price_installed': round(float(src['price_installed']) - set_cost, 2),
        'price_breakdown': bd,
        'seed_source': SEED,
        'ncsw_pick': False,
        'dash_driver_integration_id': None,
        'fit_dash_class': None,
    })
    return r


def main():
    dry = '--dry-run' in sys.argv
    src = all_items('packages', {'filter[topology][_eq]': SRC_TOPOLOGY})
    prices = set_prices(src)
    out, skipped, seen = [], 0, set()
    for s in src:
        if s.get('tier') not in TIERS:
            skipped += 1
            continue
        r = retained(s, prices)
        if r is None or r['sku'] in seen:
            skipped += 1
            continue
        seen.add(r['sku'])
        out.append(r)
    print(f'{len(src)} two-way+front-sub rows -> {len(out)} factory-retained rows ({skipped} skipped)')
    if dry:
        print(out[0]['sku'], out[0]['price_total'], out[0]['price_installed'])
        return
    old = all_items('packages', {'filter[seed_source][_eq]': SEED, 'fields': 'id'})
    for i in range(0, len(old), 200):
        dc.request('DELETE', '/items/packages', data=[o['id'] for o in old[i:i + 200]])
    print(f'removed {len(old)} earlier rows of this seed')
    for i in range(0, len(out), 200):
        dc.post('/items/packages', out[i:i + 200])
    print(f'wrote {len(out)} rows')


if __name__ == '__main__':
    main()
