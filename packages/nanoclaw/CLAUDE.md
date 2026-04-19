# NanoClaw in OneCell

Package-local guidance for `@onecell/nanoclaw`. Use the root `CLAUDE.md` for monorepo-wide context, and this file for assistant-specific codepaths and commands.

## Quick context

`@onecell/nanoclaw` is the TypeScript assistant package inside the OneCell monorepo. It can execute through the native `@onecell/edgejs` runtime or through the container backend depending on config and deployment constraints.

## Product interface model

When discussing NanoClaw product surfaces, use this framing:

- **Terminal mode** — Claude Code-style terminal interaction.
- **Group/channel mode** — OpenClaw-style interaction inside messaging surfaces such as group email, WhatsApp, Telegram, Slack, Discord, or Gmail.

Treat those as the two user-facing interface classes.

Do **not** classify `@onecell/edgejs` as a UI; it is a runtime/backend for edge execution.
Do **not** classify Claude Code skills as NanoClaw's normal product UI; they are setup/bootstrap/customization tooling.

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

- `edge` backend: uses one edge runtime path (currently centered on `@onecell/edgejs`) and local workspace state.
- `container` backend: uses the container runtime for heavier or isolation-sensitive execution.
- `auto` mode chooses between backends using policy routing.

## Routing model

Backend selection is not a single hardcoded switch. NanoClaw has policy-based dispatch that inspects execution requirements and places work on the appropriate backend.

Current framing:

- group config can pin a turn to `edge` or `container`
- `auto` mode performs capability-based routing
- script execution is treated as heavy and routes to `container`
- unsupported edge tools/capabilities route to `container`
- edge-compatible work can route to `edge`
- edge runtime failures do not silently fall through to `container` after the turn starts
- terminal mode exposes explicit `/retry-container` when an edge failure should be re-run on `container`
- scheduled tasks fail explicitly and record container escalation availability instead of auto-falling back
- some prompts can trigger team orchestration / fanout paths in addition to normal backend routing

This is better described as capability inference plus policy routing plus explicit escalation, not a rich semantic intent-classification system.

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
