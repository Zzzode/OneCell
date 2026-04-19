# NanoClaw Tool-Use State and UI Redesign

**Date:** 2026-04-15
**Status:** Draft
**Approach:** A — Transcript-first orchestrator and UI redesign

## Problem

NanoClaw's current tool-use flow is close to a provider-level tool loop, but it still behaves and renders more like an execution event stream than a first-class conversation trajectory.

Current gaps:

1. `tool_call` / `tool_result` are treated primarily as runtime events rather than durable transcript objects.
2. Tool failures are represented as generic results instead of explicit error observations that naturally drive the next assistant turn.
3. Follow-up assistant output after a tool result is not modeled as a new assistant block with a clear trajectory boundary.
4. The terminal UI renders an event/log flavored transcript instead of Claude Code-style assistant/tool/tool-result/follow-up blocks.
5. Tool verbosity and aggregation currently live too close to the event layer instead of being derived from a structured transcript model.

Reference behavior from the local `claude-code` repo:

- Assistant `tool_use` blocks are first-class conversation content.
- Tool execution emits `tool_result` content back into the message history.
- Failures are returned as `tool_result` with explicit error semantics.
- The next model turn is model-driven follow-up reasoning, not blind runtime retry.

## Goals

1. Make tool use, tool result, tool failure, and follow-up assistant output first-class transcript state.
2. Make tool failure an explicit observation that the model sees and reasons over.
3. Render terminal output as Claude Code-style conversation blocks instead of flat execution logs.
4. Support multiple assistant → tool → assistant exchanges within one execution trajectory.
5. Keep verbose/collapsed rendering as a view concern derived from transcript blocks.

## Non-goals

- Preserving the old terminal transcript event schema for compatibility.
- Implementing group/channel-specific custom UI in this pass.
- Adding new tool capabilities or changing backend routing policy.
- Designing a second truth source alongside the transcript model.

## Design

### 1. Architecture

Re-center the runtime around a transcript-first pipeline:

```text
edge runner events
  -> transcript projector / orchestrator
  -> transcript store
  -> terminal UI block renderer
```

Responsibilities:

- **Runner layer** emits atomic execution facts: assistant deltas, tool-use emission, tool-result observation, checkpoints, final/error.
- **Orchestrator/projector layer** turns those facts into durable transcript structures and assistant trajectories.
- **Transcript store** becomes the single source of truth for terminal rendering.
- **Terminal UI** renders transcript blocks only; it no longer infers tool lifecycle from raw execution events.

### 2. Core transcript model

Introduce a trajectory-aware transcript model.

```ts
interface AssistantTrajectory {
  id: string
  executionId: string
  status:
    | 'streaming'
    | 'waiting_tool'
    | 'running_tool'
    | 'followup'
    | 'completed'
    | 'errored'
  assistantMessageId: string | null
  toolUseIds: string[]
  toolResultIds: string[]
  followupMessageIds: string[]
}
```

```ts
type TranscriptBlock =
  | AssistantBlock
  | ToolUseTranscriptBlock
  | ToolResultTranscriptBlock
  | SystemStatusBlock
```

```ts
interface AssistantBlock {
  id: string
  kind: 'assistant'
  trajectoryId: string
  phase: 'initial' | 'followup'
  status: 'streaming' | 'completed'
  text: string
}

interface ToolUseTranscriptBlock {
  id: string
  kind: 'tool_use'
  trajectoryId: string
  toolUseId: string
  toolName: string
  args: Record<string, unknown>
  status: 'pending' | 'running' | 'completed' | 'errored'
}

interface ToolResultTranscriptBlock {
  id: string
  kind: 'tool_result'
  trajectoryId: string
  toolUseId: string
  toolName: string
  isError: boolean
  content: string
  structuredContent?: unknown
}

interface SystemStatusBlock {
  id: string
  kind: 'system_status'
  level: 'info' | 'warning' | 'error'
  text: string
}
```

Key rule: tool failure is represented by `ToolResultTranscriptBlock.isError = true`, not by a side-channel retry state.

### 3. Event lifecycle and re-deliberation

A single assistant trajectory may contain multiple tool exchanges.

Target lifecycle:

1. **Initial assistant phase**
   - Create `AssistantTrajectory`
   - Create `AssistantBlock(phase='initial', status='streaming')`
   - Append assistant text deltas into that block

2. **Tool use emission**
   - Create `ToolUseTranscriptBlock(status='pending')`
   - Transition trajectory status to `waiting_tool` / `running_tool`
   - Stop appending later assistant output to the current assistant block once tool use is emitted

3. **Tool result observation**
   - Create `ToolResultTranscriptBlock`
   - On success: `isError = false`, mark matching tool-use block `completed`
   - On failure: `isError = true`, mark matching tool-use block `errored`

4. **Follow-up assistant phase**
   - Any subsequent assistant output after a tool result starts a new `AssistantBlock(phase='followup')`
   - The model decides whether to retry the same tool, retry with different args, use a different tool, or answer directly

Illustrative trajectory:

```text
AssistantBlock(initial)
ToolUseBlock(A)
ToolResultBlock(A, isError=true)
AssistantBlock(followup #1)
ToolUseBlock(B)
ToolResultBlock(B, isError=false)
AssistantBlock(followup #2)
Final
```

This mirrors Claude Code's assistant trajectory semantics: assistant turn, tool observation, following assistant turn.

### 4. Runner / backend contract changes

Update runner-facing execution semantics so the projector does not need to guess transcript boundaries.

Required invariants:

1. Every tool use has a stable `toolUseId`.
2. Every tool result is explicitly tied to its `toolUseId`.
3. Assistant output can be segmented into initial vs follow-up assistant phases.
4. One execution may contain multiple assistant → tool → assistant cycles.

Practical changes in NanoClaw:

- Keep provider-specific tool APIs in `edge-runner.ts`, but stop treating `output_delta` as one monolithic assistant stream.
- Introduce enough event metadata for the projector to start a new assistant block after any tool-result boundary.
- Preserve `tool_call` and `tool_result` events, but reframe them as transcript inputs rather than direct UI outputs.
- Keep checkpoints/final/error events as execution control signals, not transcript structure.

### 5. Orchestrator / projector

Add a projector layer that consumes execution events and mutates transcript state.

Responsibilities:

- Maintain the active trajectory per execution.
- Maintain the currently open assistant block.
- Create/update tool-use blocks.
- Attach tool-result blocks to the matching tool use.
- Start a new follow-up assistant block after any tool result when assistant output resumes.
- Mark trajectory completion/error on final/error events.

This projector becomes the only place that assembles transcript semantics from execution events.

### 6. Terminal UI model

Render terminal transcript from `TranscriptBlock[]`, not from raw events.

#### Assistant block rendering

- Render as standard assistant transcript content.
- Initial and follow-up assistant blocks share the same visual language.
- Streaming assistant blocks update in place.
- Follow-up blocks appear after their preceding tool result, which makes re-deliberation visible without extra labels.

#### Tool-use block rendering

- Render as a distinct operation block with tool name and argument summary.
- Default view is collapsed/summary-first.
- Verbose view expands structured args/details.
- Status reflected visually: pending, running, completed, errored.

#### Tool-result block rendering

- Render immediately after the matching tool-use block.
- Success and failure are visually distinct.
- Failure is rendered as a tool observation, not assistant prose.
- Detailed payload remains available in verbose mode.

#### UI rules

1. Assistant text never spans across a tool exchange.
2. Each tool result stays visually adjacent to its matching tool use.
3. Verbose mode changes density, not transcript structure.
4. The UI derives state from transcript/store only; it does not infer lifecycle by inspecting raw events.

### 7. Verbose and collapsed views

Keep the existing direction of aggregated vs verbose rendering, but move it to the transcript rendering layer.

- **Collapsed mode**: summarize adjacent tool-use/result blocks by category and status.
- **Verbose mode**: show individual tool args, results, and error details.
- Aggregation uses transcript blocks as input; it is no longer coupled to ephemeral event ordering logic.

### 8. Files to modify

Primary files:

| File | Change |
|------|--------|
| `packages/nanoclaw/src/edge-runner.ts` | Refine runner event boundaries and tool-use/result metadata to support transcript projection |
| `packages/nanoclaw/src/agent-backend.ts` | Update execution event typing if needed for explicit assistant/tool boundaries |
| `packages/nanoclaw/src/edge-event-dispatcher.ts` | Stop treating raw execution events as direct UI output; feed them into transcript projection |
| `packages/nanoclaw/src/terminal-panel.ts` | Replace or shrink the old panel-centric transcript model in favor of trajectory-aware transcript blocks |
| `packages/nanoclaw/src/terminal-app.tsx` | Consume transcript store/view-model rather than ad hoc execution/event state |
| `packages/nanoclaw/src/components/transcript.tsx` | Render assistant/tool/tool-result/system blocks from structured transcript data |
| `packages/nanoclaw/src/terminal-observability.ts` | Adapt observability/state wiring to the new transcript source of truth |
| `packages/nanoclaw/src/backends/edge-backend.ts` | Update integration points if execution state assumptions change |

Secondary files likely affected by tests and view props:

- `packages/nanoclaw/src/terminal-app.test.tsx`
- `packages/nanoclaw/src/components/transcript.test.tsx`
- `packages/nanoclaw/src/edge-runner.test.ts`
- `packages/nanoclaw/src/channels/terminal.test.ts`

### 9. Migration sequence

Recommended sequence:

1. Define the new transcript and trajectory types.
2. Add the event → transcript projector.
3. Update runner event semantics so the projector does not need implicit heuristics.
4. Switch terminal state and transcript rendering to the new store.
5. Remove old event-driven transcript assembly and tool-state guessing.

This order keeps the semantic center stable while the UI migrates.

## Testing strategy

### Transcript projector tests

Add focused tests that feed event sequences into the projector and assert transcript block structure.

Required cases:

1. **Single successful tool exchange**
   - Yields `AssistantBlock(initial)` + `ToolUse` + `ToolResult(isError=false)` + `AssistantBlock(followup)`
2. **Single failed tool exchange**
   - Yields `ToolResult(isError=true)` and a separate follow-up assistant block
3. **Multiple tool exchanges in one trajectory**
   - Preserves adjacency and correct tool/result pairing
4. **No-tool assistant reply**
   - Produces only one assistant block

### Runner tests

Extend runner tests to verify:

- repeated assistant → tool → assistant loops within one execution
- stable tool use/result binding
- tool failure is not swallowed
- follow-up assistant output is segmentable as a new assistant block

### UI tests

Add transcript/UI tests verifying:

1. assistant block → tool-use block → failed tool-result block → new assistant block ordering
2. verbose toggle expands details without changing transcript structure
3. multiple tool exchanges remain correctly grouped

### Integration tests

Add at least one realistic end-to-end execution test for:

- tool success followed by assistant answer
- tool failure followed by model-driven next action rather than blind retry

## Acceptance criteria

### Semantic acceptance

1. Tool use is a first-class transcript block.
2. Tool result is a first-class transcript block.
3. Tool failure is explicitly represented with error semantics.
4. Follow-up assistant output is always a distinct block after a tool result.
5. One trajectory may include multiple tool exchanges.

### UI acceptance

1. Terminal transcript reads as conversation blocks, not flat execution logs.
2. Tool-result failure is visually separate from assistant prose.
3. Verbose/collapsed mode changes detail density, not block structure.
4. Users can visually detect that assistant re-deliberation started after a failed tool call.

### Behavioral acceptance

1. Tool failure does not trigger blind runtime retry.
2. The next action is model-driven based on the tool-result observation.
3. Successful and failed tool results both enter transcript history.
4. The orchestrator/projector is the only place where transcript semantics are assembled from events.

## Decision

Adopt a transcript-first orchestrator and UI redesign modeled after Claude Code's assistant trajectory semantics.

The key system rule is:

- **Failure is an observation, not a retry policy.**
- **Follow-up assistant output is a new conversation block, not a continuation appended across tool boundaries.**
