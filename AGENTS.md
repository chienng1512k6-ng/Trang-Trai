# Farm Development — Repository Instructions for Codex

## Canonical documentation
Before implementation, read `docs/GDD-V1.0.md`, `docs/ARCHITECTURE.md`, the relevant ADRs and the current ticket in `tasks/SPRINT-01.md`.
Prefer game-design consistency over improvising features.

## Tech decisions
- Sprint 1: Phaser 4, TypeScript, Vite in `apps/game` within a pnpm monorepo.
- Later (not Sprint 1): Next.js portal, NestJS modular backend, PostgreSQL/Prisma, worker-based offline simulations.
- Use Phaser's ordinary `TilemapLayer` for isometric maps. Do not use `TilemapGPULayer` for isometric geometry.
- Game simulation and input logic must be testable independently of Phaser rendering.
- Isometric grid coordinates are canonical; screen coordinates are derived.
- Desktop WASD and landscape mobile touch/joystick are primary controls.

## Workflow
1. Inspect repository state and report any mismatches with the design baseline.
2. For tasks touching >3 files or architecture, create a small plan first.
3. Work on one Sprint ticket at a time; avoid adding out-of-scope features.
4. Explain changes to dependencies or architecture before applying them.
5. Implement and test; run relevant lint/typecheck/unit/build checks where scripts exist.
6. Report the exact commands actually run, successes, failures and remaining limitations.
7. Update ticket status and docs only when behavior changes. Never mark untested work as done.

## Code quality
- TypeScript strict mode, no unjustified `any` or disabling type checks.
- Keep projection helpers pure and unit-tested. Normalize diagonal movement.
- Avoid network, database, registration and payments code in Sprint 1.
- Do not use inaccessible or unlicensed images/music. Record source/license attribution of imported assets.
- No credentials in git. Never commit `.env` secrets. No production deployment without approval.
- No destructive Git commands, deletion of user work, or database resets without explicit consent.
- No `--dangerously-bypass-approvals-and-sandbox` or broad full-access defaults.

## Definition of done
Ticket's acceptance checks pass; target browsers tested or listed as unverified; code built with no unexplained errors; changes described in a concise summary.
