# FDS-004 — Isometric prototype tilemap

## Assets and editing

Open [farm.tmj](../apps/game/public/assets/prototype/farm.tmj) in Tiled as a
JSON map. It is authored in the Tiled format by a deterministic project script,
not claimed to be an export from an installed Tiled editor. Dimensions: 32x32,
orientation isometric, tile size 64x32, finite map, no layer offsets or parallax.

- Ground: 1024 non-empty tiles, grass GID 1 and dirt GID 2.
- Detail: empty GID 0, path GID 3 and flower patches GID 4.
- Obstacles: 9 point objects (6 trees, 3 rocks), each with unique in-bounds
  integer col/row custom properties and type tree/rock. Tiled object-space
  x/y are `(col+0.5)*tileheight`, `(row+0.5)*tileheight`; runtime positions use
  the canonical col/row and FDS-003 gridToWorldCenter, not another projection.
  FDS-009 adds `collisionShape`, `collisionWidth`, `collisionDepth` properties
  for ground footprints; see [collision and depth](./COLLISION-DEPTH.md).
- Embedded prototype-terrain tileset: 4 columns, 4 tiles, 256x32 RGBA PNG;
  relative image path terrain.png, no margin or spacing.

[Attribution and MIT terms](../apps/game/public/assets/ATTRIBUTION.md) cover
the original PNG, map, generator and geometric tree/rock placeholders.
No downloaded art or music is used by the scene. Original template images
are retained but the background/logo are no longer loaded.

To regenerate the original prototype (overwrites manual map/PNG edits):

```powershell
node apps/game/tools/generate-prototype-map.mjs
```

The generator uses Node 26 native TypeScript support to reuse FDS-003 constants
without extra dependencies. Node may print a module-type detection warning;
it does not affect the output. Edit the map in Tiled or edit/regenerate the
generator layout deliberately; regeneration is not part of dev/build/tests.
Actual Tiled GUI opening/saving has not been tested in this environment.

## Phaser integration and coordinates

[Game scene](../apps/game/src/game/scenes/Game.ts) loads JSON and PNG via
Phaser 4.0.0's tilemapTiledJSON/image loaders, validates the prototype asset
contract, matches the tileset name and creates ordinary TilemapLayer objects
for Ground and Detail. The optional GPU path of createLayer is not enabled.
Missing assets/layers are reported to console with a visible failure message.

FDS-003 top-vertex origin is `(1024,0)`: map rows times half tile width places
the left map extent at X=0. Layers are at `(992,0)` (origin minus half width).
The following diamond TOP coordinates are checked against the actual layer's
tileToWorldXY result plus half width in X:

| Cell | World top |
| --- | --- |
| (0,0) | (1024,0) |
| (5,5) | (1024,160) |
| (0,31) | (32,496) |
| (31,0) | (2016,496) |
| (31,31) | (1024,992) |

Gold dots mark the five cell centers, 16px below each top. Hover uses the
existing pointerToGridCell adapter and highlights the selected diamond.
Obstacle graphics are separate objects ordered by footpoint Y; this is visual
placement only. There are no physics bodies or runtime collision checks.

The initial camera fits the 2048x1024 world diamond with 14% viewport padding,
centered on the projected map center. No player follow, zoom controls, mobile
controls or resize camera system is introduced (later tickets).

Phaser 4.0.0's Tilemap.orientation typings say string, while ParseJSONTiled
returns the numeric Orientation enum. The boundary value is read as unknown
and compared to Orientation.ISOMETRIC, without disabling TypeScript checks.

## Verification

Run root lint, typecheck, test and build scripts. The new Node/Vitest asset
tests are .mjs so filesystem/PNG checks require no extra Node typings dependency.
They validate metadata, layers/GIDs, PNG header/decompression, obstacles,
coordinate checkpoints and rejection of broken data.

Start `pnpm.cmd run dev`, open http://localhost:8080, and inspect the map and
browser Console/Network. To repeat the real TilemapLayer integration diagnostic:

```javascript
await (await import('/tests/tilemap.browser.mjs')).runTilemapBrowserChecks()
```

This briefly creates and destroys a second game instance. Expected: PASS,
two TilemapLayer instances, 1024 ground tiles drawn, 9 obstacles, five matching
coordinate checkpoints and successful pointer picking through the fitted camera.
This diagnostic is separate from CI. Real mobile, full collision/occlusion with
actors, Tiled GUI round trips and hosted GitHub CI remain unverified.
