# GAME DESIGN DOCUMENT — FARM DEVELOPMENT V1.0

Status: Approved design baseline (not a claim that features are built), 2026-11-06.

## 1. Pitch
A web-first isometric pixel-art farming RPG. Players begin with a small private farm, explore hostile zones to obtain money/resources, build facilities on an expandable grid, manage survival, farm, raise animals, craft goods and take quests. Single-player first, online persistence and asynchronous offline simulation later. Open-world PvP and player trading after beta.

## 2. Player experience
- Desktop: browser + WASD and mouse.
- Mobile: landscape only for the MVP; virtual joystick, touch buttons, responsive safe-area UI. Provide an orientation prompt in portrait.
- Real-time combat: wind-up, hurt feedback, short cooldown, reliable collision/attack range and a single enemy class in prototype.
- Visual style: 2:1 isometric diamond pixel art, clear silhouettes, readable UI; mixed original and licensed third-party assets.

## 3. World and building
- Private safe farm, initial **24×24 buildable cells** as a proposed balance default (can be revised following playtests).
- Expansion by purchasing contiguous plots; persistent data stored in chunks, e.g. 16×16 grid cells (implementation proposal, not visual chunk size).
- Non-farm zones: forest and cave as v1.0 content budget. Travel through portals/scene transitions initially.
- Building requires coins, sufficient unoccupied owned cells, and construction time. Placement preview can rotate if a building supports it. Timer uses authoritative server time once backend exists.

## 4. Core loop
Explore/combat/quests -> gather coins/materials -> buy/craft -> place/build -> produce crops/animal goods -> sell/upgrade -> expand farm -> revisit harder zones.
Ensure farming and crafting are viable alternatives; no single optimal grinding strategy.

## 5. Survival
- Health, hunger, thirst, stamina, fatigue.
- Hunger and thirst decline while the character is active; below thresholds, regeneration and performance worsen, eventually health can be lost. Fatigue primarily follows in-game exertion and recovers through rest/sleep.
- Offline: character enters safe rest state, NOT slowly starving to death solely for logging out. Farm production and stateful world events continue.
- World day/night clock: **24 real minutes per in-game day** as provisional tuning. This world clock is distinct from construction and production timestamps.
- Never equate "time online" with punitive exhaustion as a retention tactic.

## 6. Death and drops
- On death, drop only eligible carried items into an owner-visible recovery bag. Exclude account-bound quest items, cosmetics, and permanent entitlements.
- Initial recommendation: a recoverable bag lasts until recovered or an explicitly communicated expiry rule. Exact timer and loss severity are playtest decisions; do not silently destroy premium items.
- Respawn at safe checkpoint. Server guards against duplicate retrieval and economy exploits once backend exists.
- PvP loot/ownership changes are NOT in v1.0.

## 7. Economy, customization, monetization
- Earn coins via combat, produce, livestock, crafting and quests. Trading between players deferred until after beta.
- Cosmetic-only revenue: outfits, visual building skins, pets without gameplay buffs, decorations. No combat advantage, stamina boosts or faster crop progression for money.
- Premium entitlements never become drop-on-death items.
- Cosmetics payment integration is a separate future milestone after security, tax/business and platform review.

## 8. Offline simulation contract
- Event-driven state simulation with deterministic catch-up and bounded runtime.
- Producers consume resources, respect capacities, dependencies and timestamps.
- Each simulation subsystem has lastProcessedAt + version; apply idempotent operations with transactional locking.
- On reconnect, execute pending events in order or use mathematically equivalent fast-forward rules and provide a visible production report.
- Render/physics/NPC combat do not need to run continuously on empty farms.
- Require unit tests for 1h/8h/72h, no-feed, full-storage, interrupted replay, duplicate reconnect.

## 9. Multiplayer roadmap (NOT v1.0)
- Shared exploration shards, real-time authoritative movement/combat, PvP open in the designated shared world except explicitly defined safe zones.
- Anti-spawn-camping, temporary new-player protection, report/moderation and region/latency rules must precede public PvP.
- Player trading after beta with escrow, confirmation, anti-duplication and abuse monitoring.
- Design entity IDs and domain boundaries to support it, without constructing a multiplayer server early.

## 10. Proposed v1.0 content budget
- 1 private expandable farm/player; 2 exploration zones; 4 monster types; 8 building types; 6 crops; 2 livestock; 3 weapons; 12 recipes; 15 quests; 3 skill trees. Numbers are scope estimates, not promises.

## 11. P0: Sprint 1 restrictions
Map + player + camera + controls + collision + one slime + one attack + mobile landscape prototype. NO login, database, payments, farming, offline simulator or multiplayer in Sprint 1.

## 12. Acceptance — v1.0 beta
Core loop is coherent and recoverable across sessions. Server checks economic mutations. Consistent production while offline. Mobile usable in landscape. No critical item/coin exploits. Documented privacy, backups and incident response, controlled beta release.
