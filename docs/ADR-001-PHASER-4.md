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

## Official references
- https://phaser.io/download/phaser4
- https://www.phaser.io/oss/docs/api-documentation/class/tilemaps-tilemap
- https://github.com/phaserjs/phaser/blob/master/skills/tilemaps/SKILL.md
