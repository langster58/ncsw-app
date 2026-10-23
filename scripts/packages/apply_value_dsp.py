#!/usr/bin/env python3
"""Value builds take the budget DSP lane (Best Balance BTS880, $69), matching the
budget 'default' amp lane they already use; branded keeps the Zapco HB 46 II and
reference the Helix (research/scripts/analysis/gen_packages_write.py DSPS).
Swaps the DSP on every value-tier package that still carries another DSP and
moves its price by the difference. Writes through Directus, 100 rows per call.

Usage: scripts/directus-api.sh run python3 scripts/packages/apply_value_dsp.py [--dry-run]
"""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
import directus_client as dc  # noqa: E402

NEW = 'best-balance-bts880'


def price(slug):
    return float(dc.get(f'/items/dsp_processors/{slug}', {'fields': 'price'})['data']['price'])


def fetch(params, timeout=180):
    import json
    import time
    import urllib.parse
    import urllib.request
    url = f"{dc.BASE_URL}/items/packages?{urllib.parse.urlencode(params)}"
    for attempt in range(6):
        try:
            req = urllib.request.Request(url, headers=dc.HEADERS)
            with urllib.request.urlopen(req, timeout=timeout) as r:
                return json.loads(r.read())['data']
        except Exception as e:  # Render free tier: slow, sometimes drops
            print(f'retry {attempt + 1}: {e}', flush=True)
            time.sleep(5 * (attempt + 1))
    raise SystemExit('Directus kept timing out')


def main():
    dry = '--dry-run' in sys.argv
    new_p = price(NEW)
    old_prices = {}
    last, done = '', 0
    while True:
        params = {'filter[tier][_eq]': 'value', 'filter[dsp_id][_neq]': NEW, 'sort': 'id', 'limit': 200,
                  'fields': 'id,dsp_id,price_total,price_installed,price_breakdown'}
        # moved rows leave the filter, so the first page is always the next batch
        rows = fetch(params)
        if not rows:
            break
        if rows[-1]['id'] == last:
            raise SystemExit('a batch did not move - stopping')
        last = rows[-1]['id']
        patches = []
        for r in rows:
            old = r['dsp_id']
            if old not in old_prices:
                old_prices[old] = price(old) if old else 0.0
            bd = r.get('price_breakdown') or {}
            delta = new_p - float(bd.get('dsp', old_prices[old]))
            bd['dsp'] = new_p
            for c in bd.get('components') or []:
                if c.get('collection') == 'dsp_processors':
                    c['slug'], c['unit'] = NEW, new_p
            patches.append({'id': r['id'], 'dsp_id': NEW, 'price_breakdown': bd,
                            'price_total': round(float(r['price_total']) + delta, 2),
                            'price_installed': round(float(r['price_installed']) + delta, 2)})
        if dry:
            print(f'would move {len(patches)} rows, e.g. {patches[0]["id"]} ->', patches[0]['price_total'])
            return
        for i in range(0, len(patches), 100):
            dc.patch('/items/packages', patches[i:i + 100])
        done += len(patches)
        if done % 5000 < 200:
            print('moved', done, flush=True)
    print(f'done: {done} value rows now on {NEW} (${new_p:g})')


if __name__ == '__main__':
    main()
