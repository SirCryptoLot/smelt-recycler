# Forge Tower Markers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the small coloured squares on the Foundry world map with CSS fortress towers — gold for the player's own forge, blue for all other claimed forges.

**Architecture:** Pure visual change in one client component (`app/foundry/page.tsx`). A `TowerMarker` component renders the three-layer tower (flag → keep with battlements → base) using absolute positioning and `overflow: visible` on the parent tile so the tower can rise above the 36px tile boundary. The minimap canvas also updates to use blue dots for neutral forges and a larger radius for the player's forge.

**Tech Stack:** React (inline styles), CSS keyframe animation via `<style>` tag already in the file, Next.js 14 client component.

---

## File Map

| File | Action | Purpose |
|---|---|---|
| `app/foundry/page.tsx` | Modify | All changes — tower component, tile rendering, minimap |

---

### Task 1: Add TowerMarker component and update the world map

**Files:**
- Modify: `app/foundry/page.tsx`

This is a pure visual change. No unit tests exist for React rendering in this project. Verification is visual: start the dev server and visit `/foundry`.

- [ ] **Step 1: Read the current file to understand exact line positions**

Read `app/foundry/page.tsx`. Confirm:
- `FORGE_COLOR` record is around lines 37–43
- `TowerMarker` does NOT yet exist
- The forge marker `<div>` is around lines 212–228
- The `plotId` label `<span>` is around lines 225–227
- The `<style>` tag with `@keyframes pulse` is at the bottom (~line 292)
- Minimap `ctx.arc` call is around line 98

- [ ] **Step 2: Update `FORGE_COLOR` — change neutral to blue**

Find:
```typescript
const FORGE_COLOR: Record<string, string> = {
  mine:    '#f59e0b',
  ally:    '#4ade80',
  enemy:   '#ef4444',
  neutral: '#6b4f2a',
  empty:   'transparent',
};
```

Replace with:
```typescript
const FORGE_COLOR: Record<string, string> = {
  mine:    '#f59e0b',
  ally:    '#4ade80',
  enemy:   '#ef4444',
  neutral: '#3b82f6',
  empty:   'transparent',
};
```

- [ ] **Step 3: Add `TowerMarker` component — insert before `export default function FoundryWorldMap()`**

Find the line:
```typescript
export default function FoundryWorldMap() {
```

Insert this component immediately before it:
```typescript
// ── Tower marker (rises above tile via overflow:visible) ─────────────────────

function TowerMarker({ tier }: { tier: 'mine' | 'neutral' }) {
  const isMine = tier === 'mine';
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      position: 'absolute', bottom: 2, left: '50%', transform: 'translateX(-50%)',
      zIndex: 10, pointerEvents: 'none',
    }}>
      {/* Flag on pole */}
      <div style={{ display: 'flex', alignItems: 'flex-end' }}>
        <div style={{ width: 2, height: 8, background: isMine ? '#d4a438' : '#93c5fd' }} />
        <div style={{
          width: 10, height: 7,
          background: isMine ? '#ef4444' : '#3b82f6',
          clipPath: 'polygon(0 0, 100% 35%, 0 70%)',
        }} />
      </div>
      {/* Keep with battlements */}
      <div style={{
        width: 20, height: 16,
        background: isMine
          ? 'linear-gradient(to bottom, #d97706, #92400e)'
          : 'linear-gradient(to bottom, #1d4ed8, #1e3a5f)',
        border: `1.5px solid ${isMine ? '#fbbf24' : '#60a5fa'}`,
        borderRadius: '2px 2px 0 0',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 9, color: isMine ? '#fff' : '#bfdbfe',
        position: 'relative',
        boxShadow: isMine ? '0 0 8px #fbbf2488' : undefined,
        animation: isMine ? 'forge-glow 2s ease-in-out infinite' : undefined,
      }}>
        <div style={{
          position: 'absolute', top: -4, left: 0, right: 0,
          display: 'flex', justifyContent: 'space-around', padding: '0 2px',
        }}>
          {[0, 1, 2].map(i => (
            <div key={i} style={{
              width: 4, height: 4,
              background: isMine ? '#fbbf24' : '#60a5fa',
              borderRadius: '1px 1px 0 0',
            }} />
          ))}
        </div>
        {isMine ? '⚒' : '?'}
      </div>
      {/* Base */}
      <div style={{
        width: 24, height: 3,
        background: isMine ? '#78350f' : '#1e3a5f',
        borderRadius: '0 0 3px 3px',
      }} />
    </div>
  );
}

```

- [ ] **Step 4: Replace the forge marker block in the tile renderer**

Find this block (inside the `.flatMap` tile render, around lines 211–228):
```tsx
                  {/* Forge marker */}
                  {forge && forge.tier !== 'empty' && (
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 }}>
                      <div style={{
                        width: 16, height: 16, borderRadius: 3,
                        background: FORGE_COLOR[forge.tier],
                        border: `2px solid ${forge.tier === 'mine' ? '#fbbf24' : 'rgba(255,255,255,0.3)'}`,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 8, color: '#fff', fontWeight: 700,
                        boxShadow: forge.tier === 'mine' ? '0 0 6px #fbbf24' : undefined,
                        animation: forge.tier === 'mine' ? 'pulse 2s ease-in-out infinite' : undefined,
                      }}>
                        {forge.tier === 'mine' ? '⚒' : forge.tier === 'ally' ? '🤝' : forge.tier === 'enemy' ? '⚔' : '?'}
                      </div>
                      <span style={{ fontSize: 7, color: '#fbbf24', fontFamily: 'monospace', textShadow: '0 1px 2px black' }}>
                        #{forge.plotId}
                      </span>
                    </div>
                  )}
```

Replace with:
```tsx
                  {/* Forge tower */}
                  {forge && forge.tier !== 'empty' && (
                    <TowerMarker tier={forge.tier === 'mine' ? 'mine' : 'neutral'} />
                  )}
```

- [ ] **Step 5: Add `overflow: 'visible'` to the tile div when a forge is present**

In the same tile render, the outer `<div>` has a `style` object. Find:
```typescript
                    border: '1px solid rgba(0,0,0,0.2)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 12, position: 'relative',
                    cursor: forge && forge.tier !== 'empty' ? 'pointer' : isPassable ? 'default' : 'not-allowed',
                    boxShadow: forge?.tier === 'mine' ? '0 0 8px #f59e0b88 inset' : undefined,
```

Replace with:
```typescript
                    border: '1px solid rgba(0,0,0,0.2)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 12, position: 'relative',
                    overflow: forge && forge.tier !== 'empty' ? 'visible' : undefined,
                    cursor: forge && forge.tier !== 'empty' ? 'pointer' : isPassable ? 'default' : 'not-allowed',
                    boxShadow: forge?.tier === 'mine' ? '0 0 8px #f59e0b88 inset' : undefined,
```

- [ ] **Step 6: Update the minimap canvas — radius and colour**

Find:
```typescript
      ctx.arc(f.col * tw + tw / 2, f.row * th + th / 2, Math.max(tw, 1.5), 0, Math.PI * 2);
```

Replace with:
```typescript
      const r = f.tier === 'mine' ? 3 : 1.5;
      ctx.arc(f.col * tw + tw / 2, f.row * th + th / 2, r, 0, Math.PI * 2);
```

(The `ctx.fillStyle = FORGE_COLOR[f.tier]` line above it already picks the right colour now that `FORGE_COLOR.neutral` is `#3b82f6` — no change needed there.)

- [ ] **Step 7: Update the CSS keyframe — rename `pulse` to `forge-glow`**

Find:
```tsx
      <style>{`
        @keyframes pulse {
          0%, 100% { box-shadow: 0 0 4px #fbbf24aa; }
          50% { box-shadow: 0 0 12px #fbbf24; }
        }
      `}</style>
```

Replace with:
```tsx
      <style>{`
        @keyframes forge-glow {
          0%, 100% { box-shadow: 0 0 5px #fbbf2466; }
          50% { box-shadow: 0 0 14px #fbbf24; }
        }
      `}</style>
```

(The old `pulse` animation was only referenced in the forge marker block which is now deleted. `TowerMarker` uses `forge-glow`.)

- [ ] **Step 8: Verify TypeScript compiles**

Run from `C:\recycle`:
```
npx tsc --noEmit
```
Expected: only the ~7 pre-existing errors in `app/__tests__/`, `MobileWalletConnect.tsx`, `lib/jupiter.ts`. No new errors.

- [ ] **Step 9: Visual verification**

Start dev server if not running:
```
npm run dev
```

Visit `http://localhost:3000/foundry` (or whichever port it lands on).

Expected:
- Map loads with terrain grid
- Your forge (if connected and claimed) shows a gold fortress tower with red flag, battlements, pulsing glow — rising above the tile
- Other claimed forges show identical-sized blue towers with grey-blue flags, no glow
- No number labels anywhere on tiles
- Minimap: your forge dot is visibly larger and gold; other forge dots are blue

- [ ] **Step 10: Commit**

```bash
git add app/foundry/page.tsx
git commit -m "feat(foundry): replace forge square markers with CSS fortress towers"
```

---

## Self-Review

### Spec coverage

| Requirement | Step |
|---|---|
| Your forge = gold tower (flag, keep, battlements, ⚒, glow) | Steps 3, 4 |
| Other forges = blue tower (same structure, no glow) | Steps 3, 4 |
| Empty plots unchanged | Step 4 — only `tier !== 'empty'` gets a tower |
| No number/label on map tiles | Step 4 — `plotId` span removed |
| Minimap: mine = 3px gold dot | Step 6 |
| Minimap: neutral = 1.5px blue dot | Steps 2, 6 |
| overflow: visible on forge tiles | Step 5 |
| One file changed | All steps touch only `app/foundry/page.tsx` |

### Placeholder scan

No TBDs. All code complete.

### Type consistency

- `TowerMarker` accepts `tier: 'mine' | 'neutral'` — called with `forge.tier === 'mine' ? 'mine' : 'neutral'` which covers all non-empty tiers (ally/enemy fall through to 'neutral' visually until those systems are built) ✓
- `FORGE_COLOR` key `neutral` updated to `#3b82f6` — minimap `ctx.fillStyle = FORGE_COLOR[f.tier]` picks it up automatically ✓
- Animation name `forge-glow` used in both `TowerMarker` (Step 3) and `<style>` tag (Step 7) ✓
