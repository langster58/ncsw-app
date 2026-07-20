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

export type Vehicle = {
  vehicle_id: string
  year: number
  make: string
  model: string
  trim: string | null
  body_style: string | null
  vehicle_category: string | null
  segment: string | null
  cab_type: string | null
  luggage_volume_cuft: number | null
  acoustic_volume_cuft: number | null
}

const VEHICLE_FIELDS = [
  'vehicle_id', 'year', 'make', 'model', 'trim', 'body_style',
  'vehicle_category', 'segment', 'cab_type',
  'luggage_volume_cuft', 'acoustic_volume_cuft',
]

/** All trims/rows for a year+make+model; the picker offers trim disambiguation
 * only when the rows differ in a way that changes package fit. */
export async function fetchVehicleRows(year: string, make: string, model: string): Promise<Vehicle[]> {
  return getItems<Vehicle>('vehicles', {
    filter: { year: { _eq: year }, make: { _eq: make }, model: { _eq: model } },
    fields: VEHICLE_FIELDS,
    limit: 50,
  })
}

// --------------------------------------------------------------- package list

export type PackageSummary = {
  id: string
  sku: string
  display_name?: string | null
  topology?: string | null
  bass_alignment?: string | null
  boot_utilization?: string | null
  price_total?: number | null
  price_installed?: number | null
  summary?: string | null
  ncsw_pick?: boolean | null
  vehicle_category: string | null
  min_segment: string | null
  cab_type: string | null
}

export type PackageFilters = {
  ncswPicksOnly?: boolean
  topology?: string
  bassAlignment?: string
  maxPrice?: number
}

/** Packages that fit a vehicle. Fit key today = vehicle_category (+ cab_type
 * for trucks); segment ordering (min_segment) is enforced client-side until
 * the curation pass settles its encoding. */
export async function fetchPackagesForVehicle(
  vehicle: Vehicle,
  filters: PackageFilters = {},
): Promise<PackageSummary[]> {
  const filter: Record<string, unknown> = {
    vehicle_category: { _eq: vehicle.vehicle_category },
  }
  if (vehicle.cab_type) filter.cab_type = { _in: [vehicle.cab_type, null] }
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
  front_sub_enclosure_id: string | null
  component_set_id: string | null
  set_collection: string | null
  tweeter_integration_id: string | null
  mono_amp_id: string | null
  multichannel_amp_id: string | null
  dsp_id: string | null
  alternator_id: string | null
  battery_id: string | null
  big3_id: string | null
  installation_id: string | null
  materials_id: string | null
  price_breakdown: PackageBreakdown | null
}

export async function fetchPackageBySku(sku: string): Promise<PackageDetail | null> {
  const rows = await getItems<PackageDetail>('packages', {
    filter: { sku: { _eq: sku } },
    limit: 1,
  })
  return rows[0] ?? null
}

/** Resolve one component row for a detail block; collection per id-field. */
export async function fetchComponent<T = Record<string, unknown>>(
  collection: string,
  id: number | string,
): Promise<T | null> {
  const rows = await getItems<T>(collection, { filter: { id: { _eq: id } }, limit: 1 })
  return rows[0] ?? null
}
