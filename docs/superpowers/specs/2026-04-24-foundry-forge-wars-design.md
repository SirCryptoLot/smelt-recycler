# Foundry: Forge Wars — Design Spec

## Overview

The Foundry transforms from a passive multiplier page into a browser strategy game embedded inside the SMELT app. Inspired by Travian, each forge becomes a living fortress on a real terrain world map. Players build their forge with SMELT, train warriors, raid neighboring forges to steal SMELT, defend against incoming attacks, and compete in weekly tiered league wars.

---

## Philosophy

A forge is not just a 1.25× multiplier. It is your factory, your fortress, your army, your asset. SMELT is the fuel that runs everything — you burn it to grow, to fight, to compete. The forge gives players a reason to keep recycling every week, not just once.

Two forces drive engagement:
- **Forge Wars** (weekly competitive league) — pulls players in every week with prizes and stakes
- **The Economy** (raids, buildings, marketplace) — creates ongoing SMELT demand and player-vs-player circulation

---

## World Map

### Grid
- **Size:** 60 columns × 50 rows = 3,000 tiles total
- **Forge plots:** 500 designated forge-buildable spots, scattered across traversable terrain
- **Wilderness:** ~2,500 tiles of terrain, rivers, mountains — never buildable, always world geography

### Terrain Types

| Terrain | Traversable | Combat Effect | Visual |
|---|---|---|---|
| Grassland | ✓ | None | Green |
| Forest | ✓ | +10% defender DEF | Dark green |
| Hills | ✓ | +25% defender DEF | Brown |
| Desert | ✓ | +10% attacker speed | Sandy |
| Swamp | ✓ | −20% attacker speed | Dark green-brown |
| Water | ✗ | Impassable | Blue |
| Mountains | ✗ | Impassable | Grey |
| Cliffs | ✗ | Impassable | Dark grey |
| Lava Zone | ✓ | +15% attacker ATK | Red (animated) |

### Forge Plot Placement
- 500 designated tiles are marked as forge-eligible
- Spread across the continent with minimum 2-tile spacing between eligible spots
- Low plot IDs (#1–50) cluster near the center of the continent — highest traffic, most contested
- Water and mountains create natural barriers that divide the map into regions
- Rivers cut through the continent, forcing armies to route around them

### Navigation
- Map is pannable (drag) and zoomable (+/−)
- Minimap in corner shows full world with viewport indicator
- HUD shows current SMELT balance, troop count, league rank
- Hovering a tile shows terrain type and coords
- Hovering a forge shows name, owner, type (ally/enemy/neutral)
- Clicking enemy forge → attack modal; clicking ally → reinforce modal

---

## Buildings

All 8 buildings are upgradeable from Level 0 to Level 5. Only one building can be under construction at a time. Build time scales with level: Lv 1 = instant, Lv 2 = 30 min, Lv 3 = 1h, Lv 4 = 2h, Lv 5 = 4h real-time.

| Building | Effect per level | Lv 1 Cost |
|---|---|---|
| 🔥 Blast Furnace | +20% SMELT daily production | 2,000 SMELT |
| ⚔️ Barracks | −10% troop train time, +5 max troop capacity | 2,500 SMELT |
| 🛡️ Rampart | +15% defense power | 3,000 SMELT |
| 🗺️ Rally Point | Unlock attacks; +1 simultaneous attack slot per level | 1,500 SMELT |
| 📦 Vault Storage | Shields +2,000 SMELT from raids per level | 2,000 SMELT |
| ⚗️ Smithy | Unlock item crafting; +1 craft slot per level | 4,000 SMELT |
| 📯 War Hall | +10% weekly war score per level | 5,000 SMELT |
| 🤝 Embassy | Join or found an Alliance; +5 ally reinforcement cap per level | 3,500 SMELT |

**Notes:**
- Rally Point must be Lv 1 before any attacks can be sent
- Barracks must be Lv 1 before any troops can be trained
- Smithy must be Lv 1 before crafting is unlocked
- Embassy must be Lv 1 to join an alliance

---

## Troops

Trained at the Barracks. Training is a queue — multiple units can be queued, each taking their train time in sequence.

| Troop | ATK | DEF | Cost | Train Time | Role |
|---|---|---|---|---|---|
| ⚔️ Smelters | 40 | 25 | 200 SMELT | 5 min | Balanced generalist |
| 🏹 Ash Archers | 60 | 15 | 350 SMELT | 8 min | High attack raider |
| 🛡️ Iron Guards | 20 | 80 | 300 SMELT | 7 min | Heavy defender |

**Troop capacity:** Base 20 troops. +5 per Barracks level (max Lv 5 = 45 troops).

---

## Combat & Raiding

### Sending an Attack
1. Player opens Rally Point, selects target forge (must be neighbor or within range)
2. Chooses troop composition to send (must keep ≥1 troop at home)
3. Travel time = Manhattan distance in tiles × 3 minutes, reduced by Barracks level (−30s per level)
4. Attack is queued as a pending record with arrival timestamp

### Battle Resolution (on arrival)
```
ATK Power = sum of attacker troop ATK values
DEF Power = sum of defender troop DEF values
          × (1 + Rampart_level × 0.15)
          × terrain_bonus (Hills 1.25, Forest 1.10, Lava 0.85, others 1.0)
```

**Attacker wins** if ATK Power > DEF Power:
- Attacker steals `(forge_smelt_balance − vault_protected) × 0.25` SMELT (minimum 0)
- Vault protected amount = `Vault_Storage_level × 2,000 SMELT`
- Both sides lose troops proportionally: losers lose 100%, winners lose `(loser_power / winner_power) × 60%` of sent troops

**Defender wins** if DEF Power ≥ ATK Power:
- Attacker loses all sent troops
- Defender loses `(ATK_power / DEF_power) × 40%` of stationed troops
- No SMELT stolen

### Attack Range
- Lv 1 Rally Point: attack forges within 8 tiles
- Each additional Rally Point level: +4 tile range
- Lv 5 Rally Point: attack any forge on the map

### Battle Report
- Both attacker and defender receive a battle report in `/foundry/reports`
- Report shows: outcome, troops lost on both sides, SMELT stolen, timestamp

---

## Weekly War & Leagues

### Season Cycle
- Season runs Monday 00:00 UTC → Sunday 23:59 UTC
- Leaderboard resets at season start
- Prizes distributed Sunday midnight via admin cron job

### Three Leagues

| League | Players | Weekly Prize Pool | Prizes |
|---|---|---|---|
| 🥉 Bronze | All new forges start here | 15,000 SMELT | #1: 8k, #2: 4k, #3: 3k |
| 🥈 Silver | Promoted from Bronze | 35,000 SMELT | #1: 18k, #2: 10k, #3: 7k |
| 🥇 Gold | Promoted from Silver | 80,000 SMELT | #1: 40k, #2: 24k, #3: 16k |

### War Score Formula
```
Base =  min(accounts_recycled × 10, 600)   // capped — prevents spam farming
      + (SOL_reclaimed × 500)               // uncapped quality metric
      + (raid_wins × 50)                    // uncapped combat reward

War_Hall_mult  = 1.10 ^ War_Hall_level     // Lv0=1.0×, Lv5≈1.61×
Streak_mult    = min(1.0 + consecutive_active_weeks × 0.05, 1.5)

Final Score = Base × War_Hall_mult × Streak_mult
```

Recycling contributes max 600 base points — items and raids are uncapped and become the differentiator for top ranks.

### Promotion & Relegation (Sunday night)
- Top 1 Bronze → promoted to Silver
- Top 1 Silver → promoted to Gold
- Bottom 2 Silver → relegated to Bronze
- Bottom 2 Gold → relegated to Silver
- Promotion/relegation recorded as badge on forge profile

### Prize Pool Source
- 8% of all weekly platform recycling fees routed to prize pool
- All Store item purchases (SMELT burned contributes to pool)
- Admin can top up prize pool manually via admin panel

---

## Store & Items

Accessible at `/foundry/store`. All purchases burn SMELT permanently.

### Permanent Items
| Item | Effect | Cost |
|---|---|---|
| ⚡ Lightning Rod | +15% war score (stacks, max 3) | 3,500 SMELT |
| 💎 Crystal Bellows | +20% SOL staking distribution weight | 5,000 SMELT |
| 🏷️ Forge Nameplate | Set a custom forge name (unique, 20 char max) | 1,000 SMELT |
| 🗺️ Territorial Banner | Custom map tile color for your forge | 800 SMELT |

### Consumable Items
| Item | Effect | Cost |
|---|---|---|
| 📯 War Horn | 2× war score contribution for 7 days | 1,200 SMELT |
| 🛡️ Iron Shield | Block one league rank drop at season end | 500 SMELT |

### Smithy Crafting (cheaper, takes time)
| Item | Cost | Craft Time |
|---|---|---|
| War Horn | 900 SMELT | 6 hours |
| Iron Shield | 350 SMELT | 2 hours |

---

## Production Engine

Every account a forge owner recycles generates +1 SMELT/day passive production for 7 days (decays after). NFTs burned generate +3 SMELT/day for 7 days. Blast Furnace multiplies all production. This gives recycling a persistent economic effect beyond just war score.

Raids steal from this accumulated SMELT. Vault Storage shields a portion.

---

## Economy Flywheel

```
RECYCLE ACCOUNTS
      ↓
  Earn SMELT + War Score
      ↓
BUILD / UPGRADE FORGE (burn SMELT)
      ↓
TRAIN TROOPS (burn SMELT — troops die in battle)
      ↓
RAID NEIGHBORS (steal SMELT, earn war score)
      ↓
WIN WEEKLY LEAGUE (earn prize SMELT)
      ↓
BUY STORE ITEMS / CRAFT AT SMITHY (burn SMELT)
      ↑__________________________________↓
             loop — keep recycling to stay competitive
```

**Net effect:** SMELT is perpetually burned on buildings, troop losses, store items, and crafting. Prize pool redistributes SMELT to the most active players. Raiding redistributes SMELT between players without minting new supply. Supply pressure grows as the game deepens.

---

## Data Storage

New JSON files in `/data/`:
- `foundry-buildings.json` — per-forge building levels and construction queue
- `foundry-troops.json` — per-forge troop counts and training queue
- `foundry-attacks.json` — pending and resolved attack records
- `foundry-leagues.json` — weekly league standings, scores, history
- `foundry-map.json` — world map terrain layout and forge plot positions
- `foundry-items.json` — owned items per forge
- `foundry-production.json` — daily SMELT production records per forge

Attack queue is processed by the existing admin cron job (every 5 min check for arrived attacks).

---

## New Pages & Routes

| Path | Purpose |
|---|---|
| `/foundry` | World map (new default) |
| `/foundry/forge/[id]` | Individual forge management — buildings, troops, production |
| `/foundry/store` | Item shop |
| `/foundry/reports` | Battle reports |
| `/foundry/leaderboard` | Weekly league standings |
| `/api/foundry/attack` | POST — queue an attack |
| `/api/foundry/reinforce` | POST — send troops to ally |
| `/api/foundry/build` | POST — start building/upgrade |
| `/api/foundry/train` | POST — queue troop training |
| `/api/foundry/store/buy` | POST — purchase item |
| `/api/foundry/process-attacks` | POST (cron only) — resolve arrived attacks |

---

## Out of Scope (v1)

- No NFT wrapping of forges
- No Alliance war scoring (alliances are social/reinforcement only in v1)
- No auction house / marketplace (store purchase only, no P2P trading in v1)
- No mobile-specific forge management UI (responsive but not native)
- No real-time push (polling every 30s is sufficient for attack timers)
