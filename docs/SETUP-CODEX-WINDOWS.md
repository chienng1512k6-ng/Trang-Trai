# SETUP — WINDOWS + POWERSHELL + CODEX, STEP BY STEP

Checked against official docs in November 2026. Run commands locally on YOUR machine. Versions shown are minimum decisions, not commands executed by this document.

## Step 0 — Choose the workflow
**Recommended:** Windows 11 + VS Code + PowerShell + Codex CLI (native Windows). WSL2 is optional if Windows sandbox or toolchain problems occur; don't mix Windows and WSL project paths/dependencies in one repo.

## Step 1 — Install prerequisite applications
1. Git: https://git-scm.com/downloads
2. VS Code: https://code.visualstudio.com/
3. Node.js **26 LTS** (or supported LTS when installing): https://nodejs.org/en/download
4. Tiled: https://www.mapeditor.org/
5. LibreSprite or Aseprite (optional for prototype).
6. Chrome/Edge and real Android/iPhone browser for physical QA.
7. Docker Desktop, PostgreSQL, Redis, Next.js, NestJS: **not required for Sprint 1**.

After restarting PowerShell:

```powershell
node --version
npm --version
git --version
```

## Step 2 — Install pnpm and Codex

```powershell
npm install -g pnpm@latest
npm install -g @openai/codex
pnpm --version
codex --version
```

If `npm.ps1 cannot be loaded because running scripts is disabled`, avoid changing system policy indiscriminately; run `npm.cmd` / `pnpm.cmd` in PowerShell, or use Command Prompt, or consult Windows execution policy guidance.

## Step 3 — Create the repository and unpack this pack

```powershell
mkdir farm-development
cd farm-development
git init
```

Copy `AGENTS.md`, `.codex/`, `docs/`, `tasks/`, and `prompts/` from the starter ZIP into the root of this directory. Keep `.codex/config.toml` restricted to workspace-write/on-request as supplied.

## Step 4 — Initialize Phaser game with the official generator

### Existing repository — FDS-001

The game is already scaffolded. Do not rerun the generator. Use pnpm 12.18.0
(pinned in the root manifest) and run these commands from the repository root:

```powershell
pnpm.cmd install --frozen-lockfile
pnpm.cmd run typecheck
pnpm.cmd run build
pnpm.cmd run dev
```

Vite uses port 8080; check its printed URL if the port is occupied. The default
dev/build scripts invoke Vite directly without template telemetry. Only esbuild
is explicitly allowed to run dependency build scripts. Keep pnpm-lock.yaml as
the dependency lockfile; do not generate an npm package-lock.json.
PowerShell commands use pnpm.cmd without changing Windows Execution Policy.
For a trusted phone, use `pnpm.cmd --dir apps/game run dev --host 0.0.0.0`.
Browser rendering, console errors and real-phone behavior must be checked
separately. Lint/unit/CI setup remains FDS-002.

### New repository only

```powershell
mkdir apps
pnpm create @phaserjs/game@latest
```

In the generator, choose a **TypeScript + Web Bundler + Vite** starter with **Phaser 4**, and set output folder to `apps/game` if supported. CLI menus and template names can evolve, so follow its interactive options and verify the generated `apps/game/package.json`. If it creates a different folder, move the clean generated project to `apps/game` before wiring the workspace. Do not blindly overwrite an existing folder.

At repository root, create `pnpm-workspace.yaml`:

```yaml
packages:
  - 'apps/*'
  - 'packages/*'
```

Use the package manager's actual scripts from generated `apps/game/package.json` — generally:

```powershell
pnpm install
pnpm --dir apps/game dev
```

To serve a trusted phone on the same local Wi-Fi:

```powershell
pnpm --dir apps/game dev --host 0.0.0.0
```

Find the computer LAN IPv4 address with `ipconfig` and browse to `http://<LAN-IP>:<VITE-PORT>` on the phone. Confirm Vite's actual displayed port and Windows Firewall rules; avoid public exposure. The `--host` argument's forwarding is template/script-specific; if not accepted, use the Vite CLI directly or update its script.

## Step 5 — Launch Codex, sign in and inspect permissions

```powershell
codex
```

Sign in using the available ChatGPT option. Use `/status`, `/permissions`, and `/model` to inspect settings. Approval mode should ask before elevated actions; never use Full Access for routine scaffolding.

Read: https://developers.openai.com/codex/cli/ and https://developers.openai.com/codex/windows/

## Step 6 — Verify AGENTS.md and start with PLAN ONLY
From the repository root, ask Codex:

> Read `AGENTS.md`, `docs/GDD-V1.0.md`, `docs/ARCHITECTURE.md`, `docs/ADR-001-PHASER-4.md`, and `tasks/SPRINT-01.md`. Do not modify files yet. Report repository state, risk/unknowns, the smallest implementation path for FDS-001 only, exact commands you would run, and acceptance tests. Wait for my instruction before changes.

After reviewing its plan, request implementation of FDS-001 only. Review `git diff` and build output before accepting.

## Step 7 — Git checkpoint and tasks

```powershell
git status
git add AGENTS.md .codex docs tasks prompts README.md pnpm-workspace.yaml apps
# only if these paths exist and have been reviewed
git commit -m "chore: initialize farm development prototype"
```

Create a `.gitignore` for `node_modules`, `dist`, `.env*` secrets, logs, and local cache, but **do not ignore `.env.example`**. Check `git diff --cached` before every commit.

## Step 8 — QA and basic automation
FDS-002 provides root lint, typecheck, test and build scripts. Run
`pnpm.cmd run lint`, `pnpm.cmd run typecheck`, `pnpm.cmd run test` and
`pnpm.cmd run build` after `pnpm.cmd install --frozen-lockfile`.
See the root README for CI results and commands. Browser automation can be
added at FDS-012; real-device manual QA is still required.

## Optional integrations — NOT day-one requirements
- GitHub CLI: https://cli.github.com/ (push issues, pull requests)
- Codex MCP: `codex mcp --help`; add docs/browser connectors only as needed, verify permissions (https://developers.openai.com/codex/mcp/)
- GitHub Actions: add after base scripts work.
- Docker + database: Sprint after prototype when persistent accounts/economy are introduced.

## Troubleshooting
- `codex` not found -> restart terminal, inspect global npm bin / PATH.
- Node version too old -> install an LTS supported by your framework versions.
- Browser blank -> inspect browser console, asset URLs and Vite dev logs.
- Tilemap shows nothing -> check exported map orientation, image asset paths, Tiled tileset names and ordinary `TilemapLayer` usage.
- Camera selecting wrong cell -> inspect camera scroll/zoom transformation before converting screen to grid.
- Mobile cannot reach PC -> same trusted Wi-Fi, correct IP/port, firewall rules and development server host binding.
- Phone landscape touch not working -> set mobile viewport tag, pointer event handling and safe-area layout.
