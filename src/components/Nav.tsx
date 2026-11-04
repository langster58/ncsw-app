import { SiteNav } from './SiteNav'

// Nav — the landing's header. Thin wrapper over the shared SiteNav component
// (src/components/SiteNav.tsx), which every page uses with the same site-wide
// link set (SITE_NAV_LINKS) and the shop's phone from src/lib/site.ts.

export function Nav() {
  return <SiteNav />
}
