# Repository Guidelines

## Project Structure & Module Organization
- Monorepo (pnpm workspaces). Key paths:
  - `apps/ui/` Next.js app (Data Health, Ingestor).
  - `packages/` libraries: `types/`, `core/`, `storage/`, `ingestor/`, `cli/`.
  - `configs/` runtime config: `default.config.yaml` (override via `HYPERLOCAL_CONFIG` or `configs/local.config.yaml`).
  - `scripts/` helper scripts; lake under `storage_root` (default `./data/hyperliquid`).

## Build, Test, and Development Commands
- `pnpm dev`: run package dev tasks in parallel (watchers).
- `pnpm --filter ui dev`: run the UI locally (recommended).
- `pnpm test`: run unit/integration tests.
- `pnpm typecheck`: TypeScript project references build check.
- `pnpm lint`: ESLint + Prettier.
- `pnpm run ci`: typecheck, lint, tests, and forbidden-symbols scan.
- `pnpm db:init` · `pnpm storage:seed` · `pnpm storage:verify`: storage ops.
- `pnpm --filter @hyperlocal/storage test` · `pnpm --filter @hyperlocal/ingestor test`: targeted tests.

## Coding Style & Naming Conventions
- Language: TypeScript (strict). Node 20, pnpm 9.
- Formatting: Prettier; linting: ESLint; base config in `tsconfig.base.json`; EditorConfig enforced.
- Naming: types/interfaces `PascalCase`; variables/functions `camelCase`; constants `UPPER_SNAKE_CASE`; files `kebab-case.ts`.
- Do not introduce any trading/execution/signing code. This is signals-only; CI blocks forbidden terms.
- Schemas via `zod`; keep HL wire payloads and normalized types side-by-side for audit.

## Testing Guidelines
- Framework: Vitest (deterministic unit/integration).
- Location: co-locate `*.test.ts` next to sources.
- Storage and Ingestor have runnable tests; prefer targeted filters when iterating.
- Run `pnpm test` and `pnpm run ci` before PRs.

## Commit & Pull Request Guidelines
- Commits: Conventional Commits style (e.g., `feat(ingestor): add heartbeat`).
- PRs must include: clear scope/summary, linked issue, screenshots for UI, reproduction steps, and checklist of `pnpm ci` passing.
- Small, focused PRs preferred; update docs/configs when contracts change.

## Security & Configuration Tips
- Local-only by design; no secrets required. Switch to testnet in `configs/local.config.yaml` (`ws.url`).
- Signals-only guardrail: `scripts/forbidden-check.cjs` blocks trading/execution symbols (CI).
- UI Data Health shows per-interval row breakdown; verify after ingestor Start.
