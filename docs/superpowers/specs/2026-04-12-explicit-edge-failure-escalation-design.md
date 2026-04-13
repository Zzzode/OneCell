# Explicit Edge Failure Escalation Design

Date: 2026-04-12
Status: Draft approved in conversation, awaiting user review
Scope: `@onecell/nanoclaw`

## Summary

Replace NanoClaw's implicit post-failure edge-to-container fallback with an explicit escalation model.

Initial backend routing remains automatic and capability-based. If a turn or scheduled task is placed on the edge backend and later fails due to edge runtime conditions, NanoClaw must stop the execution, surface the failure clearly, and expose an explicit retry/escalation path instead of silently rerunning the same work in the container backend.

For terminal-driven group turns, the explicit path is a new local command: `/retry-container`.

For scheduled tasks, the execution fails normally and records that container escalation was available, without automatically starting a container retry.

## Goals

- Preserve current upfront capability-based routing between `edge` and `container`.
- Remove implicit edge-to-container fallback after edge runtime failure.
- Make backend escalation visible and user-controlled.
- Provide a smooth explicit retry path for terminal users.
- Keep scheduled tasks non-interactive and deterministic.

## Non-goals

- Redesign initial backend selection.
- Add a rich semantic intent-classification system.
- Add automatic confirmation flows for scheduled tasks.
- Add new external UIs beyond terminal and existing group/channel surfaces.

## Current behavior

Today, NanoClaw classifies some edge failures as recoverable and immediately reruns the same work on the container backend.

Primary locations:

- `packages/nanoclaw/src/index.ts` — group turn fallback path
- `packages/nanoclaw/src/task-scheduler.ts` — scheduled task fallback path
- `packages/nanoclaw/src/framework-recovery.ts` — recovery classification and fallback preparation

This means backend escalation can happen without an explicit user decision after execution has already started.

## Proposed behavior

### 1. Initial routing stays automatic

NanoClaw continues to use existing policy routing for initial placement:

- group config may pin execution to `edge` or `container`
- `auto` mode uses capability/tool requirements to select the backend
- script-heavy or unsupported-capability work may still route directly to `container`

This design only changes post-failure escalation.

### 2. Edge runtime failures no longer trigger automatic container execution

If an execution already running on `edge` fails with a recovery classification that previously caused fallback:

- the edge execution is marked failed
- the task graph / turn reflects the failure normally
- the user sees an explicit message that container retry is available
- the system does not start the container backend automatically

### 3. Terminal turns gain an explicit retry command

Terminal mode adds a new local command:

- `/retry-container`

When a terminal edge execution fails in a way that supports escalation, NanoClaw stores a short-lived retry snapshot containing the original request context. The user may then run `/retry-container` to start a new execution on the container backend.

This retry is a fresh execution, not a continuation of the failed edge execution.

### 4. Scheduled tasks fail explicitly and record escalation availability

When a scheduled task placed on `edge` fails in a way that would previously trigger fallback:

- the scheduled execution is marked failed
- no automatic container run begins
- task/execution metadata records that container escalation was available
- logs and status surfaces can explain that the task failed on edge and could be retried with container later

## Design details

## A. Recovery classification semantics

`classifyRuntimeRecovery()` remains useful, but its meaning changes.

Before:
- drives automatic fallback or replan

After:
- classifies whether a failed edge execution is eligible for explicit container escalation
- still classifies replan-worthy failures such as workspace version conflicts

Recommended decision kinds:

- `none`
- `explicit_container_retry`
- `replan`

If keeping the current return type is less disruptive, the implementation may preserve the current shape internally and reinterpret the former `fallback` case as "explicit retry available". The important requirement is behavior, not the exact enum spelling.

## B. Terminal retry snapshot

Add a small terminal-scoped state holder for the most recent retryable edge failure.

Minimum fields:

- original `prompt`
- `groupFolder`
- `chatJid`
- `isMain`
- relevant session context or explicit session reset choice
- edge failure summary
- escalation reason
- target backend fixed to `container`
- timestamp

Rules:

- only the most recent retryable failure for the terminal group needs to be stored
- successful execution clears the pending retry snapshot
- `/session clear`, `/new`, terminal quit, and similar terminal reset actions should also clear the snapshot
- container failures do not create nested escalation state

## C. `/retry-container` command behavior

Add `/retry-container` to terminal local commands.

Behavior:

1. If no retryable edge failure snapshot exists:
   - show a clear "nothing to retry" message
2. If a retry snapshot exists:
   - launch a new execution with the saved prompt/context
   - force backend placement to `container`
   - clear the pending snapshot once the retry starts successfully, or clear it after completion if that better matches existing command semantics
3. If the container retry fails:
   - surface it as a normal container failure
   - do not chain into additional recovery behavior

The command is intentionally explicit and local to terminal mode.

## D. Terminal user experience

When an edge execution fails and escalation is available, NanoClaw should emit both:

- a concise system event
- enough detail in terminal logs/inspector/status surfaces to explain what happened

Suggested copy pattern:

- `edge 执行失败：<summary>`
- `如需更复杂运行时，可执行 /retry-container`

The message must make clear that:

- the failure occurred on edge
- container retry is optional
- retrying with container is a new explicit action

## E. Scheduled task metadata

Scheduled tasks have no interactive confirmation path during execution, so the explicit escalation signal must be recorded.

Minimum metadata to preserve:

- failed backend: `edge`
- escalation available: `container`
- escalation reason
- failure summary

This can live in existing error/message fields if the current schema makes that simpler, but structured metadata is preferred if already supported. The resulting records should be easy to surface later in logs, task inspection, or future admin commands.

## F. Configuration policy

Default product behavior should become explicit escalation, not implicit fallback.

Preferred approach:

- remove the implicit post-failure fallback path from normal operation
- do not add a compatibility flag unless implementation friction clearly requires it

Rationale:

- product semantics become easier to understand
- backend changes after failure are no longer hidden
- code complexity drops by removing a special recovery branch

If a temporary compatibility switch becomes necessary during rollout, it must be framed as transitional and default to explicit retry behavior.

## Architecture impact

### Areas to change

- `packages/nanoclaw/src/index.ts`
  - remove automatic group-turn fallback execution
  - record terminal retry snapshot
  - emit explicit escalation guidance
- `packages/nanoclaw/src/task-scheduler.ts`
  - remove automatic scheduled-task fallback execution
  - mark failure and store escalation metadata instead
- `packages/nanoclaw/src/framework-recovery.ts`
  - keep classification logic, but retarget semantics toward explicit escalation signaling
- `packages/nanoclaw/src/channels/terminal.ts`
  - add `/retry-container`
  - show retry guidance
  - handle "nothing to retry"
- optional small helper module
  - store and clear retryable terminal failure state cleanly

### Areas intentionally unchanged

- `packages/nanoclaw/src/policy-router.ts`
- `packages/nanoclaw/src/backend-selection.ts`
- upfront capability-based backend placement

## Data flow

### Terminal turn

1. Request is routed normally to `edge` or `container`
2. If routed to `container`, behavior is unchanged
3. If routed to `edge` and succeeds, behavior is unchanged
4. If routed to `edge` and fails with explicit-escalation eligibility:
   - execution fails visibly
   - retry snapshot is stored
   - terminal event suggests `/retry-container`
5. User runs `/retry-container`
6. NanoClaw starts a fresh container execution using saved context

### Scheduled task

1. Task is routed normally
2. If routed to `edge` and succeeds, behavior is unchanged
3. If routed to `edge` and fails with explicit-escalation eligibility:
   - execution fails
   - no container run starts
   - failure metadata records escalation availability

## Error handling

- Workspace version conflicts should still be treated as replan conditions where appropriate.
- Explicit container retry should only be offered for the subset of failures currently considered fallback-worthy.
- Visible partial output from edge should continue to suppress escalation suggestions if current recovery rules already treat that as non-fallbackable.
- Clearing sessions after failure should remain conservative and only happen when current stale-session detection rules require it.

## Testing plan

Add or update tests for:

1. Group turn edge failure no longer auto-runs container
2. Retryable edge failures create terminal retry state
3. `/retry-container` launches a new container execution with saved context
4. `/retry-container` reports a clear message when no retryable failure exists
5. Successful retry clears pending retry state
6. Scheduled task edge failure does not auto-fallback and records escalation availability
7. Existing upfront capability routing remains unchanged
8. Replan-worthy failures still mark replan where applicable

## Rollout notes

- Update README and CLAUDE guidance to describe explicit retry semantics.
- Remove any documentation that claims edge automatically falls back to container after runtime failure.
- Because the user has requested the new behavior as the intended product model, no long-lived backwards-compatibility path is planned unless implementation constraints force a temporary one.

## Success criteria

The change is successful when all of the following are true:

- edge failures do not silently start container execution
- terminal users receive a clear `/retry-container` path
- `/retry-container` performs an explicit fresh container retry
- scheduled tasks fail visibly and record escalation availability without auto-escalating
- initial capability-based routing remains intact
