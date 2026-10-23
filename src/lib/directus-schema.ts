// GENERATED from the live Directus schema (2026-10-23).
// Regenerate with scripts/gen-directus-types.py — do not hand-edit field lists.

export interface Vehicles {
  vehicle_id: number
  make: string | null
  model: string | null
  year_range: string | null
  year: number | null
  body_style: string | null
  doors: number | null
  cab_type: string | null
  trim: string | null
  passenger_volume_cuft: number | null
  luggage_volume_cuft: number | null
  acoustic_volume_cuft: number | null
  volume_source: string | null
  vehicle_category: string | null
  segment: string | null
  image: string | null
  head_unit_replacement_supported: boolean | null
  behind_seat_depth_in: number | null
  powertrain: string | null
  branded_system_name: string | null
  has_fullrange_output: 'true' | 'false' | 'option' | null
  tap_location: string | null
  anc_present: boolean | null
  anc_disable_notes: string | null
  factory_chime_notes: string | null
  install_harness: string | null
  install_notes: string | null
  alternator: number | null
  alternator_basis: string | null
  boot_width_in: number | null
  boot_depth_in: number | null
  boot_height_in: number | null
  dims_status: string | null
  dims_source_url: string | null
  dims_quote: string | null
  dims_config: string | null
  dims_taper_note: string | null
  cargo_body_variant: string | null
  cab_type_name: string | null
  behind_seat_width_in: number | null
  behind_seat_height_in: number | null
  behind_seat_source_url: string | null
  under_seat_width_in: number | null
  under_seat_depth_in: number | null
  under_seat_height_in: number | null
  under_seat_source_url: string | null
  factory_audio_system: string | null
  front_door: string | null
  rear_door: string | null
  dash: string | null
  pillar: string | null
  sail: string | null
  kick: string | null
  center: string | null
  deck: string | null
  wideband: boolean | null
  twelve_volt_source: string | null
  anc_solution: string | null
  anc_install_note: string | null
  cab_format: string | null
  rear_seat_mechanism: string | null
  under_seat_basis: string | null
  behind_seat_basis: string | null
  behind_seat_depth_bottom_in: number | null
  install_obstructions: string | null
  rear_seat_lift_feasible: string | null
  dims_confidence: string | null
  underseat: string | null
  amp_location: string | null
  front_stage_architecture: boolean | null
  series: string | null
  rear_seat_lift_pattern: string | null
  rear_seat_lift_in: number | null
  rear_seat_lift_basis: string | null
  substage_lane: string | null
  substage_pockets: number
  substage_ib_option: string | null
  substage_blowthrough_option: boolean | null
  substage_floor_option: string | null
  substage_not_offered: boolean
  substage_not_offered_reason: string | null
  substage_width_in: number | null
  substage_depth_in: number | null
  substage_height_in: number | null
  substage_cuft: number | null
  substage_fit_margin_in: number | null
  substage_fit_confidence: string | null
  substage_topologies: string | null
  behind_seat_height_basis: string | null
  front_seat_under_height_in: number | null
  front_seat_under_height_basis: string | null
  front_seat_ib_drivers: string | null
  substage_ib_bed_option: boolean | null
  truck_wall_width_in: number | null
  truck_wall_height_in: number | null
  truck_ib_wall_depth_in: number | null
  truck_floor_ib_height_in: number | null
  engine_displacement_l: number | null
  engine_hp: number | null
  transmission: string | null
  drivetrain: string | null
  truck_rear_floor_ib_option: boolean | null
  space_evidence: unknown | null
}

export interface Packages {
  id: string
  sub_id: string | null
  sub_count: number | null
  sub_enclosure_id: string | null
  mono_amp_id: string | null
  component_set_id: string | null
  front_sub_id: string | null
  multichannel_amp_id: string | null
  dsp_id: string | null
  sku: string | null
  vehicle_category: string | null
  display_name: string | null
  topology: string | null
  bass_alignment: string | null
  summary: string | null
  ncsw_pick: boolean
  price_total: number | null
  price_installed: number | null
  price_breakdown: unknown | null
  set_collection: string | null
  seed_source: string | null
  tier: string | null
  sub_size: string | null
  ceiling_l: number | null
  depth_20hz_db: number | null
  enclosure_bucket: string | null
  rung_key: string | null
  is_default_variant: boolean | null
  install_lane: string | null
  fit_depth_in: number | null
  fit_face_width_in: number | null
  fit_flange_in: number | null
  fit_volume_cuft: number | null
  fit_face_width_alt_in: number | null
  fit_flange_alt_in: number | null
  cab_size: string | null
  fit_depth_alt_in: number | null
  fit_dash_class: string | null
  front_sub_enclosure_id: string | null
  dash_driver_integration_id: string | null
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
  description: string | null
  gallery: unknown | null
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
  raw_re_ohm: number | null
  raw_re_convention: string | null
  raw_cms_mm_per_n: number | null
  xmax_convention: string | null
  ported_score: number | null
  ported_design_vb_ft3: number | null
  sealed_design_vb_ft3: number | null
  sealed_gross_ft3: number | null
  ported_gross_ft3: number | null
  ported_port_type: string | null
  ported_fb_hz: number | null
  ported_tubes: number | null
  ported_tube_len_in: number | null
  ported_min_vb_ft3: number | null
  ported_pick: boolean | null
  sealed_pick: boolean | null
  ib_pick: boolean | null
  mounting_depth_in: number | null
  pole_vent: string | null
  truck_sealed_pick: boolean | null
  truck_sealed_counts: string[] | null
  truck_ported_pick: boolean | null
  truck_ported_counts: string[] | null
  truck_pick_notes: string | null
  underseat_ported_vb_ft3: number | null
  underseat_ported_fb_hz: number | null
  underseat_ported_tubes: number | null
  underseat_ported_tube_len_in: number | null
  underseat_ported_gross_ft3: number | null
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
  ncsw_pick: boolean | null
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
  ncsw_pick: boolean | null
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
  remote: string | null
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
  sensitivity_db: number | null
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
  xmax_basis: string | null
  clean_spl_63: number | null
  clean_spl_100: number | null
  alignment: string | null
  sensitivity_ref: string | null
  driver_size: string | null
  cms_mm_per_n: number | null
  vd_cm3: number | null
  cone_material: string | null
  motor_type: string | null
  re_ohm: number | null
  ncsw_pick: boolean | null
  pick_build: string | null
  pick_install: string | null
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

export interface VehicleEditorial {
  id: string
  make: string
  model: string
  editorial_text: string | null
  source_url: string | null
  wikipedia_title: string | null
  series: string | null
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

export interface FactoryAudioSystems {
  id: string
  manufacturer: string
  system_name: string
  anc_present: boolean | null
  system_description: string | null
  year_range: string | null
  models: string | null
  system_driver_locations: string | null
  external_amplifier_present: boolean | null
  research_status: string | null
  source_urls: string | null
  source_notes: string | null
  anc_dsp_solution: string | null
  trims: string | null
  signal_state: string | null
  signal_state_evidence: string | null
  picker_label: string | null
  picker_help: string | null
  has_subwoofer: boolean | null
  subwoofer_evidence: string | null
  dsp: string | null
  helix_dsp: string | null
  keep_factory_drivers: boolean | null
  keep_factory_drivers_evidence: string | null
  factory_path: string | null
  factory_path_evidence: string | null
  tap_point: string | null
  tap_note: string | null
  factory_processing: string | null
  factory_processing_detail: string | null
}

