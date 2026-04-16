import { ASSISTANT_NAME } from '../config/config.js';
import {
  getAllRegisteredGroups,
  getAllSessions,
  getLastBotMessageTimestamp,
  getRouterState,
  setRouterState,
} from '../db.js';
import { logger } from '../infra/logger.js';
import type { RegisteredGroup } from '../types.js';

export interface AppMutableState {
  lastTimestamp: string;
  sessions: Record<string, string>;
  registeredGroups: Record<string, RegisteredGroup>;
  lastAgentTimestamp: Record<string, string>;
  messageLoopRunning: boolean;
}

let state: AppMutableState;

export function initRouterState(deps: AppMutableState): void {
  state = deps;
}

export function loadState(): void {
  state.lastTimestamp = getRouterState('last_timestamp') || '';
  const agentTs = getRouterState('last_agent_timestamp');
  try {
    state.lastAgentTimestamp = agentTs ? JSON.parse(agentTs) : {};
  } catch {
    logger.warn('Corrupted last_agent_timestamp in DB, resetting');
    state.lastAgentTimestamp = {};
  }
  state.sessions = getAllSessions();
  state.registeredGroups = getAllRegisteredGroups();
  logger.info(
    { groupCount: Object.keys(state.registeredGroups).length },
    'State loaded',
  );
}

export function saveState(): void {
  setRouterState('last_timestamp', state.lastTimestamp);
  setRouterState(
    'last_agent_timestamp',
    JSON.stringify(state.lastAgentTimestamp),
  );
}

/**
 * Return the message cursor for a group, recovering from the last bot reply
 * if lastAgentTimestamp is missing (new group, corrupted state, restart).
 */
export function getOrRecoverCursor(chatJid: string): string {
  const existing = state.lastAgentTimestamp[chatJid];
  if (existing) return existing;

  const botTs = getLastBotMessageTimestamp(chatJid, ASSISTANT_NAME);
  if (botTs) {
    logger.info(
      { chatJid, recoveredFrom: botTs },
      'Recovered message cursor from last bot reply',
    );
    state.lastAgentTimestamp[chatJid] = botTs;
    saveState();
    return botTs;
  }
  return '';
}
