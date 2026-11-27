// The demo cars' build documentation (/build?car=<slug>), used by the homepage's
// demo-car cards and the build pages. Only what Brett has said about each car
// goes here (memory notes and his messages, 2026-11); a part not decided yet
// says so rather than guessing.

export type Build = {
  slug: string
  car: string
  status: string
  summary: string
  photo?: string
  parts: [what: string, detail: string][]
  notes: string[]
}

export const BUILDS: Build[] = [
  {
    slug: 'bmw-328i-2014',
    car: '2014 BMW 328i xDrive',
    status: 'Being rebuilt',
    summary: 'A processor, amplifiers and a subwoofer, playing through the factory speakers for now.',
    photo: '/images/build-bmw-328i-1000.jpg',
    parts: [
      ['Front speakers', 'Factory speakers, for now.'],
      ['Processor and amplifiers', 'Added.'],
      ['Subwoofer', 'Added.'],
    ],
    notes: [],
  },
  {
    slug: 'mini-cooper-s-2008',
    car: '2008 Mini Cooper S',
    status: 'Planned',
    summary: 'Two 15-inch infinite-baffle subwoofers, new door speakers and tweeters on posts.',
    photo: '/images/build-mini-cooper-1000.jpg',
    parts: [
      ['Subwoofers', 'Two Acoustic Elegance IB15, infinite baffle.'],
      ['Tweeters', 'On posts: the Mini has no factory tweeter location.'],
      ['Door speakers', 'In the factory door locations.'],
    ],
    notes: [],
  },
  {
    slug: 'golf-alltrack-2018',
    car: '2018 Volkswagen Golf Alltrack',
    status: 'In progress',
    summary: 'Two 18-inch subwoofers built into the cargo floor, with no box (infinite baffle).',
    photo: '/images/build-golf-alltrack-1200.jpg',
    parts: [
      ['Subwoofers', 'Two Dayton Audio Ultimax 18, infinite baffle in the cargo floor.'],
      ['Door woofers', 'One Audio MB8.e 8-inch.'],
      ['Wideband', 'PRV 2MR50-NDY.'],
      ['Tweeters', 'Eminence SD28.'],
    ],
    notes: [
      'Two 18s have far more bass in reserve than the front speakers need. The tune uses that reserve for more bass at full volume, instead of turning the subs down to match a smaller system.',
    ],
  },
  {
    slug: 'honda-crv-2015',
    car: '2015 Honda CR-V',
    status: 'Nearly finished',
    summary: 'Two 15-inch subwoofers in the cargo floor, front subs under the seats, and a lithium battery to power it.',
    photo: '/images/build-honda-crv-1000.jpg',
    parts: [
      ['Front speakers', 'Stevens Audio component set with SA1 tweeters.'],
      ['Front subs', 'Two, under the front seats, playing in stereo on their own 2-channel amplifier.'],
      ['Subwoofers', 'Two 15-inch, in the cargo floor, on their own amplifier.'],
      ['Processor', 'Helix M SIX DSP. Its six amplifier channels run the tweeters, front door woofers and rear doors.'],
      ['Head unit', 'Joying Android head unit, with the small top-of-dash screen showing the backup camera.'],
      ['Power', 'Lithium battery in the cargo area.'],
    ],
    notes: [],
  },
]
