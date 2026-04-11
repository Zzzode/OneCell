# NanoClaw in OneCell

Package-local guidance for `@onecell/nanoclaw`. Use the root `CLAUDE.md` for monorepo-wide context, and this file for assistant-specific codepaths and commands.

## Quick context

`@onecell/nanoclaw` is the TypeScript assistant package inside the OneCell monorepo. It can execute through the native `@onecell/edgejs` runtime or through the container backend depending on config and deployment constraints.

## Key files

| File | Purpose |
|------|---------|
| `src/index.ts` | Main orchestrator: state, message loop, channel/bootstrap wiring |
| `src/channels/registry.ts` | Channel registration and lookup |
| `src/config.ts` | Environment-backed app configuration |
| `src/nanoclaw-config.ts` | JSON config schema and resolution for `nanoclaw.config.json` |
| `src/config-loader.ts` | `--config` path resolution and config file loading |
| `src/backends/edge-backend.ts` | Edge runtime-backed execution path |
| `src/backends/container-backend.ts` | Container runtime-backed execution path |
| `src/edge-subprocess-runner.ts` | Launches the packaged edgejs binary for edge execution |
| `src/task-scheduler.ts` | Scheduled task loop |
| `src/db.ts` | SQLite operations |
| `docs/` | Assistant architecture, security, and troubleshooting docs |

## Commands

Run these from the monorepo root:

```bash
pnpm --filter @onecell/nanoclaw run build
pnpm --filter @onecell/nanoclaw run dev
pnpm --filter @onecell/nanoclaw run typecheck
pnpm --filter @onecell/nanoclaw run lint
pnpm --filter @onecell/nanoclaw run test
```

Useful root-level helpers:

```bash
pnpm build:nanoclaw
pnpm build:edgejs
```

If you are validating edge execution mode, build `@onecell/edgejs` first so `binaryPath` resolves to a real runtime binary.

## Configuration

- Runtime config is typically loaded from `nanoclaw.config.json`, and `src/config-loader.ts` also supports `--config <path>` overrides.
- Example configs live next to this package:
  - `nanoclaw.config.terminal.example.json`
  - `nanoclaw.config.claw.example.json`
- `src/nanoclaw-config.ts` validates provider definitions, execution mode, and edge/container provider selection.

## Runtime model

- `edge` backend: uses the built `@onecell/edgejs` binary and local workspace state.
- `container` backend: uses the container runtime for heavier or isolation-sensitive execution.
- `auto` mode chooses based on runtime policy and deployment constraints.

## Integration with edgejs

`src/edge-subprocess-runner.ts` imports `binaryPath` from `@onecell/edgejs`. That package is only the npm wrapper; the actual runtime binary is produced by the repo-root native build.

When edge execution is enabled, missing native build output will surface as runner startup failures. Build the runtime before treating that as an application bug.

## Testing / verification

Primary validation for this package is:

```bash
pnpm --filter @onecell/nanoclaw run typecheck
pnpm --filter @onecell/nanoclaw run lint
pnpm --filter @onecell/nanoclaw run test
```

Use root workflow changes to keep CI pnpm/workspace-oriented rather than standalone `npm ci` assumptions.
