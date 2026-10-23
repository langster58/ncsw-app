-- RETIRED 2026-09-20. sub_fit_envelopes / vehicle_envelopes / sub_fit_matrix were deleted in the Postgres / Directus reconciliation.
-- Car fit is not stored any more: each package carries what it needs (fit_volume_cuft, fit_face_width_in, fit_flange_in and the
-- 2 x 2 alternative) and the app compares that with the car's own trunk / cargo dimensions (carFitFilter in app/src/lib/packages.ts).
-- The rule below is the one those package figures were written from. Do not run. Backups: research/rollback/reconcile-2026-09-20/.
-- N-driver fit, envelope-keyed (2026-08-20). Replaces the vehicle_sub_fit VIEW as the
-- app's read path: 89k vehicles share only ~1,000 distinct envelopes, so fitment is
-- computed once per envelope and vehicles join through vehicle_envelopes.
--
-- Gates (GENERATOR-CONTRACT-2026-08-20):
--   sealed/ported: env_ft3 >= N x gross; baffle face tiles N flanges
--   ib: baffle only; TRUNK adds the cavity test env_ft3 >= N x 4 x Vas (per-driver rear
--       volume halves when the cavity is shared); truck/cargo = true IB, no volume test
--   N: cargo {1,2,4} · trunk {1,2, no 18s at 2} · truck {1} (shallow class not yet curated)
--   face tiling: N=1 face2>=flange · N=2 face1>=2f & face2>=f · N=4 row or 2x2 grid
-- Match packages on (sub_id, bass_alignment, sub_count, vehicle_category).

DROP TABLE IF EXISTS sub_fit_matrix;
DROP TABLE IF EXISTS vehicle_envelopes;
DROP TABLE IF EXISTS sub_fit_envelopes;

CREATE TABLE sub_fit_envelopes AS
WITH env AS (
  SELECT vehicle_id, vehicle_category,
         COALESCE(boot_width_in,  behind_seat_width_in,  under_seat_width_in)  - 1.5 AS wi,
         COALESCE(boot_height_in, behind_seat_height_in, under_seat_height_in) - 1.5 AS hi,
         COALESCE(boot_depth_in,  behind_seat_depth_in,  under_seat_depth_in)  - 1.5 AS di
  FROM vehicles
)
SELECT row_number() OVER (ORDER BY vehicle_category, wi, hi, di) AS env_key,
       vehicle_category, wi, hi, di,
       round((wi*hi*di/1728.0)::numeric, 2) AS env_ft3,
       GREATEST(wi,hi,di) AS face1,
       wi+hi+di - GREATEST(wi,hi,di) - LEAST(wi,hi,di) AS face2,
       count(*) AS n_vehicles
FROM env WHERE wi > 0 AND hi > 0 AND di > 0
GROUP BY vehicle_category, wi, hi, di;
ALTER TABLE sub_fit_envelopes ADD PRIMARY KEY (env_key);

CREATE TABLE vehicle_envelopes AS
SELECT v.vehicle_id, e.env_key
FROM vehicles v
JOIN sub_fit_envelopes e
  ON e.vehicle_category = v.vehicle_category
 AND e.wi = COALESCE(v.boot_width_in,  v.behind_seat_width_in,  v.under_seat_width_in)  - 1.5
 AND e.hi = COALESCE(v.boot_height_in, v.behind_seat_height_in, v.under_seat_height_in) - 1.5
 AND e.di = COALESCE(v.boot_depth_in,  v.behind_seat_depth_in,  v.under_seat_depth_in)  - 1.5;
ALTER TABLE vehicle_envelopes ADD PRIMARY KEY (vehicle_id);
CREATE INDEX ON vehicle_envelopes (env_key);

CREATE TABLE sub_fit_matrix AS
WITH sub AS (
  SELECT slug, driver_size, vas_l/28.3168 AS vas_ft3,
         sealed_gross_ft3, ported_gross_ft3, sealed_pick, ported_pick, ib_pick,
         CASE driver_size WHEN '10' THEN 10.9 WHEN '12' THEN 12.8
                          WHEN '15' THEN 15.8 WHEN '18' THEN 19.0 END AS flange
  FROM subwoofers
  WHERE (sealed_pick OR ported_pick OR ib_pick) AND driver_size IN ('10','12','15','18')
),
n AS (SELECT unnest(ARRAY[1,2,4]) AS sub_count)
SELECT e.env_key, e.vehicle_category, s.slug AS sub_id, a.alignment, n.sub_count
FROM sub_fit_envelopes e
CROSS JOIN sub s
CROSS JOIN n
CROSS JOIN (VALUES ('sealed'),('ported'),('ib')) a(alignment)
WHERE
  -- N availability by category (contract)
  (e.vehicle_category = 'cargo' AND n.sub_count IN (1,2,4)
   OR e.vehicle_category = 'trunk' AND n.sub_count IN (1,2)
       AND NOT (n.sub_count = 2 AND s.driver_size = '18')
   OR e.vehicle_category = 'truck' AND n.sub_count = 1)
  -- alignment availability + pick flag
  AND ( a.alignment = 'sealed' AND s.sealed_pick AND s.driver_size <> '10'
     OR a.alignment = 'ported' AND s.ported_pick AND s.driver_size <> '10'
        AND e.vehicle_category IN ('cargo','trunk')
     OR a.alignment = 'ib' AND s.ib_pick AND n.sub_count <= 2 )
  -- volume gates
  AND ( a.alignment = 'sealed' AND e.env_ft3 >= n.sub_count * s.sealed_gross_ft3
     OR a.alignment = 'ported' AND e.env_ft3 >= n.sub_count * s.ported_gross_ft3
     OR a.alignment = 'ib' AND (e.vehicle_category <> 'trunk'
                                OR e.env_ft3 >= n.sub_count * 4 * s.vas_ft3) )
  -- baffle tiling
  AND ( n.sub_count = 1 AND e.face2 >= s.flange
     OR n.sub_count = 2 AND e.face1 >= 2*s.flange AND e.face2 >= s.flange
     OR n.sub_count = 4 AND ( e.face1 >= 4*s.flange AND e.face2 >= s.flange
                           OR e.face1 >= 2*s.flange AND e.face2 >= 2*s.flange ) );
CREATE INDEX ON sub_fit_matrix (env_key);
CREATE INDEX ON sub_fit_matrix (sub_id, alignment, sub_count);
ANALYZE sub_fit_envelopes; ANALYZE vehicle_envelopes; ANALYZE sub_fit_matrix;
