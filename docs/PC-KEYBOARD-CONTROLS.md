# FDS-006 — PC keyboard controls

## Mapping

[keyboardIntent.ts](../apps/game/src/core/keyboardIntent.ts) turns physical
KeyboardEvent.code WASD into screen intent `(D-A, S-W)`. Opposite keys cancel
before conversion. Feed this vector through FDS-003 worldToGrid at zero origin,
then normalize its ground-space magnitude to one. This reuses the position
inverse for displacement and adds no second projection.

| Keys | Unit grid direction (col,row) |
| --- | --- |
| W | (-1,-1)/sqrt(2) |
| S | (1,1)/sqrt(2) |
| A | (-1,1)/sqrt(2) |
| D | (1,-1)/sqrt(2) |
| W+A | (-3,-1)/sqrt(10) |
| W+D | (-1,-3)/sqrt(10) |
| S+A | (1,3)/sqrt(10) |
| S+D | (3,1)/sqrt(10) |

The 3:1 combinations produce 45-degree screen diagonals with 64x32 tiles.
All nonzero combinations have the same ground magnitude/speed. Apparent pixel
speed can differ by direction as specified in FDS-005. Speed, delta policy,
map clamp, animation selection and footpoint/depth remain unchanged.

PC_BINDINGS reserves E for interaction and Space for attack as definitions only.
They have no listeners, capture, gameplay actions or combat implementation.

## Phaser and lifecycle

[KeyboardInput.ts](../apps/game/src/game/player/KeyboardInput.ts) implements
the existing PlayerInput interface using Phaser 4.0.0 KeyboardPlugin keydown
and keyup events. The installed KeyboardManager dispatches these synchronously
from its DOM event handler via MANAGER_PROCESS, so preventDefault on accepted
game WASD still occurs during native dispatch. No global captures or Phaser Key
objects are registered; text entry remains unaffected.

Held codes live in a Set, so repeat events do not stack. Blur, focus return,
visibility change, focusin, pause and sleep clear held state. Sampling also
checks document focus, visibility and active editable elements. Auto-repeat
after a reset cannot reintroduce a hold until a fresh non-repeat keydown.
Input/textarea/select/contenteditable, IME composition and Ctrl/Alt/Meta
shortcuts are not consumed. Matching keyup always removes its hold.

The adapter removes its two keyboard listeners, four DOM listeners and four
scene listeners on shutdown/destroy; disposal is idempotent. No global capture
state or other adapters' listeners are changed. Scene restart creates a fresh
adapter. The scene wires it to the existing Player; core movement and PlayerView
are not modified.

Default http://localhost:8080/ uses WASD. With `?playerDemo=1` in development,
only DemoInput is connected, and real input adapters are not instantiated. Production
removes the demo branch and uses WASD even if the query is present.
FDS-007 adds [touch controls](./MOBILE-TOUCH-CONTROLS.md): a held joystick takes
priority over keyboard (even in the dead zone), and release restores WASD.

## Verification

Run the normal root lint/typecheck/test/build scripts using pnpm.cmd in Windows.
New unit tests cover eight directions, opposite/no keys, ground normalization,
screen projection, Idle/facing behavior through the existing movement function,
press/release/repeat, focus/visibility/text input, shortcuts and listener cleanup.

For repeatable browser checks open
http://localhost:8080/tests/keyboard.html. This standalone development-only page
boots exactly one real game with the same Game scene as the main entry. In
DevTools, `keyboardCheck.snapshot()` reports logical/world position, animation
and keyboard listener count; `await keyboardCheck.restart()` tests restart;
`keyboardCheck.stressBounds()` checks map edges through the keyboard adapter.
Do not start a second game on the main page: the first game's event prevention
can correctly keep a second game's KeyboardManager from receiving the same key.
The browser automation used an equivalent instrumented single-game bootstrap
at localhost:8080 to inspect state while sending real Playwright key events.

Local browser checks passed W/S/A/D, four diagonal combinations, opposite keys,
release-to-idle, text entry in input/textarea/contenteditable, no page scroll,
no console errors, blur reset, three restarts with one keydown listener and
map-bound stress. Blur was dispatched as an event; physical OS Alt-Tab and
real hidden-tab transitions still need manual confirmation. Unit tests cover
visibility changes. Real hardware key ghosting, mobile and hosted GitHub CI
remain unverified. No joystick, camera follow, obstacle collision or combat added.
