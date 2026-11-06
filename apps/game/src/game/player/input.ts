import type { MovementInput } from '../../core/player';

export interface PlayerInput { sample(deltaMs: number): MovementInput }
export const idleInput: PlayerInput = { sample: () => ({ col: 0, row: 0 }) };
