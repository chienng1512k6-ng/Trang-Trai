# Asset sources and licenses

## FDS-004 prototype map and artwork

- Files: prototype/farm.tmj, prototype/terrain.png.
- Author: Farm Development project (created with Codex assistance, 2026-11-06).
- Source: original procedural pixel art and authored map layout in
  [generate-prototype-map.mjs](../../tools/generate-prototype-map.mjs).
- Tree/rock graphics: original geometric placeholder artwork drawn in
  [Game.ts](../../src/game/scenes/Game.ts); same author and license.
- License for these original assets and their generator: MIT (text below).
- No downloaded imagery, music or third-party art is used by the map scene.

## FDS-005 player artwork

- File: player/farmer.png (192x192 RGBA PNG, 24 frames of 32x48 pixels).
- Author: Farm Development project, created with Codex assistance, 2026-11-06.
- Source: original procedural pixel art in
  [generate-player.mjs](../../tools/generate-player.mjs), no third-party images.
- License: MIT, under the Farm Development contributors copyright and full
  terms below (also applies to this player asset and generator).
- Rows: southEast, southWest, northWest, northEast. Columns 0-1 idle, 2-5 walk.
  Authored contact point is (16,46) in every frame; transparent canvas 32x48.

## Retained template files

bg.png, logo.png, favicon.png and the repository's template screenshot were
supplied by the Phaser Studio template; see [template LICENSE](../../LICENSE)
and [upstream template](https://github.com/phaserjs/template-vite-ts).
The old background/logo are retained but are not loaded by the map scene.

## MIT License — original project assets

Copyright (c) 2026 Farm Development contributors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
