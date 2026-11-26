// Package browse data contract — the only file PLP/PDP screens talk to.
//
// Flow: pick your vehicle (year -> make -> model[/trim]) -> resolve the vehicle
// row -> list the packages that fit it -> open one package's full composition.
//
// The packages collection is live with the interim v16 seed (see
// scripts/packages/seed_v16_interim.py) until the curation pass replaces it
// (two-round model: a large curated offering, then `ncsw_pick = true` on the
// handful we recommend per group — the PLP filter defaults to picks).
//
// Wiring model: every component is a slug FK into its product collection and
// the package stores NO price truth of its own. `price_total`/`price_installed`
// are caches; `price_breakdown` records the line arithmetic. After any product
// price change, scripts/packages/reprice_packages.py recomputes the caches —
// that's the cascade. Fit key: `vehicle_category` is the envelope class
// (truck/trunk/cargo), matching vehicles.vehicle_category directly.
import { getItems } from './directus'

// 2026-11-26: the list and detail screens now read `systems` / `system_variants` /
// `system_variant_parts` instead of the `packages` collection. A variant is one
// hand-entered, engineered system; its price is its parts added up at request
// time (nothing stored). Installed price = parts + the system's flat base install
// (`systems.install_price`) + the sub stage price of an installation the car can
// take (`sub_enclosures.price` for that installation, sub size and count).
// Variants exist for cars only; trucks get an empty list.

// ------------------------------------------------------------- vehicle picker

export type VehicleFacet = { value: string; count: number }

export async function fetchYears(): Promise<string[]> {
  const rows = await getItems<{ year: number }>('vehicles', {
    groupBy: ['year'],
    sort: ['-year'],
    limit: -1,
  })
  return rows.map((r) => String(r.year))
}

export async function fetchMakes(year: string): Promise<string[]> {
  const rows = await getItems<{ make: string }>('vehicles', {
    filter: { year: { _eq: year } },
    groupBy: ['make'],
    sort: ['make'],
    limit: -1,
  })
  return rows.map((r) => r.make)
}

export async function fetchModels(year: string, make: string): Promise<string[]> {
  const rows = await getItems<{ model: string }>('vehicles', {
    filter: { year: { _eq: year }, make: { _eq: make } },
    groupBy: ['model'],
    sort: ['model'],
    limit: -1,
  })
  return rows.map((r) => r.model)
}

// A vehicle row is identified by year · make · model · series · cab · trim ·
// powertrain. `model` is the nameplate only (Silverado, Ram, F-250); `series`
// is the duty designation sold under it (1500, 2500HD, Super Duty, XD) and is
// null for vehicles that have none. `cab_type` is the four-value install class
// (regular/extended/crew/mega); `cab_type_name` is the brand name the picker
// shows (SuperCab, Quad Cab, CrewMax) — two brand cabs can share a class in the
// same year, so the picker filters on the name. `powertrain` separates rows
// whose install envelope differs by engine (Maverick hybrid vs EcoBoost: the
// hybrid battery takes one under-seat pocket) and the PHEV/EV twins of a trim.
export type Vehicle = {
  vehicle_id: string
  year: number
  make: string
  model: string
  series: string | null
  trim: string | null
  powertrain: string | null
  body_style: string | null
  vehicle_category: string | null
  segment: string | null
  cab_type: string | null
  cab_type_name: string | null
  luggage_volume_cuft: number | null
  acoustic_volume_cuft: number | null
  // The engine that separates otherwise identical rows. Filled for the pre-1990
  // cars, whose `trim` was imported holding an engine spec ("1.6 MT (85 Hp)")
  // rather than a trim name; `powertrain` on those rows is only ICE or Diesel,
  // so it is these figures, not powertrain, that tell the rows apart.
  engine_displacement_l?: number | null
  engine_hp?: number | null
  transmission?: string | null
  drivetrain?: string | null
  // Trunk / cargo opening the enclosure has to fit in (cars and SUVs).
  boot_width_in?: number | null
  boot_height_in?: number | null
  boot_depth_in?: number | null
  // True when NCSW does not install a substage in this vehicle at all; the
  // page shows `substage_not_offered_reason` instead of a package list.
  substage_not_offered?: boolean | null
  substage_not_offered_reason?: string | null
  // Trucks only. `substage_topologies` lists the enclosure types the truck
  // takes; the four figures below are what lanefit.py judged the cut-the-body
  // installs on (wall to cut, wall depth for a motor in the cab, height under
  // the front seat). Null depth / height = that install is not offered.
  substage_topologies?: string | null
  substage_blowthrough_option?: boolean | null
  substage_ib_bed_option?: boolean | null
  truck_wall_width_in?: number | null
  truck_wall_height_in?: number | null
  truck_ib_wall_depth_in?: number | null
  truck_floor_ib_height_in?: number | null
  // Where the box goes and the space there: for `under-seat-lifted` the width,
  // depth and height under the rear seat, the height including the seat lift;
  // for `behind-front-seat` / `behind-rear-seat` the space behind that seat;
  // for `jump-seats-deleted` / `rear-seat-deleted` the space the seats leave.
  // `substage_pockets` = 2 when the space is split in two. `cab_format` gives
  // the cab size the truck's packages are balanced for (truckCabSize).
  substage_lane?: string | null
  substage_width_in?: number | null
  substage_depth_in?: number | null
  substage_height_in?: number | null
  substage_pockets?: number | null
  cab_format?: string | null
  // Floor infinite baffle under the lifted rear seat, motor in the cab: offered
  // only on trucks that take no full-frame driver in the cab any other way.
  truck_rear_floor_ib_option?: boolean | null
  // does the rear seatback fold: 'folds' | 'fixed' | 'varies' | 'no rear seat' (blank = not settled)
  rear_seat_fold?: string | null
  // a fixed seat's ski pass-through: true / false (blank = not settled)
  rear_seat_ski_pass?: boolean | null
  // Factory dash speaker position and its size (empty = none). Decides whether
  // a front stage with a dash driver - a wideband or a three-way midrange - can
  // be offered (vehicleDashClass).
  dash?: string | null
  // The factory sound system this car was most likely built with, and the
  // picker label(s) it could be ordered with ('Base: … | Bose: …'). A single
  // label means there was never a choice, so `factory_audio_system` IS the car's
  // system - used when the per-choice rows cannot be read.
  factory_audio_system?: string | null
  branded_system_name?: string | null
}

const VEHICLE_FIELDS = [
  'vehicle_id', 'year', 'make', 'model', 'series', 'trim', 'powertrain', 'body_style',
  'vehicle_category', 'segment', 'cab_type', 'cab_type_name',
  'luggage_volume_cuft', 'acoustic_volume_cuft',
  'engine_displacement_l', 'engine_hp', 'transmission', 'drivetrain',
  'boot_width_in', 'boot_height_in', 'boot_depth_in',
  'substage_not_offered', 'substage_not_offered_reason',
  'substage_topologies', 'substage_blowthrough_option', 'substage_ib_bed_option',
  'truck_wall_width_in', 'truck_wall_height_in', 'truck_ib_wall_depth_in', 'truck_floor_ib_height_in',
  'substage_lane', 'substage_width_in', 'substage_depth_in', 'substage_height_in', 'substage_pockets', 'cab_format',
  'dash', 'truck_rear_floor_ib_option',
  'rear_seat_fold', 'rear_seat_ski_pass',
  'factory_audio_system', 'branded_system_name',
]

/** Customer-facing names for the powertrain codes stored on vehicles. */
export const POWERTRAIN_LABEL: Record<string, string> = {
  ICE: 'Gas',
  Diesel: 'Diesel',
  'Full Hybrid': 'Hybrid',
  'Mild Hybrid': 'Mild hybrid',
  PHEV: 'Plug-in hybrid',
  EV: 'Electric',
}

export function powertrainLabel(code: string | null | undefined): string {
  return code ? POWERTRAIN_LABEL[code] ?? code : ''
}

/** "1.6L 85 hp manual" — the engine itself, for the rows that carry its figures.
 * Empty for everything else, which is every vehicle from 1990 on. */
export function engineSpecLabel(
  v: Pick<Vehicle, 'engine_displacement_l' | 'engine_hp' | 'transmission' | 'drivetrain' | 'powertrain'>,
): string {
  if (v.engine_displacement_l == null && v.engine_hp == null) return ''
  const parts: string[] = []
  if (v.engine_displacement_l != null) parts.push(`${v.engine_displacement_l.toFixed(1)}L`)
  if (v.engine_hp != null) parts.push(`${v.engine_hp} hp`)
  if (v.transmission) {
    const [box, speeds] = v.transmission.split(' ')
    const name = box === 'MT' ? 'manual' : box === 'AT' ? 'automatic' : box.toLowerCase()
    parts.push(speeds ? `${speeds} ${name}` : name)
  }
  if (v.drivetrain) parts.push(v.drivetrain)
  // The fuel has to stay in the label: a 1.6 diesel and a 1.6 petrol of the same
  // output are two different cars, and the diesel marker lives on `powertrain`.
  if (v.powertrain && v.powertrain !== 'ICE') parts.push(powertrainLabel(v.powertrain).toLowerCase())
  return parts.join(' ')
}

/** `trim` holds a trim name only when the row has no engine figures. The pre-1990
 * import put an engine spec in that column, and an engine spec is not a trim —
 * it belongs to the Engine step, so it is withheld from the Trim one. */
export function displayTrim(v: Pick<Vehicle, 'trim' | 'engine_displacement_l' | 'engine_hp'>): string | null {
  return v.engine_displacement_l == null && v.engine_hp == null ? v.trim : null
}

/** What the Engine step offers for a row: its engine where we hold the figures,
 * otherwise its powertrain — the two never mix within one model-year. */
export function engineKey(v: Vehicle): string {
  return engineSpecLabel(v) || v.powertrain || ''
}

/** Display text for an engine key, which is either a powertrain code or already
 * a written-out engine. */
export function engineLabel(key: string): string {
  return POWERTRAIN_LABEL[key] ?? key
}

/** Every row for a year+make+model. The picker derives its remaining steps
 * (series, cab, trim) from this one result instead of a request per step. */
export async function fetchVehicleRows(year: string, make: string, model: string): Promise<Vehicle[]> {
  return getItems<Vehicle>('vehicles', {
    filter: { year: { _eq: year }, make: { _eq: make }, model: { _eq: model } },
    fields: VEHICLE_FIELDS,
    sort: ['series', 'cab_type_name', 'trim', 'powertrain'],
    limit: 500,
  })
}

/** "2019 Chevrolet Silverado 2500HD" — series joins the name when present. */
export function vehicleName(v: Pick<Vehicle, 'year' | 'make' | 'model' | 'series'>): string {
  return [v.year, v.make, v.model, v.series].filter(Boolean).join(' ')
}

/** "Crew Cab LTZ" — the cab (trucks) and trim that pin down the exact row, or
 * the engine where that is what separates them ("1.6L 85 hp manual"). */
export function vehicleVariant(
  v: Pick<
    Vehicle,
    'cab_type_name' | 'trim' | 'powertrain' | 'engine_displacement_l' | 'engine_hp' | 'transmission' | 'drivetrain'
  >,
): string {
  return [v.cab_type_name, displayTrim(v) || engineSpecLabel(v)].filter(Boolean).join(' ')
}

export type VehiclePick = {
  series?: string
  /** Body style — sedan/wagon/coupe. Carries different cargo dimensions. */
  body?: string
  cab?: string
  trim?: string
  /** An engine key from `engineKey` — a powertrain code or a written-out engine. */
  engine?: string
  /** @deprecated superseded by `engine`, which also covers the pre-1990 rows. */
  powertrain?: string
}

function distinct(values: (string | null | undefined)[]): string[] {
  return Array.from(new Set(values.filter((x): x is string => !!x)))
}

/** Rows still in play after the picks made so far. */
export function narrowVehicleRows(rows: Vehicle[], pick: VehiclePick): Vehicle[] {
  return rows.filter(
    (r) =>
      (!pick.series || r.series === pick.series) &&
      (!pick.body || r.body_style === pick.body) &&
      (!pick.cab || r.cab_type_name === pick.cab) &&
      (!pick.trim || displayTrim(r) === pick.trim) &&
      (!pick.engine || engineKey(r) === pick.engine) &&
      (!pick.powertrain || r.powertrain === pick.powertrain),
  )
}

/** Engines offered for the chosen series, cab and trim. More than one means the
 * picker needs an Engine step; one means it's taken as read. Covers both the
 * powertrain split (Maverick hybrid vs EcoBoost) and the pre-1990 rows, which
 * differ by the engine itself rather than by powertrain. */
export function engineOptions(rows: Vehicle[], pick: VehiclePick): string[] {
  return distinct(
    narrowVehicleRows(rows, { series: pick.series, body: pick.body, cab: pick.cab, trim: pick.trim })
      .map(engineKey),
  )
}

/** @deprecated use `engineOptions`, which also separates the pre-1990 rows. */
export function powertrainOptions(rows: Vehicle[], pick: VehiclePick): string[] {
  return distinct(
    narrowVehicleRows(rows, { series: pick.series, cab: pick.cab, trim: pick.trim }).map((r) => r.powertrain),
  )
}

/** Series offered under this model-year (empty when the model has none). */
export function seriesOptions(rows: Vehicle[]): string[] {
  return distinct(rows.map((r) => r.series))
}

/** Body styles offered for the chosen series. A car sold as a sedan and a wagon
 * has different cargo dimensions in each, so this has to be asked before the
 * enclosure can be judged — and for the pre-1990 rows body is the ONLY thing
 * separating them, since their engine variants were removed. Measured: body and
 * cab never both offer a choice in the same model-year, so the two steps cannot
 * compete — cars have bodies, trucks have cabs. */
export function bodyOptions(rows: Vehicle[], pick: VehiclePick): string[] {
  return distinct(narrowVehicleRows(rows, { series: pick.series }).map((r) => r.body_style))
}

/** Brand cab names offered for the chosen series (empty for cars). */
export function cabOptions(rows: Vehicle[], pick: VehiclePick): string[] {
  return distinct(narrowVehicleRows(rows, { series: pick.series, body: pick.body }).map((r) => r.cab_type_name))
}

/** Trims offered for the chosen series, body and cab. Rows whose `trim` is really
 * an engine spec contribute nothing here — they are separated at the Engine step. */
export function trimOptions(rows: Vehicle[], pick: VehiclePick): string[] {
  return distinct(
    narrowVehicleRows(rows, { series: pick.series, body: pick.body, cab: pick.cab }).map(displayTrim),
  )
}

// --------------------------------------------------------------- package list

export type PackageSummary = {
  id: string
  sku: string
  display_name?: string | null
  topology?: string | null
  bass_alignment?: string | null
  // enclosure_bucket = the PLP Enclosure column value (customer picks between
  // every option that fits): 'sealed_prefab' | 'custom_sealed' | 'ported' | 'trunk_ib'.
  enclosure_bucket?: string | null
  price_total?: number | null
  price_installed?: number | null
  summary?: string | null
  ncsw_pick?: boolean | null
  vehicle_category: string | null
  tier?: string | null
  dsp_id?: string | null
}

export type PackageFilters = {
  ncswPicksOnly?: boolean
  topology?: string
  bassAlignment?: string
  maxPrice?: number
}

// NCSW does not offer packages that keep the factory speakers: every system
// replaces the drivers (Brett, 2026-11-24; research/packages/SYSTEM-DESIGN.md §7).

/** The cab size a truck's packages are balanced for. A sub plays louder in a
 * smaller cab, so each truck package row is written for one cab size
 * (`packages.cab_size`) and a truck takes the rows for its own. */
export function truckCabSize(v: Vehicle): 'regular' | 'extended' | 'crew' {
  if (v.cab_format === 'front-only') return 'regular'
  if (v.cab_format === 'front+jump') return 'extended'
  return 'crew'
}

/** The dash size class a vehicle's dash speaker location gives a wideband or a
 * three-way midrange, as the front-stage sets name them (2.0, 2.5, 3.0, 3.5+),
 * or null when there is no dash location big enough (tweeter-size positions,
 * 'present' with no size, or none). `vehicles.dash` is the largest driver the
 * position takes; an oval takes a round driver no wider than its short side. */
export function vehicleDashClass(v: Vehicle): '2.0' | '2.5' | '3.0' | '3.5+' | null {
  const raw = (v.dash ?? '').trim().toLowerCase()
  if (!raw) return null
  const sides = raw.split('x').map(Number)
  if (sides.some((n) => !Number.isFinite(n))) return null
  const size = Math.min(...sides)
  if (size >= 3.5) return '3.5+'
  if (size >= 3) return '3.0'
  if (size >= 2.5) return '2.5'
  if (size >= 2) return '2.0'
  return null
}

/** Front stages with a wideband or a three-way midrange say where that driver
 * goes in `fit_dash_class`: a dash size class, or 'custom' when it goes in
 * custom pillars or pods. Rows without such a driver
 * leave it empty. A vehicle takes the rows with nothing there, plus the rows for
 * its own dash size class - or, with no dash location, the 'custom' rows: the
 * three-way with its midrange in custom pillars or pods, and the wideband sets
 * whose driver is marked for pods (wideband_drivers.pods_ok). */
export function dashFitFilter(v: Vehicle): Record<string, unknown> {
  const dash = vehicleDashClass(v) ?? 'custom'
  return { _or: [{ fit_dash_class: { _null: true } }, { fit_dash_class: { _eq: dash } }] }
}

/** Which truck packages this truck takes. Every truck row stores what it
 * needs and is compared with the truck's own figures.
 * Box under the rear seat (`install_lane` under-seat), behind the seat
 * (behind-seat), or where an extended cab's jump seats or small rear seat
 * were (seat-removed), sealed or ported: the row's cab size, the net air (`fit_volume_cuft`, against the space less 1.5 in
 * each way), and two ways the box can be laid out, each a height, depth and
 * width (`fit_flange_in`, `fit_depth_in`, `fit_face_width_in` and the `_alt_`
 * three) - either one will do. Sealed: drivers firing forward or up. Ported:
 * the two layouts of drivers and port tubes that reach the most trucks. Behind
 * the seat there is one layout (firing forward into the seat back), stored twice.
 * The cut-the-body rows (infinite baffle on the wall with the motor in the cab
 * or out in the bed, infinite baffle in the floor, blow-through): `fit_depth_in`,
 * `fit_face_width_in`, `fit_flange_in`, and the cab size. The rules and their constants live in
 * A front stage with a dash driver (wideband, three-way) also carries the dash
 * size class it needs (`fit_dash_class`), compared with vehicleDashClass.
 * research/scripts/analysis/gen_truck_underseat_packages.py and
 * gen_truck_underseat_ported_packages.py, gen_truck_behindseat_packages.py,
 * gen_truck_behindseat_ported_packages.py, gen_truck_ib_packages.py,
 * research/scripts/vehicles/lanefit.py and fitrules.py. */
export function truckFitFilter(v: Vehicle): Record<string, unknown> {
  const topo = (v.substage_topologies ?? '').split(',').map((t) => t.trim())
  const boxes = ['sealed', 'ported'].filter((a) => topo.includes(a))
  const or: Record<string, unknown>[] = []
  const uw = v.substage_width_in
  const ud = v.substage_depth_in
  const uh = v.substage_height_in
  const boxLane =
    v.substage_lane === 'under-seat-lifted'
      ? 'under-seat'
      : v.substage_lane === 'behind-front-seat' || v.substage_lane === 'behind-rear-seat'
        ? 'behind-seat'
        : v.substage_lane === 'jump-seats-deleted' || v.substage_lane === 'rear-seat-deleted'
          ? 'seat-removed'
          : null
  if (boxLane && boxes.length && uw != null && ud != null && uh != null) {
    const pockets = v.substage_pockets || 1
    const net = (pockets * Math.max(uw / pockets - 1.5, 0) * Math.max(ud - 1.5, 0) * Math.max(uh - 1.5, 0)) / 1728
    or.push({
      _and: [
        { install_lane: { _eq: boxLane } },
        { cab_size: { _eq: truckCabSize(v) } },
        { bass_alignment: { _in: boxes } },
        { fit_volume_cuft: { _lte: Math.round(net * 100) / 100 } },
        {
          _or: [
            { _and: [{ fit_flange_in: { _lte: uh } }, { fit_depth_in: { _lte: ud } }, { fit_face_width_in: { _lte: uw } }] },
            { _and: [{ fit_flange_alt_in: { _lte: uh } }, { fit_depth_alt_in: { _lte: ud } }, { fit_face_width_alt_in: { _lte: uw } }] },
          ],
        },
      ],
    })
  }
  const W = v.truck_wall_width_in
  const H = v.truck_wall_height_in
  // the cut-the-body rows are balanced per cab size too
  const cab = { cab_size: { _eq: truckCabSize(v) } }
  if (W != null && H != null) {
    const onWall = [cab, { fit_face_width_in: { _lte: W } }, { fit_flange_in: { _lte: H } }]
    if (v.truck_ib_wall_depth_in != null) {
      or.push({ _and: [{ install_lane: { _eq: 'ib-wall' } }, { fit_depth_in: { _lte: v.truck_ib_wall_depth_in } }, ...onWall] })
    }
    if (v.substage_ib_bed_option) or.push({ _and: [{ install_lane: { _eq: 'ib-bed' } }, ...onWall] })
    if (v.substage_blowthrough_option) or.push({ _and: [{ install_lane: { _eq: 'blow-through' } }, ...onWall] })
  }
  if (v.truck_floor_ib_height_in != null) {
    or.push({ _and: [{ install_lane: { _eq: 'ib-floor' } }, cab, { fit_depth_in: { _lte: v.truck_floor_ib_height_in } }] })
  }
  // floor infinite baffle under the rear seat: the driver's frame has to sit on
  // the floor under the seat; its depth is assumed to be solvable
  if (v.truck_rear_floor_ib_option && uw != null && ud != null) {
    const pocket = uw / (v.substage_pockets || 1)
    or.push({
      _and: [{ install_lane: { _eq: 'ib-floor-rear' } }, cab, { fit_flange_in: { _lte: Math.min(ud, pocket) } }],
    })
  }
  // nothing fits: match no row rather than every row
  if (!or.length) return { install_lane: { _eq: 'none' } }
  return { _and: [{ _or: or }, dashFitFilter(v)] }
}

/** Which trunk / cargo packages this car takes. The space is the car's own
 * trunk or cargo dimensions less 1.5 in of panel; its two largest dimensions
 * are the face the drivers mount on. A package stores what it needs: the
 * volume (`fit_volume_cuft`, empty = no volume test) and the driver layout -
 * long side `fit_face_width_in`, short side `fit_flange_in`, with a 2 x 2
 * alternative for four drivers (`fit_face_width_alt_in`, `fit_flange_alt_in`).
 * Returns null when the car has no dimensions on file (no narrowing). */
export function carFitFilter(v: Vehicle): Record<string, unknown> | null {
  const raw = [v.boot_width_in, v.boot_height_in, v.boot_depth_in].map((d) => (d == null ? NaN : Number(d)))
  if (raw.some((d) => !(d > 1.5))) return null
  // Volume is the AIR INSIDE the box, so the 0.75 in panels come off each axis.
  // The face is the OUTSIDE of the baffle, which spans the full space - the
  // flanges sit on it, not inside the side walls. Taking the wall thickness off
  // the face too was double-counting and cost half an inch on every car
  // (Brett 2026-11-07: two 18s do fit a CR-V - its 39 in opening was being
  // compared as 37.5 against the 38.0 two 18 flanges need). The truck filter
  // below already separates these; this now matches it.
  const [short, mid, long] = [...raw].sort((a, b) => a - b)
  const cuft = ((short - 1.5) * (mid - 1.5) * (long - 1.5)) / 1728
  return {
    _and: [
      { _or: [{ fit_volume_cuft: { _null: true } }, { fit_volume_cuft: { _lte: cuft } }] },
      {
        _or: [
          { _and: [{ fit_face_width_in: { _lte: long } }, { fit_flange_in: { _lte: mid } }] },
          { _and: [{ fit_face_width_alt_in: { _lte: long } }, { fit_flange_alt_in: { _lte: mid } }] },
        ],
      },
    ],
  }
}

/** Packages that fit a vehicle. Fit key = vehicle_category, narrowed for cars
 * by `carFitFilter` and for trucks
 * by `truckFitFilter`. The cab_type
 * and min_segment refinements were dropped 2026-07-28 along with their columns,
 * which had never been populated — reinstate here if curation reintroduces them. */
export async function fetchPackagesForVehicle(
  vehicle: Vehicle,
  filters: PackageFilters = {},
): Promise<PackageSummary[]> {
  // No variants are engineered for trucks yet.
  if (vehicle.vehicle_category === 'truck') return []
  const cat = await loadVariantCatalog()
  // The smallest proper sealed box has to fit the trunk / cargo space
  // (same allowance as carFitFilter: 1.5 in of panel off each dimension).
  const dims = [vehicle.boot_width_in, vehicle.boot_height_in, vehicle.boot_depth_in].map((d) => (d == null ? NaN : Number(d)))
  const space = dims.every((d) => d > 1.5) ? ((dims[0] - 1.5) * (dims[1] - 1.5) * (dims[2] - 1.5)) / 1728 : null
  return cat.variants
    .filter((v) => {
      const need = v.sealed_box_min_ft3 == null ? null : Number(v.sealed_box_min_ft3)
      return space == null || need == null || v.bass_installation !== 'sealed' || need <= space
    })
    .map((v) => variantSummary(v, cat, vehicle))
    .filter((p) => !filters.topology || p.topology === filters.topology)
    .filter((p) => !filters.bassAlignment || p.bass_alignment === filters.bassAlignment)
    .filter((p) => !filters.maxPrice || ((p.price_installed ?? p.price_total) != null && Number(p.price_installed ?? p.price_total) <= filters.maxPrice))
    .sort((a, b) => Number(a.price_installed ?? a.price_total ?? 0) - Number(b.price_installed ?? b.price_total ?? 0))
}

// ------------------------------------------------------- systems and variants

type VariantRow = {
  id: number
  system: number | null
  front_stage: string | null
  bass_installation: string | null
  sub_stage: string | null
  sub_output_db: number | string | null
  sealed_box_min_ft3: number | string | null
  sealed_box_ideal_ft3: number | string | null
  sort: number | null
  dsp: string | null
}

export type VariantPart = {
  id: number
  variant: number
  role: string
  part_collection: string
  part_slug: string
  quantity: number
}

type PartRow = { slug: string; brand?: string | null; model?: string | null; name?: string | null; price?: number | string | null; driver_size?: number | string | null }

type InstallTypeRow = { id: string; slug: string; title: string | null; bass_installation: string | null; sort: number | null }
type EnclosurePriceRow = { install_type: string | null; size: string | null; driver_count: number | null; price: number | string | null }

type VariantCatalog = {
  variants: VariantRow[]
  parts: Map<number, VariantPart[]>
  rows: Map<string, PartRow>
  installPrice: Map<number, number>
  installTypes: InstallTypeRow[]
  enclosures: EnclosurePriceRow[]
}

// The installations a sealed sub stage in a car can be sold in. The plain
// sealed box fits any car; the other two are for fixed rear seats.
const CAR_INSTALLATIONS = ['fabricated-sealed', 'sealed-pass-through', 'sealed-rear-deck']

const partKey = (collection: string, slug: string) => `${collection}/${slug}`

let variantCatalog: Promise<VariantCatalog> | null = null

/** Every variant, its parts, and the catalog row behind each part. Small
 * (tens of variants), so it is read once per page load and reused. */
function loadVariantCatalog(): Promise<VariantCatalog> {
  if (!variantCatalog) {
    variantCatalog = (async () => {
      const [variants, parts, systems, installTypes] = await Promise.all([
        getItems<VariantRow>('system_variants', { sort: ['sort', 'id'], limit: 500 }),
        getItems<VariantPart>('system_variant_parts', { limit: 5000 }),
        getItems<{ id: number; install_price: number | string | null }>('systems', { limit: 100 }).catch(() => []),
        getItems<InstallTypeRow>('install_types', {
          filter: { slug: { _in: CAR_INSTALLATIONS } },
          fields: ['id', 'slug', 'title', 'bass_installation', 'sort'],
          limit: 20,
        }).catch(() => []),
      ])
      const enclosures = installTypes.length
        ? await getItems<EnclosurePriceRow>('sub_enclosures', {
            filter: { install_type: { _in: installTypes.map((i) => i.id) } },
            fields: ['install_type', 'size', 'driver_count', 'price'],
            limit: 500,
          }).catch(() => [])
        : []
      const installPrice = new Map<number, number>()
      for (const s of systems) if (s.install_price != null) installPrice.set(s.id, Number(s.install_price))
      const byVariant = new Map<number, VariantPart[]>()
      const slugs = new Map<string, Set<string>>()
      for (const p of parts) {
        const list = byVariant.get(p.variant) ?? []
        list.push(p)
        byVariant.set(p.variant, list)
        const s = slugs.get(p.part_collection) ?? new Set<string>()
        s.add(p.part_slug)
        slugs.set(p.part_collection, s)
      }
      const rows = new Map<string, PartRow>()
      await Promise.all(
        Array.from(slugs.entries()).map(async ([collection, set]) => {
          try {
            const found = await getItems<PartRow>(collection, { filter: { slug: { _in: Array.from(set) } }, limit: 500 })
            for (const r of found) rows.set(partKey(collection, r.slug), r)
          } catch {
            // a parts collection the public role cannot read: its lines stay unpriced
          }
        }),
      )
      return { variants, parts: byVariant, rows, installPrice, installTypes, enclosures }
    })()
    variantCatalog.catch(() => { variantCatalog = null })
  }
  return variantCatalog
}

const ROLE_ORDER = ['midbass', 'tweeter', 'wideband', 'subwoofer', 'multichannel_amp', 'mono_amp', 'dsp', 'dsp_remote']
const roleRank = (role: string) => { const i = ROLE_ORDER.indexOf(role); return i < 0 ? ROLE_ORDER.length : i }

function partName(cat: VariantCatalog, p: VariantPart): string {
  const r = cat.rows.get(partKey(p.part_collection, p.part_slug))
  if (!r) return p.part_slug
  return [r.brand, r.model].filter(Boolean).join(' ') || r.name || p.part_slug
}

function variantParts(cat: VariantCatalog, id: number): VariantPart[] {
  return [...(cat.parts.get(id) ?? [])].sort((a, b) => roleRank(a.role) - roleRank(b.role) || a.id - b.id)
}

/** Parts added up. Null when any part has no price on file, so a partial sum
 * is never shown as the price. */
function variantPartsTotal(cat: VariantCatalog, id: number): number | null {
  let total = 0
  for (const p of cat.parts.get(id) ?? []) {
    const price = cat.rows.get(partKey(p.part_collection, p.part_slug))?.price
    if (price == null) return null
    total += Number(price) * (p.quantity || 1)
  }
  return Math.round(total * 100) / 100
}

const BASS_ALIGNMENT: Record<string, string> = { 'infinite-baffle': 'true_ib' }

/** One way the sub stage can be installed in a given car, with its flat price. */
export type InstallOption = { slug: string; title: string; price: number }

type SeatFacts = Pick<Vehicle, 'vehicle_category' | 'body_style' | 'rear_seat_fold' | 'rear_seat_ski_pass'>

/** Which installations this car can take. Every car takes the plain sealed box.
 * A fixed rear seat adds the pass-through (when the seat has a ski opening) or
 * the rear-deck enclosure (when it has none). Convertibles are sealed box only. */
function installSlugsFor(vehicle: SeatFacts | null): string[] {
  const slugs = ['fabricated-sealed']
  if (!vehicle || vehicle.vehicle_category !== 'trunk' || vehicle.body_style === 'Convertible') return slugs
  if (vehicle.rear_seat_fold === 'fixed') {
    if (vehicle.rear_seat_ski_pass === true) slugs.push('sealed-pass-through')
    else if (vehicle.rear_seat_ski_pass === false) slugs.push('sealed-rear-deck')
  }
  return slugs
}

function installOptions(cat: VariantCatalog, v: VariantRow, vehicle: SeatFacts | null): InstallOption[] {
  const sub = (cat.parts.get(v.id) ?? []).find((p) => p.role === 'subwoofer')
  if (!sub) return []
  const size = cat.rows.get(partKey(sub.part_collection, sub.part_slug))?.driver_size
  if (size == null) return []
  const count = sub.quantity || 1
  const out: InstallOption[] = []
  for (const slug of installSlugsFor(vehicle)) {
    const it = cat.installTypes.find((i) => i.slug === slug)
    if (!it || (it.bass_installation ?? 'sealed') !== (v.bass_installation ?? 'sealed')) continue
    const prices = cat.enclosures
      .filter((e) => e.install_type === it.id && Number(e.size) === Number(size) && Number(e.driver_count) === count && e.price != null)
      .map((e) => Number(e.price))
    if (prices.length) out.push({ slug, title: it.title ?? slug, price: Math.min(...prices) })
  }
  return out
}

/** Parts + the system's flat base install + the cheapest sub stage installation
 * the car can take. Null when any of the three is missing. */
function variantInstalled(cat: VariantCatalog, v: VariantRow, vehicle: SeatFacts | null): number | null {
  const parts = variantPartsTotal(cat, v.id)
  const base = v.system == null ? undefined : cat.installPrice.get(v.system)
  const options = installOptions(cat, v, vehicle)
  if (parts == null || base == null || !options.length) return null
  return Math.round((parts + base + Math.min(...options.map((o) => o.price))) * 100) / 100
}

function variantSummary(v: VariantRow, cat: VariantCatalog, vehicle: SeatFacts | null): PackageSummary {
  const parts = variantParts(cat, v.id)
  const named = (role: string) => parts.filter((p) => p.role === role).map((p) => partName(cat, p))
  const sub = parts.find((p) => p.role === 'subwoofer')
  const front = [...named('midbass'), ...named('wideband'), ...named('tweeter')].join(' + ')
  const subs = sub ? `${sub.quantity > 1 ? `${sub.quantity} × ` : ''}${partName(cat, sub)}` : ''
  const dsp = named('dsp')[0] ?? ''
  const bass = v.bass_installation ?? null
  return {
    id: String(v.id),
    sku: String(v.id),
    display_name: [front, subs, dsp].filter(Boolean).join(' · ') || `System ${v.id}`,
    topology: v.front_stage,
    bass_alignment: bass ? BASS_ALIGNMENT[bass] ?? bass : null,
    price_total: variantPartsTotal(cat, v.id),
    price_installed: variantInstalled(cat, v, vehicle),
    summary: null,
    ncsw_pick: null,
    vehicle_category: vehicle?.vehicle_category ?? null,
    tier: null,
    dsp_id: v.dsp,
  }
}

// ------------------------------------------------------------- package detail

export type PackageBreakdownLine = {
  collection: string
  slug: string
  name?: string
  qty: number
  unit: number
}

export type PackageBreakdown = {
  components: PackageBreakdownLine[]
  labor: { base: number; extra_amps: number; enclosure: number }
  materials_kit?: PackageBreakdownLine[]
  materials_total?: number
}

// Component FKs are slugs into their product collections (slug PKs everywhere).
export type PackageDetail = PackageSummary & {
  sub_id: string | null
  sub_count: number | null
  sub_enclosure_id: string | null
  front_sub_id: string | null
  component_set_id: string | null
  set_collection: string | null
  mono_amp_id: string | null
  multichannel_amp_id: string | null
  dsp_id: string | null
  price_breakdown: PackageBreakdown | null
  // the variant's own parts list (system_variant_parts)
  parts?: VariantPart[]
  // the system's flat base install price (systems.install_price)
  install_price?: number | null
}

/** One variant as a package detail. `sku` is the variant's id. */
export async function fetchPackageBySku(sku: string): Promise<PackageDetail | null> {
  const cat = await loadVariantCatalog()
  const v = cat.variants.find((x) => String(x.id) === sku)
  if (!v) return null
  const parts = variantParts(cat, v.id)
  const slugOf = (role: string) => parts.find((p) => p.role === role)?.part_slug ?? null
  const sub = parts.find((p) => p.role === 'subwoofer')
  return {
    ...variantSummary(v, cat, null),
    install_price: v.system == null ? null : cat.installPrice.get(v.system) ?? null,
    sub_id: sub?.part_slug ?? null,
    sub_count: sub?.quantity ?? null,
    sub_enclosure_id: null,
    front_sub_id: null,
    component_set_id: null,
    set_collection: null,
    mono_amp_id: slugOf('mono_amp'),
    multichannel_amp_id: slugOf('multichannel_amp'),
    dsp_id: slugOf('dsp') ?? v.dsp,
    price_breakdown: {
      components: parts
        .map((p) => ({
          collection: p.part_collection,
          slug: p.part_slug,
          name: partName(cat, p),
          qty: p.quantity || 1,
          unit: Number(cat.rows.get(partKey(p.part_collection, p.part_slug))?.price ?? NaN),
        }))
        .filter((l) => Number.isFinite(l.unit)),
      labor: { base: 0, extra_amps: 0, enclosure: 0 },
    },
    parts,
  }
}

/** The installations one variant can be sold in for one car, cheapest first. */
export async function fetchInstallOptions(sku: string, vehicle: SeatFacts | null): Promise<InstallOption[]> {
  const cat = await loadVariantCatalog()
  const v = cat.variants.find((x) => String(x.id) === sku)
  if (!v) return []
  return installOptions(cat, v, vehicle).sort((a, b) => a.price - b.price)
}

/** Resolve one component row for a detail block; collection per id-field.
 * Product collections use slug primary keys. */
export async function fetchComponent<T = Record<string, unknown>>(
  collection: string,
  slug: string,
): Promise<T | null> {
  const rows = await getItems<T>(collection, { filter: { slug: { _eq: slug } }, limit: 1 })
  return rows[0] ?? null
}

// ------------------------------------------------- wired PDP (packages/detail)

/** Fuller vehicle row for the PDP's vehicle blocks (spec strip, copy). */
export type VehicleDetail = Vehicle & {
  passenger_volume_cuft: number | null
  branded_system_name: string | null
  has_fullrange_output: string | boolean | null
  dash_kit: string | null
  alternator: number | null
}

export async function fetchVehicleById(vehicleId: string): Promise<VehicleDetail | null> {
  const rows = await getItems<VehicleDetail>('vehicles', {
    filter: { vehicle_id: { _eq: vehicleId } },
    fields: [
      ...VEHICLE_FIELDS,
      'passenger_volume_cuft', 'branded_system_name', 'has_fullrange_output',
      'dash_kit', 'alternator',
    ],
    limit: 1,
  })
  return rows[0] ?? null
}

// ------------------------------------------------ factory audio (picker step)

/** One choice in the factory-audio question for a vehicle, as materialised by
 * `gen_vehicle_options.py` from `vehicles.branded_system_name`.
 *
 * `picker_help` is the owner-facing text for telling whether their own car has
 * this system — badges on the speaker grilles, a name on the radio, a subwoofer
 * in the trunk. It is copied onto every option row from `audio_choice_help` on
 * each rebuild, so it is read here rather than joined at request time. */
export type AudioOption = {
  position: number
  label: string
  system_name: string | null
  brand_key: string
  has_fullrange: string | null
  picker_help: string | null
  // From the choice's factory system: what the DSP has to take from it.
  fit: SystemFit | null
}

/** What a factory system decides about a package: which DSP it needs. `dsp` is
 * the Zapco that takes its feeds (HB 68 II, six speaker-level inputs, when it
 * has a factory sub; HB 46 II, four, when not); `helix_dsp` the Helix for
 * reference builds. */
export type SystemFit = {
  id: string | null
  has_sub: boolean | null
  dsp: string | null
  helix_dsp: string | null
}

const FIT_FIELDS = ['id', 'has_subwoofer', 'dsp', 'helix_dsp']
type FitRow = { id?: string; has_subwoofer?: boolean | null; dsp?: string | null; helix_dsp?: string | null }
const toFit = (r: FitRow | null | undefined): SystemFit | null =>
  r ? { id: r.id ?? null, has_sub: r.has_subwoofer ?? null, dsp: r.dsp ?? null, helix_dsp: r.helix_dsp ?? null } : null

/** The DSP a build takes once the car's factory system is known. Value keeps
 * the $69 budget DSP (four inputs) unless the system has a factory sub, which
 * needs six - then it takes the system's Zapco. Branded takes the system's
 * Zapco, reference its Helix. Null = keep the package's own DSP. */
export function dspForSystem(tier: string | null | undefined, fit: SystemFit | null): string | null {
  if (!fit) return null
  if (tier === 'reference') return fit.helix_dsp
  if (tier === 'branded') return fit.dsp
  if (tier === 'value') return fit.has_sub ? fit.dsp : null
  return null
}

/** DSP prices by slug, for repricing a build to its system's DSP. */
export async function fetchDspPrices(): Promise<Record<string, number>> {
  const rows = await getItems<{ slug: string; price: number | string | null }>('dsp_processors', {
    fields: ['slug', 'price'],
    limit: 50,
  })
  return Object.fromEntries(rows.map((r) => [r.slug, Number(r.price ?? 0)]))
}

/** A package's installed price with its DSP swapped for the system's. */
export function installedForSystem(
  pkg: Pick<PackageSummary, 'tier' | 'dsp_id' | 'price_installed'>,
  fit: SystemFit | null,
  prices: Record<string, number>,
): number | null {
  if (pkg.price_installed == null) return null
  const base = Number(pkg.price_installed)
  const dsp = dspForSystem(pkg.tier, fit)
  if (!dsp || !pkg.dsp_id || dsp === pkg.dsp_id || prices[dsp] == null || prices[pkg.dsp_id] == null) return base
  return Math.round((base + prices[dsp] - prices[pkg.dsp_id]) * 100) / 100
}

/** The factory systems this exact vehicle could have been ordered with.
 *
 * ONE row means there was never a choice — the picker asks nothing. Two or more
 * means only the owner can say which was ticked at the factory: it is not in the
 * VIN and no data vendor sells it, which is why the question is asked at all. */
export async function fetchAudioOptions(vehicleId: string): Promise<AudioOption[]> {
  type Row = Omit<AudioOption, 'fit'> & { factory_audio_system?: FitRow | null }
  const rows = await getItems<Row>('vehicle_audio_options', {
    filter: { vehicle_id: { _eq: vehicleId } },
    fields: ['position', 'label', 'system_name', 'brand_key', 'has_fullrange', 'picker_help',
      ...FIT_FIELDS.map((f) => `factory_audio_system.${f}`)],
    sort: ['position'],
    limit: 10,
  })
  return rows.map(({ factory_audio_system, ...o }) => ({
    ...o,
    fit: toFit(factory_audio_system),
  }))
}

/** One factory system's DSP needs (null = no such system). */
export async function fetchSystemFit(systemId: string): Promise<SystemFit | null> {
  const rows = await getItems<FitRow>('factory_audio_systems', {
    filter: { id: { _eq: systemId } },
    fields: FIT_FIELDS,
    limit: 1,
  })
  return toFit(rows[0])
}

export type ProductRow = {
  slug: string
  brand?: string | null
  model?: string | null
  price?: number | string | null
  image_filename?: string | null
  product_url?: string | null
  description?: string | null
  rms_watts?: number | null
  rms_power?: number | string | null
  channels?: number | string | null
  snr?: number | string | null
  tier?: string | null
  type?: string | null
  size?: string | null
  volume_cuft?: number | string | null
}

export type ResolvedComponent = {
  role: string
  collection: string
  slug: string
  qty: number
  row: ProductRow | null
}

const SLOT_ROLES: [keyof PackageDetail, string, string][] = [
  ['sub_id', 'subwoofers', 'Sub stage'],
  ['sub_enclosure_id', 'sub_enclosures', 'Enclosure'],
  ['mono_amp_id', 'mono_amps', 'Sub amplification'],
  ['component_set_id', 'component_sets', 'Front stage'],
  ['multichannel_amp_id', 'multichannel_amps', 'Front amplification'],
  ['dsp_id', 'dsp_processors', 'Signal'],
]

// system_variant_parts.role -> the label a detail row carries
const PART_ROLE_LABEL: Record<string, string> = {
  midbass: 'Front stage',
  wideband: 'Front stage wideband',
  tweeter: 'Front stage tweeter',
  subwoofer: 'Sub stage',
  multichannel_amp: 'Front amplification',
  mono_amp: 'Sub amplification',
  dsp: 'Signal',
  dsp_remote: 'DSP remote',
}

/** Resolve every populated component slot of a package to its product row. */
export async function fetchPackageComponents(pkg: PackageDetail): Promise<ResolvedComponent[]> {
  if (pkg.parts) {
    return Promise.all(
      pkg.parts.map(async (p) => ({
        role: PART_ROLE_LABEL[p.role] ?? p.role,
        collection: p.part_collection,
        slug: p.part_slug,
        qty: p.quantity || 1,
        row: await fetchComponent<ProductRow>(p.part_collection, p.part_slug).catch(() => null),
      })),
    )
  }
  const qtyFor = (collection: string, slug: string): number => {
    const line = pkg.price_breakdown?.components?.find(
      (l) => l.collection === collection && l.slug === slug,
    )
    return line?.qty ?? (collection === 'subwoofers' ? pkg.sub_count ?? 1 : 1)
  }
  const jobs = SLOT_ROLES.filter(([key]) => pkg[key]).map(async ([key, collection, role]) => {
    const slug = String(pkg[key])
    const row = await fetchComponent<ProductRow>(
      collection === 'component_sets' && pkg.set_collection ? pkg.set_collection : collection,
      slug,
    )
    return { role, collection, slug, qty: qtyFor(collection, slug), row }
  })
  return Promise.all(jobs)
}

export type InstallationRow = { slug: string; name: string; description: string | null }

/** The install-standard narrative rows (shared by every package). */
export async function fetchInstallationRows(): Promise<InstallationRow[]> {
  return getItems<InstallationRow>('installation', { sort: ['slug'], limit: 20 })
}
