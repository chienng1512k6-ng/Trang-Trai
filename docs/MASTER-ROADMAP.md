# MASTER ROADMAP — 12-MONTH TARGET, NOT A PROMISE

## Product releases
- Milestone A, Month 1: isometric technical proof, mobile control + basic combat.
- Milestone B, Month 3: world transitions, enemy encounters and loot prototype.
- Milestone C, Month 6: vertical slice with trusted economy and persistence, account login, building construction.
- Milestone D, Month 9: farming, survival, livestock, crafting, deterministic offline progression.
- Milestone E, Month 11: closed alpha and telemetry, economy balancing, exploit testing, device performance.
- Milestone F, Month 12: controlled public beta **only** after go/no-go checks.

## Detailed months
1. Foundation, Phaser 4 prototype, Tiled map, joystick, collision and action combat.
2. Scenes, map loading, persistent scene boundaries, enemy animation and UI foundations.
3. Combat depth, drops, monster AI, progression hooks, gameplay telemetry.
4. Auth + server modules + PostgreSQL, inventory and transaction-based wallet.
5. Buildings, expand-farm grid occupancy, build timers, transactions.
6. End-to-end combat-to-construction vertical slice and cloud save.
7. Crops, water, harvest, survival, rest and day-night tuning.
8. Livestock, production, crafting and warehouse/storage.
9. Offline simulation, catch-up correctness, worker and state migration tests.
10. Skills, quests, content pacing, optional cosmetic preview UI.
11. Closed alpha, mobile QA, anti-exploit hardening and operations drills.
12. Limited beta if launch gates are achieved; no paid launch if unsafe.

## Post-beta — Multiplayer and open PvP
- Social presence, authoritative shared exploration, latency reconciliation, abuse reporting and PvP safe zones.
- Player trading with escrow + item provenance + fraud controls.
- Separate load/budget plan for servers, fraud, moderation, and real-money payments.

## Definition of done for milestones
Each is deployable/testable, demonstrable without hidden manual patching, measured on desktop + a real landscape phone, with docs updated and a recorded test checklist.

## Risks
Isometric depth/picking, mobile FPS/input, asset production, economy duplication, offline time scale & concurrency, future server-authoritative PvP, scope creep, operation budget. Favor early technical spikes over broad scaffolding.
