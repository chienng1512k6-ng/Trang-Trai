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
    const grid = worldToGrid({ x, y });
    const length = Math.hypot(grid.col, grid.row);
    return length === 0 ? { col: 0, row: 0 } : { col: grid.col / length, row: grid.row / length };
}
