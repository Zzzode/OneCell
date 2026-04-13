# Explicit Edge Failure Escalation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove implicit edge→container fallback after edge runtime failures, add explicit `/retry-container` for terminal mode, and keep scheduled tasks on explicit failure paths while preserving upfront capability-based routing.

**Architecture:** Keep the existing policy router and initial backend selection intact. Change only the post-failure path: edge failures that used to auto-fallback will now surface as explicit escalation opportunities, terminal mode will store one retryable request snapshot and expose `/retry-container`, and scheduled tasks will record escalation availability in failure text instead of starting a container rerun.

**Tech Stack:** TypeScript, Node.js, Vitest, NanoClaw terminal channel, NanoClaw scheduler/runtime orchestration

---

## File map

- `packages/nanoclaw/src/framework-recovery.ts` — classify edge failures as explicit container-retry opportunities instead of auto-fallback triggers.
- `packages/nanoclaw/src/framework-recovery.test.ts` — lock in the new classification semantics.
- `packages/nanoclaw/src/terminal-retry.ts` — new small state module for the most recent retryable terminal edge failure.
- `packages/nanoclaw/src/terminal-retry.test.ts` — tests for storing, reading, consuming, and clearing retry state.
- `packages/nanoclaw/src/channels/registry.ts` — add terminal callback for `/retry-container`.
- `packages/nanoclaw/src/channels/terminal.ts` — add `/retry-container`, help text, and terminal messaging.
- `packages/nanoclaw/src/channels/terminal.test.ts` — verify `/retry-container` behavior.
- `packages/nanoclaw/src/index.ts` — remove implicit group-turn fallback, store retry snapshot, and wire `/retry-container` to a fresh forced-container run.
- `packages/nanoclaw/src/index-runtime-fallback.test.ts` — replace fallback tests with explicit failure + retry-state coverage.
- `packages/nanoclaw/src/task-scheduler.ts` — remove implicit scheduled-task fallback and record escalation availability in failure text.
- `packages/nanoclaw/src/task-scheduler.test.ts` — verify no auto-fallback and visible escalation metadata.
- `packages/nanoclaw/README.md` — document explicit retry semantics.
- `packages/nanoclaw/CLAUDE.md` — align internal guidance with explicit retry semantics.

---

### Task 1: Reframe recovery classification around explicit retry

**Files:**
- Modify: `packages/nanoclaw/src/framework-recovery.ts`
- Modify: `packages/nanoclaw/src/framework-recovery.test.ts`

- [ ] **Step 1: Rewrite the recovery tests to describe explicit retry rather than fallback**

```typescript
// packages/nanoclaw/src/framework-recovery.test.ts
import { describe, expect, it } from 'vitest';

import { classifyRuntimeRecovery } from './framework-recovery.js';

describe('framework recovery', () => {
  it('classifies edge runtime failures for explicit container retry', () => {
    expect(
      classifyRuntimeRecovery({
        error: 'Edge execution exceeded deadline of 100ms.',
        workerClass: 'edge',
        fallbackEligible: true,
      }),
    ).toEqual({
      kind: 'explicit_container_retry',
      reason: 'edge_timeout',
    });

    expect(
      classifyRuntimeRecovery({
        error: 'Edge runner finished without a final event.',
        workerClass: 'edge',
        fallbackEligible: true,
      }),
    ).toEqual({
      kind: 'explicit_container_retry',
      reason: 'edge_runtime_unhealthy',
    });
  });

  it('suppresses explicit retry after visible output and still marks replan', () => {
    expect(
      classifyRuntimeRecovery({
        error: 'Edge execution exceeded deadline of 100ms.',
        workerClass: 'edge',
        fallbackEligible: true,
        visibleOutputEmitted: true,
      }),
    ).toEqual({ kind: 'none' });

    expect(
      classifyRuntimeRecovery({
        error: 'Workspace version conflict: expected a, received b',
        workerClass: 'edge',
        fallbackEligible: true,
      }),
    ).toEqual({
      kind: 'replan',
      reason: 'state_conflict_requires_heavy',
    });
  });
});
```

- [ ] **Step 2: Run the recovery tests to verify they fail**

Run: `pnpm --filter @onecell/nanoclaw exec vitest run src/framework-recovery.test.ts`
Expected: FAIL because the implementation still returns `kind: 'fallback'`.

- [ ] **Step 3: Update recovery classification semantics**

```typescript
// packages/nanoclaw/src/framework-recovery.ts
export type RuntimeRecoveryDecision =
  | { kind: 'none' }
  | {
      kind: 'explicit_container_retry';
      reason: Extract<
        TaskFallbackReason,
        'edge_timeout' | 'edge_runtime_unhealthy'
      >;
    }
  | {
      kind: 'replan';
      reason: Extract<TaskFallbackReason, 'state_conflict_requires_heavy'>;
    };

export function classifyRuntimeRecovery(options: {
  error: string;
  workerClass: 'edge' | 'heavy';
  fallbackEligible: boolean;
  visibleOutputEmitted?: boolean;
}): RuntimeRecoveryDecision {
  if (!options.error.trim()) {
    return { kind: 'none' };
  }

  if (/workspace version conflict/i.test(options.error)) {
    return {
      kind: 'replan',
      reason: 'state_conflict_requires_heavy',
    };
  }

  if (
    options.workerClass !== 'edge' ||
    !options.fallbackEligible ||
    options.visibleOutputEmitted === true ||
    /cancelled before completion/i.test(options.error)
  ) {
    return { kind: 'none' };
  }

  return {
    kind: 'explicit_container_retry',
    reason: /deadline|timeout/i.test(options.error)
      ? 'edge_timeout'
      : 'edge_runtime_unhealthy',
  };
}
```

- [ ] **Step 4: Run the recovery tests to verify they pass**

Run: `pnpm --filter @onecell/nanoclaw exec vitest run src/framework-recovery.test.ts`
Expected: PASS with 2 passing tests.

- [ ] **Step 5: Commit the recovery-classification change**

```bash
git add packages/nanoclaw/src/framework-recovery.ts packages/nanoclaw/src/framework-recovery.test.ts
git commit -m "refactor(nanoclaw): classify edge failures for explicit retry"
```

---

### Task 2: Add terminal retry state storage

**Files:**
- Create: `packages/nanoclaw/src/terminal-retry.ts`
- Create: `packages/nanoclaw/src/terminal-retry.test.ts`

- [ ] **Step 1: Write failing tests for terminal retry state**

```typescript
// packages/nanoclaw/src/terminal-retry.test.ts
import { beforeEach, describe, expect, it } from 'vitest';

import {
  clearTerminalRetryRequest,
  consumeTerminalRetryRequest,
  getTerminalRetryRequest,
  setTerminalRetryRequest,
} from './terminal-retry.js';

describe('terminal retry state', () => {
  beforeEach(() => {
    clearTerminalRetryRequest();
  });

  it('stores and returns the latest retryable request', () => {
    setTerminalRetryRequest({
      prompt: 'summarize this thread',
      groupFolder: 'terminal_canary',
      chatJid: 'term:canary-group',
      isMain: true,
      sessionId: 'session-edge-1',
      failureSummary: 'Edge execution exceeded deadline of 100ms.',
      escalationReason: 'edge_timeout',
      createdAt: '2026-04-12T12:00:00.000Z',
    });

    expect(getTerminalRetryRequest()).toEqual({
      prompt: 'summarize this thread',
      groupFolder: 'terminal_canary',
      chatJid: 'term:canary-group',
      isMain: true,
      sessionId: 'session-edge-1',
      failureSummary: 'Edge execution exceeded deadline of 100ms.',
      escalationReason: 'edge_timeout',
      createdAt: '2026-04-12T12:00:00.000Z',
    });
  });

  it('consumes and clears retry state', () => {
    setTerminalRetryRequest({
      prompt: 'summarize this thread',
      groupFolder: 'terminal_canary',
      chatJid: 'term:canary-group',
      isMain: true,
      sessionId: null,
      failureSummary: 'Edge runner finished without a final event.',
      escalationReason: 'edge_runtime_unhealthy',
      createdAt: '2026-04-12T12:00:00.000Z',
    });

    expect(consumeTerminalRetryRequest()?.prompt).toBe('summarize this thread');
    expect(getTerminalRetryRequest()).toBeNull();
  });
});
```

- [ ] **Step 2: Run the retry-state tests to verify they fail**

Run: `pnpm --filter @onecell/nanoclaw exec vitest run src/terminal-retry.test.ts`
Expected: FAIL because `src/terminal-retry.ts` does not exist.

- [ ] **Step 3: Implement terminal retry state in a dedicated module**

```typescript
// packages/nanoclaw/src/terminal-retry.ts
export interface TerminalRetryRequest {
  prompt: string;
  groupFolder: string;
  chatJid: string;
  isMain: boolean;
  sessionId: string | null;
  failureSummary: string;
  escalationReason: 'edge_timeout' | 'edge_runtime_unhealthy';
  createdAt: string;
}

let pendingTerminalRetryRequest: TerminalRetryRequest | null = null;

export function getTerminalRetryRequest(): TerminalRetryRequest | null {
  return pendingTerminalRetryRequest;
}

export function setTerminalRetryRequest(
  request: TerminalRetryRequest,
): TerminalRetryRequest {
  pendingTerminalRetryRequest = request;
  return request;
}

export function consumeTerminalRetryRequest(): TerminalRetryRequest | null {
  const current = pendingTerminalRetryRequest;
  pendingTerminalRetryRequest = null;
  return current;
}

export function clearTerminalRetryRequest(): void {
  pendingTerminalRetryRequest = null;
}
```

- [ ] **Step 4: Run the retry-state tests to verify they pass**

Run: `pnpm --filter @onecell/nanoclaw exec vitest run src/terminal-retry.test.ts`
Expected: PASS with 2 passing tests.

- [ ] **Step 5: Commit the retry-state module**

```bash
git add packages/nanoclaw/src/terminal-retry.ts packages/nanoclaw/src/terminal-retry.test.ts
git commit -m "feat(nanoclaw): store explicit terminal retry requests"
```

---

### Task 3: Add `/retry-container` to the terminal channel

**Files:**
- Modify: `packages/nanoclaw/src/channels/registry.ts`
- Modify: `packages/nanoclaw/src/channels/terminal.ts`
- Modify: `packages/nanoclaw/src/channels/terminal.test.ts`

- [ ] **Step 1: Add terminal tests for `/retry-container`**

```typescript
// packages/nanoclaw/src/channels/terminal.test.ts
it('calls onRetryContainer when `/retry-container` is entered', async () => {
  const onRetryContainer = vi.fn(async () => '已使用 container 重试上一条失败请求。');
  const writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

  try {
    const factory = getChannelFactory('terminal');
    const channel = factory!({
      onMessage: vi.fn(),
      onChatMetadata: vi.fn(),
      onRetryContainer,
      registeredGroups: () => ({}),
    });

    expect(channel).not.toBeNull();
    await channel!.connect();

    readlineHarness.emitLine('/retry-container');
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(onRetryContainer).toHaveBeenCalledWith('terminal_canary');
    expect(
      writeSpy.mock.calls.some(([chunk]) =>
        String(chunk).includes('已使用 container 重试上一条失败请求。'),
      ),
    ).toBe(true);

    await channel!.disconnect();
  } finally {
    writeSpy.mockRestore();
  }
});

it('shows a clear message when `/retry-container` has nothing to retry', async () => {
  const onRetryContainer = vi.fn(async () => '当前没有可用的 edge 失败请求可供 container 重试。');
  const writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

  try {
    const factory = getChannelFactory('terminal');
    const channel = factory!({
      onMessage: vi.fn(),
      onChatMetadata: vi.fn(),
      onRetryContainer,
      registeredGroups: () => ({}),
    });

    expect(channel).not.toBeNull();
    await channel!.connect();

    readlineHarness.emitLine('/retry-container');
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(
      writeSpy.mock.calls.some(([chunk]) =>
        String(chunk).includes('当前没有可用的 edge 失败请求可供 container 重试。'),
      ),
    ).toBe(true);

    await channel!.disconnect();
  } finally {
    writeSpy.mockRestore();
  }
});
```

- [ ] **Step 2: Run the terminal tests to verify they fail**

Run: `pnpm --filter @onecell/nanoclaw exec vitest run src/channels/terminal.test.ts`
Expected: FAIL because `ChannelOpts` and local-command handling do not support `/retry-container`.

- [ ] **Step 3: Extend the terminal channel contract and command handling**

```typescript
// packages/nanoclaw/src/channels/registry.ts
export interface ChannelOpts {
  onMessage: OnInboundMessage;
  onChatMetadata: OnChatMetadata;
  registeredGroups: () => Record<string, RegisteredGroup>;
  onResetSession?: (groupFolder: string) => void | Promise<void>;
  onQuit?: (groupFolder: string) => void | Promise<void>;
  onCancel?: (groupFolder: string) => void | Promise<void>;
  onRetryContainer?: (groupFolder: string) => Promise<string> | string;
}
```

```typescript
// packages/nanoclaw/src/channels/terminal.ts
type LocalCommand =
  | '/help'
  | '/status'
  | '/agents'
  | '/graph'
  | '/focus'
  | '/tasks'
  | '/task'
  | '/new'
  | '/session'
  | '/retry-container'
  | '/logs'
  | '/clear'
  | '/exit'
  | '/quit';

private async handleLocalCommand(input: string): Promise<boolean> {
  const parts = input.trim().split(/\s+/);
  const command = parts[0] as LocalCommand | string;
  switch (command) {
    // ...existing cases...
    case '/retry-container': {
      const message =
        (await this.opts.onRetryContainer?.(TERMINAL_GROUP_FOLDER)) ??
        '当前没有可用的 edge 失败请求可供 container 重试。';
      this.showInspector('retry-container', message);
      return true;
    }
    // ...existing cases...
  }
}
```

```typescript
// packages/nanoclaw/src/channels/terminal.ts (help text excerpt)
[
  '可用命令：',
  '/help  查看帮助',
  '/status 查看当前状态',
  '/agents 查看当前 team agents 状态',
  '/graph 查看当前 team graph 明细',
  '/focus <root|planner|worker N|aggregate|clear> 切换观察焦点',
  '/tasks  查看当前任务',
  '/task list 查看任务详情',
  '/task pause <taskId> 暂停任务',
  '/task resume <taskId> 恢复任务',
  '/task delete <taskId> 删除任务',
  '/new  清空当前 terminal provider session',
  '/session clear 清空当前 terminal provider session',
  '/retry-container 使用 container 重试上一条 edge 失败请求',
  '/logs [n] 查看最近系统事件',
  '/clear  清空当前 inspector',
  'Shift+Up/Down 切换当前 focus agent',
  'ESC    打断当前正在执行的对话',
  '/quit   退出终端',
].join('\n')
```

- [ ] **Step 4: Run the terminal tests to verify they pass**

Run: `pnpm --filter @onecell/nanoclaw exec vitest run src/channels/terminal.test.ts`
Expected: PASS including the two `/retry-container` tests.

- [ ] **Step 5: Commit the terminal command change**

```bash
git add packages/nanoclaw/src/channels/registry.ts packages/nanoclaw/src/channels/terminal.ts packages/nanoclaw/src/channels/terminal.test.ts
git commit -m "feat(nanoclaw): add explicit terminal container retry command"
```

---

### Task 4: Remove group-turn auto-fallback and wire explicit terminal retry

**Files:**
- Modify: `packages/nanoclaw/src/index.ts`
- Modify: `packages/nanoclaw/src/index-runtime-fallback.test.ts`
- Modify: `packages/nanoclaw/src/channels/registry.ts`
- Modify: `packages/nanoclaw/src/channels/terminal.ts`
- Modify: `packages/nanoclaw/src/terminal-retry.ts`

- [ ] **Step 1: Replace the runtime-fallback tests with explicit failure and retry coverage**

```typescript
// packages/nanoclaw/src/index-runtime-fallback.test.ts
it('fails edge group turns explicitly and stores a terminal retry request', async () => {
  vi.resetModules();

  const db = await import('./db.js');
  const index = await import('./index.js');
  const retryState = await import('./terminal-retry.js');

  db._initTestDatabase();
  retryState.clearTerminalRetryRequest();
  index._setRegisteredGroups({
    'room@g.us': {
      name: 'Team Alpha',
      folder: 'team_alpha',
      trigger: '@Andy',
      added_at: '2026-04-07T00:00:00.000Z',
      executionMode: 'auto',
      requiresTrigger: false,
    },
  });
  index._setChannelsForTests([{ name: 'test', connect: async () => {}, disconnect: async () => {}, isConnected: () => true, ownsJid: (jid) => jid === 'room@g.us', sendMessage: vi.fn(async () => {}), setTyping: vi.fn(async () => {}) }]);
  index._setSessionsForTests({ team_alpha: 'session-edge-1' });
  index._setLastAgentTimestampForTests({});

  db.storeChatMetadata('room@g.us', '2026-04-07T00:00:01.000Z', 'Team Alpha', 'whatsapp', true);
  db.storeMessageDirect({
    id: 'msg-1',
    chat_jid: 'room@g.us',
    sender: 'alice',
    sender_name: 'Alice',
    content: 'please summarize this',
    timestamp: '2026-04-07T00:00:01.000Z',
    is_from_me: false,
  });

  edgeBackendRun.mockResolvedValueOnce({
    status: 'error',
    result: null,
    error: 'Edge execution exceeded deadline of 100ms.',
  });

  const processed = await index._processGroupMessagesForTests('room@g.us');

  expect(processed).toBe(false);
  expect(edgeBackendRun).toHaveBeenCalledTimes(1);
  expect(containerBackendRun).not.toHaveBeenCalled();
  expect(retryState.getTerminalRetryRequest()).toMatchObject({
    prompt: expect.stringContaining('please summarize this'),
    escalationReason: 'edge_timeout',
    sessionId: 'session-edge-1',
  });
});

it('retries the latest terminal edge failure on container when requested explicitly', async () => {
  vi.resetModules();

  const db = await import('./db.js');
  const index = await import('./index.js');
  const retryState = await import('./terminal-retry.js');

  db._initTestDatabase();
  retryState.setTerminalRetryRequest({
    prompt: 'replay this prompt',
    groupFolder: 'terminal_canary',
    chatJid: 'term:canary-group',
    isMain: true,
    sessionId: 'session-edge-1',
    failureSummary: 'Edge execution exceeded deadline of 100ms.',
    escalationReason: 'edge_timeout',
    createdAt: '2026-04-12T12:00:00.000Z',
  });

  containerBackendRun.mockResolvedValueOnce({
    status: 'success',
    result: 'container retry result',
    newSessionId: 'session-container-2',
  });

  const message = await index._retryTerminalFailureForTests();

  expect(message).toContain('/retry-container');
  expect(containerBackendRun).toHaveBeenCalledTimes(1);
  expect(edgeBackendRun).not.toHaveBeenCalled();
  expect(retryState.getTerminalRetryRequest()).toBeNull();
});
```

- [ ] **Step 2: Run the group-runtime tests to verify they fail**

Run: `pnpm --filter @onecell/nanoclaw exec vitest run src/index-runtime-fallback.test.ts`
Expected: FAIL because the current runtime still auto-runs the container fallback and has no explicit retry helper.

- [ ] **Step 3: Remove auto-fallback from `index.ts` and add explicit retry wiring**

```typescript
// packages/nanoclaw/src/index.ts (imports)
import { classifyRuntimeRecovery, markTaskNodeForReplan } from './framework-recovery.js';
import {
  clearTerminalRetryRequest,
  consumeTerminalRetryRequest,
  setTerminalRetryRequest,
} from './terminal-retry.js';
```

```typescript
// packages/nanoclaw/src/index.ts (new helper)
async function retryTerminalFailureWithContainer(): Promise<string> {
  const retry = consumeTerminalRetryRequest();
  if (!retry) {
    return '当前没有可用的 edge 失败请求可供 container 重试。';
  }

  const group = registeredGroups[retry.chatJid];
  if (!group) {
    return `无法重试：group 不存在 (${retry.groupFolder})`; 
  }

  const forcedGroup = {
    ...group,
    executionMode: 'container' as const,
  };

  await runAgent(forcedGroup, retry.prompt, retry.chatJid);
  return `已使用 container 重试上一条失败请求。失败原因：${retry.failureSummary}`;
}
```

```typescript
// packages/nanoclaw/src/index.ts (inside runAgent, replacing the fallback block)
const recovery = classifyRuntimeRecovery({
  error: streamedError || output.error || '',
  workerClass: placement.workerClass,
  fallbackEligible: placement.fallbackEligible,
  visibleOutputEmitted: streamedVisibleResult,
});

if (recovery.kind === 'explicit_container_retry') {
  const rawError = streamedError || output.error || 'Unknown error';
  if (executionId) {
    failExecution(executionId, rawError);
  }
  setTerminalRetryRequest({
    prompt,
    groupFolder: group.folder,
    chatJid,
    isMain,
    sessionId: sessionId ?? null,
    failureSummary: summarizeRuntimeError(rawError),
    escalationReason: recovery.reason,
    createdAt: new Date().toISOString(),
  });
  failRootTaskGraph(graph.graphId, graph.rootTaskId, rawError);
  failTerminalTurn({
    chatJid,
    stage: 'failed',
    error: rawError,
    activity: `edge 执行失败：${graph.graphId} · ${summarizeRuntimeError(rawError)}`,
  });
  emitTerminalSystemEvent(
    chatJid,
    `edge 执行失败：${summarizeRuntimeError(rawError)} · 如需更复杂运行时，可执行 /retry-container`,
  );
  return 'error';
}
```

```typescript
// packages/nanoclaw/src/index.ts (channelOpts)
onResetSession: (groupFolder: string) => {
  if (groupFolder === TERMINAL_GROUP_FOLDER) {
    clearTerminalRetryRequest();
    resetTerminalConversation();
  }
},
onQuit: (groupFolder: string) => {
  if (groupFolder === TERMINAL_GROUP_FOLDER) {
    clearTerminalRetryRequest();
    gracefulTerminalQuit();
  }
},
onCancel: (groupFolder: string) => {
  if (groupFolder === TERMINAL_GROUP_FOLDER) {
    interruptTerminalTurn();
    emitTerminalSystemEvent(TERMINAL_GROUP_JID, '已打断当前对话（ESC）');
  }
},
onRetryContainer: async (groupFolder: string) => {
  if (groupFolder !== TERMINAL_GROUP_FOLDER) {
    return '当前没有可用的 edge 失败请求可供 container 重试。';
  }
  return retryTerminalFailureWithContainer();
},
```

```typescript
// packages/nanoclaw/src/index.ts (test exports)
export async function _retryTerminalFailureForTests(): Promise<string> {
  return retryTerminalFailureWithContainer();
}
```

- [ ] **Step 4: Run the group-runtime tests to verify they pass**

Run: `pnpm --filter @onecell/nanoclaw exec vitest run src/index-runtime-fallback.test.ts`
Expected: PASS with no auto-container fallback and explicit retry coverage.

- [ ] **Step 5: Commit the explicit group-turn retry flow**

```bash
git add packages/nanoclaw/src/index.ts packages/nanoclaw/src/index-runtime-fallback.test.ts packages/nanoclaw/src/terminal-retry.ts
 git commit -m "feat(nanoclaw): make edge group failures retry explicitly"
```

---

### Task 5: Remove scheduled-task auto-fallback and record escalation availability

**Files:**
- Modify: `packages/nanoclaw/src/task-scheduler.ts`
- Modify: `packages/nanoclaw/src/task-scheduler.test.ts`

- [ ] **Step 1: Replace the scheduled-task fallback test with explicit-failure coverage**

```typescript
// packages/nanoclaw/src/task-scheduler.test.ts
it('fails edge task executions explicitly and records container escalation availability', async () => {
  createTask({
    id: 'task-edge-failure',
    group_folder: 'team_alpha',
    chat_jid: 'room@g.us',
    prompt: 'edge first task',
    schedule_type: 'once',
    schedule_value: '2026-04-03T00:00:00.000Z',
    context_mode: 'isolated',
    next_run: new Date(Date.now() - 60_000).toISOString(),
    status: 'active',
    created_at: '2026-04-03T00:00:00.000Z',
  });

  edgeBackendRun.mockResolvedValueOnce({
    status: 'error',
    result: null,
    error: 'Edge execution exceeded deadline of 100ms.',
  });

  const queue = {
    closeStdin: vi.fn(),
    enqueueTask: vi.fn(async (_groupJid: string, _taskId: string, fn: () => Promise<void>) => {
      await fn();
    }),
    registerProcess: vi.fn(),
    notifyIdle: vi.fn(),
  } as any;
  const sendMessage = vi.fn(async () => {});

  startSchedulerLoop({
    backends: { container: backendStub, edge: edgeBackendStub },
    defaultExecutionMode: 'auto',
    registeredGroups: () => ({
      'room@g.us': {
        name: 'Team Alpha',
        folder: 'team_alpha',
        trigger: '@Andy',
        added_at: '2026-04-03T00:00:00.000Z',
        executionMode: 'auto',
      },
    }),
    getSessions: () => ({}),
    queue,
    sendMessage,
  });

  await vi.advanceTimersByTimeAsync(10);

  expect(edgeBackendRun).toHaveBeenCalledTimes(1);
  expect(backendRun).not.toHaveBeenCalled();
  expect(sendMessage).not.toHaveBeenCalled();

  const executions = listExecutionStates();
  expect(executions).toHaveLength(1);
  expect(executions[0]).toMatchObject({
    backend: 'edge',
    status: 'failed',
    error: 'Edge execution exceeded deadline of 100ms. Container retry available: edge_timeout.',
  });

  const task = getTaskById('task-edge-failure');
  expect(task?.last_result).toContain('Container retry available: edge_timeout.');
});
```

- [ ] **Step 2: Run the scheduled-task tests to verify they fail**

Run: `pnpm --filter @onecell/nanoclaw exec vitest run src/task-scheduler.test.ts`
Expected: FAIL because the scheduler still starts a container fallback run.

- [ ] **Step 3: Remove auto-fallback and annotate the error instead**

```typescript
// packages/nanoclaw/src/task-scheduler.ts
function appendEscalationHint(
  error: string,
  reason: 'edge_timeout' | 'edge_runtime_unhealthy',
): string {
  return `${error} Container retry available: ${reason}.`;
}
```

```typescript
// packages/nanoclaw/src/task-scheduler.ts (replace the fallback block)
const recovery = classifyRuntimeRecovery({
  error: streamedError || output.error || '',
  workerClass: placement.workerClass,
  fallbackEligible: placement.fallbackEligible,
});

if (recovery.kind === 'explicit_container_retry') {
  const rawError = streamedError || output.error || 'Unknown error';
  const escalatedError = appendEscalationHint(rawError, recovery.reason);
  if (executionId) {
    failExecution(executionId, escalatedError);
  }
  error = escalatedError;
  emitTerminalSystemEvent(
    task.chat_jid,
    `任务失败：${task.id} · ${summarizeRuntimeError(rawError)} · 可显式改用 container 重试`,
  );
}
```

```typescript
// packages/nanoclaw/src/task-scheduler.ts (finalization remains explicit)
const resultSummary = error
  ? `Error: ${error}`
  : result
    ? result.slice(0, 200)
    : 'Completed';
updateTaskAfterRun(task.id, nextRun, resultSummary);
```

- [ ] **Step 4: Run the scheduled-task tests to verify they pass**

Run: `pnpm --filter @onecell/nanoclaw exec vitest run src/task-scheduler.test.ts`
Expected: PASS with no container fallback and visible escalation text in the failure path.

- [ ] **Step 5: Commit the scheduled-task explicit failure path**

```bash
git add packages/nanoclaw/src/task-scheduler.ts packages/nanoclaw/src/task-scheduler.test.ts
git commit -m "refactor(nanoclaw): stop implicit scheduler fallback"
```

---

### Task 6: Update docs and run focused regression coverage

**Files:**
- Modify: `packages/nanoclaw/README.md`
- Modify: `packages/nanoclaw/CLAUDE.md`

- [ ] **Step 1: Add explicit-retry language to the docs**

```markdown
<!-- packages/nanoclaw/README.md -->
In `auto`, NanoClaw does capability-based routing rather than relying on a high-level semantic intent classifier. It inspects execution requirements such as scripts and requested tools/capabilities, then dispatches work to the appropriate backend.

Initial routing may still choose `container` up front when the work requires it. But if an edge execution later fails, NanoClaw no longer performs an implicit edge→container fallback. In terminal mode it surfaces the failure and offers an explicit `/retry-container` path instead.
```

```markdown
<!-- packages/nanoclaw/CLAUDE.md -->
- `auto` mode performs capability-based routing
- script execution is treated as heavy and routes to `container`
- unsupported edge tools/capabilities route to `container`
- edge-compatible work can route to `edge`
- edge runtime failures should surface explicitly; terminal mode may offer `/retry-container` for a user-confirmed rerun on `container`
- scheduled-task edge failures do not auto-escalate; they fail visibly and record escalation availability
```

- [ ] **Step 2: Run the focused regression suite**

Run: `pnpm --filter @onecell/nanoclaw exec vitest run src/framework-recovery.test.ts src/terminal-retry.test.ts src/channels/terminal.test.ts src/index-runtime-fallback.test.ts src/task-scheduler.test.ts`
Expected: PASS across all targeted tests.

- [ ] **Step 3: Run the package test suite**

Run: `pnpm --filter @onecell/nanoclaw run test`
Expected: PASS with the full NanoClaw test suite green.

- [ ] **Step 4: Commit docs and final verification updates**

```bash
git add packages/nanoclaw/README.md packages/nanoclaw/CLAUDE.md
 git commit -m "docs(nanoclaw): document explicit edge retry semantics"
```

---

## Self-review checklist

- Spec coverage: initial routing preserved (Tasks 1, 4, 5), terminal explicit retry added (Tasks 2, 3, 4), scheduled-task explicit failure path added (Task 5), docs updated (Task 6).
- Placeholder scan: no `TODO`, `TBD`, or undefined helper names remain in the plan.
- Type consistency: recovery kind is `explicit_container_retry` throughout; terminal retry state uses `TerminalRetryRequest`; `/retry-container` is the only new terminal command.
