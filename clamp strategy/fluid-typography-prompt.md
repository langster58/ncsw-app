# Prompt for Claude Code: Fluid Typography Migration

Paste this into Claude Code in the ncsw-app (or ncsw-database/apps/web) repo.

---

## Task

Migrate all font-size declarations in this codebase from fixed/viewport-only units to accessible fluid typography using `clamp()` with combined `rem` + `vw` values. Goal: preserve the visual effect of elements scaling together smoothly across screen sizes (the look you'd get from pure `vw` units), while keeping text zoomable/accessible (the thing pure `vw` breaks).

## Step 1 — Audit before touching anything

Before writing any CSS:

1. Find every place font-size is currently declared — in `tokens.css`, Tailwind config (`fontSize` theme), NativeWind style props, component-level inline styles, and any `.css`/`.module.css` files. List them out.
2. Identify the current type scale: what are the distinct heading levels (H1–H6, body, caption, label, etc.) and their current sizes?
3. Flag any existing use of raw `vw` units for font-size — these are the ones causing the zoom problem and are the priority fix.
4. Do not assume file locations — search the repo. Confirm with me before mass-editing if the type scale is ambiguous or inconsistent across files.

## Step 2 — Design the fluid scale

For each heading/text level, compute a `clamp(MIN, PREFERRED, MAX)` value where:

- `MIN` = the size at mobile (smallest viewport, ~375px), in `rem`
- `MAX` = the size at desktop (largest viewport, ~1440px+), in `rem`
- `PREFERRED` = a formula combining `rem` + `vw`, e.g. `1.5rem + 2vw` — never a bare `vw` value alone

Formula for the preferred value (standard fluid-type approach):
```
slope = (max_size - min_size) / (max_vw - min_vw)
intersection = min_size - slope * min_vw
preferred = intersection + (slope * 100)vw
```
You can compute this directly, or use the utopia.fyi calculator methodology — show your math in a comment above each clamp() declaration so the values are auditable later.

Apply these rules:
- **Larger elements (H1, H2, hero text)**: bigger spread between min and max — these should compress more aggressively on mobile relative to desktop.
- **Smaller elements (body text, captions, labels)**: smaller spread — body text especially should barely change, or even hold flat/grow slightly on mobile rather than shrink.
- **Never let any clamp() scale unbounded** — every declaration needs both a MIN and MAX.
- **Maintain proportional hierarchy at both ends** — H1 should still clearly outrank H2 at both the mobile and desktop extremes; don't let curves cross.

## Step 3 — Implement using existing token system

This project uses a token file (`tokens.css`) and Tailwind/NativeWind theme config as the single source of truth — do not hardcode clamp() values inline in components.

- Define the fluid sizes as CSS custom properties in `tokens.css` (e.g. `--font-size-h1: clamp(2rem, 1.5rem + 2vw, 4rem);`)
- Wire these into the Tailwind `fontSize` theme config so existing utility classes (`text-h1`, `text-body`, etc.) automatically pick up the fluid values — components using those classes should require no changes.
- For NativeWind/React Native Web specifics: confirm whether `clamp()` is supported in the current NativeWind version in this repo's target RN Web output. If NativeWind's style resolution doesn't support CSS `clamp()` natively, flag this to me before proceeding — we may need a `useWindowDimensions` + interpolation fallback for native, with `clamp()` reserved for the web build only. Don't silently substitute a different approach without telling me.

## Step 4 — Verify

After implementing:
1. List every clamp() value you set, with the min/max in both rem and approximate px, plus which file it lives in.
2. Confirm no bare `vw`-only font-size declarations remain anywhere in the codebase (grep for `vw` in font-size contexts).
3. Note any components that had hardcoded inline font sizes bypassing the token system, and whether you migrated them to use the tokens or left them (with reasoning why).
4. Do NOT create a summary markdown file, planning doc, or "what I did" report file — report directly in the chat response per repo convention. No .md sprawl.

## Constraints

- Don't touch spacing/padding/margin values unless they're explicitly tied to font-size via a ratio in the existing system — that's a separate task.
- Don't invent new heading levels or change the type hierarchy itself — only convert existing sizes to fluid clamp() equivalents.
- If the audit in Step 1 reveals the type scale is inconsistent or you're not sure which value is "correct" for a given level, stop and ask rather than guessing.
