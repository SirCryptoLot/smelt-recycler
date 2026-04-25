# Forge Tower Markers — Design Spec

## Goal

Replace the small 16×16px coloured squares on the Foundry world map with CSS fortress towers that rise above their tile, making all claimed forges easy to spot and the player's own forge instantly identifiable.

## Visual Design

### Your forge (`mine` tier)

Three-layer CSS tower rendered with `position: absolute` and the parent tile set to `overflow: visible`:

1. **Flag** — red flag on a gold pole, top of tower
2. **Keep** — 20×16px body with gold border (`#fbbf24`), warm amber gradient fill, three gold battlements across the top, ⚒ centred inside. Animated gold glow pulse (`box-shadow` 2s ease-in-out infinite)
3. **Base** — 24×3px dark amber block below the keep

### Other players' forges (`neutral` tier)

Identical tower structure and dimensions. Colour scheme:

1. **Flag** — dark blue flag on a steel-blue pole
2. **Keep** — blue border (`#60a5fa`), dark blue gradient fill (`#1d4ed8` → `#1e3a5f`), blue battlements, `?` centred inside. No glow animation.
3. **Base** — dark navy block

### Empty plots

Unchanged — small faint dot (`6×6px`, `rgba(255,200,100,0.25)`).

### No labels

No forge number or any text label on map tiles.

## Minimap (canvas)

- Player's forge dot: radius **3px**, colour `#f59e0b`
- Other forges dot: radius **1.5px** (unchanged), colour `#3b82f6` (blue, matching tower)

## Architecture

**One file changed:** `app/foundry/page.tsx`

- Add `TowerMarker` component (or inline render block) that accepts `tier: 'mine' | 'neutral'` and renders the appropriate tower
- Parent tile div gets `overflow: 'visible'` when a forge is present (currently `overflow` is not set, so adding `visible` is safe)
- Remove the `plotId` label `<span>` that currently renders below the square marker
- Update minimap `useEffect` to use `3` radius for `mine` tier and `#3b82f6` colour for `neutral`

## Constraints

- Tower uses only CSS (no images, no SVG files)
- `overflow: visible` on tiles does not affect tile grid layout — tiles remain 36×36px, tower visually overlaps neighbours
- Animation only on `mine` tier to keep neutral towers calm and readable at density
- No changes to API, data files, or any other page
