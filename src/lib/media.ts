// Product photos and installation drawings.
//
// A part's own photo is looked up by name: the catalog's image_filename if it
// has one, then /images/products/<slug>.webp|.png|.jpg. While the photo library
// is still being made, a part with none shows a photo of the same kind of part,
// marked as representative (Brett, 2026-11-27: use product images for design
// now; the exact photos follow).

const STAND_IN: Record<string, string> = {
  midbass: '/images/products/one-audio-mb8-e.jpg',
  midrange: '/images/products/one-audio-mb8-e.jpg',
  wideband: '/images/products/one-audio-mb8-e.jpg',
  tweeter: '/images/products/seas-prestige-27tffnc-g-h1396.webp',
  subwoofer: '/images/products/ct-sounds-tropo-10.webp',
  front_sub: '/images/products/ct-sounds-tropo-10.webp',
  mono_amp: '/images/products/vevor-bp-1500-1d.webp',
  multichannel_amp: '/images/products/vevor-mdx200-4.webp',
  dsp: '/images/products/helix-dsp-mini-mk2.webp',
}

/** The part's own photo candidates, in the order to try them. */
export function productPhotoSrcs(slug: string, imageFilename?: string | null): string[] {
  return [
    ...(imageFilename ? [`/images/products/${imageFilename}`] : []),
    ...['webp', 'png', 'jpg'].map((x) => `/images/products/${slug}.${x}`),
  ]
}

/** A photo of the same kind of part, shown when the part has none yet. */
export function standInPhoto(role: string | null | undefined): string | null {
  return (role && STAND_IN[role]) || null
}

// Line drawings of each installation (install_types.slug -> file in
// /images/installs). Installations without a drawing yet show none.
const INSTALL_ART = new Set([
  'prefab-sealed', 'fabricated-sealed', 'integrated', 'stealth', 'fabricated-ib', 'true-ib-manifold',
  'quarter-panel-ib', 'trunk-ib', 'baffle-sealed', 'sealed-pass-through', 'underseat', 'behind-seat',
  'truck-wall-ib-cab', 'truck-wall-ib-bed', 'front-sub', 'post-mount', 'pods',
])

export function installArt(slug: string | null | undefined): string | null {
  return slug && INSTALL_ART.has(slug) ? `/images/installs/${slug}.jpg` : null
}
