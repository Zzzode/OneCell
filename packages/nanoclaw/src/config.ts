import path from 'path';

import { readEnvFile } from './env.js';
import {
  loadConfigFile,
} from './config-loader.js';
import type { ResolvedNanoclawConfig } from './nanoclaw-config.js';
import { resolveShadowExecutionMode } from './shadow-execution.js';
import { isValidTimezone } from './timezone.js';

// ---------------------------------------------------------------------------
// New config system
// ---------------------------------------------------------------------------

let _appConfig: ResolvedNanoclawConfig | null = null;

export function initConfig(configPath: string): ResolvedNanoclawConfig {
  _appConfig = loadConfigFile(configPath);

  // Overwrite mutable exports with resolved config values.
  DEFAULT_EXECUTION_MODE = _appConfig.executionMode;
  EDGE_RUNNER_MODE = _appConfig.edgeRunnerMode;
  EDGE_ENABLE_TOOLS = _appConfig.edge.enableTools;
  EDGE_DISABLE_FALLBACK = _appConfig.edge.disableFallback;
  TERMINAL_CHANNEL_ENABLED = _appConfig.profile === 'terminal';
  TERMINAL_GROUP_EXECUTION_MODE = _appConfig.executionMode;

  EDGE_RUNNER_PROVIDER = _appConfig.edgeProvider.type;

  // Backward-compat provider exports derived from the resolved config.
  EDGE_ANTHROPIC_API_KEY = _appConfig.edgeProvider.apiKey ?? undefined;
  EDGE_ANTHROPIC_API_BASE_URL = _appConfig.edgeProvider.baseUrl ?? undefined;
  EDGE_ANTHROPIC_MODEL = _appConfig.edgeProvider.model ?? undefined;
  EDGE_API_KEY = _appConfig.edgeProvider.apiKey ?? undefined;
  EDGE_API_BASE_URL = _appConfig.edgeProvider.baseUrl ?? undefined;
  EDGE_MODEL = _appConfig.edgeProvider.model ?? undefined;

  const cp = _appConfig.containerProvider;
  ANTHROPIC_API_KEY = cp.apiKey ?? undefined;
  ANTHROPIC_BASE_URL = cp.baseUrl ?? undefined;
  ANTHROPIC_MODEL = cp.model ?? undefined;

  return _appConfig;
}

export function getAppConfig(): ResolvedNanoclawConfig {
  if (!_appConfig)
    throw new Error('Config not initialized. Call initConfig() first.');
  return _appConfig;
}

// ---------------------------------------------------------------------------
// Env file — only read keys that are still env-var-driven.
// ---------------------------------------------------------------------------

const envConfig = readEnvFile([
  'ASSISTANT_NAME',
  'ASSISTANT_HAS_OWN_NUMBER',
  'EDGEJS_BIN',
  'SHADOW_EXECUTION_MODE',
  'TERMINAL_GROUP_FOLDER',
  'TERMINAL_GROUP_JID',
  'TERMINAL_GROUP_NAME',
  'TERMINAL_RESET_SESSION_ON_START',
  'TERMINAL_USER_JID',
  'TERMINAL_USER_NAME',
  'ONECLI_URL',
  'TZ',
]);

// ---------------------------------------------------------------------------
// Constants from env vars (unchanged)
// ---------------------------------------------------------------------------

export const ASSISTANT_NAME =
  process.env.ASSISTANT_NAME || envConfig.ASSISTANT_NAME || 'Andy';
export const ASSISTANT_HAS_OWN_NUMBER =
  (process.env.ASSISTANT_HAS_OWN_NUMBER ||
    envConfig.ASSISTANT_HAS_OWN_NUMBER) === 'true';
export const POLL_INTERVAL = 2000;
export const SCHEDULER_POLL_INTERVAL = 60000;

// Absolute paths needed for container mounts
const PROJECT_ROOT = process.cwd();
function resolveHomeDir(): string {
  return process.env.HOME || PROJECT_ROOT;
}
const HOME_DIR = resolveHomeDir();

// Mount security: allowlist stored OUTSIDE project root, never mounted into containers
export const MOUNT_ALLOWLIST_PATH = path.join(
  HOME_DIR,
  '.config',
  'nanoclaw',
  'mount-allowlist.json',
);
export const SENDER_ALLOWLIST_PATH = path.join(
  HOME_DIR,
  '.config',
  'nanoclaw',
  'sender-allowlist.json',
);
export const STORE_DIR = path.resolve(
  process.env.NANOCLAW_STORE_DIR || path.join(PROJECT_ROOT, 'store'),
);
export const GROUPS_DIR = path.resolve(
  process.env.NANOCLAW_GROUPS_DIR || path.join(PROJECT_ROOT, 'groups'),
);
export const DATA_DIR = path.resolve(
  process.env.NANOCLAW_DATA_DIR || path.join(PROJECT_ROOT, 'data'),
);

export const CONTAINER_IMAGE =
  process.env.CONTAINER_IMAGE || 'nanoclaw-agent:latest';

export const EDGEJS_BIN =
  process.env.EDGEJS_BIN || envConfig.EDGEJS_BIN || undefined;

export const SHADOW_EXECUTION_MODE = resolveShadowExecutionMode(
  process.env.SHADOW_EXECUTION_MODE || envConfig.SHADOW_EXECUTION_MODE,
);

export const CONTAINER_TIMEOUT = parseInt(
  process.env.CONTAINER_TIMEOUT || '1800000',
  10,
);
export const CONTAINER_MAX_OUTPUT_SIZE = parseInt(
  process.env.CONTAINER_MAX_OUTPUT_SIZE || '10485760',
  10,
); // 10MB default
export const ONECLI_URL =
  process.env.ONECLI_URL || envConfig.ONECLI_URL || 'http://localhost:10254';
export const MAX_MESSAGES_PER_PROMPT = Math.max(
  1,
  parseInt(process.env.MAX_MESSAGES_PER_PROMPT || '10', 10) || 10,
);
export const IPC_POLL_INTERVAL = 1000;
export const IDLE_TIMEOUT = parseInt(process.env.IDLE_TIMEOUT || '1800000', 10); // 30min default
export const MAX_CONCURRENT_CONTAINERS = Math.max(
  1,
  parseInt(process.env.MAX_CONCURRENT_CONTAINERS || '5', 10) || 5,
);

// ---------------------------------------------------------------------------
// Terminal identity (unchanged, from env vars)
// ---------------------------------------------------------------------------

export const TERMINAL_GROUP_JID =
  process.env.TERMINAL_GROUP_JID ||
  envConfig.TERMINAL_GROUP_JID ||
  'term:canary-group';
export const TERMINAL_GROUP_NAME =
  process.env.TERMINAL_GROUP_NAME ||
  envConfig.TERMINAL_GROUP_NAME ||
  'Terminal Canary';
export const TERMINAL_RESET_SESSION_ON_START =
  (process.env.TERMINAL_RESET_SESSION_ON_START ||
    envConfig.TERMINAL_RESET_SESSION_ON_START) === 'true';
export const TERMINAL_GROUP_FOLDER =
  process.env.TERMINAL_GROUP_FOLDER ||
  envConfig.TERMINAL_GROUP_FOLDER ||
  'terminal_canary';
export const TERMINAL_USER_JID =
  process.env.TERMINAL_USER_JID || envConfig.TERMINAL_USER_JID || 'term:user';
export const TERMINAL_USER_NAME =
  process.env.TERMINAL_USER_NAME || envConfig.TERMINAL_USER_NAME || 'You';

// ---------------------------------------------------------------------------
// Mutable exports — set by initConfig(), safe defaults before initialization
// ---------------------------------------------------------------------------

export let DEFAULT_EXECUTION_MODE: 'edge' | 'container' | 'auto' = 'edge';
export let EDGE_RUNNER_MODE: string = 'edgejs';
export let EDGE_ENABLE_TOOLS: boolean = true;
export let EDGE_DISABLE_FALLBACK: boolean = false;
export let TERMINAL_CHANNEL_ENABLED: boolean = true;
export let TERMINAL_GROUP_EXECUTION_MODE: 'edge' | 'container' | 'auto' =
  'edge';

// ---------------------------------------------------------------------------
// Backward-compat provider exports — set by initConfig()
// These are kept so existing consumers (edge-runner, container-runner) keep
// working without changes. They will be removed once those consumers are
// migrated to read from getAppConfig() directly.
// ---------------------------------------------------------------------------

export let EDGE_RUNNER_PROVIDER: string = 'local';
export let EDGE_ANTHROPIC_API_KEY: string | undefined = undefined;
export let EDGE_ANTHROPIC_API_BASE_URL: string | undefined = undefined;
export let EDGE_ANTHROPIC_MODEL: string | undefined = undefined;
export let EDGE_API_KEY: string | undefined = undefined;
export let EDGE_API_BASE_URL: string | undefined = undefined;
export let EDGE_MODEL: string | undefined = undefined;
export let ANTHROPIC_API_KEY: string | undefined = undefined;
export let ANTHROPIC_BASE_URL: string | undefined = undefined;
export let ANTHROPIC_MODEL: string | undefined = undefined;

// ---------------------------------------------------------------------------
// Trigger patterns (unchanged)
// ---------------------------------------------------------------------------

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function buildTriggerPattern(trigger: string): RegExp {
  return new RegExp(`^${escapeRegex(trigger.trim())}\\b`, 'i');
}

export const DEFAULT_TRIGGER = `@${ASSISTANT_NAME}`;

export function getTriggerPattern(trigger?: string): RegExp {
  const normalizedTrigger = trigger?.trim();
  return buildTriggerPattern(normalizedTrigger || DEFAULT_TRIGGER);
}

export const TRIGGER_PATTERN = buildTriggerPattern(DEFAULT_TRIGGER);

// ---------------------------------------------------------------------------
// Timezone (unchanged)
// ---------------------------------------------------------------------------

function resolveConfigTimezone(): string {
  const candidates = [
    process.env.TZ,
    envConfig.TZ,
    Intl.DateTimeFormat().resolvedOptions().timeZone,
  ];
  for (const tz of candidates) {
    if (tz && isValidTimezone(tz)) return tz;
  }
  return 'UTC';
}
export const TIMEZONE = resolveConfigTimezone();
