# FDS-008 — Camera follow, zoom and resize

The CameraController owns native Phaser follow, viewport/bounds configuration,
canvas wheel input and a DOM HUD with zoom buttons. It does not update Player
or implement another camera update loop. No dependencies or engine versions change.

## Follow and geometry

- PlayerView.sprite.x/y is the projected **footpoint**. `startFollow(sprite,
  false, 0.12, 0.12)` follows that live object, preserving animation and foot-Y depth.
  Native lerp is per rendered frame; smoothing varies with render rate. Movement
  remains delta-based and independent of the camera. Subpixel follow avoids
  integer rounding jumps; nearest-neighbor texture sampling remains enabled.
- `core/camera.ts` projects the four outer corners with FDS-003 `gridToWorld`.
  For origin (1024,0), 32×32 tiles at 64×32, the diamond vertices are
  (1024,0), (2048,512), (1024,1024), (0,512). Its AABB is (0,0,2048,1024).
- `setBounds` uses that world AABB, not grid dimensions. Empty triangles inside
  the rectangular AABB use the background color #172c2c. This is rectangular
  camera clamping, not a polygon-constrained camera or runtime collision.
- If visible width/height (viewport/zoom) exceeds the map on an axis, expand
  bounds symmetrically on that axis. Phaser's own clamp then centers the map
  exactly and prevents follow oscillation. Other axes retain normal clamping.

## Zoom and resize

- CAMERA_CONFIG: default 1.5, minimum 0.5, maximum 3, step factor 1.2,
  follow lerp 0.12. Invalid/nonpositive zoom throws before changing camera state.
- Canvas wheel changes zoom by direction. Ctrl/Meta wheel is left to the browser.
  DOM +/- buttons are separate from joystick and Action pointer capture. Pointer
  presses activate immediately because browsers may suppress synthesized clicks
  during multitouch; keyboard/assistive clicks remain supported without doubling.
- Zoom/resize reframe toward the footpoint, subject to bounds; zoom does not
  anchor under the mouse and never changes logical/world player position or speed.
- Scale.RESIZE fills the game parent; it changes the camera viewport rather than
  stretching the world. Uniform camera zoom preserves the diamond ratio.
  DOM controls keep safe-area CSS positions and the existing portrait prompt.
- Pointer picking still uses FDS-003 pointerToGridCell -> Camera.getWorldPoint.
  Phaser refreshes its matrix in normal preRender. No custom inverse camera math.
  Debug hover labels refresh on pointer movement, not on stationary-pointer follow.
- Shutdown/destroy removes wheel, scale and scene listeners, DOM UI and follow.
  Pause/focus/orientation do not add camera listeners; existing input cancellation
  and portrait blocking remain owned by FDS-006/007.

## Verification — 2026-11-06

- 190 Vitest tests pass, including 28 new camera geometry/controller tests.
- Lint, typecheck, production build and git diff --check pass.
- localhost:8080 root smoke: one canvas; no captured console/JavaScript errors
  or HTTP >=400 responses. The existing development-only keyboard fixture loads
  the same production Game scene for state inspection.
- Real Phaser Camera browser helper: **260 assertions** across five viewports,
  three zooms and four corner cells plus center. It checks native bounds,
  settled scroll stability, oversized centering and pointer-grid round trips.
- Live scene: W/S/A/D move in screen directions, native follow changes scroll,
  Walk/Idle and foot-Y depth remain correct. Movement edge stress clamps player
  to (0.25,31.75); camera view stays within world bounds and picks cell (0,31)
  after zoom. Wheel and +/- buttons work.
- Layout measured at 568×320, 844×390, 1024×600, 1280×720; no control overflow.
  Portrait 390×844 shows the prompt and blocks movement, landscape restores it.
  The integrated browser can restore its host viewport between calls; tests set
  viewport within each call. CSS dynamic viewport rounding was below one pixel
  (390.4 camera/CSS units for a 390px canvas) and accounted for in layout checks.
  Screenshot raster output from this integrated browser remained inconsistent
  with measured viewport/canvas bounds. Layout acceptance uses DOM measurements;
  final visual review in a standalone browser remains recommended.
- Chromium CDP touch events verify joystick + Action concurrently, independent
  Action release, then joystick + zoom concurrently, and Idle on final release.
  A suppressed multitouch click was found and fixed with pointerdown activation.
- Four live scene restarts retain one camera overlay, one touch overlay, one
  keyboard listener and four total scale resize listeners (including Phaser's).

Real-device iOS/Android, nonzero hardware safe-area insets, browser toolbar
resizing, Safari/Firefox and long-running performance are **unverified**.
Browser emulation is not phone QA. Hosted CI is unverified; nothing was pushed.
FDS-009 collision/depth work is not included.

For reproduction, run `pnpm.cmd run dev`, open `/tests/keyboard.html`, then call
`keyboardCheck.verifyCameraGeometry()` in the browser console. The fixture also
exposes `cameraSnapshot()`, `snapshot()`, `restart()` and `stressBounds()`.
