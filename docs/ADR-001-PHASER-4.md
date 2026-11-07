# ADR-001: Use Phaser 4 for the isometric gameplay prototype

Status: Accepted for Sprint 1 on 2026-11-06, subject to hands-on validation.

## Context
Phaser 4 was released in April 2026. Stable v4.2.1 is listed on Phaser's release page as of 2026-11-06. Phaser's `TilemapLayer` supports isometric tilemaps exported from Tiled. `TilemapGPULayer`, in contrast, supports orthographic layers only, so it must not be used for this project.

## Decision
- Phaser 4 + Vite + TypeScript in a standalone browser game package (`apps/game`).
- Tiled JSON for isometric map authoring. Choose a documented diamond 2:1 projection (illustrative diamond tile: 64×32 px). Confirm art scale during prototype.
- Use ordinary `TilemapLayer`; object overlays are separate game objects with explicit depth ordering based on sprite footpoints.
- Physics/collision and grid occupancy are distinct from visible sprite outlines.
- Prefer Phaser built-in tile conversions; wrap in our own small adapter for tests and cross-module use.

## Consequences and tests
- Validate canvas/WebGL performance on a real mid-range phone and PC.
- Validate pointer-to-tile picking under camera scroll + zoom.
- Confirm tiles are drawn in correct order and characters pass correctly behind trees/buildings.
- If performance or rendering blocks requirements, raise an ADR before switching engines.

## Sprint 1 validation outcome — FDS-013, 2026-11-07

Retain the installed **Phaser 4.0.0**, Vite 6.4.5 and TypeScript 5.7.3.
The historical release-page context above is not an instruction to upgrade.
Ordinary TilemapLayer renders the 32×32 isometric map; the five authored tile
checkpoints match the shared projection. Native Camera.getWorldPoint/startFollow
and footpoint depth are integrated and covered by browser diagnostics. Pure
movement/collision/FSM/combat remains separate from Phaser rendering.

Owner-reported Chrome desktop and physical iPhone Safari functional QA passed;
both Safari gesture fixes are CLOSED. Production Electron timing was measured
for 600 seconds. It is not Chrome or phone FPS. Phone model/performance tier,
numerical phone performance and a broader device matrix remain unverified, so
the original mid-range-phone performance criterion is not quantitatively closed.
Hosted CI was verified SUCCESS on 2026-11-07 for commit 53692f9; the final report
records its run URL and full SHA. No engine blocker or evidence justifying a switch
was identified for this local prototype. Buildings/elevation/many entities and
commercial beta readiness are not validated by this decision.

See [final review, evidence and limits](./SPRINT-01-FINAL-REPORT.md) and
[source-attributed QA](./PERFORMANCE-QA.md). FDS-013 and Sprint 1 are PASS after
closing the hosted CI gate; device-performance limitations above are unchanged.

## Official references (historical sources)
- https://phaser.io/download/phaser4
- https://www.phaser.io/oss/docs/api-documentation/class/tilemaps-tilemap
- https://github.com/phaserjs/phaser/blob/master/skills/tilemaps/SKILL.md
