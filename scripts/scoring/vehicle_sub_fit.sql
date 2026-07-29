-- vehicle_sub_fit — the PLP fit engine (founder-settled practices, 2026-07-28)
--
-- One row per (vehicle, subwoofer, alignment) that physically FITS. This is a
-- SCREEN, not enclosure design (the real box is designed in the bay): every
-- driver carries its own design box (sealed argmax / ported -1 dB knee, stored
-- by scripts/scoring/score.py), and a vehicle simply does or does not hold it.
--
-- Envelope: W x H x D per vehicle (boot for trunk/cargo; the truck's single
-- build location), derated 1.5" per axis for 3/4" walls. Tests:
--   volume  envelope ft3 >= gross ft3 (net design box + driver + port bore)
--   face    2nd-largest internal dim >= driver flange (driver claims a face)
--   port    run guaranteed by practice: n x 4" aeros <= 40" straight along the
--           boot width in cargo, elbowed to the baffle face in trunks
-- Availability matrix (founder): cargo = sealed/ported/stealth/true-IB;
-- trunk = sealed/ported/trunk-IB; truck = sealed/IB (ported DEFERRED).
-- Stealth = spare-tire well fiberglass, cargo only, ~6.5 ft3, no dim test.
-- Catalog rules: sealed/ported/stealth offer 12"+; IB offers 10"+; no 8s/21s.
--
-- Size-class constants mirror instrument.py DRIVER_FLANGE_IN (screening only).
-- Register in Directus as a read-only collection, or query via psql.

CREATE OR REPLACE VIEW vehicle_sub_fit AS
WITH env AS (
  SELECT vehicle_id, vehicle_category,
         COALESCE(boot_width_in,  behind_seat_width_in,  under_seat_width_in)  - 1.5 AS wi,
         COALESCE(boot_height_in, behind_seat_height_in, under_seat_height_in) - 1.5 AS hi,
         COALESCE(boot_depth_in,  behind_seat_depth_in,  under_seat_depth_in)  - 1.5 AS di
  FROM vehicles
),
dims AS (
  SELECT vehicle_id, vehicle_category, wi, hi, di,
         wi * hi * di / 1728.0                                        AS env_ft3,
         wi + hi + di - GREATEST(wi, hi, di) - LEAST(wi, hi, di)      AS face2_in
  FROM env
  WHERE wi > 0 AND hi > 0 AND di > 0
),
sub AS (
  SELECT slug, brand, model, driver_size, price,
         impact_score, sealed_design_vb_ft3, sealed_gross_ft3,
         ported_score, ported_design_vb_ft3, ported_gross_ft3,
         ib_composite,
         CASE driver_size WHEN '6.5' THEN 7.2  WHEN '8'  THEN 8.7
                          WHEN '10'  THEN 10.9 WHEN '12' THEN 12.8
                          WHEN '13.5' THEN 14.2 WHEN '15' THEN 15.8
                          WHEN '18'  THEN 19.0 WHEN '21' THEN 22.0
                          ELSE 13.0 END AS flange_in
  FROM subwoofers
  WHERE driver_size NOT IN ('8', '21')
)

-- sealed: dimension-limited box, all categories
SELECT d.vehicle_id, d.vehicle_category, s.slug, s.brand, s.model, s.driver_size,
       s.price, 'sealed'::text AS alignment, s.impact_score AS score,
       s.sealed_design_vb_ft3 AS design_vb_ft3, s.sealed_gross_ft3 AS gross_ft3
FROM dims d CROSS JOIN sub s
WHERE s.driver_size NOT IN ('6.5', '10')
  AND s.impact_score IS NOT NULL
  AND d.env_ft3  >= s.sealed_gross_ft3
  AND d.face2_in >= s.flange_in

UNION ALL
-- ported: knee build, cargo + trunk (trucks deferred 2026-07-28)
SELECT d.vehicle_id, d.vehicle_category, s.slug, s.brand, s.model, s.driver_size,
       s.price, 'ported', s.ported_score,
       s.ported_design_vb_ft3, s.ported_gross_ft3
FROM dims d CROSS JOIN sub s
WHERE d.vehicle_category IN ('cargo', 'trunk')
  AND s.driver_size NOT IN ('6.5', '10')
  AND s.ported_score IS NOT NULL
  AND d.env_ft3  >= s.ported_gross_ft3
  AND d.face2_in >= s.flange_in

UNION ALL
-- stealth (spare-tire well, cargo only): ~6.5 ft3 fiberglass, no dim test
SELECT d.vehicle_id, d.vehicle_category, s.slug, s.brand, s.model, s.driver_size,
       s.price,
       CASE a.n WHEN 1 THEN 'stealth_sealed' ELSE 'stealth_ported' END,
       CASE a.n WHEN 1 THEN s.impact_score ELSE s.ported_score END,
       CASE a.n WHEN 1 THEN s.sealed_design_vb_ft3 ELSE s.ported_design_vb_ft3 END,
       CASE a.n WHEN 1 THEN s.sealed_gross_ft3 ELSE s.ported_gross_ft3 END
FROM dims d CROSS JOIN sub s CROSS JOIN (VALUES (1), (2)) a(n)
WHERE d.vehicle_category = 'cargo'
  AND s.driver_size NOT IN ('6.5', '10')
  AND CASE a.n WHEN 1 THEN s.impact_score ELSE s.ported_score END IS NOT NULL
  AND CASE a.n WHEN 1 THEN s.sealed_gross_ft3 ELSE s.ported_gross_ft3 END <= 6.5

UNION ALL
-- IB: baffle-mount only, no volume test. trunk = trunk-IB (rear deck /
-- seatback); cargo + truck = true IB. 10"+ allowed here.
SELECT d.vehicle_id, d.vehicle_category, s.slug, s.brand, s.model, s.driver_size,
       s.price,
       CASE d.vehicle_category WHEN 'trunk' THEN 'trunk_ib' ELSE 'ib' END,
       s.ib_composite, NULL::real, NULL::real
FROM dims d CROSS JOIN sub s
WHERE s.driver_size <> '6.5'
  AND s.ib_composite IS NOT NULL
  AND d.face2_in >= s.flange_in;
