import { SiteNav, type NavLinkItem } from './SiteNav'

// Nav — the landing's header. Thin wrapper over the shared SiteNav component
// (src/components/SiteNav.tsx), which every page uses. This file only owns the
// landing's link set + phone number; all nav behavior lives in SiteNav.

const NAV_LINKS: NavLinkItem[] = [
  ['Packages', '/#packages'],
  ['Subwoofers', '/methodology/subwoofers'],
  ['Install Types', '/'],
  ['Editorial', '/'],
  ['About', '/'],
  ['Location', '/#location'],
]

const PHONE_NUMBER = '(216) 555-0114'

export function Nav() {
  return <SiteNav links={NAV_LINKS} phone={PHONE_NUMBER} />
}
