# Repository Guidelines

## Project Structure & Module Organization
- Monorepo (pnpm workspaces). Key paths:
  - `apps/ui/` Next.js dashboard.
  - `packages/` core libraries: `types/`, `core/`, `bus/`, `ingestor/`, `analytics/`, `backtester/`, `storage/`, `indicators/`, `cli/`.
  - `configs/` runtime config: `default.config.yaml`, `signal.presets.yaml` (override via `HYPERLOCAL_CONFIG` or `configs/local.config.yaml`).
  - `scripts/` helper scripts; data under `storage_root` (default `./data/hyperliquid`).

## Build, Test, and Development Commands
- `pnpm dev`: run ingestor, analytics, and UI together (local-only).
- `pnpm test`: run unit/integration tests.
- `pnpm typecheck`: TypeScript project references build check.
- `pnpm lint`: ESLint + Prettier.
- `pnpm run ci`: typecheck, lint, tests, and forbidden-symbols scan.
- `pnpm backfill -- --coin=BTC --interval=1m --days=120`: on-demand backfill.
- `pnpm compact -- --min-file-rows=50000`: Parquet compaction.

## Coding Style & Naming Conventions
- Language: TypeScript (strict). Node 20, pnpm 9.
- Formatting: Prettier; linting: ESLint; base config in `tsconfig.base.json`; EditorConfig enforced.
- Naming: types/interfaces `PascalCase`; variables/functions `camelCase`; constants `UPPER_SNAKE_CASE`; files `kebab-case.ts`.
- Do not introduce any trading/execution/signing code. This is signals-only; CI blocks forbidden terms.
- Schemas via `zod`; keep HL wire payloads and normalized types side-by-side for audit.

## Testing Guidelines
- Framework: Jest or Vitest (keep tests deterministic).
- Location: co-locate as `*.test.ts` next to sources or under `__tests__/`.
- Golden tests for indicators/features; tolerate ±1e-8 for numeric comparisons.
- Run `pnpm test` and `pnpm ci` before PRs; include fixtures when adding indicators/adapters.

## Commit & Pull Request Guidelines
- Commits: Conventional Commits style (e.g., `feat(ingestor): add heartbeat`).
- PRs must include: clear scope/summary, linked issue, screenshots for UI, reproduction steps, and checklist of `pnpm ci` passing.
- Small, focused PRs preferred; update docs/configs when contracts change.

## Security & Configuration Tips
- Local-only by design; no secrets required. Switch to testnet by editing `configs/local.config.yaml` (`ws.url`).
- Respect rate budgets and safe-mode defaults; never add deps or code that reference private keys or execution APIs.
