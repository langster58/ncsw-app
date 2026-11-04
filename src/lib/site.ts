// The shop's own facts, in one place. Every page, the menu, the footer and the
// business details search engines read come from here, so a placeholder can never
// show in one spot while the real value shows in another.
//
// Phone and address are null until the shop has them. Anything that needs them
// (the Call or text buttons, the address block, directions, the local-business
// details for Google) stays hidden while they are null — fill them in here and
// they appear everywhere at once.

export type ShopAddress = {
  street: string
  city: string
  region: string // state, two letters
  postalCode: string
}

export const SITE = {
  name: 'North Coast Soundworks',
  url: 'https://northcoastsoundworks.com',
  // Digits only, with country code, e.g. '+12165550100'. null = not yet.
  phone: null as string | null,
  // As people should read it, e.g. '(216) 555-0100'.
  phoneDisplay: null as string | null,
  // Whether the number takes text messages (shows "Call or text" vs "Call").
  phoneTakesTexts: true,
  address: null as ShopAddress | null,
  area: 'Cleveland, Ohio',
  hours: [
    ['Mon–Fri', '9am — 5pm'],
    ['Sat–Sun', 'Closed'],
  ] as readonly (readonly [string, string])[],
  // The same hours in the form the business details for machines use.
  openingHours: ['Mo-Fr 09:00-17:00'],
  description:
    "North Coast Soundworks is Cleveland's MECP-certified car audio specialist. " +
    'Car audio systems pre-engineered for your make and model, installed and calibrated, at one price up front.',
} as const

export const callLabel = SITE.phoneTakesTexts ? 'Call or text' : 'Call'

export function telHref(): string | null {
  return SITE.phone ? `tel:${SITE.phone}` : null
}
