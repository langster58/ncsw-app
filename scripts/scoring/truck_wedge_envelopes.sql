-- RETIRED 2026-09-20. truck_wedge_envelopes / vehicle_wedge_envelopes / truck_wedge_fit were deleted in the Postgres / Directus
-- reconciliation; the vehicles rows carry the under-seat space themselves. Do not run. Backups: research/rollback/reconcile-2026-09-20/.
-- Truck under-seat WEDGE envelopes (2026-08-21). Pure geometry — no driver opinion.
--
-- Model (GENERATOR-CONTRACT, "UNDER-SEAT TRUCKS — envelope model + pricing"):
--   FH_out = under_seat_height + 3.5 (seat lift)   RH_out = FH_out - 3 (taper)
--   walls 0.75 -> internal dims lose 1.5 per axis
--   internal ft3 = Wi * Di * (FHi + RHi) / 2 / 1728
--   net ported = internal * 0.85 (bracing + slot port)   net sealed = internal * 0.93
--   per-driver share = (net - N * driver_disp) / N
--   front-face mount: flange <= FH_out + 2.0 (vendor overhang)   N * flange <= W_out (single row)
--     BOTH flange checks use the OUTSIDE face. Corrected 2026-08-24 (Brett): the width test
--     used Wi, i.e. the face minus 1.5in of side wall. Flanges sit on the baffle and the side
--     walls sit behind it — only the CUTOUT has to clear the cavity. Wi/Di/FHi/RHi remain
--     correct for the VOLUME math, which is the only thing they are for.
-- Validated against CustomLows builds: F-150 crew -> FH 11.75 / 2.74 net (their quad-8 = 2.68);
-- GM crew -> FH 10.94 / 2.76 (their box FH 11 at 2.5" lift).
--
-- Crew/double cabs only: extended-cab under_seat_* rows are jump-seat geometry and unverified.
--
-- 2026-08-24: the envelope key now carries the MOUNTING DEPTH CAP as well as the geometry.
-- Caps were mixed inside a single geometric envelope (wedge_key 27 spanned 3.5-6.5in stock
-- across 2,138 trucks), so one key could not answer "does this driver physically mount".
-- mount_depth_effective_in is what the fit pass gates on. This table is the LIFTED lane
-- (the model already adds a seat lift), and we fabricate the riser ourselves, so:
--   stock cap + 2.0 (the riser we price at $265), OR a recorded lifted cap if it is higher
--   -> else the recorded lifted cap alone -> else geometry (fhi - 1.0), flagged 'geometry'.
-- Why stock+2.0 rather than the recorded lifted figure: vendor "optional mounting depth"
-- numbers describe THEIR box construction, not the cavity. A 2in riser lifts the cushion
-- 2in, which adds ~2in of usable depth. Checked on the GM K2XX: cavity is ~10.25in (their
-- 9.75in box plus clearance), +2in riser = 12.25in, less 0.75 top ply, 0.75 bottom ply and
-- ~1in cone-to-floor clearance leaves ~9.25in. So stock+2.0 = 8.5 is conservative, and the
-- vendor's 7.25in "optional" figure was under-claiming the cavity.

DROP TABLE IF EXISTS vehicle_wedge_envelopes;
DROP TABLE IF EXISTS truck_wedge_fit;
DROP TABLE IF EXISTS truck_wedge_envelopes;

CREATE TABLE truck_wedge_envelopes AS
WITH w AS (
  SELECT under_seat_width_in  AS w_out,
         under_seat_depth_in  AS d_out,
         under_seat_height_in + 3.5 AS fh_out,
         under_seat_height_in + 0.5 AS rh_out,
         under_seat_width_in - 1.5  AS wi,
         under_seat_depth_in - 1.5  AS di,
         under_seat_height_in + 2.0 AS fhi,
         under_seat_height_in - 1.0 AS rhi,
         coalesce(greatest(under_seat_mount_depth_in + 2.0,
                           under_seat_mount_depth_lifted_in),
                  under_seat_mount_depth_lifted_in,
                  under_seat_height_in + 1.0) AS mount_depth_effective_in,
         CASE WHEN under_seat_mount_depth_in IS NOT NULL        THEN 'stock-plus-riser'
              WHEN under_seat_mount_depth_lifted_in IS NOT NULL THEN 'lifted-sourced'
              ELSE 'geometry' END AS depth_basis,
         min(under_seat_mount_depth_in)        AS mount_depth_stock_in,
         min(under_seat_mount_depth_lifted_in) AS mount_depth_lifted_in,
         count(*) AS n_vehicles
  FROM vehicles
  WHERE vehicle_category = 'truck'
    AND cab_type IN ('crew_cab','double_cab')
    AND under_seat_width_in IS NOT NULL
    AND under_seat_depth_in IS NOT NULL
    AND under_seat_height_in IS NOT NULL
  GROUP BY 1,2,3,4,5,6,7,8,9,10
)
SELECT row_number() OVER (ORDER BY w_out, d_out, fh_out, mount_depth_effective_in) AS wedge_key,
       w_out, d_out, fh_out, rh_out, wi, di, fhi, rhi,
       mount_depth_effective_in, depth_basis, mount_depth_stock_in, mount_depth_lifted_in,
       n_vehicles,
       round((wi * di * (fhi + rhi) / 2 / 1728)::numeric, 3)        AS internal_ft3,
       round((wi * di * (fhi + rhi) / 2 / 1728 * 0.85)::numeric, 3) AS net_ported_ft3,
       round((wi * di * (fhi + rhi) / 2 / 1728 * 0.93)::numeric, 3) AS net_sealed_ft3,
       CASE WHEN wi * di * (fhi + rhi) / 2 / 1728 * 0.85 >= 3.00 THEN 'XL'
            WHEN wi * di * (fhi + rhi) / 2 / 1728 * 0.85 >= 2.40 THEN 'L'
            WHEN wi * di * (fhi + rhi) / 2 / 1728 * 0.85 >= 1.60 THEN 'M'
            WHEN wi * di * (fhi + rhi) / 2 / 1728 * 0.85 >= 1.00 THEN 'S'
            ELSE 'XS' END AS wedge_class
FROM w
WHERE wi > 0 AND di > 0 AND rhi > 0;
ALTER TABLE truck_wedge_envelopes ADD PRIMARY KEY (wedge_key);
CREATE INDEX ON truck_wedge_envelopes (wedge_class);
CREATE INDEX ON truck_wedge_envelopes (mount_depth_effective_in);

CREATE TABLE vehicle_wedge_envelopes AS
SELECT v.vehicle_id, e.wedge_key
FROM vehicles v
JOIN truck_wedge_envelopes e
  ON e.w_out  = v.under_seat_width_in
 AND e.d_out  = v.under_seat_depth_in
 AND e.fh_out = v.under_seat_height_in + 3.5
 AND e.mount_depth_effective_in = coalesce(greatest(v.under_seat_mount_depth_in + 2.0,
                                                    v.under_seat_mount_depth_lifted_in),
                                           v.under_seat_mount_depth_lifted_in,
                                           v.under_seat_height_in + 1.0)
 AND e.depth_basis = CASE WHEN v.under_seat_mount_depth_in IS NOT NULL        THEN 'stock-plus-riser'
                          WHEN v.under_seat_mount_depth_lifted_in IS NOT NULL THEN 'lifted-sourced'
                          ELSE 'geometry' END
WHERE v.vehicle_category = 'truck' AND v.cab_type IN ('crew_cab','double_cab');
ALTER TABLE vehicle_wedge_envelopes ADD PRIMARY KEY (vehicle_id);
CREATE INDEX ON vehicle_wedge_envelopes (wedge_key);

ANALYZE truck_wedge_envelopes; ANALYZE vehicle_wedge_envelopes;
