# TECHNICAL ARCHITECTURE — FARM DEVELOPMENT

Status: Planned architecture. Sprint 1 implements only Phaser + TypeScript + Vite.

## 1. Repository strategy
pnpm workspace (TypeScript):

```text
apps/
  game/     Phaser 4 + Vite standalone client (Sprint 1)
  web/      Next.js account/portal/dashboard (later)
  api/      NestJS modular monolith (later)
  worker/   delayed jobs and offline simulation (later)
packages/
  core/        pure game rules, math and shared types
  contracts/   versioned API schemas and validation
  simulation/  deterministic offline progression
  game-config/ definitions for items, mobs, crops, buildings
  database/    Prisma schema and migrations
```

Separate rendering from domain state. Starting with a standalone `apps/game` avoids SSR and canvas integration complexity. Later integrate with the portal by sharing same-origin auth/API behind deployment routing, not by granting game client direct database access.

## 2. Coordinate systems
- Canonical grid cell: integer (col,row), `zoneId`, optionally chunkId. Canonical world simulation positions: fixed or integer sub-cell units as needed.
- Example 2:1 diamond projection centered at origin: `sx=(col-row)*(tileWidth/2)`, `sy=(col+row)*(tileHeight/2)`; inverse is tested and camera transforms must be applied before picking.
- Sprites have a footpoint anchor and world collision shape; depth ordering is based on footpoint Y (with per-layer offsets), not sprite top edge.
- Grid ownership/occupancy is checked by authoritative backend, independently of visible tile color.

## 3. Core game modules (future)
Auth, Users, Characters, World, Inventory, Wallet, Combat, Drops, Buildings, Farming, Livestock, Crafting, Survival, Quests, Simulation, Cosmetics, Analytics.

## 4. Authority boundaries
- Client predicts movement/plays animations/renders effects and shows previews.
- Server validates purchases, money, items, cooldown/reward logic, ownership, and world mutations.
- Authentication via a managed provider supporting email+Google (provider chosen before backend implementation). Always map auth identity to internal stable user ID.
- Do not accept `goldAwarded`, `dropContents`, `elapsedOfflineSeconds` at face value from client.
- Backend owns time for persistent jobs; clock skew tolerated by design.

## 5. Persistence (future)
PostgreSQL/Prisma. Initial high-value tables: users, characters, farms, owned_plot_chunks, inventory_stacks, wallets, wallet_ledger, placed_buildings, construction_jobs, drop_bags, simulation_state.
- Wallet movements use ACID transactions and integer minor units, reference unique operation IDs.
- API commands require idempotency keys where retries could duplicate money/items.
- Unique keys and locks guard duplicate building placement and double item claims.
- Build placement records definitionId, grid coords, orientation, lifecycle state, timestamps, version.
- Event log/audit and backup/restore strategy are release gates.

## 6. Offline catch-up (future)
One authoritative state timeline, event queue + elapsed-time fast-forward for independent producers; deterministic ordering, resource caps and replay protection. Worker for scheduled tasks that must trigger without a user session. Heavy jobs are bounded and queued; do not block all login requests behind a massive simulation.

## 7. Multiplayer path (future)
Shared region instance with server-authoritative real-time simulation, proximity/interest management, spatial state and PvP rules. Introduce WebSocket or game networking only after evaluating combat latency and reconciliation needs. Keep private farm logic and persistent inventory isolated from ephemeral zone server state.

## 8. Operations (later)
CI: lockfile install, lint, TS check, tests, build. Staging then beta. Structured logs + error tracking, backups, migrations/rollback procedures, fraud alerts, rate limiting, privacy/security requirements. Do not choose expensive infrastructure without measured load or budget.

## 9. Security and commercial rules
Asset licenses and attribution tracked. Cosmetics cannot improve combat, construction speed, stamina or yields. Secure session handling and account recovery. Avoid P2W and loot loss of paid entitlements. Abuse reports/moderation precede open PvP launch.
