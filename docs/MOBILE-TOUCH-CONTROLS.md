# FDS-007 — Virtual joystick and touch controls

## Architecture and Phaser boundary

- [VirtualJoystick](../apps/game/src/core/virtualJoystick.ts): renderer-free
  pointer ownership, normalized knob displacement, configurable dead zone and
  analog sampling. ActionPointer owns its own independent pointer ID.
- [TouchControls](../apps/game/src/game/player/TouchControls.ts): DOM ring/knob,
  Action prototype button, pointer capture, lifecycle and viewport layout.
- [CombinedInput](../apps/game/src/game/player/CombinedInput.ts): one input
  adapter for the existing Player. Held joystick wins over WASD, including its
  zero-output dead zone; releasing it falls back to the keyboard. Action never
  changes movement. A blocked/portrait/background/text-entry state returns zero.
- [Shared screen mapping](../apps/game/src/core/keyboardIntent.ts): both keyboard
  and joystick use screenIntentToGrid, which calls the FDS-003 inverse projection.
  No new projection, speed, time integration or second Player update loop.

The installed Phaser 4.0.0 InputManager/InputPlugin support activePointers and
addPointer, with one canvas touch pointer by default. Its TouchManager targets
the canvas and handles touchcancel. The overlay deliberately uses DOM Pointer
Events instead: its elements are outside the camera/canvas, so their two or more
pointer IDs do not consume Phaser's canvas pointer pool or require extra pointers.
This also avoids camera transforms/zoom for UI positions. See the browser
[Pointer Events documentation](https://developer.mozilla.org/en-US/docs/Web/API/Pointer_events).

## Joystick and multi-touch

Ring center is fixed; its rect is sampled on drag. The knob diameter is 35% of
the ring diameter, leaving 65% of the ring radius for center travel. Offset is
clamped to this travel radius. Dead zone defaults to 15% of maximum knob travel;
configure through the VirtualJoystick/TouchControls constructor.

For radial displacement r in [0,1], output strength is zero through the dead
zone d, otherwise `(r-d)/(1-d)`. Screen direction is inverse-projected and ground
normalized, then multiplied by strength. Full deflection reaches the existing
3 ground cells/second; half strength gives half speed. Sampling is independent
of frame rate. No frame timing is used to calculate joystick input.

Only the pointer which began a joystick hold can move/release it; a second
finger cannot steal it. Action has a separate owner and aria-pressed visual
state. Pointer capture keeps release/cancel routed to its element even outside
the circle/button. Up, cancel and lost capture clear the matching pointer only.
Blur, visibility, resize, text entry, scene pause/sleep reset both controls and
release held captures. Old fingers must start a new gesture after reset.

FDS-011 now labels Action **ATTACK** and buffers one attack per pointer press.
Release preserves a quick tap; cancel/blur clears pending input. Joystick and
Action ownership remain independent. See [combat](./COMBAT.md).

## Layout and lifecycle

The overlay fills the game app, with joystick bottom-left and Action bottom-right.
CSS clamp sizes and safe-area env insets keep controls inside the viewport.
The viewport meta enables viewport-fit=cover and the app uses dynamic viewport
height with a 100vh fallback. The existing Phaser FIT canvas scaling stays in
place; no follow/zoom/resize camera system is introduced. Safe-area variables:
[CSS env documentation](https://developer.mozilla.org/en-US/docs/Web/CSS/env).

Controls stay visible for mouse, touch and hybrid devices; no unreliable device
detection is used. Portrait shows a rotate prompt and suspends combined input;
orientation lock is never requested. Layout/orientation changes reset held input.
Only joystick/button have touch-action:none and consume their own pointer events.
The rest of the page, browser UI and input fields keep their normal behavior;
no body-wide touch cancellation, zoom restriction or global touch listeners.

Shutdown/destroy removes all owned DOM and scene listeners and the overlay;
disposal is idempotent. Development playerDemo mode creates neither keyboard
nor touch input, so demo and real input cannot compete.

## Verification and remaining QA

Run root lint/typecheck/test/build using pnpm.cmd on Windows. New unit tests
cover directions/diagonals, dead zone/analog magnitude, radius clamp, pointer
ownership, independent Action, release/cancel, resize/portrait, focus/visibility,
text entry, shutdown/restart and keyboard arbitration.

Use http://localhost:8080/ normally. The existing standalone input diagnostic at
http://localhost:8080/tests/keyboard.html also exposes touch state through
`keyboardCheck.snapshot()` and supports `await keyboardCheck.restart()`.

Chromium emulated touch checks used Input.dispatchTouchEvent with two pointer
IDs, not mouse-only dragging: movement, Action state, independent release in
both orders, drag outside the ring, cancellation and keyboard/touch priority
passed. Three scene restarts retained one overlay and one keyboard listener.
CSS viewport measurements passed landscape 568x320, 844x390 and 1024x600;
portrait 360x640 showed the prompt and blocked movement. The integrated browser
can restore its host viewport between calls, so screenshot capture at forced
viewport sizes was not reliable; layout assertions use measured CSS rects.

**Real-device QA is unverified.** Test Safari/iOS and Chrome/Android with two
fingers, notches/home indicators, browser toolbar resize, tab/app switching,
portrait-to-landscape changes and release outside controls. Nonzero physical
safe-area insets and hardware touch ergonomics are not proven by emulation.
Hosted GitHub CI remains unverified. No FDS-008+ behavior is implemented.
