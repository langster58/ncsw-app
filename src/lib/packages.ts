// Package browse data contract — the only file PLP/PDP screens talk to.
//
// Flow: pick your vehicle (year -> make -> model[/trim]) -> resolve the vehicle
// row -> list the packages that fit it -> open one package's full composition.
//
// The packages collection is being curated (two-round model: a large curated
// offering, then `ncsw_pick = true` on the handful we recommend per group —
// the PLP filter defaults to picks so thousands narrow to a browsable list).
// Until rows land, `fetchPackagesForVehicle` returns an empty list and the PLP
// renders its honest empty state. The CONTRACT below is the source of truth
// the curation must satisfy; columns marked (pending) do not exist yet in the
// packages table and must be added by the curation pass:
//   sku (exists) · vehicle_category/min_segment/cab_type (exist — the fit key)
//   ncsw_pick boolean (pending) · display_name (pending) · topology (pending)
//   price_total (pending) · price_installed (pending) · summary (pending)
//   bass_alignment 'sealed'|'ported'|'trunk_ib'|'true_ib' (pending)
//   boot_utilization 'compact'|'standard'|'full' (pending)
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
  id: number
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

export type PackageDetail = PackageSummary & {
  sub_id: number | null
  sub_count: number | null
  sub_enclosure_id: number | null
  front_sub_id: number | null
  front_sub_enclosure_id: number | null
  component_set_id: number | null
  tweeter_integration_id: number | null
  mono_amp_id: number | null
  multichannel_amp_id: number | null
  dsp_id: number | null
  alternator_id: number | null
  battery_id: number | null
  big3_id: number | null
  installation_id: number | null
  materials_id: number | null
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
