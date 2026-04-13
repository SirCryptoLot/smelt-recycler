# Jito-Style UI Redesign — Design Spec
_Date: 2026-04-13_

## Overview

Full visual redesign of the SMELT Recycler app inspired by Jito Network's clean, professional aesthetic. The current dark-teal theme is replaced with a bright light theme: white card surfaces, light gray page background, bold near-black typography, and emerald green as the primary accent color.

**Navigation changes from a sidebar to a sticky top nav bar**, matching how Jito and most modern Solana DApps are structured. A live stats strip sits below the nav. Mobile gets a hamburger menu that opens a slide-in drawer.

---

## Design Tokens

### Colors

| Token | Value | Usage |
|---|---|---|
| `bg-page` | `#f9fafb` | Page background (gray-50) |
| `bg-surface` | `#ffffff` | Cards, nav, modals |
| `bg-surface-hover` | `#f9fafb` | Card hover state |
| `border` | `#e5e7eb` | Card and nav borders (gray-200) |
| `border-light` | `#f3f4f6` | Row dividers (gray-100) |
| `text-primary` | `#111827` | Headings, strong values (gray-900) |
| `text-secondary` | `#374151` | Body text (gray-700) |
| `text-muted` | `#6b7280` | Subtitles, descriptions (gray-500) |
| `text-faint` | `#9ca3af` | Labels, placeholders (gray-400) |
| `accent` | `#16a34a` | Primary CTA, active states (green-600) |
| `accent-light` | `#f0fdf4` | Active nav bg, tinted cards (green-50) |
| `accent-border` | `#bbf7d0` | Active nav border, tinted card border (green-200) |
| `accent-dark` | `#15803d` | Active nav text, accent labels (green-700) |
| `accent-faint` | `#dcfce7` | Badges, positive chips (green-100) |
| `positive` | `#16a34a` | Positive numbers (same as accent) |
| `indigo` | `#6366f1` | Weight / neutral secondary metric |
| `red-text` | `#ef4444` | Errors |
| `red-bg` | `#fef2f2` | Error backgrounds |
| `red-border` | `#fecaca` | Error borders |

All dark values (`zinc-*`, `emerald-500/15`, `#060f0d`) are removed.

### Typography

- Font: system-ui / `-apple-system` / `BlinkMacSystemFont` (matches Jito)
- Page title: `text-2xl font-extrabold text-gray-900`
- Section heading: `text-sm font-semibold text-gray-400 uppercase tracking-widest`
- Card value: `text-xl font-bold` (or larger for hero stats)
- Card label: `text-xs font-semibold text-gray-400 uppercase tracking-[0.06em]`
- Body: `text-sm text-gray-500 leading-relaxed`
- Monospace (addresses): `font-mono text-xs text-gray-400`

### Radius & Shadows

- Cards: `rounded-2xl` (14px)
- Buttons (pill): `rounded-full`
- Buttons (standard): `rounded-xl`
- Nav active state: `rounded-lg`
- Card shadow: none (border-only design, like Jito)
- Subtle shadow for elevated elements (modal, wallet button): `shadow-sm`

---

## Layout Architecture

### AppShell (full rewrite)

The sidebar (`components/AppShell.tsx`) is replaced with a top-nav shell.

**Desktop structure:**
```
┌──────────────────────────────────────────────────────────┐
│  NAV BAR  (sticky, h-14, white, border-b)                │
│  Logo | Recycle Swap Community Pools HowItWorks Dashboard│
│                                    [Wallet addr] [Connect]│
├──────────────────────────────────────────────────────────┤
│  STATS BAR  (h-9, gray-100, border-b)                    │
│  NAV: 0.0024 SOL  |  Supply: 1.2M SMELT  |  Pool: 2.89  │
├──────────────────────────────────────────────────────────┤
│                                                          │
│  PAGE CONTENT  (flex-1 overflow-y-auto, bg-gray-50)      │
│  max-w-4xl mx-auto px-6 py-8                             │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

**Mobile structure (< 768px):**
```
┌──────────────────────┐
│ [☰] ♻ Recycler [●]  │  ← mobile top bar (wallet dot = connected indicator)
├──────────────────────┤
│ Stats bar (scrollable│  ← horizontal scroll, no wrapping
│ overflow-x-auto)     │
├──────────────────────┤
│                      │
│  PAGE CONTENT        │
│  px-4 py-6           │
│                      │
└──────────────────────┘

When ☰ pressed → slide-in drawer from left:
┌──────────────┬───────┐
│ ♻ Recycler  │░░░░░░░│  ← overlay with backdrop
│              │░░░░░░░│
│ ♻ Recycle   │░░░░░░░│
│ ⇄ Swap      │░░░░░░░│
│ 🌍 Community │░░░░░░░│
│ 🏊 Pools     │░░░░░░░│
│ 📖 How it..  │░░░░░░░│
│ 👤 Dashboard │░░░░░░░│
│              │░░░░░░░│
│ [wallet addr]│░░░░░░░│
│ [Connect btn]│░░░░░░░│
└──────────────┴───────┘
```

### Nav Items

```typescript
const NAV_ITEMS = [
  { href: '/', label: 'Recycle', icon: '♻' },
  { href: '/swap', label: 'Swap', icon: '⇄' },
  { href: '/community', label: 'Community', icon: '🌍' },
  { href: '/pools', label: 'Pools', icon: '🏊' },
  { href: '/how-it-works', label: 'How it works', icon: '📖' },
];
// Dashboard appended only when wallet connected
```

Desktop nav shows labels only (no icons). Mobile drawer shows icon + label.

### Stats Bar

Fetched from `/api/stats` (already exists). Auto-refreshes every 60s.

Items: `NAV · Supply · Pool · Emission rate`

Desktop: flex row with `|` separators. Mobile: `overflow-x-auto whitespace-nowrap` horizontal scroll, no separators.

---

## Component Designs

### Stat Card
```
┌──────────────────────────┐
│ LABEL (xs uppercase gray)│
│ VALUE (xl bold dark)     │
│ sub (xs muted)           │
└──────────────────────────┘
bg-white border border-gray-200 rounded-2xl p-4
Accent variant: bg-green-50 border-green-200
```

### Account Row (Recycle page)
```
[Avatar] [Name + addr]     [value / EMPTY badge] [checkbox]
```
Selected: `border-green-200 bg-green-50`
Deselected: `border-gray-100 bg-white opacity-50`

### Primary Button
```
bg-green-600 hover:bg-green-500 active:scale-[0.99]
text-white font-bold rounded-xl py-3.5 px-5
disabled:opacity-40 disabled:cursor-not-allowed
```

### Connect Button (nav)
```
bg-green-600 text-white font-bold text-sm rounded-full px-4 py-2
```

### Wallet Pill (nav, when connected)
```
bg-gray-100 text-gray-500 font-mono text-xs rounded-full px-3 py-1.5
```

### Tab Toggle (leaderboard, swap mode)
```
bg-gray-100 rounded-xl p-1 flex gap-1
Active tab: bg-white text-green-600 font-semibold shadow-sm rounded-lg
Inactive: text-gray-500 hover:text-gray-700
```

### Page Header
```html
<div class="mb-6">
  <h1 class="text-2xl font-extrabold text-gray-900">{title}</h1>
  <p class="text-sm text-gray-500 mt-1">{subtitle}</p>
</div>
```

---

## Per-Page Changes

All pages remove dark Tailwind classes (`bg-[#060f0d]`, `zinc-*`, `white/*`, `emerald-500/*`) and replace with the light palette above.

### Home — Recycle (`app/page.tsx`)
- Stats strip (`grid grid-cols-2`) → `bg-green-50 border-green-200` for SOL card, `bg-white border-gray-200` for SMELT card
- Account list rows → white cards with green selected state
- Bottom recycle button → green primary button
- All status screens (disconnected, scanning, empty, error, success) → light theme with white cards

### Swap (`app/swap/page.tsx`)
- Mode toggle → gray tab toggle
- Stat rows → white cards with borders
- Two-step progress indicator → light green active step
- Jupiter Terminal widget container → white card wrapper

### Community (`app/community/page.tsx`)
- Ecosystem 4-cards → white cards
- Leaderboard table → white card, gray-100 header row
- Connected wallet row highlight → `bg-green-50`

### Dashboard (`app/dashboard/page.tsx`)
- Portfolio 4-card grid → white cards (weight card uses `text-indigo-500`)
- Referral link box → white card with gray input
- Distribution history → white card with gray row dividers

### Pools (`app/pools/page.tsx`)
- Existing dark styling replaced with white card + light palette

### How it works (`app/how-it-works/page.tsx`)
- Step list → numbered steps with `bg-green-50 border-green-200` circle badges
- FAQ items → white cards with border
- Info callout → `bg-gray-50 border-gray-200`

---

## Mobile Responsiveness

All pages already use responsive Tailwind classes for content (`grid-cols-2 sm:grid-cols-4`, `px-4 sm:px-6`). The AppShell rewrite handles mobile nav. Additional requirements:

- **Stats bar**: `overflow-x-auto whitespace-nowrap` on mobile, `flex gap-4` with smaller font
- **Leaderboard table**: `SOL reclaimed` and `Prize` columns already `hidden sm:table-cell` ✓
- **Nav drawer**: 280px wide, `transform translate-x` animation (250ms ease), backdrop `bg-black/40`
- **Recycle button area**: `sticky bottom-0 bg-white border-t border-gray-100 px-4 py-3` on mobile so it stays visible
- **All touch targets**: minimum 44×44px (buttons, nav links, checkboxes)
- **Wallet modal**: already handled by `@solana/wallet-adapter-react-ui`

---

## Files to Modify

| File | Change |
|---|---|
| `components/AppShell.tsx` | Full rewrite: sidebar → top nav + mobile drawer |
| `app/globals.css` | Add `body { background: #f9fafb; color: #111827; }` |
| `app/page.tsx` | Replace dark classes with light palette |
| `app/swap/page.tsx` | Replace dark classes with light palette |
| `app/community/page.tsx` | Replace dark classes with light palette |
| `app/dashboard/page.tsx` | Replace dark classes with light palette |
| `app/pools/page.tsx` | Replace dark classes with light palette |
| `app/how-it-works/page.tsx` | Replace dark classes with light palette |

No new files needed. No API changes. No dependency changes.

---

## Out of Scope

- Animations beyond existing transitions
- Dark mode toggle (removing dark theme entirely)
- Redesigning page information architecture (only visual reskin)
- Admin pages (`/admin/[token]`) — already minimal, low priority
