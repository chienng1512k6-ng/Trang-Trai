# FARM DEVELOPMENT — DESIGN PACK V1.0

Status: Design baseline, 2026-11-06. This pack is **documentation and agent configuration**, NOT a finished running game.

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
