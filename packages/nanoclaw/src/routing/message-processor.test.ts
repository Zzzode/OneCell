import { beforeEach, describe, expect, it, vi } from 'vitest';

const dbMocks = vi.hoisted(() => ({
  getMessagesSince: vi.fn(),
  getNewMessages: vi.fn(),
}));

const routerStateMocks = vi.hoisted(() => ({
  getOrRecoverCursor: vi.fn(),
  saveState: vi.fn(),
}));

const terminalMocks = vi.hoisted(() => ({
  emitTerminalSystemEvent: vi.fn(),
}));

vi.mock('../config/config.js', () => ({
  ASSISTANT_NAME: 'Andy',
  DEFAULT_TRIGGER: '@Andy',
  getTriggerPattern: vi.fn(() => /@Andy/i),
  IDLE_TIMEOUT: 10,
  MAX_MESSAGES_PER_PROMPT: 20,
  POLL_INTERVAL: 1,
  TERMINAL_CHANNEL_ENABLED: true,
  TERMINAL_GROUP_JID: 'term:canary-group',
  TIMEZONE: 'Asia/Shanghai',
}));

vi.mock('../db.js', () => ({
  getMessagesSince: dbMocks.getMessagesSince,
  getNewMessages: dbMocks.getNewMessages,
}));

vi.mock('../infra/bot-message-recorder.js', () => ({
  recordBotMessage: vi.fn(),
}));

vi.mock('../infra/logger.js', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('../infra/sender-allowlist.js', () => ({
  isTriggerAllowed: vi.fn(() => true),
  loadSenderAllowlist: vi.fn(() => ({})),
}));

vi.mock('./router.js', () => ({
  findChannel: vi.fn(
    (channels: Array<{ ownsJid: (jid: string) => boolean }>, jid: string) =>
      channels.find((c) => c.ownsJid(jid)),
  ),
  formatMessages: vi.fn(() => 'PROMPT_BASE'),
}));

vi.mock('./router-state.js', () => ({
  getOrRecoverCursor: routerStateMocks.getOrRecoverCursor,
  saveState: routerStateMocks.saveState,
}));

vi.mock('../channels/terminal.js', () => ({
  emitTerminalSystemEvent: terminalMocks.emitTerminalSystemEvent,
}));

import {
  initMessageProcessor,
  processGroupMessages,
  resetMessageProcessorRetryGuardsForTests,
} from './message-processor.js';
import type { RegisteredGroup, NewMessage } from '../types.js';

function makeMessage(overrides: Partial<NewMessage> = {}): NewMessage {
  return {
    id: 'm1',
    chat_jid: 'group-1',
    sender: 'alice',
    sender_name: 'Alice',
    content: 'hello',
    timestamp: '2026-04-20T10:00:00.000Z',
    is_from_me: false,
    ...overrides,
  };
}

function buildDeps(
  runAgentImpl: MessageProcessorDeps['runAgent'],
): MessageProcessorDeps {
  const group: RegisteredGroup = {
    name: 'Group 1',
    folder: 'group_1',
    trigger: '@Andy',
    added_at: '2026-04-20T10:00:00.000Z',
    isMain: true,
  };

  return {
    channels: [
      {
        name: 'test-channel',
        connect: async () => {},
        disconnect: async () => {},
        isConnected: () => true,
        ownsJid: (jid: string) => jid === 'group-1',
        sendMessage: async () => {},
        setTyping: async () => {},
      },
    ],
    registeredGroups: { 'group-1': group },
    lastTimestamp: '',
    lastAgentTimestamp: {},
    messageLoopRunning: false,
    queue: {
      closeStdin: vi.fn(),
      notifyIdle: vi.fn(),
      sendMessage: vi.fn(() => false),
      enqueueMessageCheck: vi.fn(),
    } as unknown as MessageProcessorDeps['queue'],
    runAgent: runAgentImpl,
  };
}

type MessageProcessorDeps = Parameters<typeof initMessageProcessor>[0];

describe('message-processor retry guard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetMessageProcessorRetryGuardsForTests();
    routerStateMocks.getOrRecoverCursor.mockReturnValue('');
    dbMocks.getMessagesSince.mockReturnValue([
      makeMessage({ id: 'm1', timestamp: '2026-04-20T10:00:00.000Z' }),
    ]);
    dbMocks.getNewMessages.mockReturnValue({ messages: [], newTimestamp: '' });
  });

  it('appends retry hint after first identical no-output failure', async () => {
    const prompts: string[] = [];
    initMessageProcessor(
      buildDeps(async (_group, prompt) => {
        prompts.push(prompt);
        return 'error';
      }),
    );

    const first = await processGroupMessages('group-1');
    const second = await processGroupMessages('group-1');

    expect(first).toBe(false);
    expect(second).toBe(false);
    expect(prompts[0]).toBe('PROMPT_BASE');
    expect(prompts[1]).toContain('PROMPT_BASE');
    expect(prompts[1]).toContain('[retry-hint]');
  });

  it('stops automatic retry after bounded identical failures', async () => {
    initMessageProcessor(buildDeps(async () => 'error'));

    const first = await processGroupMessages('group-1');
    const second = await processGroupMessages('group-1');
    const third = await processGroupMessages('group-1');

    expect(first).toBe(false);
    expect(second).toBe(false);
    expect(third).toBe(true);
    expect(terminalMocks.emitTerminalSystemEvent).toHaveBeenCalledWith(
      'group-1',
      expect.stringContaining('重复失败已达上限'),
    );
  });

  it('clears retry guard after a successful run', async () => {
    const prompts: string[] = [];
    let call = 0;

    initMessageProcessor(
      buildDeps(async (_group, prompt) => {
        prompts.push(prompt);
        call += 1;
        if (call === 1) return 'error';
        return 'success';
      }),
    );

    const first = await processGroupMessages('group-1');
    const second = await processGroupMessages('group-1');
    const third = await processGroupMessages('group-1');

    expect(first).toBe(false);
    expect(second).toBe(true);
    expect(third).toBe(true);
    expect(prompts[1]).toContain('[retry-hint]');
    expect(prompts[2]).toBe('PROMPT_BASE');
  });
});
