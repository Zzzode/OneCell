# NanoClaw Tool-Use State and UI Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild NanoClaw's tool-use lifecycle so tool calls, tool results, failures, and follow-up assistant output are first-class transcript blocks rendered in the terminal UI.

**Architecture:** Add a transcript projector between execution events and terminal rendering. The runner continues to emit execution facts, but the projector becomes the single place that assembles assistant trajectories and block boundaries. The terminal UI renders trajectory-aware transcript blocks, including explicit tool-result error blocks and separate follow-up assistant blocks.

**Tech Stack:** TypeScript, React, Ink, Vitest

---

## File Structure

### Create
- `packages/nanoclaw/src/terminal-transcript.ts` — shared transcript block types, trajectory types, projector reducer, helper constructors
- `packages/nanoclaw/src/terminal-transcript.test.ts` — reducer/projector tests for assistant/tool/tool-result/follow-up sequencing

### Modify
- `packages/nanoclaw/src/agent-backend.ts` — extend `ExecutionEvent` typing with explicit assistant segment / tool identifiers needed by the projector
- `packages/nanoclaw/src/edge-runner.ts` — emit projector-friendly assistant/tool boundaries for initial vs follow-up output
- `packages/nanoclaw/src/edge-event-dispatcher.ts` — route execution events through the transcript projector instead of mutating tool transcript entries directly
- `packages/nanoclaw/src/terminal-panel.ts` — replace flat `TerminalPanelTranscriptEntry` model with transcript block view model or re-export the new types
- `packages/nanoclaw/src/terminal-app.tsx` — consume structured transcript blocks instead of flat event entries
- `packages/nanoclaw/src/components/transcript.tsx` — render assistant/tool_use/tool_result/system blocks with collapsed and verbose modes
- `packages/nanoclaw/src/backends/edge-backend.ts` — ensure event hooks and final output handling preserve the new runner semantics
- `packages/nanoclaw/src/components/transcript.test.tsx` — render tests for new block layout and verbose/collapsed invariants
- `packages/nanoclaw/src/terminal-app.test.tsx` — smoke tests for app wiring with transcript blocks
- `packages/nanoclaw/src/channels/terminal.test.ts` — terminal integration tests for ctrl+o and projected transcript display
- `packages/nanoclaw/src/edge-runner.test.ts` — runner tests for multi-step assistant → tool → assistant trajectories

### Existing responsibilities to preserve
- `edge-runner.ts` still owns provider-specific request/response loops.
- `edge-event-dispatcher.ts` still adapts backend execution events into terminal observability/UI updates.
- `components/transcript.tsx` still owns transcript rendering, but now from structured transcript blocks.

---

### Task 1: Add transcript-first types and projector

**Files:**
- Create: `packages/nanoclaw/src/terminal-transcript.ts`
- Test: `packages/nanoclaw/src/terminal-transcript.test.ts`
- Modify: `packages/nanoclaw/src/terminal-panel.ts`

- [ ] **Step 1: Write the failing projector tests**

```ts
import { describe, expect, it } from 'vitest'

import {
  applyExecutionEventToTranscript,
  createEmptyTerminalTranscriptState,
} from './terminal-transcript.js'
import type { ExecutionEvent } from './agent-backend.js'

function reduce(events: ExecutionEvent[]) {
  let state = createEmptyTerminalTranscriptState()
  for (const event of events) {
    state = applyExecutionEventToTranscript(state, event)
  }
  return state
}

describe('terminal transcript projector', () => {
  it('creates a follow-up assistant block after a failed tool result', () => {
    const state = reduce([
      {
        type: 'assistant_segment_start',
        executionId: 'exec-1',
        segmentId: 'seg-1',
        phase: 'initial',
      },
      {
        type: 'output_delta',
        executionId: 'exec-1',
        segmentId: 'seg-1',
        text: 'I will inspect the file.',
      },
      {
        type: 'tool_call',
        executionId: 'exec-1',
        toolUseId: 'tool-1',
        tool: 'workspace.read',
        args: { path: 'missing.ts' },
      },
      {
        type: 'tool_result',
        executionId: 'exec-1',
        toolUseId: 'tool-1',
        tool: 'workspace.read',
        isError: true,
        result: { error: 'ENOENT: missing.ts' },
      },
      {
        type: 'assistant_segment_start',
        executionId: 'exec-1',
        segmentId: 'seg-2',
        phase: 'followup',
      },
      {
        type: 'output_delta',
        executionId: 'exec-1',
        segmentId: 'seg-2',
        text: 'That read failed; I will inspect the manifest instead.',
      },
    ])

    expect(state.blocks.map(block => block.kind)).toEqual([
      'assistant',
      'tool_use',
      'tool_result',
      'assistant',
    ])

    expect(state.blocks[2]).toMatchObject({
      kind: 'tool_result',
      isError: true,
      toolUseId: 'tool-1',
    })

    expect(state.blocks[3]).toMatchObject({
      kind: 'assistant',
      phase: 'followup',
      text: 'That read failed; I will inspect the manifest instead.',
    })
  })

  it('keeps a no-tool reply as one assistant block', () => {
    const state = reduce([
      {
        type: 'assistant_segment_start',
        executionId: 'exec-1',
        segmentId: 'seg-1',
        phase: 'initial',
      },
      {
        type: 'output_delta',
        executionId: 'exec-1',
        segmentId: 'seg-1',
        text: 'No tool is needed here.',
      },
      {
        type: 'final',
        executionId: 'exec-1',
        result: { status: 'success', outputText: 'No tool is needed here.' },
      },
    ])

    expect(state.blocks).toHaveLength(1)
    expect(state.blocks[0]).toMatchObject({
      kind: 'assistant',
      phase: 'initial',
      text: 'No tool is needed here.',
    })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @onecell/nanoclaw run test -- terminal-transcript.test.ts`
Expected: FAIL with module/type errors because `terminal-transcript.ts` and the new event shapes do not exist yet.

- [ ] **Step 3: Write the transcript types and reducer**

```ts
// packages/nanoclaw/src/terminal-transcript.ts
import type { ExecutionEvent } from './agent-backend.js'

export interface AssistantTrajectory {
  id: string
  executionId: string
  status: 'streaming' | 'waiting_tool' | 'running_tool' | 'followup' | 'completed' | 'errored'
  assistantMessageId: string | null
  toolUseIds: string[]
  toolResultIds: string[]
  followupMessageIds: string[]
}

export interface AssistantTranscriptBlock {
  id: string
  kind: 'assistant'
  executionId: string
  trajectoryId: string
  segmentId: string
  phase: 'initial' | 'followup'
  status: 'streaming' | 'completed'
  text: string
}

export interface ToolUseTranscriptBlock {
  id: string
  kind: 'tool_use'
  executionId: string
  trajectoryId: string
  toolUseId: string
  toolName: string
  args: Record<string, unknown>
  status: 'pending' | 'running' | 'completed' | 'errored'
}

export interface ToolResultTranscriptBlock {
  id: string
  kind: 'tool_result'
  executionId: string
  trajectoryId: string
  toolUseId: string
  toolName: string
  isError: boolean
  content: string
  structuredContent?: unknown
}

export interface SystemStatusBlock {
  id: string
  kind: 'system_status'
  level: 'info' | 'warning' | 'error'
  text: string
}

export type TerminalTranscriptBlock =
  | AssistantTranscriptBlock
  | ToolUseTranscriptBlock
  | ToolResultTranscriptBlock
  | SystemStatusBlock

export interface TerminalTranscriptState {
  blocks: TerminalTranscriptBlock[]
  trajectories: Record<string, AssistantTrajectory>
  activeTrajectoryIdByExecution: Record<string, string>
  activeAssistantBlockIdByExecution: Record<string, string>
  pendingToolBlockIdByToolUse: Record<string, string>
}

export function createEmptyTerminalTranscriptState(): TerminalTranscriptState {
  return {
    blocks: [],
    trajectories: {},
    activeTrajectoryIdByExecution: {},
    activeAssistantBlockIdByExecution: {},
    pendingToolBlockIdByToolUse: {},
  }
}

function stringifyToolResult(result: unknown): string {
  if (typeof result === 'string') return result
  try {
    return JSON.stringify(result)
  } catch {
    return '[unserializable tool result]'
  }
}

export function applyExecutionEventToTranscript(
  state: TerminalTranscriptState,
  event: ExecutionEvent,
): TerminalTranscriptState {
  const next: TerminalTranscriptState = {
    ...state,
    blocks: [...state.blocks],
    trajectories: { ...state.trajectories },
    activeTrajectoryIdByExecution: { ...state.activeTrajectoryIdByExecution },
    activeAssistantBlockIdByExecution: { ...state.activeAssistantBlockIdByExecution },
    pendingToolBlockIdByToolUse: { ...state.pendingToolBlockIdByToolUse },
  }

  if (event.type === 'assistant_segment_start') {
    const trajectoryId =
      next.activeTrajectoryIdByExecution[event.executionId] ??
      `${event.executionId}:trajectory:1`

    if (!next.trajectories[trajectoryId]) {
      next.trajectories[trajectoryId] = {
        id: trajectoryId,
        executionId: event.executionId,
        status: 'streaming',
        assistantMessageId: null,
        toolUseIds: [],
        toolResultIds: [],
        followupMessageIds: [],
      }
      next.activeTrajectoryIdByExecution[event.executionId] = trajectoryId
    }

    const blockId = `${event.executionId}:${event.segmentId}`
    next.blocks.push({
      id: blockId,
      kind: 'assistant',
      executionId: event.executionId,
      trajectoryId,
      segmentId: event.segmentId,
      phase: event.phase,
      status: 'streaming',
      text: '',
    })
    next.activeAssistantBlockIdByExecution[event.executionId] = blockId
    return next
  }

  if (event.type === 'output_delta' && event.segmentId) {
    const blockId = next.activeAssistantBlockIdByExecution[event.executionId]
    const block = next.blocks.find(
      candidate => candidate.kind === 'assistant' && candidate.id === blockId,
    ) as AssistantTranscriptBlock | undefined
    if (block) block.text += event.text
    return next
  }

  if (event.type === 'tool_call' && event.toolUseId) {
    const trajectoryId = next.activeTrajectoryIdByExecution[event.executionId]
    if (!trajectoryId) return next
    next.blocks.push({
      id: `${event.executionId}:${event.toolUseId}:call`,
      kind: 'tool_use',
      executionId: event.executionId,
      trajectoryId,
      toolUseId: event.toolUseId,
      toolName: event.tool,
      args: (event.args && typeof event.args === 'object' && !Array.isArray(event.args))
        ? (event.args as Record<string, unknown>)
        : {},
      status: 'running',
    })
    next.pendingToolBlockIdByToolUse[event.toolUseId] = `${event.executionId}:${event.toolUseId}:call`
    next.trajectories[trajectoryId].toolUseIds.push(event.toolUseId)
    delete next.activeAssistantBlockIdByExecution[event.executionId]
    return next
  }

  if (event.type === 'tool_result' && event.toolUseId) {
    const trajectoryId = next.activeTrajectoryIdByExecution[event.executionId]
    if (!trajectoryId) return next
    const toolBlockId = next.pendingToolBlockIdByToolUse[event.toolUseId]
    const toolBlock = next.blocks.find(
      candidate => candidate.kind === 'tool_use' && candidate.id === toolBlockId,
    ) as ToolUseTranscriptBlock | undefined
    if (toolBlock) toolBlock.status = event.isError ? 'errored' : 'completed'
    next.blocks.push({
      id: `${event.executionId}:${event.toolUseId}:result`,
      kind: 'tool_result',
      executionId: event.executionId,
      trajectoryId,
      toolUseId: event.toolUseId,
      toolName: event.tool,
      isError: event.isError,
      content: stringifyToolResult(event.result),
      structuredContent: event.result,
    })
    next.trajectories[trajectoryId].toolResultIds.push(event.toolUseId)
    delete next.pendingToolBlockIdByToolUse[event.toolUseId]
    return next
  }

  if (event.type === 'final' || event.type === 'error') {
    const trajectoryId = next.activeTrajectoryIdByExecution[event.executionId]
    if (trajectoryId) {
      next.trajectories[trajectoryId].status =
        event.type === 'error' ? 'errored' : event.result.status === 'success' ? 'completed' : 'errored'
    }
    const blockId = next.activeAssistantBlockIdByExecution[event.executionId]
    const block = next.blocks.find(
      candidate => candidate.kind === 'assistant' && candidate.id === blockId,
    ) as AssistantTranscriptBlock | undefined
    if (block) block.status = 'completed'
    return next
  }

  return next
}
```

- [ ] **Step 4: Re-export the new transcript model from the panel module**

```ts
// packages/nanoclaw/src/terminal-panel.ts
export type {
  AssistantTrajectory,
  AssistantTranscriptBlock,
  ToolUseTranscriptBlock,
  ToolResultTranscriptBlock,
  SystemStatusBlock,
  TerminalTranscriptBlock,
  TerminalTranscriptState,
} from './terminal-transcript.js'

export { createEmptyTerminalTranscriptState } from './terminal-transcript.js'
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm --filter @onecell/nanoclaw run test -- terminal-transcript.test.ts`
Expected: PASS with the new projector tests green.

- [ ] **Step 6: Commit**

```bash
git add packages/nanoclaw/src/terminal-transcript.ts packages/nanoclaw/src/terminal-transcript.test.ts packages/nanoclaw/src/terminal-panel.ts
git commit -m "feat(nanoclaw): add transcript projector for tool trajectories"
```

### Task 2: Extend execution events with assistant/tool boundaries

**Files:**
- Modify: `packages/nanoclaw/src/agent-backend.ts`
- Modify: `packages/nanoclaw/src/edge-runner.ts`
- Test: `packages/nanoclaw/src/edge-runner.test.ts`

- [ ] **Step 1: Write the failing runner tests for segment boundaries**

```ts
it('emits a new assistant segment after a tool result error', async () => {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    url: 'https://provider.example/v1/messages',
    text: async () => JSON.stringify({
      id: 'msg-1',
      stop_reason: 'end_turn',
      content: [
        {
          type: 'tool_use',
          id: 'toolu_1',
          name: 'workspace.read',
          input: { path: 'missing.ts' },
        },
        {
          type: 'text',
          text: 'I will inspect another file instead.',
        },
      ],
    }),
    status: 200,
  })
  vi.stubGlobal('fetch', fetchMock)

  const failingRequest: ExecutionRequest = {
    ...request,
    limits: { ...request.limits, maxToolCalls: 2 },
    runner: {
      provider: 'anthropic',
      apiKey: 'test-anthropic-key',
      apiBaseUrl: 'https://provider.example',
      model: 'claude-sonnet-4-20250514',
    },
  }

  vi.spyOn(await import('./edge-runner.js'), 'executeTool').mockRejectedValueOnce(
    new Error('ENOENT: missing.ts'),
  )

  const events: ExecutionEvent[] = []
  for await (const event of anthropicEdgeRunner.runTurn(failingRequest)) {
    events.push(event)
  }

  expect(events).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        type: 'assistant_segment_start',
        phase: 'initial',
      }),
      expect.objectContaining({
        type: 'tool_call',
        toolUseId: 'toolu_1',
        tool: 'workspace.read',
      }),
      expect.objectContaining({
        type: 'tool_result',
        toolUseId: 'toolu_1',
        tool: 'workspace.read',
        isError: true,
      }),
      expect.objectContaining({
        type: 'assistant_segment_start',
        phase: 'followup',
      }),
    ]),
  )
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @onecell/nanoclaw run test -- edge-runner.test.ts`
Expected: FAIL because `assistant_segment_start`, `toolUseId`, `segmentId`, and `isError` are not part of the execution event model yet.

- [ ] **Step 3: Extend `ExecutionEvent` with the required boundary fields**

```ts
// packages/nanoclaw/src/agent-backend.ts
export type ExecutionEvent =
  | { type: 'ack'; executionId: string; nodeId: string }
  | { type: 'heartbeat'; executionId: string; at: string }
  | { type: 'progress'; executionId: string; message: string }
  | {
      type: 'assistant_segment_start'
      executionId: string
      segmentId: string
      phase: 'initial' | 'followup'
    }
  | {
      type: 'output_delta'
      executionId: string
      text: string
      segmentId?: string
    }
  | {
      type: 'output_message'
      executionId: string
      text: string
      segmentId?: string
    }
  | {
      type: 'tool_call'
      executionId: string
      tool: string
      args: unknown
      toolUseId?: string
    }
  | {
      type: 'tool_result'
      executionId: string
      tool: string
      result: unknown
      toolUseId?: string
      isError?: boolean
    }
  | { type: 'warning'; executionId: string; message: string }
  | {
      type: 'needs_fallback'
      executionId: string
      reason: string
      suggestedWorkerClass?: 'edge' | 'heavy'
    }
  | {
      type: 'checkpoint'
      executionId: string
      providerSession?: unknown
      summaryDelta?: string
      workspaceOverlayDigest?: string
      workspaceOverlay?: WorkspaceOverlay
    }
  | { type: 'final'; executionId: string; result: ExecutionFinalResult }
  | { type: 'error'; executionId: string; code: string; message: string }
```

- [ ] **Step 4: Update the edge runner to emit segment starts and explicit tool-result error semantics**

```ts
// packages/nanoclaw/src/edge-runner.ts
let assistantSegmentCounter = 0
let activeSegmentId: string | null = null
let nextPhase: 'initial' | 'followup' = 'initial'

function beginAssistantSegment(
  executionId: string,
  phase: 'initial' | 'followup',
): { segmentId: string; event: ExecutionEvent } {
  assistantSegmentCounter += 1
  const segmentId = `${executionId}:assistant:${assistantSegmentCounter}`
  return {
    segmentId,
    event: {
      type: 'assistant_segment_start',
      executionId,
      segmentId,
      phase,
    },
  }
}

const opened = beginAssistantSegment(request.executionId, nextPhase)
activeSegmentId = opened.segmentId
yield opened.event

// when yielding assistant text:
yield {
  type: 'output_delta',
  executionId: request.executionId,
  text,
  segmentId: activeSegmentId,
}

// when yielding tool_call from provider tool use:
yield {
  type: 'tool_call',
  executionId: request.executionId,
  tool: toolUse.name!,
  args: toolUse.input ?? {},
  toolUseId: toolUse.id!,
}

// when a tool finishes or throws:
yield {
  type: 'tool_result',
  executionId: request.executionId,
  tool: toolUse.name!,
  result: toolResult.result,
  toolUseId: toolUse.id!,
  isError: Boolean(
    typeof toolResult.result === 'object' &&
      toolResult.result !== null &&
      'error' in (toolResult.result as Record<string, unknown>)
  ),
}

// before resuming assistant output after any tool results:
nextPhase = 'followup'
const followup = beginAssistantSegment(request.executionId, nextPhase)
activeSegmentId = followup.segmentId
yield followup.event
```

- [ ] **Step 5: Update the existing runner tests to assert the new event shape**

```ts
expect(events.map(event => event.type)).toContain('assistant_segment_start')
expect(events).toEqual(
  expect.arrayContaining([
    expect.objectContaining({
      type: 'tool_call',
      toolUseId: expect.any(String),
    }),
    expect.objectContaining({
      type: 'tool_result',
      toolUseId: expect.any(String),
    }),
  ]),
)
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `pnpm --filter @onecell/nanoclaw run test -- edge-runner.test.ts`
Expected: PASS with the new boundary-aware event assertions green.

- [ ] **Step 7: Commit**

```bash
git add packages/nanoclaw/src/agent-backend.ts packages/nanoclaw/src/edge-runner.ts packages/nanoclaw/src/edge-runner.test.ts
git commit -m "feat(nanoclaw): emit trajectory-aware tool execution events"
```

### Task 3: Project execution events into terminal transcript state

**Files:**
- Modify: `packages/nanoclaw/src/edge-event-dispatcher.ts`
- Modify: `packages/nanoclaw/src/backends/edge-backend.ts`
- Test: `packages/nanoclaw/src/channels/terminal.test.ts`

- [ ] **Step 1: Write the failing terminal integration test**

```ts
it('renders a failed tool result followed by a follow-up assistant block', async () => {
  emitTerminalSystemEvent('term:canary-group', 'execution started')
  appendTerminalEventForTests('term:canary-group', {
    kind: 'assistant',
    phase: 'initial',
    text: 'I will inspect the file.',
  })
  appendTerminalEventForTests('term:canary-group', {
    kind: 'tool_use',
    toolName: 'workspace.read',
    args: { path: 'missing.ts' },
    status: 'errored',
  })
  appendTerminalEventForTests('term:canary-group', {
    kind: 'tool_result',
    toolName: 'workspace.read',
    isError: true,
    content: '{"error":"ENOENT: missing.ts"}',
  })
  appendTerminalEventForTests('term:canary-group', {
    kind: 'assistant',
    phase: 'followup',
    text: 'That read failed; I will inspect the manifest instead.',
  })

  const channelFactory = getChannelFactory('terminal')
  const channel = channelFactory?.createChannel?.({})
  const output = renderToString(channel!.buildAppForTests())

  expect(output).toContain('I will inspect the file.')
  expect(output).toContain('workspace.read')
  expect(output).toContain('ENOENT: missing.ts')
  expect(output).toContain('That read failed; I will inspect the manifest instead.')
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @onecell/nanoclaw run test -- channels/terminal.test.ts`
Expected: FAIL because the terminal channel still expects flat `TerminalPanelTranscriptEntry` records and does not understand projected transcript blocks.

- [ ] **Step 3: Replace pending tool mutation with transcript projection in the dispatcher**

```ts
// packages/nanoclaw/src/edge-event-dispatcher.ts
import {
  applyExecutionEventToTranscript,
  createEmptyTerminalTranscriptState,
} from './terminal-transcript.js'

const transcriptStateByChat = new Map<string, ReturnType<typeof createEmptyTerminalTranscriptState>>()

function project(chatJid: string, event: ExecutionEvent) {
  const current = transcriptStateByChat.get(chatJid) ?? createEmptyTerminalTranscriptState()
  const next = applyExecutionEventToTranscript(current, event)
  transcriptStateByChat.set(chatJid, next)
  return next
}

async onToolCall(event) {
  const next = project(request.chatJid, event)
  const { replaceTerminalTranscriptBlocks } = await import('./channels/terminal.js')
  replaceTerminalTranscriptBlocks(request.chatJid, next.blocks)
}

async onToolResult(event) {
  const next = project(request.chatJid, event)
  const { replaceTerminalTranscriptBlocks } = await import('./channels/terminal.js')
  replaceTerminalTranscriptBlocks(request.chatJid, next.blocks)
}

onError(event) {
  const next = project(request.chatJid, event)
  replaceTerminalTranscriptBlocks(request.chatJid, next.blocks)
  failTerminalWorker({
    chatJid: request.chatJid,
    key: workerKey,
    error: event.message,
  })
}
```

- [ ] **Step 4: Make the edge backend pass all assistant boundary events through the existing hook path**

```ts
// packages/nanoclaw/src/backends/edge-backend.ts
for await (const event of runner.runTurn(request, { signal: abortController.signal })) {
  lastEventAt = Date.now()

  if (event.type === 'assistant_segment_start') {
    await hooks?.onProgress?.({
      type: 'progress',
      executionId: event.executionId,
      message: `assistant ${event.phase} segment started`,
    })
  }

  switch (event.type) {
    case 'ack':
      await hooks?.onAck?.(event)
      break
    case 'heartbeat':
      await hooks?.onHeartbeat?.(event)
      break
    case 'tool_call':
      await hooks?.onToolCall?.(event)
      break
    case 'tool_result':
      await hooks?.onToolResult?.(event)
      break
    case 'checkpoint':
      await hooks?.onCheckpoint?.(event)
      break
    case 'final':
      await hooks?.onFinal?.(event)
      break
    case 'error':
      await hooks?.onError?.(event)
      break
  }
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm --filter @onecell/nanoclaw run test -- channels/terminal.test.ts`
Expected: PASS with the new projected transcript behavior visible in terminal tests.

- [ ] **Step 6: Commit**

```bash
git add packages/nanoclaw/src/edge-event-dispatcher.ts packages/nanoclaw/src/backends/edge-backend.ts packages/nanoclaw/src/channels/terminal.test.ts
git commit -m "feat(nanoclaw): project edge events into terminal trajectories"
```

### Task 4: Render trajectory-aware transcript blocks in the terminal UI

**Files:**
- Modify: `packages/nanoclaw/src/components/transcript.tsx`
- Modify: `packages/nanoclaw/src/terminal-app.tsx`
- Modify: `packages/nanoclaw/src/components/transcript.test.tsx`
- Modify: `packages/nanoclaw/src/terminal-app.test.tsx`

- [ ] **Step 1: Write the failing UI render tests**

```ts
it('renders assistant, tool use, failed tool result, and follow-up assistant as separate blocks', () => {
  const blocks = [
    {
      id: 'a1',
      kind: 'assistant',
      executionId: 'exec-1',
      trajectoryId: 'traj-1',
      segmentId: 'seg-1',
      phase: 'initial',
      status: 'completed',
      text: 'I will inspect the file.',
    },
    {
      id: 't1',
      kind: 'tool_use',
      executionId: 'exec-1',
      trajectoryId: 'traj-1',
      toolUseId: 'tool-1',
      toolName: 'workspace.read',
      args: { path: 'missing.ts' },
      status: 'errored',
    },
    {
      id: 'r1',
      kind: 'tool_result',
      executionId: 'exec-1',
      trajectoryId: 'traj-1',
      toolUseId: 'tool-1',
      toolName: 'workspace.read',
      isError: true,
      content: '{"error":"ENOENT: missing.ts"}',
    },
    {
      id: 'a2',
      kind: 'assistant',
      executionId: 'exec-1',
      trajectoryId: 'traj-1',
      segmentId: 'seg-2',
      phase: 'followup',
      status: 'completed',
      text: 'That read failed; I will inspect the manifest instead.',
    },
  ] as const

  const output = renderToString(<Transcript blocks={blocks} width={100} verbose />)
  expect(output).toContain('I will inspect the file.')
  expect(output).toContain('workspace.read')
  expect(output).toContain('ENOENT: missing.ts')
  expect(output).toContain('That read failed; I will inspect the manifest instead.')
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @onecell/nanoclaw run test -- components/transcript.test.tsx terminal-app.test.tsx`
Expected: FAIL because `Transcript` and `TerminalApp` still accept `entries`, not structured transcript blocks.

- [ ] **Step 3: Update `Transcript` to render structured blocks**

```tsx
// packages/nanoclaw/src/components/transcript.tsx
import type {
  AssistantTranscriptBlock,
  TerminalTranscriptBlock,
  ToolResultTranscriptBlock,
  ToolUseTranscriptBlock,
} from '../terminal-transcript.js'

interface TranscriptProps {
  blocks: TerminalTranscriptBlock[]
  width?: number
  maxLines?: number
  verbose?: boolean
}

function AssistantBlockLine({ block }: { block: AssistantTranscriptBlock }) {
  return (
    <Box>
      <Text color={theme.agentCyan}>⏺</Text>
      <Text> </Text>
      <Text color={theme.text}>{block.text}</Text>
    </Box>
  )
}

function ToolUseLine({ block }: { block: ToolUseTranscriptBlock }) {
  const summary = `${block.toolName}(${JSON.stringify(block.args)})`
  return (
    <Box>
      <Text color={theme.subtle}>  ├─ </Text>
      <Text color={theme.inactive}>{summary}</Text>
    </Box>
  )
}

function ToolResultLine({ block }: { block: ToolResultTranscriptBlock }) {
  return (
    <Box>
      <Text color={theme.subtle}>  └─ </Text>
      <Text color={block.isError ? 'red' : theme.inactive}>{block.content}</Text>
    </Box>
  )
}

export function Transcript({ blocks, width, verbose = false }: TranscriptProps) {
  if (blocks.length === 0) {
    return <Text color={theme.subtle}>No transcript yet.</Text>
  }

  return (
    <Box flexDirection="column" width={width}>
      {blocks.map(block => {
        switch (block.kind) {
          case 'assistant':
            return <AssistantBlockLine key={block.id} block={block} />
          case 'tool_use':
            return <ToolUseLine key={block.id} block={block} />
          case 'tool_result':
            return <ToolResultLine key={block.id} block={block} />
          case 'system_status':
            return <Text key={block.id} color={theme.inactive}>{block.text}</Text>
        }
      })}
    </Box>
  )
}
```

- [ ] **Step 4: Update `TerminalApp` to pass transcript blocks instead of flat entries**

```tsx
// packages/nanoclaw/src/terminal-app.tsx
import type { TerminalTranscriptBlock } from './terminal-transcript.js'

interface TerminalAppProps {
  backend: string
  busy: boolean
  recentTranscript?: TerminalTranscriptBlock[]
  // ...existing props...
}

<Transcript blocks={recentTranscript} width={width} verbose={verbose} />
```

- [ ] **Step 5: Update the render tests for verbose/collapsed invariants**

```ts
expect(outputVerbose).toContain('workspace.read')
expect(outputVerbose).toContain('ENOENT: missing.ts')
expect(outputCollapsed).toContain('ctrl+o to expand')
expect(outputCollapsed).toContain('That read failed; I will inspect the manifest instead.')
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `pnpm --filter @onecell/nanoclaw run test -- components/transcript.test.tsx terminal-app.test.tsx`
Expected: PASS with assistant/tool/tool-result/follow-up block rendering covered.

- [ ] **Step 7: Commit**

```bash
git add packages/nanoclaw/src/components/transcript.tsx packages/nanoclaw/src/terminal-app.tsx packages/nanoclaw/src/components/transcript.test.tsx packages/nanoclaw/src/terminal-app.test.tsx
git commit -m "feat(nanoclaw): render transcript blocks for tool trajectories"
```

### Task 5: Verify the full flow and clean up old flat transcript assumptions

**Files:**
- Modify: `packages/nanoclaw/src/channels/terminal.test.ts`
- Modify: `packages/nanoclaw/src/edge-runner.test.ts`
- Modify: `packages/nanoclaw/src/edge-event-dispatcher.ts`
- Modify: `packages/nanoclaw/src/components/transcript.tsx`

- [ ] **Step 1: Add an end-to-end regression test for model-driven follow-up after tool failure**

```ts
it('shows model-driven follow-up instead of blind retry after tool failure', async () => {
  const blocks = [
    {
      id: 'a1',
      kind: 'assistant',
      executionId: 'exec-1',
      trajectoryId: 'traj-1',
      segmentId: 'seg-1',
      phase: 'initial',
      status: 'completed',
      text: 'I will inspect the file.',
    },
    {
      id: 't1',
      kind: 'tool_use',
      executionId: 'exec-1',
      trajectoryId: 'traj-1',
      toolUseId: 'tool-1',
      toolName: 'workspace.read',
      args: { path: 'missing.ts' },
      status: 'errored',
    },
    {
      id: 'r1',
      kind: 'tool_result',
      executionId: 'exec-1',
      trajectoryId: 'traj-1',
      toolUseId: 'tool-1',
      toolName: 'workspace.read',
      isError: true,
      content: '{"error":"ENOENT: missing.ts"}',
    },
    {
      id: 'a2',
      kind: 'assistant',
      executionId: 'exec-1',
      trajectoryId: 'traj-1',
      segmentId: 'seg-2',
      phase: 'followup',
      status: 'completed',
      text: 'That read failed; I will inspect the manifest instead.',
    },
  ]

  const output = renderToString(<Transcript blocks={blocks} width={100} verbose />)
  expect(output.match(/workspace\.read/g)?.length).toBe(1)
  expect(output).toContain('That read failed; I will inspect the manifest instead.')
})
```

- [ ] **Step 2: Run the focused tests first**

Run: `pnpm --filter @onecell/nanoclaw run test -- terminal-transcript.test.ts edge-runner.test.ts components/transcript.test.tsx terminal-app.test.tsx channels/terminal.test.ts`
Expected: PASS with all redesigned transcript-flow tests green.

- [ ] **Step 3: Run the package verification suite**

Run: `pnpm --filter @onecell/nanoclaw run typecheck && pnpm --filter @onecell/nanoclaw run test && pnpm --filter @onecell/nanoclaw run lint`
Expected: All commands PASS.

- [ ] **Step 4: Do a terminal golden-path check**

Run: `pnpm --filter @onecell/nanoclaw run dev`
Expected: The terminal UI starts, a tool-using turn renders as assistant block → tool block → tool result block → follow-up assistant block, and ctrl+o still toggles verbose details.

- [ ] **Step 5: Remove any leftover flat transcript helper branches that are now dead code**

```ts
// examples of code to delete once the new flow is in place
// - pendingToolCalls maps that mutate a flat transcript entry in place
// - Transcript code paths keyed on entry.role === 'tool'
// - TerminalApp props typed as TerminalPanelTranscriptEntry[]
```

- [ ] **Step 6: Commit**

```bash
git add packages/nanoclaw/src/channels/terminal.test.ts packages/nanoclaw/src/edge-runner.test.ts packages/nanoclaw/src/edge-event-dispatcher.ts packages/nanoclaw/src/components/transcript.tsx
git commit -m "refactor(nanoclaw): finalize transcript-first tool trajectory UI"
```

## Self-review

### Spec coverage
- Transcript-first architecture: covered by Tasks 1 and 3.
- Explicit tool-result error semantics: covered by Tasks 1 and 2.
- Follow-up assistant blocks after tool results: covered by Tasks 1, 2, and 4.
- Terminal UI block rendering: covered by Task 4.
- Testing and acceptance criteria: covered by Task 5.

### Placeholder scan
- No `TODO` / `TBD` placeholders remain.
- Every code-changing step includes a concrete code block.
- Every verification step includes exact commands and expected outcomes.

### Type consistency
- `assistant_segment_start`, `segmentId`, `toolUseId`, and `isError` are introduced in Task 2 and used consistently in Tasks 1, 3, 4, and 5.
- `TerminalTranscriptBlock` is introduced in Task 1 and consumed consistently in Tasks 3 and 4.

## Notes for the implementing agent
- Keep the changes focused on terminal mode and the shared execution/transcript path used by terminal mode.
- Do not preserve the flat `role: 'tool'` transcript model in parallel once the new block model is live.
- If a helper is only needed by the new transcript projector, keep it in `terminal-transcript.ts` instead of spreading transcript semantics across multiple files.
