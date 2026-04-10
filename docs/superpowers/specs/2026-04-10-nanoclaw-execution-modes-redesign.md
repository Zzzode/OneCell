# Nanoclaw Execution Modes Redesign

**Date**: 2026-04-10
**Status**: Draft

## Problem

Nanoclaw's execution configuration conflates three independent concerns: product form factor (channel), execution environment (container/edge), and LLM provider. The current design scatters these across environment variables with implicit coupling (`EDGE_RUNNER_PROVIDER` only affects edge, `TERMINAL_CHANNEL_ENABLED` conflates channel with profile). This makes configuration error-prone and limits flexibility.

## Design: Three-Axis Orthogonal Model

Three independent dimensions, each configured separately:

### Axis 1: Profile (Product Form Factor) — `profile`

| Value | Behavior |
|---|---|
| `claw` | Multi-channel AI assistant (WhatsApp/Telegram/Discord). Message-driven, multi-group concurrent. |
| `terminal` | Local interactive TUI. Single session, Shift+Up/Down for agent focus cycling, ESC to interrupt. |

Profile determines which channels to start. Default: `terminal`.

### Axis 2: Execution Mode (Execution Environment) — `executionMode`

| Value | Behavior |
|---|---|
| `edge` | Lightweight execution in-process or edgejs subprocess. Restricted tool set. |
| `container` | Full Docker container isolation. Uses Claude Agent SDK. |
| `auto` | Policy router decides per-request. Edge→container fallback on failure. |

Default: `edge`. Per-group override via database `executionMode` field.

### Axis 3: LLM Providers (Model Configuration) — `providers`

Named provider definitions, each with type and credentials. Edge and container each reference one provider independently.

## Configuration File: `nanoclaw.config.json`

```json
{
  "profile": "terminal",
  "executionMode": "edge",
  "edgeRunnerMode": "edgejs",

  "providers": {
    "my-openai": {
      "type": "openai",
      "apiKey": "${OPENAI_API_KEY}",
      "baseUrl": "https://api.example.com/v1",
      "model": "gpt-4o"
    },
    "my-claude": {
      "type": "anthropic",
      "apiKey": "${ANTHROPIC_API_KEY}",
      "model": "claude-sonnet-4-20250514"
    },
    "stub": {
      "type": "local"
    }
  },

  "edge": {
    "provider": "my-openai",
    "enableTools": true,
    "disableFallback": false
  },
  "container": {
    "provider": "my-claude",
    "maxConcurrent": 5
  }
}
```

### Field Reference

| Field | Type | Default | Description |
|---|---|---|---|
| `profile` | `claw` \| `terminal` | `terminal` | Product form factor |
| `executionMode` | `edge` \| `container` \| `auto` | `edge` | Execution environment |
| `edgeRunnerMode` | `edgejs` \| `node` | `edgejs` | Edge subprocess runtime |
| `providers` | `Record<string, Provider>` | `{}` | Named LLM provider definitions |
| `edge.provider` | `string` | First anthropic provider | Provider name for edge execution |
| `edge.enableTools` | `boolean` | `true` | Enable tool calls in edge runner |
| `edge.disableFallback` | `boolean` | `false` | Disable edge→container fallback |
| `container.provider` | `string` | First anthropic provider | Provider name for container execution |
| `container.maxConcurrent` | `number` | `5` | Max concurrent containers |

### Provider Definition

| Field | Type | Required | Description |
|---|---|---|---|
| `type` | `anthropic` \| `openai` \| `local` | Yes | Provider type |
| `apiKey` | `string` | For anthropic/openai | Supports `${ENV_VAR}` expansion |
| `model` | `string` | For anthropic/openai | Model ID |
| `baseUrl` | `string` | For openai | API base URL |

### Constraint: Container Provider Must Be Anthropic

Container mode uses Claude Agent SDK (`@anthropic-ai/claude-agent-sdk`) which only supports Anthropic. Startup validation rejects `container.provider` referencing a non-anthropic provider.

### Env Var Expansion

`apiKey` values containing `${VAR_NAME}` are expanded from environment variables at load time. This keeps secrets out of config files while allowing structured configuration.

Example: `"apiKey": "${OPENAI_API_KEY}"` → reads `process.env.OPENAI_API_KEY`.

## Profile Behavior

### Channel Startup Logic

```
profile=claw    → Load all non-terminal registered channels (skip those missing credentials)
profile=terminal → Load only TerminalChannel
```

Channel credentials (WhatsApp tokens, etc.) remain in `.env`. Channels without credentials are silently skipped.

### Removed Config

- `TERMINAL_CHANNEL_ENABLED` — determined by profile
- `TERMINAL_GROUP_EXECUTION_MODE` — unified to per-group override
- `EDGE_RUNNER_PROVIDER` — replaced by `edge.provider`
- `DEFAULT_EXECUTION_MODE` — replaced by `executionMode`
- `EDGE_ANTHROPIC_API_KEY` / `EDGE_API_KEY` — replaced by provider definitions
- `EDGE_ANTHROPIC_MODEL` / `EDGE_MODEL` — replaced by provider definitions

### Retained Config

- `EDGE_RUNNER_MODE` → `edgeRunnerMode` in config file
- `EDGE_ENABLE_TOOLS` → `edge.enableTools`
- `EDGE_DISABLE_FALLBACK` → `edge.disableFallback`
- `SHADOW_EXECUTION_MODE` → retained as env var (development/testing only)
- Per-group `executionMode` override in database

## Policy Router Update

`routeTaskNode()` gains one rule:

```
If container.provider.type !== 'anthropic':
  - Container backend is unavailable
  - auto mode behaves as edge-only
  - Edge→container fallback is disabled
```

## npm Scripts

Default reads `nanoclaw.config.json`. Override with `--config`:

```json
"dev": "tsx src/index.ts",
"dev:claw": "tsx src/index.ts --config nanoclaw.config.claw.json",
"start": "node dist/index.js"
```

Example config files provided (not committed):
- `nanoclaw.config.terminal.example.json`
- `nanoclaw.config.claw.example.json`

## Startup Validation

```
1. Parse --config → load config file (default: nanoclaw.config.json)
2. Expand ${ENV_VAR} references in apiKeys
3. Validate edge.provider references an existing provider
4. Validate container.provider references an existing provider
5. Validate container.provider.type === 'anthropic'
6. If executionMode needs containers, check Docker availability
7. Start channels based on profile
8. Enter main loop
```

## Files Changed

| File | Change |
|---|---|
| `src/config.ts` | Rewrite: load config file, expand env vars, export resolved config |
| `src/execution-mode.ts` | Unchanged (types remain the same) |
| `src/edge-backend.ts` | Read provider from config instead of env vars |
| `src/edge-runner.ts` | Runner selection from config provider type |
| `src/edge-runner-cli.ts` | Provider from request.runner (source: config) |
| `src/edge-subprocess-runner.ts` | Unchanged (subprocess protocol unchanged) |
| `src/policy-router.ts` | Add container-unavailable rule |
| `src/framework-recovery.ts` | Respect container availability |
| `src/backends/container-backend.ts` | Unchanged (still Claude SDK) |
| `src/index.ts` | Profile-based channel startup, --config arg parsing |
| `src/channels/terminal.ts` | Remove TERMINAL_CHANNEL_ENABLED check |
| `src/channels/index.ts` | Profile-aware channel loading |
| `package.json` | Simplify npm scripts, add config examples |
| New: `nanoclaw.config.*.example.json` | Example configs |

## Migration

No backward compatibility shim. Users create a new `nanoclaw.config.json` based on examples. Old env var based configuration is removed.
