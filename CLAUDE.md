# CLAUDE.md — North Coast Soundworks Universal App

This file governs how you work in this repo. Read it fully before any action and follow it on every session. When a request conflicts with this file, follow this file and say so. When this file conflicts with what the code actually shows, trust the code and update this file.

---

## 0. Project locations (absolute paths — never guess these)

- **Staging folder (assets + instructions, NOT the app):**
  `/Users/brettcombs/Documents/NCSW Application`
  Contains brand assets, fonts, product images, and instruction files. It is NOT the app. Never scaffold into it, never run `git init` in it, never treat it as the repo root. The app only reads assets from it.

- **App repo (the actual application):**
  `/Users/brettcombs/Documents/ncsw-app`
  Where the universal app lives. All scaffolding, code, git, and deploys happen here.

Always use full quoted absolute paths. The staging path contains a space — always quote it: `"/Users/brettcombs/Documents/NCSW Application"`.

---

## 1. What this project is

A **single universal app** built with **Expo Router** that ships to **web, iOS, and Android from one codebase**. One repo, three render targets.

The site is small by design — **three render patterns**, not many pages:

1. **Landing page** — a one-off bespoke page. Defines the visual language. Source of the design tokens and first components. (Built; being polished.)
2. **Product detail template** — built once, rendered for thousands of records from Directus (packages: components + pricing). Contains the dense data table and is the **known platform-split point** (see §4).
3. **Article template** — built once, rendered for many records from a Directus collection.

Native-only features (camera, gyroscope, accounts, sending photos) are **explicitly deferred**. Do not build or scaffold them until specced in a later task.

---

## 2. The tech stack (verified against the code — do not substitute without asking)

- **Expo SDK 56 + Expo Router** — universal file-based routing, `src/app/` directory. Check the versioned docs at https://docs.expo.dev/versions/v56.0.0/ before writing code; never install from memory.
- **Custom design-token system** — `src/ui/tokens.ts` is the single source of truth: fluid type/spacing engine (`fluid` / `fluidType` / `useFluidPx`), `colors`, `fonts`, `space`, `radius`. **All colors come from the `colors` export — never write a hex literal in a component.**
- **Hand-rolled primitive library** — `src/ui/` (Button, Card, Dropdown, Modal, DataTable, Section, etc.), styled inline via tokens.
- **Reanimated** — animations.
- **Directus** (on Render) — content source. Copy and data are fetched, never hardcoded. (Not yet wired — see §7.)
- **Git + Vercel** — static web export (`npx expo export --platform web` → `dist/`). Every push to `main` auto-deploys to ncsw-app.vercel.app.

**Not in this stack:** NativeWind, Tailwind, React Native Reusables. They were in an early plan and were never installed. Do not add them, audit against them, or "migrate" to them.

---

## 3. Build order — primitives before pages

1. **Tokens first** — defined once in `src/ui/tokens.ts`, seeded from the landing page.
2. **Primitives next** — the components a page needs, tinted to the tokens.
3. **Pages last** — a page is arrangement of existing components fed by Directus content.

If you find yourself writing fresh one-off markup or a fresh hex color inside a page or section component, stop.

---

## 4. Shared by default; split only when the platform demands it

Components are shared across all platforms by default. Split into `Foo.web.tsx` / `Foo.tsx` only at genuine divergence points.

**The one known split point is the product-detail data table:**
- `PackageTable.web.tsx` — full dense grid (built).
- `PackageTable.tsx` — currently an honest placeholder; becomes the native card list/master-detail in a later phase.

Do not split any other screen without a clear platform reason.

**Known web-only mechanisms that must not spread** (they break native and get replaced during the native phase): `@font-face` fonts in `src/app/+html.tsx`, `/images/...`-style `public/` asset paths, and the `window.NCSW_SUBWOOFER_FRONTIER` script-tag dataset. Don't add new code that depends on these patterns.

---

## 5. Content comes from Directus

All copy and product data will be fetched from Directus collections. Never add NEW hardcoded body copy, headlines, descriptions, pricing, or article text. (Existing hardcoded content is known debt, scheduled for migration in §7 — don't migrate it piecemeal ahead of that sequence.)

**Directus access constraint:** the web build is a static export — there is no server, so anything the browser fetches with is public. The `DIRECTUS_TOKEN` in `.env` must never appear in client code. Web data access uses a public read-only role on the catalog collections (or build-time fetching). Decide per §7 step 3 before writing the first fetch call.

---

## 6. No markdown sprawl

Do not create planning docs, session summaries, or scratch markdown in the repo. The only markdown at the repo root is CLAUDE.md / AGENTS.md (plus the stock README/LICENSE).

---

## 7. Engineering sequence (agreed 2026-07-02 — pick up at the lowest unblocked step)

1. ~~Color-token consolidation~~ — done.
2. ~~Delete Expo template remnants~~ — done.
3. **Directus data-access layer** (`src/lib/directus.ts`, typed client, auth decision from §5) — **blocked until the database data is perfected** (in progress in a parallel thread).
4. **Landing-page copy → Directus** — blocked until landing-page polish finishes (in progress in a parallel thread).
5. **Product data wiring** — replace the hardcoded catalog in `PackageTable.web.tsx` and `public/subwoofer-frontier-data.js` with Directus queries. After step 3. End state: only data pulled from Directus.
6. **Native asset groundwork** — `expo-font`, bundled/CDN images, `ios.bundleIdentifier` / `android.package` in app.json. Before any native build.
7. **`PackageTable` native layout** — last.

Do not start steps 3–5 early; they are deliberately sequenced behind the data-cleanup and landing-page threads. Ask the user whether those threads are finished if it's unclear.

---

## 8. Working agreements

- Keep sessions execution-focused. Planning and copywriting happen upstream in chat.
- Never create files outside the app repo at `/Users/brettcombs/Documents/ncsw-app`.
- Small, reviewable commits.
- **Standing authorization for git commits and pushes to `main`.** Commit and push at the end of every code-changing turn — do NOT ask for confirmation. `git pull --ff-only` before starting work: parallel threads push to the same branch. Only confirm before destructive operations (force-push, hard reset, branch delete, history rewrite).
- When unsure about a version, command, or path, check before acting.
- When you hit a blocker, say exactly what broke. Do not deflect to a no-code tool and do not silently work around it.

---

@AGENTS.md
