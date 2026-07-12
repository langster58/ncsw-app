// GENERATED from the live Directus schema (2026-07-04).
// Regenerate with scripts/gen-directus-types.py — do not hand-edit field lists.

export interface Vehicles {
  vehicle_id: number
  make: string | null
  model: string | null
  year_range: string | null
  year: number | null
  body_style: string | null  // Sedan | Coupe | Hatchback | SUV / Crossover | Wagon | Truck | Minivan | Convertible
  doors: number | null
  cab_type: string | null    // crew | ext | single | null (trucks only)
  trim: string | null
  passenger_volume_cuft: number | null
  luggage_volume_cuft: number | null
  acoustic_volume_cuft: number | null
  volume_source: string | null
  vehicle_category: string | null  // cargo | trunk | truck
  segment: string | null           // two_seat | subcompact | compact | midsize | fullsize | extended | oversized
  image: string | null
  head_unit_replacement_supported: boolean | null
  behind_seat_install_supported: boolean | null
  behind_seat_depth_category: string | null
  behind_seat_depth_in: number | null
  powertrain: string | null
  audio_system: string | null
  has_fullrange_output: 'true' | 'false' | 'option' | null
  audio_option_base: string | null
  audio_option_premium: string | null
  audio_option_premium_fullrange: boolean | null
  audio_option_base_fullrange: boolean | null
}

export interface Packages {
  id: string
  sku: string | null
  vehicle_category: string | null   // cargo | trunk | truck
  min_segment: string | null        // two_seat | subcompact | compact | midsize | fullsize | extended | oversized
  cab_type: string | null           // crew | ext | single | null (trucks only)
  sub_id: string | null
  sub_count: number | null
  mono_amp_id: string | null
  multichannel_amp_id: string | null
  dsp_id: string | null
  component_set_id: string | null
  front_sub_id: string | null
  sub_enclosure_id: string | null
  tweeter_integration_id: string | null
  front_sub_enclosure_id: string | null
  big3_id: string | null
  alternator_id: string | null
  battery_id: string | null
  installation_id: string | null
  materials_id: string | null
}

export interface Subwoofers {
  slug: string
  category: string | null
  brand: string | null
  model: string | null
  price: number | null
  image_filename: string | null
  product_url: string | null
  rms_watts: number | null
  fs_hz: number | null
  qts: number | null
  qes: number | null
  qms: number | null
  vas_l: number | null
  sd_cm2: number | null
  xmax_mm: number | null
  re_ohm: number | null
  bl_tm: number | null
  mms_g: number | null
  cms_mm_per_n: number | null
  le_mh: number | null
  sensitivity_db_1w_1m: number | null
  vd_liters: number | null
  effective_xmax_mm: number | null
  motor_upgrade_price: number | null
  motor_upgrade_label: string | null
  description: string | null
  gallery: unknown | null
  motor_upgrade_description: string | null
  in_stock: boolean | null
  coming_soon: boolean | null
  alignment: string | null
  driver_size: string | null
  tier: string | null
  review_date: string | null
  impact_score: number | null
  ib_output: number | null
  cat_sealed: boolean | null
  cat_ported: boolean | null
  cat_ib: boolean | null
  ib_composite: number | null
}

export interface Enclosures {
  slug: string
  type: string | null
  size: string | null
  driver_count: number | null
  pr_count: number | null
  pr_size: string | null
  construction: string | null
  volume_cuft: number | null
  tuning_fb_hz: number | null
  materials_cost: number | null
  labor_hours: number | null
  labor_rate: number | null
  vehicle_constraint: string | null
  notes: string | null
  description: string | null
  wood_sheets: number | null
  finish_sqft: number | null
  gallery: unknown | null
  in_stock: boolean | null
  coming_soon: boolean | null
  manufacturer: string | null
  vendor_url: string | null
  vendor_price: number | null
  image_url: string | null
  firing: string | null
  chambers: number | null
  max_drivers: number | null
  cutout_sizes_available: unknown | null
  mounting_depth_in: number | null
  vehicle_label_raw: string | null
}

export interface EnclosureFitments {
  id: string
  enclosure_slug: string
  vehicle_id: number
  source: string | null
  notes: string | null
}

export interface MonoAmps {
  slug: string
  brand: string | null
  model: string | null
  rms_power: string | null
  channels: number | null
  thd: string | null
  snr: string | null
  damping_factor: string | null
  dimensions: string | null
  image_filename: string | null
  image_filename_2: string | null
  product_url: string | null
  dyno_url: string | null
  price: number | null
  tier: string | null
  in_stock: boolean | null
  coming_soon: boolean | null
  requires_big3: boolean | null
  requires_alternator_upgrade: boolean | null
  requires_battery_upgrade: boolean | null
  watts_rms: number | null
  amp_class: string | null
}

export interface MultichannelAmps {
  slug: string
  brand: string | null
  model: string | null
  rms_power: string | null
  channels: number | null
  thd: string | null
  snr: string | null
  damping_factor: string | null
  dimensions: string | null
  image_filename: string | null
  image_filename_2: string | null
  product_url: string | null
  dyno_url: string | null
  price: number | null
  tier: string | null
  in_stock: boolean | null
  coming_soon: boolean | null
  watts_rms: number | null
  amp_class: string | null
}

export interface DspProcessors {
  slug: string
  brand: string | null
  model: string | null
  inputs: string | null
  outputs: string | null
  hi_level_in: string | null
  rca_in: string | null
  optical_in: string | null
  coaxial_in: string | null
  bluetooth_streaming: string | null
  tuning_app: string | null
  tuning_pc: string | null
  onboard_amp: string | null
  thd: string | null
  snr: string | null
  dimensions: string | null
  image_filename: string | null
  product_url: string | null
  price: number | null
  description: string | null
  tier: string | null
  gallery: unknown | null
  in_stock: boolean | null
  coming_soon: boolean | null
  dsp_resolution: string | null
  requires_fullrange_input: boolean | null
}

export interface FrontSubs {
  slug: string
  brand: string | null
  model: string | null
  image_filename: string | null
  product_url: string | null
  price: number | null
  impedance: number | null
  rms_watts: number | null
  sensitivity_db_2_83v: number | null
  fs_hz: number | null
  qts: number | null
  qms: number | null
  qes: number | null
  vas_l: number | null
  xmax_mm_one_way: number | null
  bl_tm: number | null
  mms_g: number | null
  sd_cm2: number | null
  le_mh: number | null
  description: string | null
  tier: string | null
  gallery: unknown | null
  in_stock: boolean | null
  coming_soon: boolean | null
  sealed_net_ft3: number | null
  mounting_depth_in: number | null
}

export interface ElectricalTiers {
  id: number
  mono_amp_watts_min: number
  mono_amp_watts_max: number
  big3_required: string | null
  alternator_required_slug: string | null
  battery_required_slug: string | null
  battery_default_slug: string | null
  notes: string | null
}

export interface Alternators {
  slug: string
  tier: string | null
  output_amps_min: number | null
  output_amps_max: number | null
  rated_for_system_watts_max: number | null
  vehicle_specific: string | null
  notes: string | null
  product_url: string | null
  image_filename: string | null
  description: string | null
  gallery: unknown | null
  in_stock: boolean | null
  coming_soon: boolean | null
  estimated_price: number | null
}

export interface Batteries {
  slug: string
  brand: string | null
  model: string | null
  chemistry: string | null
  voltage_v: number | null
  capacity_ah: number | null
  pb_equivalent_ah: string | null
  group_size: string | null
  terminals: string | null
  dimensions_lwh_in: string | null
  weight_lb: number | null
  continuous_watts_max: number | null
  burst_watts_max: number | null
  location: string | null
  under_hood_safe: string | null
  price: number | null
  product_url: string | null
  image_filename: string | null
  description: string | null
  gallery: unknown | null
  in_stock: boolean | null
  coming_soon: boolean | null
}

export interface Library {
  id: string
  slug: string
  name: string | null
  brand: string | null
  category: string | null
  description: string | null
  price: number | null
  image_filename: string | null
  product_url: string | null
  specs: unknown | null
}

export interface VehicleEditorial {
  id: string
  make: string
  model: string
  editorial_text: string | null
  source_url: string | null
  wikipedia_title: string | null
}

export interface SubEnclosures {
  slug: string
  type: string | null
  size: string | null
  driver_count: number | null
  pr_count: number | null
  pr_size: string | null
  construction: string | null
  volume_cuft: number | null
  tuning_fb_hz: number | null
  materials_cost: number | null
  labor_hours: number | null
  labor_rate: number | null
  vehicle_constraint: string | null
  notes: string | null
  description: string | null
  wood_sheets: number | null
  finish_sqft: number | null
  gallery: unknown | null
  in_stock: boolean | null
  coming_soon: boolean | null
  manufacturer: string | null
  vendor_url: string | null
  vendor_price: number | null
  image_url: string | null
  firing: string | null
  chambers: number | null
  max_drivers: number | null
  cutout_sizes_available: unknown | null
  mounting_depth_in: number | null
  vehicle_label_raw: string | null
}

export interface SubEnclosureFitments {
  id: string
  sub_enclosure_slug: string
  vehicle_id: number
  source: string | null
  notes: string | null
}

export interface TweeterIntegrations {
  slug: string
  name: string | null
  description: string | null
  image: string | null
  notes: string | null
  labor_cost: number | null
  materials_cost: number | null
}

export interface FrontSubEnclosures {
  slug: string
  name: string | null
  type: string | null   // sealed | IB
  description: string | null
  image: string | null
  notes: string | null
  labor_cost: number | null
  materials_cost: number | null
}

export interface Electrical {
  slug: string
  name: string | null
  description: string | null
  image: string | null
  notes: string | null
  labor_cost: number | null
  materials_cost: number | null
  part_cost: number | null
}

export interface Installation {
  slug: string
  name: string | null
  description: string | null
  image: string | null
  notes: string | null
  labor_cost: number | null
  materials_cost: number | null
}

export interface InstallTypes {
  id: string
  status: string | null
  title: string
  slug: string
  parent_category: string
  hero_image: string | null
  copy: string | null
  gallery: unknown | null
}

// Added by hand 2026-07-07 (see scripts/create-articles-collection.js). The
// gen-directus-types.py regen was transiently dropping real tables against the
// Render instance, so this block was authored to match the created fields.
// Re-run the generator to reconcile once the instance is healthy.
export interface Articles {
  id: string
  status: string            // published | draft | archived
  sort: number | null
  date_created: string | null
  date_updated: string | null
  title: string
  slug: string
  category: string | null   // methodology | guide | review | build-log | news
  author: string | null     // byline (Person); defaults to "Brett Combs"
  publish_date: string | null
  reading_time: string | null
  kicker: string | null
  excerpt: string | null
  cta_label: string | null
  hero_image: string | null
  body: string | null       // Markdown
  figures: unknown | null   // [{ type: frontier|blind_amp|dsp|image, data, caption }]
  gallery: unknown | null
  tags: unknown | null
  featured: boolean | null
  seo_title: string | null
  seo_description: string | null
  canonical_url: string | null
}
