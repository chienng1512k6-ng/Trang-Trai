# FDS-003 coordinate contract

Pure helpers: [isometric.ts](../apps/game/src/core/isometric.ts). They stay in
the game package until a second consumer justifies extracting packages/core.
No new dependency or workspace is needed.

## Conventions

- Grid: `{ col, row }`. World: `{ x, y }` in pixels, Y pointing down.
  Origin is the TOP vertex of diamond cell (0,0), not its center or image corner.
- Defaults: 64x32 diamond (2:1), bounds 32 columns x 32 rows. Other finite,
  positive 2:1 dimensions and custom bounds are supported.
- `gridToWorld`: `x=origin.x+(col-row)*width/2`,
  `y=origin.y+(col+row)*height/2`. `worldToGrid` is the continuous inverse.
  Neither rounds nor clamps. `gridToWorldCenter` projects `(col+0.5,row+0.5)`.
  Thus (0,0) projects to (0,0), its center to (0,16), and (5,5) to (0,160).
- `worldToGridCell` floors both inverse components. Cells are half-open
  `[col,col+1) x [row,row+1)`, including negative coordinates. At shared edges,
  the increasing grid coordinate owns the boundary. No epsilon is added;
  floating-point values extremely close to an edge may fall on either side.
- Bounds checks require integer indices in `[0,columns) x [0,rows)`.
  Outside picking returns outside indices; callers decide whether to reject.
- Position/origin inputs must be finite numbers. Helpers validate dimensions
  and bounds, return fresh objects and do not mutate inputs.

## Phaser and Tiled

For ordinary Phaser TilemapLayer at scale 1 and scroll factors 1, place the
layer at `(origin.x-width/2, origin.y)`. Phaser 4.0.0's
`IsometricTileToWorldXY` returns image bounding-box top-left: add width/2 to X
for our top vertex. `IsometricWorldToTileXY(..., originTop=true)` then matches
our cell picking. This was verified against installed source and the real API.

Tiled tile-layer indices map directly to col/row. Explicitly choose layer
placement on import; editor canvas pixels are not automatically game world
pixels. Tiled object-layer coordinates need a separate conversion later; see
[Tiled layer documentation](https://doc.mapeditor.org/en/stable/manual/layers/).
No map or object importer is implemented in FDS-003.

[pointerToGridCell](../apps/game/src/game/isometricPointer.ts) calls
`camera.getWorldPoint(pointer.x,pointer.y)` before the pure inverse. Pass
Phaser canvas-space pointer X/Y and the intended camera, not DOM client
coordinates or stale pointer.worldX/worldY. Phaser owns scroll, zoom, rotation
and viewport transforms; its matrices must be current after preRender.
Non-unit layer scale, parallax, parent transforms and elevation are outside
this adapter contract.

## Verification

Vitest covers pure math with 1000 seeded fractional round trips, origins,
centers, shared edges, negative/outside coordinates, bounds and invalid sizes.
Adapter unit tests verify delegation and Phaser type compatibility without DOM.

To repeat real Phaser camera/tile API checks, run `pnpm.cmd run dev`, open its
URL and execute in browser DevTools:

```javascript
(await import('/tests/isometric.browser.mjs')).runIsometricBrowserChecks()
```

Expected: Phaser 4.0.0, status PASS, 40 checks: scroll, four zoom values,
rotation, viewport offset, translated origin, negative/outside cells and tile
conversion parity. This diagnostic runs in the browser separately from CI.
Loading the full Camera module in Node failed due to Phaser's window dependency;
no DOM emulation dependency was introduced.
