import { worldToGrid } from './isometric';
import type { MovementInput } from './player';

export const PC_BINDINGS = Object.freeze({ up: 'KeyW', down: 'KeyS', left: 'KeyA', right: 'KeyD',
    interact: 'KeyE', attack: 'Space' } as const); // Future actions: definitions only, no handlers.
export const MOVEMENT_CODES = [PC_BINDINGS.up, PC_BINDINGS.left, PC_BINDINGS.down, PC_BINDINGS.right];

/** Screen intent uses the SAME inverse projection as positions (zero origin),
 * then unit ground magnitude. No movement speed or delta handling here.
 */
export function keyboardIntent(pressed: ReadonlySet<string>): MovementInput {
    const x = Number(pressed.has(PC_BINDINGS.right)) - Number(pressed.has(PC_BINDINGS.left));
    const y = Number(pressed.has(PC_BINDINGS.down)) - Number(pressed.has(PC_BINDINGS.up));
    return screenIntentToGrid({ x, y });
}

/** Shared directional inverse. Preserve analog magnitude after ground normalization. */
export function screenIntentToGrid({ x, y }: { readonly x: number; readonly y: number }, magnitude = 1): MovementInput {
    if (![x, y, magnitude].every(Number.isFinite)) return { col: 0, row: 0 };
    const grid = worldToGrid({ x, y });
    const length = Math.hypot(grid.col, grid.row);
    const strength = Math.max(0, Math.min(1, magnitude));
    return length === 0 || strength === 0 ? { col: 0, row: 0 } : { col: grid.col / length * strength, row: grid.row / length * strength };
}
