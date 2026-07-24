#!/usr/bin/env python3
"""Founder-settled enclosure prices (2026-07-24) into sub_enclosures.price.

Buckets (customer-facing) -> the DB type/construction rows they cover:
  Sealed (prefab)  = found box prices, LEFT AS-IS (sealed/prefab, under-seat-sealed/prefab)
  Custom Sealed    = $250  (fabricated sealed, incl. inverted, trunk baffle, pass-through)
  Ported (custom)  = $350  (fabricated ported, incl. inverted)
  Trunk IB         = $300  (true-ib)

NOT priced here (premium finishes / distinct install types the founder has not
priced yet — Integrated/Stealth presentation deltas, truck under-seat ported):
  sealed/custom-fiberglass, ported/custom-fiberglass, stealth/*, under-seat-pr.
Left NULL so they surface as $0/TBD, never a guessed number.

Idempotent; safe to re-run.
"""
import os
import psycopg2

CUSTOM_SEALED = 250.0
CUSTOM_PORTED = 350.0
TRUNK_IB = 300.0

# (type, construction) -> price. prefab rows omitted (keep found prices).
PRICING = {
    ("sealed", "fabricated"): CUSTOM_SEALED,
    ("sealed-inverted", "fabricated"): CUSTOM_SEALED,
    ("trunk-baffle", "fabricated"): CUSTOM_SEALED,
    ("trunk-baffle-inverted", "fabricated"): CUSTOM_SEALED,
    ("pass-through", "custom-to-vehicle"): CUSTOM_SEALED,
    ("ported", "fabricated"): CUSTOM_PORTED,
    ("ported-inverted", "fabricated"): CUSTOM_PORTED,
    ("true-ib", "custom-to-vehicle"): TRUNK_IB,
}


def main():
    env = {}
    for line in open(os.path.expanduser("~/.config/directus-render.env")):
        if "=" in line:
            k, v = line.split("=", 1)
            env[k.strip()] = v.strip()
    conn = psycopg2.connect(env["DATABASE_URL"]); cur = conn.cursor()

    total = 0
    for (etype, constr), price in PRICING.items():
        cur.execute("update sub_enclosures set price=%s where type=%s and construction=%s",
                    (price, etype, constr))
        total += cur.rowcount
        print(f"  {etype}/{constr}: {cur.rowcount} rows -> ${price:.0f}")
    conn.commit()
    print(f"priced {total} enclosure rows")

    cur.execute("""select type, construction, count(*) from sub_enclosures
        where slug not like 'zen-%' and price is null group by type, construction order by 1""")
    left = cur.fetchall()
    if left:
        print("\nstill unpriced (TBD — premium finishes / distinct types):")
        for t, c, n in left:
            print(f"  {t}/{c}: {n}")


if __name__ == "__main__":
    main()
