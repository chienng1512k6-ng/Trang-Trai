# FARM DEVELOPMENT — DESIGN PACK V1.0

Status: Sprint 1 foundation and development quality tooling. The client currently
renders a 32x32 isometric prototype map; player gameplay is not implemented.

Map authoring, asset attribution, coordinate checkpoints and browser verification:
[Isometric tilemap](docs/ISOMETRIC-TILEMAP.md).

## Environment and local commands

Use Node.js 26 (validated locally with 26.13.0), pnpm 12.18.0 and Git.
Phaser is pinned to 4.0.0; the installed Vite and TypeScript versions are
6.4.5 and 5.7.3. Run commands from the repository root:

```powershell
pnpm.cmd install --frozen-lockfile
pnpm.cmd run dev
```

Open the URL printed by Vite (normally http://localhost:8080). Stop with Ctrl+C.
PowerShell uses pnpm.cmd to avoid blocked pnpm.ps1; no Execution Policy change
is needed. On Linux/macOS use pnpm instead of pnpm.cmd.

```powershell
pnpm.cmd run lint
pnpm.cmd run typecheck
pnpm.cmd run test
pnpm.cmd run build
```

Lint uses ESLint Flat Config and TypeScript ESLint recommended rules, excludes
generated output and node_modules, and treats warnings as failures. Unit tests
use Vitest in one-shot mode: failed assertions return a nonzero exit code.
The bootstrap tests mock Phaser to run without a browser or WebGL; they do not
replace browser rendering tests. Production output is in apps/game/dist.

## CI results

[Development Quality](.github/workflows/ci.yml) runs on pushes and pull requests
with Node 26 and pnpm 12.18.0: frozen install, lint, typecheck, tests, then build.
No secrets are required. A failed step fails the job and prevents later checks
from running. After pushing your reviewed changes, open GitHub **Actions →
Development Quality**, or the pull request's **Checks** tab, and inspect each
step's log. Local success does not verify the hosted GitHub run; no push is
performed automatically.

## Files
- `docs/GDD-V1.0.md` — product scope, core loops, world systems, PvP and monetization boundaries
- `docs/ARCHITECTURE.md` — modular architecture, persistence, server authority and multiplayer path
- `docs/ADR-001-PHASER-4.md` — engine/version selection and isometric limitations
- `docs/MASTER-ROADMAP.md` — milestone and launch gates
- `tasks/SPRINT-01.md` — ordered tasks, dependencies, estimates, acceptance tests
- `docs/SETUP-CODEX-WINDOWS.md` — PowerShell-based setup and Codex workflow
- `AGENTS.md` — scoped agent instructions
- `.codex/config.toml` — suggested safe default CLI permissions (review before use)
- `prompts/SPRINT-01-KICKOFF.md` — prompt for Codex to start Sprint 1

## Import into a new repository
1. Create an empty `farm-development` folder and initialize Git.
2. Copy all the files from this pack into that folder.
3. Follow `docs/SETUP-CODEX-WINDOWS.md`.
4. Launch Codex from the repository root, first in **planning mode** with the prompt provided.

Do **not** request the entire game in one Codex task. Each ticket has an explicit finish line.

## Sources checked (2026-11-06)
- Codex CLI: https://developers.openai.com/codex/cli/
- Codex config: https://developers.openai.com/codex/config-basic/
- AGENTS.md: https://developers.openai.com/codex/guides/agents-md/
- Windows: https://developers.openai.com/codex/windows/
- Phaser 4 releases: https://phaser.io/download/phaser4
- Phaser 4 isometric tilemap: https://github.com/phaserjs/phaser/blob/master/skills/tilemaps/SKILL.md
- Phaser Create Game CLI: https://phaser.io/tutorials/create-game-app
- Node LTS: https://nodejs.org/en/download
- pnpm: https://pnpm.io/installation
