import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Channel } from './types.js';

const { edgeBackendRun, containerBackendRun } = vi.hoisted(() => ({
  edgeBackendRun: vi.fn(),
  containerBackendRun: vi.fn(),
}));

const { syncObservabilitySnapshotToIpc, emitTerminalSystemEvent } = vi.hoisted(() => ({
  syncObservabilitySnapshotToIpc: vi.fn(),
  emitTerminalSystemEvent: vi.fn(),
}));

vi.mock('./backends/edge-backend.js', () => ({
  edgeBackend: {
    backendId: 'edge',
    workerClass: 'edge',
    runtimeClass: 'edge-subprocess',
    capabilityEnvelope: [],
    run: edgeBackendRun,
  },
}));

vi.mock('./backends/container-backend.js', () => ({
  heavyWorker: {
    backendId: 'container',
    workerClass: 'heavy',
    runtimeClass: 'container',
    plannedSpecializations: [],
    capabilityEnvelope: [],
    run: containerBackendRun,
  },
}));

vi.mock('./container-snapshot-writer.js', () => ({
  writeTasksSnapshotToIpc: vi.fn(),
  writeGroupsSnapshotToIpc: vi.fn(),
  writeObservabilitySnapshotToIpc: vi.fn(),
  syncObservabilitySnapshotToIpc,
}));

vi.mock('./channels/terminal.js', async () => {
  const actual = await vi.importActual<typeof import('./channels/terminal.js')>(
    './channels/terminal.js',
  );
  return {
    ...actual,
    emitTerminalSystemEvent,
  };
});

describe('index group runtime fallback', () => {
  beforeEach(async () => {
    const retry = await import('./terminal-retry.js');
    retry.clearTerminalRetryState();
  });
  const originalShadowMode = process.env.SHADOW_EXECUTION_MODE;

  beforeEach(() => {
    process.env.SHADOW_EXECUTION_MODE = 'off';
    edgeBackendRun.mockReset();
    containerBackendRun.mockReset();
    syncObservabilitySnapshotToIpc.mockReset();
    emitTerminalSystemEvent.mockReset();
  });

  afterEach(() => {
    if (originalShadowMode === undefined) {
      delete process.env.SHADOW_EXECUTION_MODE;
    } else {
      process.env.SHADOW_EXECUTION_MODE = originalShadowMode;
    }
  });

  it('fails terminal edge turns explicitly and stores retry state instead of auto-falling back', async () => {
    vi.resetModules();

    const db = await import('./db.js');
    const index = await import('./index.js');

    db._initTestDatabase();
    index._setRegisteredGroups({});
    index._setChannelsForTests([]);
    index._setSessionsForTests({});
    index._setLastAgentTimestampForTests({});

    const sendMessage = vi.fn(async () => {});
    const setTyping = vi.fn(async () => {});
    const channel: Channel = {
      name: 'test',
      connect: async () => {},
      disconnect: async () => {},
      isConnected: () => true,
      ownsJid: (jid) => jid === 'term:canary-group',
      sendMessage,
      setTyping,
    };

    index._setChannelsForTests([channel]);
    index._setRegisteredGroups({
      'term:canary-group': {
        name: 'Terminal Canary',
        folder: 'terminal_canary',
        trigger: '@Andy',
        added_at: '2026-04-07T00:00:00.000Z',
        executionMode: 'edge',
        requiresTrigger: false,
      },
    });
    index._setSessionsForTests({ terminal_canary: 'session-edge-1' });

    db.storeChatMetadata(
      'term:canary-group',
      '2026-04-07T00:00:01.000Z',
      'Terminal Canary',
      'terminal',
      true,
    );
    db.storeMessageDirect({
      id: 'msg-1',
      chat_jid: 'term:canary-group',
      sender: 'term:user',
      sender_name: 'You',
      content: 'please summarize this',
      timestamp: '2026-04-07T00:00:01.000Z',
      is_from_me: false,
    });

    edgeBackendRun.mockResolvedValueOnce({
      status: 'error',
      result: null,
      error: 'Edge execution exceeded deadline of 100ms.',
    });

    const processed = await index._processGroupMessagesForTests('term:canary-group');

    expect(processed).toBe(false);
    expect(edgeBackendRun).toHaveBeenCalledTimes(1);
    expect(containerBackendRun).not.toHaveBeenCalled();
    expect(edgeBackendRun.mock.calls[0]?.[1]).toMatchObject({
      sessionId: 'session-edge-1',
      chatJid: 'term:canary-group',
    });
    expect(sendMessage).not.toHaveBeenCalled();
    expect(setTyping).toHaveBeenNthCalledWith(1, 'term:canary-group', true);
    expect(setTyping).toHaveBeenNthCalledWith(2, 'term:canary-group', false);

    const executions = db.listExecutionStates();
    expect(executions).toHaveLength(1);
    expect(executions[0]).toMatchObject({
      backend: 'edge',
      status: 'failed',
      error: 'Edge execution exceeded deadline of 100ms.',
    });

    const graph = db.getTaskGraph(`graph:${executions[0]!.turnId}`);
    expect(graph).toMatchObject({
      requestKind: 'group_turn',
      scopeType: 'group',
      scopeId: 'terminal_canary',
      status: 'failed',
      error: 'Edge execution exceeded deadline of 100ms.',
    });
    expect(db.getTaskNode(graph!.rootTaskId)).toMatchObject({
      graphId: graph!.graphId,
      status: 'failed',
      workerClass: 'edge',
      backendId: 'edge',
      fallbackTarget: null,
      fallbackReason: null,
      error: 'Edge execution exceeded deadline of 100ms.',
    });
    expect(db.listExecutionStatesForTaskNode(graph!.rootTaskId)).toMatchObject([
      { backend: 'edge', status: 'failed' },
    ]);

    expect(db.getAllSessions()).toEqual({});
    const retry = await import('./terminal-retry.js');
    expect(retry.getTerminalRetryState()).toMatchObject({
      chatJid: 'term:canary-group',
      groupFolder: 'terminal_canary',
      sessionId: 'session-edge-1',
      escalationReason: 'edge_timeout',
      graphId: graph!.graphId,
    });
    expect(
      emitTerminalSystemEvent.mock.calls.filter(
        ([jid, message]) =>
          jid === 'term:canary-group' &&
          String(message).includes('/retry-container'),
      ),
    ).toHaveLength(1);
    expect(
      emitTerminalSystemEvent.mock.calls.filter(
        ([jid, message]) =>
          jid === 'term:canary-group' &&
          String(message).includes(`执行失败：${graph!.graphId}`),
      ),
    ).toHaveLength(1);
  });

  it('stores retry state when terminal edge execution throws a retryable error', async () => {
    vi.resetModules();

    const db = await import('./db.js');
    const index = await import('./index.js');

    db._initTestDatabase();
    index._setRegisteredGroups({
      'term:canary-group': {
        name: 'Terminal Canary',
        folder: 'terminal_canary',
        trigger: '@Andy',
        added_at: '2026-04-07T00:00:00.000Z',
        executionMode: 'edge',
        requiresTrigger: false,
      },
    });
    index._setChannelsForTests([
      {
        name: 'test',
        connect: async () => {},
        disconnect: async () => {},
        isConnected: () => true,
        ownsJid: (jid) => jid === 'term:canary-group',
        sendMessage: vi.fn(async () => {}),
        setTyping: vi.fn(async () => {}),
      },
    ]);
    index._setSessionsForTests({ terminal_canary: 'session-edge-throw' });
    index._setLastAgentTimestampForTests({});

    db.storeChatMetadata(
      'term:canary-group',
      '2026-04-07T00:00:01.000Z',
      'Terminal Canary',
      'terminal',
      true,
    );
    db.storeMessageDirect({
      id: 'msg-throw',
      chat_jid: 'term:canary-group',
      sender: 'term:user',
      sender_name: 'You',
      content: 'please retry this later',
      timestamp: '2026-04-07T00:00:01.000Z',
      is_from_me: false,
    });

    edgeBackendRun.mockRejectedValueOnce(
      new Error('Edge execution exceeded deadline of 100ms.'),
    );

    const processed = await index._processGroupMessagesForTests('term:canary-group');

    expect(processed).toBe(false);
    expect(edgeBackendRun).toHaveBeenCalledTimes(1);
    expect(containerBackendRun).not.toHaveBeenCalled();

    const retry = await import('./terminal-retry.js');
    expect(retry.getTerminalRetryState()).toMatchObject({
      chatJid: 'term:canary-group',
      groupFolder: 'terminal_canary',
      sessionId: 'session-edge-throw',
      escalationReason: 'edge_timeout',
    });
  });

  it('retries the latest terminal edge failure on container when explicitly invoked', async () => {
    vi.resetModules();

    const db = await import('./db.js');
    const index = await import('./index.js');

    db._initTestDatabase();
    index._setRegisteredGroups({});
    index._setChannelsForTests([]);
    index._setSessionsForTests({});
    index._setLastAgentTimestampForTests({});

    const sendMessage = vi.fn(async () => {});
    const setTyping = vi.fn(async () => {});
    const channel: Channel = {
      name: 'test',
      connect: async () => {},
      disconnect: async () => {},
      isConnected: () => true,
      ownsJid: (jid) => jid === 'term:canary-group',
      sendMessage,
      setTyping,
    };

    index._setChannelsForTests([channel]);
    index._setRegisteredGroups({
      'term:canary-group': {
        name: 'Terminal Canary',
        folder: 'terminal_canary',
        trigger: '@Andy',
        added_at: '2026-04-07T00:00:00.000Z',
        executionMode: 'edge',
        requiresTrigger: false,
      },
    });
    index._setSessionsForTests({ terminal_canary: 'session-edge-1' });

    db.storeChatMetadata(
      'term:canary-group',
      '2026-04-07T00:00:01.000Z',
      'Terminal Canary',
      'terminal',
      true,
    );
    db.storeMessageDirect({
      id: 'msg-edge-fallback',
      chat_jid: 'term:canary-group',
      sender: 'term:user',
      sender_name: 'You',
      content: 'hello there',
      timestamp: '2026-04-07T00:00:01.000Z',
      is_from_me: false,
    });

    edgeBackendRun.mockResolvedValueOnce({
      status: 'error',
      result: null,
      error: 'Edge runner produced no progress within 30000ms.',
    });

    const processed = await index._processGroupMessagesForTests('term:canary-group');

    expect(processed).toBe(false);
    expect(edgeBackendRun).toHaveBeenCalledTimes(1);
    expect(containerBackendRun).not.toHaveBeenCalled();
    expect(sendMessage).not.toHaveBeenCalled();

    containerBackendRun.mockResolvedValueOnce({
      status: 'success',
      result: 'heavy hello',
      newSessionId: 'session-heavy-edge',
    });

    const retryResult = await index._retryTerminalOnContainerForTests();

    expect(retryResult).toBe('success');
    expect(containerBackendRun).toHaveBeenCalledTimes(1);
    expect(containerBackendRun.mock.calls[0]?.[1]).toMatchObject({
      sessionId: 'session-edge-1',
      chatJid: 'term:canary-group',
    });
    const retry = await import('./terminal-retry.js');
    expect(retry.getTerminalRetryState()).toBeNull();
    expect(db.getAllSessions()).toEqual({ terminal_canary: 'session-heavy-edge' });
  });

  it('preserves retry state when explicit container retry returns error', async () => {
    vi.resetModules();

    const db = await import('./db.js');
    const index = await import('./index.js');

    db._initTestDatabase();
    index._setRegisteredGroups({
      'term:canary-group': {
        name: 'Terminal Canary',
        folder: 'terminal_canary',
        trigger: '@Andy',
        added_at: '2026-04-07T00:00:00.000Z',
        executionMode: 'edge',
        requiresTrigger: false,
      },
    });
    index._setChannelsForTests([]);
    index._setSessionsForTests({ terminal_canary: 'session-edge-1' });
    index._setLastAgentTimestampForTests({});

    const retry = await import('./terminal-retry.js');
    retry.setTerminalRetryState({
      prompt: 'retry me',
      groupFolder: 'terminal_canary',
      chatJid: 'term:canary-group',
      isMain: false,
      sessionId: 'session-edge-1',
      failureSummary: 'Edge execution exceeded deadline of 100ms.',
      error: 'Edge execution exceeded deadline of 100ms.',
      escalationReason: 'edge_timeout',
      graphId: 'graph:retryable',
      createdAt: '2026-04-12T00:00:00.000Z',
    });

    containerBackendRun.mockResolvedValueOnce({
      status: 'error',
      result: null,
      error: 'container still failed',
    });

    const result = await index._retryTerminalOnContainerForTests();

    expect(result).toBe('error');
    expect(retry.getTerminalRetryState()).toMatchObject({
      graphId: 'graph:retryable',
      sessionId: 'session-edge-1',
    });
    expect(db.getAllSessions()).toEqual({ terminal_canary: 'session-edge-1' });
  });

  it('preserves retry state when explicit container retry throws', async () => {
    vi.resetModules();

    const db = await import('./db.js');
    const index = await import('./index.js');

    db._initTestDatabase();
    index._setRegisteredGroups({
      'term:canary-group': {
        name: 'Terminal Canary',
        folder: 'terminal_canary',
        trigger: '@Andy',
        added_at: '2026-04-07T00:00:00.000Z',
        executionMode: 'edge',
        requiresTrigger: false,
      },
    });
    index._setChannelsForTests([]);
    index._setSessionsForTests({ terminal_canary: 'session-edge-1' });
    index._setLastAgentTimestampForTests({});

    const retry = await import('./terminal-retry.js');
    retry.setTerminalRetryState({
      prompt: 'retry me',
      groupFolder: 'terminal_canary',
      chatJid: 'term:canary-group',
      isMain: false,
      sessionId: 'session-edge-1',
      failureSummary: 'Edge execution exceeded deadline of 100ms.',
      error: 'Edge execution exceeded deadline of 100ms.',
      escalationReason: 'edge_timeout',
      graphId: 'graph:retryable',
      createdAt: '2026-04-12T00:00:00.000Z',
    });

    containerBackendRun.mockRejectedValueOnce(new Error('container crashed'));

    const result = await index._retryTerminalOnContainerForTests();

    expect(result).toBe('error');
    expect(retry.getTerminalRetryState()).toMatchObject({
      graphId: 'graph:retryable',
      sessionId: 'session-edge-1',
    });
    expect(db.getAllSessions()).toEqual({ terminal_canary: 'session-edge-1' });
  });

  it('marks workspace conflicts for replan and closes the failed edge attempt', async () => {
    vi.resetModules();

    const db = await import('./db.js');
    const index = await import('./index.js');

    db._initTestDatabase();
    index._setRegisteredGroups({});
    index._setChannelsForTests([]);
    index._setSessionsForTests({});
    index._setLastAgentTimestampForTests({});

    const sendMessage = vi.fn(async () => {});
    const channel: Channel = {
      name: 'test',
      connect: async () => {},
      disconnect: async () => {},
      isConnected: () => true,
      ownsJid: (jid) => jid === 'room@g.us',
      sendMessage,
      setTyping: vi.fn(async () => {}),
    };

    index._setChannelsForTests([channel]);
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

    db.storeChatMetadata(
      'room@g.us',
      '2026-04-07T00:00:02.000Z',
      'Team Alpha',
      'whatsapp',
      true,
    );
    db.storeMessageDirect({
      id: 'msg-conflict',
      chat_jid: 'room@g.us',
      sender: 'alice',
      sender_name: 'Alice',
      content: 'please update the workspace',
      timestamp: '2026-04-07T00:00:02.000Z',
      is_from_me: false,
    });

    const conflictError = 'Workspace version conflict: expected a, received b';
    edgeBackendRun.mockResolvedValueOnce({
      status: 'error',
      result: null,
      error: conflictError,
    });

    const processed = await index._processGroupMessagesForTests('room@g.us');

    expect(processed).toBe(false);
    expect(edgeBackendRun).toHaveBeenCalledTimes(1);
    expect(containerBackendRun).not.toHaveBeenCalled();
    expect(sendMessage).not.toHaveBeenCalled();

    const executions = db.listExecutionStates();
    expect(executions).toHaveLength(1);
    expect(executions[0]).toMatchObject({
      backend: 'edge',
      status: 'failed',
      error: conflictError,
    });

    const graph = db.getTaskGraph(`graph:${executions[0]!.turnId}`);
    expect(graph).toMatchObject({
      requestKind: 'group_turn',
      status: 'failed',
      error: conflictError,
    });
    expect(db.getTaskNode(graph!.rootTaskId)).toMatchObject({
      status: 'failed',
      failureClass: 'commit_failure',
      fallbackTarget: 'replan',
      fallbackReason: 'state_conflict_requires_heavy',
      error: conflictError,
    });
    expect(syncObservabilitySnapshotToIpc).toHaveBeenCalledWith('team_alpha');
  });

  it('writes observability snapshots after successful edge group turns', async () => {
    vi.resetModules();

    const db = await import('./db.js');
    const index = await import('./index.js');

    db._initTestDatabase();
    index._setRegisteredGroups({});
    index._setChannelsForTests([]);
    index._setSessionsForTests({});
    index._setLastAgentTimestampForTests({});

    const sendMessage = vi.fn(async () => {});
    const channel: Channel = {
      name: 'test',
      connect: async () => {},
      disconnect: async () => {},
      isConnected: () => true,
      ownsJid: (jid) => jid === 'room@g.us',
      sendMessage,
      setTyping: vi.fn(async () => {}),
    };

    index._setChannelsForTests([channel]);
    index._setRegisteredGroups({
      'room@g.us': {
        name: 'Team Alpha',
        folder: 'team_alpha',
        trigger: '@Andy',
        added_at: '2026-04-07T00:00:00.000Z',
        executionMode: 'edge',
        requiresTrigger: false,
      },
    });

    db.storeChatMetadata(
      'room@g.us',
      '2026-04-07T00:00:03.000Z',
      'Team Alpha',
      'whatsapp',
      true,
    );
    db.storeMessageDirect({
      id: 'msg-success',
      chat_jid: 'room@g.us',
      sender: 'alice',
      sender_name: 'Alice',
      content: 'please summarize this',
      timestamp: '2026-04-07T00:00:03.000Z',
      is_from_me: false,
    });

    edgeBackendRun.mockResolvedValueOnce({
      status: 'success',
      result: 'edge result',
      newSessionId: 'session-edge-2',
    });

    const processed = await index._processGroupMessagesForTests('room@g.us');

    expect(processed).toBe(true);
    expect(sendMessage).toHaveBeenCalledWith('room@g.us', 'edge result');
    expect(syncObservabilitySnapshotToIpc).toHaveBeenCalledWith('team_alpha');
  });

  it('clears terminal retry state after a later successful terminal turn', async () => {
    vi.resetModules();

    const db = await import('./db.js');
    const index = await import('./index.js');
    const retry = await import('./terminal-retry.js');

    db._initTestDatabase();
    index._setRegisteredGroups({});
    index._setChannelsForTests([]);
    index._setSessionsForTests({ terminal_canary: 'session-edge-1' });
    index._setLastAgentTimestampForTests({});

    const sendMessage = vi.fn(async () => {});
    const channel: Channel = {
      name: 'test',
      connect: async () => {},
      disconnect: async () => {},
      isConnected: () => true,
      ownsJid: (jid) => jid === 'term:canary-group',
      sendMessage,
      setTyping: vi.fn(async () => {}),
    };

    index._setChannelsForTests([channel]);
    index._setRegisteredGroups({
      'term:canary-group': {
        name: 'Terminal Canary',
        folder: 'terminal_canary',
        trigger: '@Andy',
        added_at: '2026-04-07T00:00:00.000Z',
        executionMode: 'edge',
        requiresTrigger: false,
      },
    });

    retry.setTerminalRetryState({
      prompt: 'retry terminal failure',
      groupFolder: 'terminal_canary',
      chatJid: 'term:canary-group',
      isMain: false,
      sessionId: 'session-edge-1',
      failureSummary: 'Edge execution exceeded deadline of 100ms.',
      error: 'Edge execution exceeded deadline of 100ms.',
      escalationReason: 'edge_timeout',
      graphId: 'graph:retryable',
      createdAt: '2026-04-12T00:00:00.000Z',
    });

    db.storeChatMetadata(
      'term:canary-group',
      '2026-04-07T00:00:03.000Z',
      'Terminal Canary',
      'terminal',
      true,
    );
    db.storeMessageDirect({
      id: 'msg-success-terminal',
      chat_jid: 'term:canary-group',
      sender: 'term:user',
      sender_name: 'You',
      content: 'please summarize this',
      timestamp: '2026-04-07T00:00:03.000Z',
      is_from_me: false,
    });

    edgeBackendRun.mockResolvedValueOnce({
      status: 'success',
      result: 'edge result',
      newSessionId: 'session-edge-2',
    });

    const processed = await index._processGroupMessagesForTests('term:canary-group');

    expect(processed).toBe(true);
    expect(sendMessage).toHaveBeenCalledWith('term:canary-group', 'edge result');
    expect(retry.getTerminalRetryState()).toBeNull();
  });

  it('does not create terminal retry state for retryable non-terminal group failures', async () => {
    vi.resetModules();

    const db = await import('./db.js');
    const index = await import('./index.js');
    const retry = await import('./terminal-retry.js');

    db._initTestDatabase();
    retry.clearTerminalRetryState();
    index._setRegisteredGroups({
      'room@g.us': {
        name: 'Team Alpha',
        folder: 'team_alpha',
        trigger: '@Andy',
        added_at: '2026-04-07T00:00:00.000Z',
        executionMode: 'edge',
        requiresTrigger: false,
      },
    });
    index._setChannelsForTests([
      {
        name: 'test',
        connect: async () => {},
        disconnect: async () => {},
        isConnected: () => true,
        ownsJid: (jid) => jid === 'room@g.us',
        sendMessage: vi.fn(async () => {}),
        setTyping: vi.fn(async () => {}),
      },
    ]);
    index._setSessionsForTests({ team_alpha: 'session-edge-group' });
    index._setLastAgentTimestampForTests({});

    db.storeChatMetadata(
      'room@g.us',
      '2026-04-07T00:00:01.000Z',
      'Team Alpha',
      'whatsapp',
      true,
    );
    db.storeMessageDirect({
      id: 'msg-group-failure',
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
    expect(retry.getTerminalRetryState()).toBeNull();
  });

  it('cleans up terminal runtime on startup reset without affecting other groups', async () => {
    vi.resetModules();

    const db = await import('./db.js');
    const index = await import('./index.js');
    const { createRootTaskGraph, markTaskNodeRunning } =
      await import('./task-graph-state.js');
    const { beginExecution } = await import('./execution-state.js');

    db._initTestDatabase();
    index._setRegisteredGroups({});
    index._setChannelsForTests([]);
    index._setSessionsForTests({
      terminal_canary: 'session-terminal-old',
      team_alpha: 'session-team-old',
    });
    index._setLastAgentTimestampForTests({});

    db.setSession('terminal_canary', 'session-terminal-old');
    db.setSession('team_alpha', 'session-team-old');

    createRootTaskGraph({
      graphId: 'graph:terminal-stale',
      rootTaskId: 'task:terminal-stale:root',
      requestKind: 'group_turn',
      scopeType: 'group',
      scopeId: 'terminal_canary',
      groupFolder: 'terminal_canary',
      chatJid: 'term:canary-group',
      logicalSessionId: 'group:terminal_canary',
      workerClass: 'edge',
      backendId: 'edge',
      now: new Date('2026-04-08T00:00:00.000Z'),
    });
    markTaskNodeRunning('graph:terminal-stale', 'task:terminal-stale:root');

    createRootTaskGraph({
      graphId: 'graph:other-running',
      rootTaskId: 'task:other-running:root',
      requestKind: 'group_turn',
      scopeType: 'group',
      scopeId: 'team_alpha',
      groupFolder: 'team_alpha',
      chatJid: 'room@g.us',
      logicalSessionId: 'group:team_alpha',
      workerClass: 'edge',
      backendId: 'edge',
      now: new Date('2026-04-08T00:00:01.000Z'),
    });
    markTaskNodeRunning('graph:other-running', 'task:other-running:root');

    const terminalExecution = beginExecution({
      scopeType: 'group',
      scopeId: 'terminal_canary',
      backend: 'edge',
      groupJid: 'term:canary-group',
      taskNodeId: 'task:terminal-stale:root',
      now: new Date('2026-04-08T00:00:00.000Z'),
      leaseMs: 300_000,
    });
    const otherExecution = beginExecution({
      scopeType: 'group',
      scopeId: 'team_alpha',
      backend: 'edge',
      groupJid: 'room@g.us',
      taskNodeId: 'task:other-running:root',
      now: new Date('2026-04-08T00:00:01.000Z'),
      leaseMs: 300_000,
    });

    index._cleanupTerminalRuntimeForTests('startup');

    expect(db.getSession('terminal_canary')).toBeUndefined();
    expect(db.getSession('team_alpha')).toBe('session-team-old');

    expect(db.getExecutionState(terminalExecution.executionId)).toMatchObject({
      status: 'failed',
      error: 'Terminal session reset on startup',
    });
    expect(db.getTaskGraph('graph:terminal-stale')).toMatchObject({
      status: 'failed',
      error: 'Terminal session reset on startup',
    });
    expect(db.getTaskNode('task:terminal-stale:root')).toMatchObject({
      status: 'failed',
      error: 'Terminal session reset on startup',
    });

    expect(db.getExecutionState(otherExecution.executionId)).toMatchObject({
      status: 'running',
    });
    expect(db.getTaskGraph('graph:other-running')).toMatchObject({
      status: 'running',
    });
  });
});
