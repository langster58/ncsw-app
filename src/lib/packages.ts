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
}

export type PackageFilters = {
  ncswPicksOnly?: boolean
  topology?: string
  bassAlignment?: string
  maxPrice?: number
}

/** Which truck packages this truck takes. Under-seat / behind-seat box rows
 * carry no `install_lane` and follow `substage_topologies`. The cut-the-body
 * rows (infinite baffle on the wall with the motor in the cab or out in the
 * bed, infinite baffle in the floor, blow-through) each store what they need
 * - `fit_depth_in`, `fit_face_width_in` (all flanges side by side),
 * `fit_flange_in` - and are compared with the truck's own figures. The rule and
 * its constants live in research/scripts/vehicles/lanefit.py and fitrules.py. */
export function truckFitFilter(v: Vehicle): Record<string, unknown> {
  const topo = (v.substage_topologies ?? '').split(',').map((t) => t.trim())
  const boxes = ['sealed', 'ported'].filter((a) => topo.includes(a))
  const or: Record<string, unknown>[] = []
  if (boxes.length) {
    or.push({ _and: [{ install_lane: { _null: true } }, { bass_alignment: { _in: boxes } }] })
  }
  const W = v.truck_wall_width_in
  const H = v.truck_wall_height_in
  if (W != null && H != null) {
    const onWall = [{ fit_face_width_in: { _lte: W } }, { fit_flange_in: { _lte: H } }]
    if (v.truck_ib_wall_depth_in != null) {
      or.push({ _and: [{ install_lane: { _eq: 'ib-wall' } }, { fit_depth_in: { _lte: v.truck_ib_wall_depth_in } }, ...onWall] })
    }
    if (v.substage_ib_bed_option) or.push({ _and: [{ install_lane: { _eq: 'ib-bed' } }, ...onWall] })
    if (v.substage_blowthrough_option) or.push({ _and: [{ install_lane: { _eq: 'blow-through' } }, ...onWall] })
  }
  if (v.truck_floor_ib_height_in != null) {
    or.push({ _and: [{ install_lane: { _eq: 'ib-floor' } }, { fit_depth_in: { _lte: v.truck_floor_ib_height_in } }] })
  }
  // nothing fits: match no row rather than every row
  return or.length ? { _or: or } : { install_lane: { _eq: 'none' } }
}

/** Which trunk / cargo packages this car takes. The space is the car's own
 * trunk or cargo dimensions less 1.5 in of panel; its two largest dimensions
 * are the face the drivers mount on. A package stores what it needs: the
 * volume (`fit_volume_cuft`, empty = no volume test) and the driver layout -
 * long side `fit_face_width_in`, short side `fit_flange_in`, with a 2 x 2
 * alternative for four drivers (`fit_face_width_alt_in`, `fit_flange_alt_in`).
 * Returns null when the car has no dimensions on file (no narrowing). */
export function carFitFilter(v: Vehicle): Record<string, unknown> | null {
  const dims = [v.boot_width_in, v.boot_height_in, v.boot_depth_in].map((d) => (d == null ? NaN : Number(d) - 1.5))
  if (dims.some((d) => !(d > 0))) return null
  const [short, mid, long] = [...dims].sort((a, b) => a - b)
  const cuft = (short * mid * long) / 1728
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
  const filter: Record<string, unknown> = {
    vehicle_category: { _eq: vehicle.vehicle_category },
  }
  if (vehicle.vehicle_category === 'truck') Object.assign(filter, truckFitFilter(vehicle))
  else Object.assign(filter, carFitFilter(vehicle) ?? {})
  if (filters.ncswPicksOnly) filter.ncsw_pick = { _eq: true }
  if (filters.topology) filter.topology = { _eq: filters.topology }
  if (filters.bassAlignment) filter.bass_alignment = { _eq: filters.bassAlignment }
  if (filters.maxPrice) filter.price_installed = { _lte: filters.maxPrice }
  try {
    return await getItems<PackageSummary>('packages', {
      filter,
      sort: ['price_installed', 'price_total'],
      limit: 200,
    })
  } catch {
    // pending columns in the filter 400 until the curation pass adds them —
    // fall back to the bare fit key so the page keeps working mid-migration
    return getItems<PackageSummary>('packages', {
      filter: { vehicle_category: { _eq: vehicle.vehicle_category } },
      limit: 200,
    })
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
}

export async function fetchPackageBySku(sku: string): Promise<PackageDetail | null> {
  const rows = await getItems<PackageDetail>('packages', {
    filter: { sku: { _eq: sku } },
    limit: 1,
  })
  return rows[0] ?? null
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
  head_unit_replacement_supported: boolean | null
  alternator: number | null
}

export async function fetchVehicleById(vehicleId: string): Promise<VehicleDetail | null> {
  const rows = await getItems<VehicleDetail>('vehicles', {
    filter: { vehicle_id: { _eq: vehicleId } },
    fields: [
      ...VEHICLE_FIELDS,
      'passenger_volume_cuft', 'branded_system_name', 'has_fullrange_output',
      'head_unit_replacement_supported', 'alternator',
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
}

/** The factory systems this exact vehicle could have been ordered with.
 *
 * ONE row means there was never a choice — the picker asks nothing. Two or more
 * means only the owner can say which was ticked at the factory: it is not in the
 * VIN and no data vendor sells it, which is why the question is asked at all. */
export async function fetchAudioOptions(vehicleId: string): Promise<AudioOption[]> {
  return getItems<AudioOption>('vehicle_audio_options', {
    filter: { vehicle_id: { _eq: vehicleId } },
    fields: ['position', 'label', 'system_name', 'brand_key', 'has_fullrange', 'picker_help'],
    sort: ['position'],
    limit: 10,
  })
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

/** Resolve every populated component slot of a package to its product row. */
export async function fetchPackageComponents(pkg: PackageDetail): Promise<ResolvedComponent[]> {
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
