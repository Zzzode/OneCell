import fs from 'fs';
import path from 'path';

import { OneCLI } from '@onecli-sh/sdk';

import {
  ASSISTANT_NAME,
  DEFAULT_TRIGGER,
  GROUPS_DIR,
  ONECLI_URL,
  TERMINAL_CHANNEL_ENABLED,
  TERMINAL_GROUP_EXECUTION_MODE,
  TERMINAL_GROUP_FOLDER,
  TERMINAL_GROUP_JID,
  TERMINAL_GROUP_NAME,
} from '../config/config.js';
import { getAllChats } from '../db.js';
import { setRegisteredGroup } from '../db.js';
import { resolveGroupFolderPath } from './group-folder.js';
import { logger } from './logger.js';
import { mountProjectSourceIntoGroup } from './group-mount.js';
import type { RegisteredGroup } from '../types.js';
import type { GroupSnapshot } from '../framework/execution-snapshots.js';

interface GroupRegistrationState {
  registeredGroups: Record<string, RegisteredGroup>;
}

let state: GroupRegistrationState;
const onecli = new OneCLI({ url: ONECLI_URL });

export function initGroupRegistration(deps: GroupRegistrationState): void {
  state = deps;
}

/** @internal - update the registeredGroups reference (used by test helpers) */
export function _setRegisteredGroupsRef(
  groups: Record<string, RegisteredGroup>,
): void {
  state.registeredGroups = groups;
}

export function ensureOneCLIAgent(jid: string, group: RegisteredGroup): void {
  if (group.isMain) return;
  const identifier = group.folder.toLowerCase().replace(/_/g, '-');
  onecli.ensureAgent({ name: group.name, identifier }).then(
    (res) => {
      logger.info(
        { jid, identifier, created: res.created },
        'OneCLI agent ensured',
      );
    },
    (err) => {
      logger.debug(
        { jid, identifier, err: String(err) },
        'OneCLI agent ensure skipped',
      );
    },
  );
}

export function registerGroup(jid: string, group: RegisteredGroup): void {
  let groupDir: string;
  try {
    groupDir = resolveGroupFolderPath(group.folder);
  } catch (err) {
    logger.warn(
      { jid, folder: group.folder, err },
      'Rejecting group registration with invalid folder',
    );
    return;
  }

  state.registeredGroups[jid] = group;
  setRegisteredGroup(jid, group);

  // Create group folder
  fs.mkdirSync(path.join(groupDir, 'logs'), { recursive: true });

  // Copy CLAUDE.md template into the new group folder so agents have
  // identity and instructions from the first run.  (Fixes #1391)
  const groupMdFile = path.join(groupDir, 'CLAUDE.md');
  if (!fs.existsSync(groupMdFile)) {
    const templateFile = path.join(
      GROUPS_DIR,
      group.isMain ? 'main' : 'global',
      'CLAUDE.md',
    );
    if (fs.existsSync(templateFile)) {
      let content = fs.readFileSync(templateFile, 'utf-8');
      if (ASSISTANT_NAME !== 'Andy') {
        content = content.replace(/^# Andy$/m, `# ${ASSISTANT_NAME}`);
        content = content.replace(/You are Andy/g, `You are ${ASSISTANT_NAME}`);
      }
      fs.writeFileSync(groupMdFile, content);
      logger.info({ folder: group.folder }, 'Created CLAUDE.md from template');
    }
  }

  // Ensure a corresponding OneCLI agent exists (best-effort, non-blocking)
  ensureOneCLIAgent(jid, group);

  logger.info(
    { jid, name: group.name, folder: group.folder },
    'Group registered',
  );
}

export function ensureTerminalCanaryGroup(): void {
  if (!TERMINAL_CHANNEL_ENABLED) return;
  const existing = state.registeredGroups[TERMINAL_GROUP_JID];
  if (
    existing &&
    existing.folder === TERMINAL_GROUP_FOLDER &&
    existing.executionMode === TERMINAL_GROUP_EXECUTION_MODE &&
    existing.requiresTrigger === false
  ) {
    return;
  }

  registerGroup(TERMINAL_GROUP_JID, {
    name: TERMINAL_GROUP_NAME,
    folder: TERMINAL_GROUP_FOLDER,
    trigger: DEFAULT_TRIGGER,
    added_at: new Date().toISOString(),
    executionMode: TERMINAL_GROUP_EXECUTION_MODE,
    requiresTrigger: false,
  });

  mountProjectSourceIntoGroup(TERMINAL_GROUP_FOLDER);
}

/**
 * Get available groups list for the agent.
 * Returns groups ordered by most recent activity.
 */
export function getAvailableGroups(): GroupSnapshot[] {
  const chats = getAllChats();
  const registeredJids = new Set(Object.keys(state.registeredGroups));

  return chats
    .filter((c) => c.jid !== '__group_sync__' && c.is_group)
    .map((c) => ({
      jid: c.jid,
      name: c.name,
      lastActivity: c.last_message_time,
      isRegistered: registeredJids.has(c.jid),
    }));
}
