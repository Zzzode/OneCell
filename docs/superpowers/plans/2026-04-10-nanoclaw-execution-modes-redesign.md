# Nanoclaw Execution Modes Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace scattered env-var-based configuration with a structured `nanoclaw.config.json` that decouples profile (claw/terminal), execution mode (edge/container/auto), and LLM providers (named provider definitions).

**Architecture:** Three-axis orthogonal config: Profile → which channels to start; ExecutionMode → where agents run; Providers → which LLM APIs to call. A single JSON config file defines named providers with `${ENV_VAR}` expansion for secrets, and edge/container each reference one provider. Old env vars (`EDGE_RUNNER_PROVIDER`, `DEFAULT_EXECUTION_MODE`, `TERMINAL_CHANNEL_ENABLED`, etc.) are replaced.

**Tech Stack:** TypeScript, vitest, Node.js fs/readline

---

### Task 1: Define new config types and loader

**Files:**
- Create: `packages/nanoclaw/src/nanoclaw-config.ts`
- Test: `packages/nanoclaw/src/nanoclaw-config.test.ts`

- [ ] **Step 1: Write the failing tests for config types and loader**

```typescript
// packages/nanoclaw/src/nanoclaw-config.test.ts
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import {
  type NanoclawConfigFile,
  type ResolvedNanoclawConfig,
  type ProviderDefinition,
  validateConfigFile,
  resolveConfig,
  expandEnvVars,
} from './nanoclaw-config.js';

const validConfigFile: NanoclawConfigFile = {
  profile: 'terminal',
  executionMode: 'edge',
  edgeRunnerMode: 'edgejs',
  providers: {
    myopenai: {
      type: 'openai',
      apiKey: '${OPENAI_API_KEY}',
      baseUrl: 'https://api.example.com/v1',
      model: 'gpt-4o',
    },
    myclaude: {
      type: 'anthropic',
      apiKey: '${ANTHROPIC_API_KEY}',
      model: 'claude-sonnet-4-20250514',
    },
  },
  edge: { provider: 'myopenai' },
  container: { provider: 'myclaude' },
};

describe('expandEnvVars', () => {
  it('expands ${VAR} references from process.env', () => {
    process.env.TEST_EXPAND_KEY = 'secret-123';
    expect(expandEnvVars('${TEST_EXPAND_KEY}')).toBe('secret-123');
    delete process.env.TEST_EXPAND_KEY;
  });

  it('returns empty string for missing env vars', () => {
    expect(expandEnvVars('${NONEXISTENT_VAR_xyz}')).toBe('');
  });

  it('leaves plain text untouched', () => {
    expect(expandEnvVars('hello world')).toBe('hello world');
  });
});

describe('validateConfigFile', () => {
  it('accepts a valid config file', () => {
    expect(() => validateConfigFile(validConfigFile)).not.toThrow();
  });

  it('rejects config with missing edge provider reference', () => {
    const config = { ...validConfigFile, edge: { provider: 'nonexistent' } };
    expect(() => validateConfigFile(config)).toThrow(/edge.*provider/i);
  });

  it('rejects config with missing container provider reference', () => {
    const config = { ...validConfigFile, container: { provider: 'nonexistent' } };
    expect(() => validateConfigFile(config)).toThrow(/container.*provider/i);
  });

  it('rejects non-anthropic container provider', () => {
    const config = {
      ...validConfigFile,
      container: { provider: 'myopenai' },
    };
    expect(() => validateConfigFile(config)).toThrow(/anthropic/i);
  });

  it('accepts local provider without apiKey or model', () => {
    const config: NanoclawConfigFile = {
      ...validConfigFile,
      providers: {
        ...validConfigFile.providers,
        stub: { type: 'local' },
      },
      edge: { provider: 'stub' },
    };
    expect(() => validateConfigFile(config)).not.toThrow();
  });

  it('rejects anthropic provider without apiKey', () => {
    const config = {
      ...validConfigFile,
      providers: {
        bad: { type: 'anthropic', model: 'claude-sonnet-4-20250514' },
      },
      edge: { provider: 'bad' },
      container: { provider: 'bad' },
    };
    expect(() => validateConfigFile(config)).toThrow(/apiKey/i);
  });

  it('rejects openai provider without apiKey', () => {
    const config = {
      ...validConfigFile,
      providers: {
        bad: { type: 'openai', baseUrl: 'https://api.example.com/v1', model: 'gpt-4o' },
      },
      edge: { provider: 'bad' },
    };
    expect(() => validateConfigFile(config)).toThrow(/apiKey/i);
  });
});

describe('resolveConfig', () => {
  beforeEach(() => {
    process.env.OPENAI_API_KEY = 'test-openai-key';
    process.env.ANTHROPIC_API_KEY = 'test-anthropic-key';
  });
  afterEach(() => {
    delete process.env.OPENAI_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
  });

  it('resolves a full config with env var expansion', () => {
    const resolved = resolveConfig(validConfigFile);
    expect(resolved.profile).toBe('terminal');
    expect(resolved.executionMode).toBe('edge');
    expect(resolved.edgeRunnerMode).toBe('edgejs');
    expect(resolved.edgeProvider.type).toBe('openai');
    expect(resolved.edgeProvider.apiKey).toBe('test-openai-key');
    expect(resolved.containerProvider.type).toBe('anthropic');
    expect(resolved.containerProvider.apiKey).toBe('test-anthropic-key');
  });

  it('applies defaults for missing optional fields', () => {
    const minimal: NanoclawConfigFile = {
      providers: {
        myclaude: {
          type: 'anthropic',
          apiKey: '${ANTHROPIC_API_KEY}',
          model: 'claude-sonnet-4-20250514',
        },
      },
    };
    const resolved = resolveConfig(minimal);
    expect(resolved.profile).toBe('terminal');
    expect(resolved.executionMode).toBe('edge');
    expect(resolved.edgeRunnerMode).toBe('edgejs');
    expect(resolved.edge.enableTools).toBe(true);
    expect(resolved.edge.disableFallback).toBe(false);
    expect(resolved.container.maxConcurrent).toBe(5);
  });

  it('resolves edge provider to first anthropic provider when not specified', () => {
    const config: NanoclawConfigFile = {
      providers: {
        myclaude: {
          type: 'anthropic',
          apiKey: '${ANTHROPIC_API_KEY}',
          model: 'claude-sonnet-4-20250514',
        },
      },
    };
    const resolved = resolveConfig(config);
    expect(resolved.edgeProvider.name).toBe('myclaude');
    expect(resolved.containerProvider.name).toBe('myclaude');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd packages/nanoclaw && pnpm vitest run src/nanoclaw-config.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement config types and loader**

```typescript
// packages/nanoclaw/src/nanoclaw-config.ts
export type Profile = 'claw' | 'terminal';
export type LlmProviderType = 'anthropic' | 'openai' | 'local';

export interface ProviderDefinition {
  type: LlmProviderType;
  apiKey?: string;
  baseUrl?: string;
  model?: string;
}

export interface NanoclawConfigFile {
  profile?: Profile;
  executionMode?: 'edge' | 'container' | 'auto';
  edgeRunnerMode?: 'edgejs' | 'node';
  providers: Record<string, ProviderDefinition>;
  edge?: {
    provider?: string;
    enableTools?: boolean;
    disableFallback?: boolean;
  };
  container?: {
    provider?: string;
    maxConcurrent?: number;
  };
}

export interface ResolvedProvider {
  name: string;
  type: LlmProviderType;
  apiKey?: string;
  baseUrl?: string;
  model?: string;
}

export interface ResolvedNanoclawConfig {
  profile: Profile;
  executionMode: 'edge' | 'container' | 'auto';
  edgeRunnerMode: 'edgejs' | 'node';
  providers: Record<string, ResolvedProvider>;
  edgeProvider: ResolvedProvider;
  containerProvider: ResolvedProvider;
  edge: {
    enableTools: boolean;
    disableFallback: boolean;
  };
  container: {
    maxConcurrent: number;
  };
}

export function expandEnvVars(value: string): string {
  return value.replace(/\$\{([^}]+)\}/g, (_, varName: string) => {
    return process.env[varName] ?? '';
  });
}

function findFirstProviderByType(
  providers: Record<string, ProviderDefinition>,
  type: LlmProviderType,
): string | null {
  for (const [name, def] of Object.entries(providers)) {
    if (def.type === type) return name;
  }
  return null;
}

export function validateConfigFile(config: NanoclawConfigFile): void {
  if (!config.providers || Object.keys(config.providers).length === 0) {
    throw new Error('Config must define at least one provider.');
  }

  for (const [name, def] of Object.entries(config.providers)) {
    if (def.type === 'local') continue;
    if (!def.apiKey) {
      throw new Error(`Provider "${name}" (${def.type}) requires an apiKey.`);
    }
    if (def.type === 'openai' && !def.model) {
      throw new Error(`Provider "${name}" (openai) requires a model.`);
    }
  }

  const edgeProviderName = config.edge?.provider ?? findFirstProviderByType(config.providers, 'anthropic');
  if (edgeProviderName && !config.providers[edgeProviderName]) {
    throw new Error(`edge.provider "${edgeProviderName}" not found in providers.`);
  }

  const containerProviderName = config.container?.provider ?? findFirstProviderByType(config.providers, 'anthropic');
  if (containerProviderName && !config.providers[containerProviderName]) {
    throw new Error(`container.provider "${containerProviderName}" not found in providers.`);
  }

  if (containerProviderName) {
    const containerDef = config.providers[containerProviderName];
    if (containerDef.type !== 'anthropic') {
      throw new Error(`container.provider must be type "anthropic", got "${containerDef.type}".`);
    }
  }
}

export function resolveConfig(config: NanoclawConfigFile): ResolvedNanoclawConfig {
  validateConfigFile(config);

  const resolvedProviders: Record<string, ResolvedProvider> = {};
  for (const [name, def] of Object.entries(config.providers)) {
    resolvedProviders[name] = {
      name,
      type: def.type,
      apiKey: def.apiKey ? expandEnvVars(def.apiKey) : undefined,
      baseUrl: def.baseUrl,
      model: def.model,
    };
  }

  const edgeProviderName =
    config.edge?.provider ?? findFirstProviderByType(config.providers, 'anthropic') ?? Object.keys(config.providers)[0]!;
  const containerProviderName =
    config.container?.provider ?? findFirstProviderByType(config.providers, 'anthropic') ?? Object.keys(config.providers)[0]!;

  return {
    profile: config.profile ?? 'terminal',
    executionMode: config.executionMode ?? 'edge',
    edgeRunnerMode: config.edgeRunnerMode ?? 'edgejs',
    providers: resolvedProviders,
    edgeProvider: resolvedProviders[edgeProviderName]!,
    containerProvider: resolvedProviders[containerProviderName]!,
    edge: {
      enableTools: config.edge?.enableTools ?? true,
      disableFallback: config.edge?.disableFallback ?? false,
    },
    container: {
      maxConcurrent: config.container?.maxConcurrent ?? 5,
    },
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd packages/nanoclaw && pnpm vitest run src/nanoclaw-config.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/nanoclaw/src/nanoclaw-config.ts packages/nanoclaw/src/nanoclaw-config.test.ts
git commit -m "feat(nanoclaw): add config types and loader for nanoclaw.config.json"
```

---

### Task 2: Add config file reader with --config CLI arg

**Files:**
- Create: `packages/nanoclaw/src/config-loader.ts`
- Test: `packages/nanoclaw/src/config-loader.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// packages/nanoclaw/src/config-loader.test.ts
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { loadConfigFile, resolveConfigPath } from './config-loader.js';

describe('resolveConfigPath', () => {
  it('returns --config arg value when provided', () => {
    expect(resolveConfigPath(['--config', '/tmp/test.json'])).toBe('/tmp/test.json');
  });

  it('returns nanoclaw.config.json in cwd by default', () => {
    expect(resolveConfigPath([])).toBe(
      path.join(process.cwd(), 'nanoclaw.config.json'),
    );
  });
});

describe('loadConfigFile', () => {
  const tmpDir = path.join(os.tmpdir(), `nanoclaw-config-test-${Date.now()}`);

  beforeEach(() => {
    fs.mkdirSync(tmpDir, { recursive: true });
  });
  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('loads and parses a valid config file', () => {
    process.env._TEST_LOAD_KEY = 'loaded-secret';
    const configPath = path.join(tmpDir, 'test.config.json');
    fs.writeFileSync(
      configPath,
      JSON.stringify({
        profile: 'terminal',
        executionMode: 'edge',
        providers: {
          myclaude: {
            type: 'anthropic',
            apiKey: '${_TEST_LOAD_KEY}',
            model: 'claude-sonnet-4-20250514',
          },
        },
      }),
    );

    const resolved = loadConfigFile(configPath);
    expect(resolved.profile).toBe('terminal');
    expect(resolved.edgeProvider.apiKey).toBe('loaded-secret');
    delete process.env._TEST_LOAD_KEY;
  });

  it('throws on missing file', () => {
    expect(() => loadConfigFile('/nonexistent/path.json')).toThrow(/not found/);
  });

  it('throws on invalid JSON', () => {
    const configPath = path.join(tmpDir, 'bad.json');
    fs.writeFileSync(configPath, 'not json');
    expect(() => loadConfigFile(configPath)).toThrow(/JSON/);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd packages/nanoclaw && pnpm vitest run src/config-loader.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement config file loader**

```typescript
// packages/nanoclaw/src/config-loader.ts
import fs from 'fs';
import path from 'path';

import type { NanoclawConfigFile } from './nanoclaw-config.js';
import { resolveConfig } from './nanoclaw-config.js';
import type { ResolvedNanoclawConfig } from './nanoclaw-config.js';

export function resolveConfigPath(argv: string[]): string {
  const configIdx = argv.indexOf('--config');
  if (configIdx !== -1 && configIdx + 1 < argv.length) {
    return argv[configIdx + 1]!;
  }
  return path.join(process.cwd(), 'nanoclaw.config.json');
}

export function loadConfigFile(configPath: string): ResolvedNanoclawConfig {
  if (!fs.existsSync(configPath)) {
    throw new Error(`Config file not found: ${configPath}`);
  }

  let raw: string;
  try {
    raw = fs.readFileSync(configPath, 'utf-8');
  } catch (error) {
    throw new Error(`Failed to read config file: ${configPath}`);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`Config file is not valid JSON: ${configPath}`);
  }

  return resolveConfig(parsed as NanoclawConfigFile);
}

export function loadConfigFromArgv(argv: string[]): ResolvedNanoclawConfig {
  const configPath = resolveConfigPath(argv);
  return loadConfigFile(configPath);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd packages/nanoclaw && pnpm vitest run src/config-loader.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/nanoclaw/src/config-loader.ts packages/nanoclaw/src/config-loader.test.ts
git commit -m "feat(nanoclaw): add config file loader with --config CLI arg"
```

---

### Task 3: Rewrite src/config.ts to consume the new config

**Files:**
- Modify: `packages/nanoclaw/src/config.ts`
- Test: `packages/nanoclaw/src/config.test.ts` (new)

This is the core migration step. `src/config.ts` currently reads from env vars and exports constants. We rewrite it to load the config file once and re-export resolved values. Modules that import from `config.ts` should not need changes in this step — we keep the same export names where possible and add new ones.

- [ ] **Step 1: Write the failing tests for new config exports**

```typescript
// packages/nanoclaw/src/config.test.ts
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';

// These tests verify the new config initialization path.
// The module-level constants are set via initConfig().
describe('config initialization', () => {
  const tmpDir = path.join(os.tmpdir(), `nanoclaw-config-test-${Date.now()}`);

  beforeEach(() => {
    fs.mkdirSync(tmpDir, { recursive: true });
    process.env.ANTHROPIC_API_KEY = 'test-key';
  });
  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    delete process.env.ANTHROPIC_API_KEY;
  });

  it('initConfig sets resolved config from a config file', async () => {
    const configPath = path.join(tmpDir, 'test.json');
    fs.writeFileSync(configPath, JSON.stringify({
      profile: 'claw',
      executionMode: 'edge',
      providers: {
        myclaude: {
          type: 'anthropic',
          apiKey: '${ANTHROPIC_API_KEY}',
          model: 'claude-sonnet-4-20250514',
        },
      },
    }));

    // Dynamic import to get fresh module state
    const configModule = await import('./config.js');
    const config = configModule.initConfig(configPath);
    expect(config.profile).toBe('claw');
    expect(config.executionMode).toBe('edge');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/nanoclaw && pnpm vitest run src/config.test.ts`
Expected: FAIL — initConfig not exported or wrong behavior

- [ ] **Step 3: Rewrite src/config.ts**

The new `config.ts` will:
- Keep all existing path-related exports (STORE_DIR, GROUPS_DIR, etc.)
- Replace env-var-based LLM/mode exports with values from the config file
- Export `initConfig(configPath)` called once at startup from `index.ts`
- Export the `ResolvedNanoclawConfig` as `appConfig`

Key changes:
- `DEFAULT_EXECUTION_MODE` → derived from `appConfig.executionMode`
- `EDGE_RUNNER_PROVIDER` → derived from `appConfig.edgeProvider.type`
- `EDGE_RUNNER_MODE` → derived from `appConfig.edgeRunnerMode`
- `EDGE_ENABLE_TOOLS` → derived from `appConfig.edge.enableTools`
- `EDGE_DISABLE_FALLBACK` → derived from `appConfig.edge.disableFallback`
- `TERMINAL_CHANNEL_ENABLED` → derived from `appConfig.profile === 'terminal'`
- `TERMINAL_GROUP_EXECUTION_MODE` → derived from `appConfig.executionMode`
- Remove `EDGE_RUNNER_PROVIDER`, `EDGE_API_BASE_URL`, `EDGE_API_KEY`, `EDGE_MODEL`, `EDGE_ANTHROPIC_*` exports
- Add `appConfig` export (the resolved `ResolvedNanoclawConfig`)

```typescript
// packages/nanoclaw/src/config.ts — rewritten
import path from 'path';

import { readEnvFile } from './env.js';
import { resolveExecutionMode } from './execution-mode.js';
import { resolveShadowExecutionMode } from './shadow-execution.js';
import { isValidTimezone } from './timezone.js';
import { loadConfigFile, type ResolvedNanoclawConfig } from './config-loader.js';

// --- Legacy env file reading (still needed for non-config-file settings) ---
const envConfig = readEnvFile([
  'ASSISTANT_NAME',
  'ASSISTANT_HAS_OWN_NUMBER',
  'EDGEJS_BIN',
  'SHADOW_EXECUTION_MODE',
  'TZ',
  // Terminal group identity
  'TERMINAL_GROUP_FOLDER',
  'TERMINAL_GROUP_JID',
  'TERMINAL_GROUP_NAME',
  'TERMINAL_RESET_SESSION_ON_START',
  'TERMINAL_USER_JID',
  'TERMINAL_USER_NAME',
  // Paths
  'NANOCLAW_STORE_DIR',
  'NANOCLAW_GROUPS_DIR',
  'NANOCLAW_DATA_DIR',
  // Container
  'CONTAINER_IMAGE',
  'CONTAINER_TIMEOUT',
  'CONTAINER_MAX_OUTPUT_SIZE',
  // Misc
  'ONECLI_URL',
  'MAX_MESSAGES_PER_PROMPT',
  'MAX_CONCURRENT_CONTAINERS',
  'IDLE_TIMEOUT',
]);

// --- Paths (unchanged) ---
export const ASSISTANT_NAME =
  process.env.ASSISTANT_NAME || envConfig.ASSISTANT_NAME || 'Andy';
export const ASSISTANT_HAS_OWN_NUMBER =
  (process.env.ASSISTANT_HAS_OWN_NUMBER || envConfig.ASSISTANT_HAS_OWN_NUMBER) === 'true';
export const POLL_INTERVAL = 2000;
export const SCHEDULER_POLL_INTERVAL = 60000;
const PROJECT_ROOT = process.cwd();
function resolveHomeDir(): string { return process.env.HOME || PROJECT_ROOT; }
const HOME_DIR = resolveHomeDir();
export const MOUNT_ALLOWLIST_PATH = path.join(HOME_DIR, '.config', 'nanoclaw', 'mount-allowlist.json');
export const SENDER_ALLOWLIST_PATH = path.join(HOME_DIR, '.config', 'nanoclaw', 'sender-allowlist.json');
export const STORE_DIR = path.resolve(process.env.NANOCLAW_STORE_DIR || path.join(PROJECT_ROOT, 'store'));
export const GROUPS_DIR = path.resolve(process.env.NANOCLAW_GROUPS_DIR || path.join(PROJECT_ROOT, 'groups'));
export const DATA_DIR = path.resolve(process.env.NANOCLAW_DATA_DIR || path.join(PROJECT_ROOT, 'data'));
export const CONTAINER_IMAGE = process.env.CONTAINER_IMAGE || envConfig.CONTAINER_IMAGE || 'nanoclaw-agent:latest';
export const ONECLI_URL = process.env.ONECLI_URL || envConfig.ONECLI_URL || 'http://localhost:10254';
export const MAX_MESSAGES_PER_PROMPT = Math.max(1, parseInt(process.env.MAX_MESSAGES_PER_PROMPT || '10', 10) || 10);
export const IPC_POLL_INTERVAL = 1000;
export const IDLE_TIMEOUT = parseInt(process.env.IDLE_TIMEOUT || '1800000', 10);
export const MAX_CONCURRENT_CONTAINERS = Math.max(1, parseInt(process.env.MAX_CONCURRENT_CONTAINERS || '5', 10) || 5);
export const CONTAINER_TIMEOUT = parseInt(process.env.CONTAINER_TIMEOUT || '1800000', 10);
export const CONTAINER_MAX_OUTPUT_SIZE = parseInt(process.env.CONTAINER_MAX_OUTPUT_SIZE || '10485760', 10);
export const EDGEJS_BIN = process.env.EDGEJS_BIN || envConfig.EDGEJS_BIN || undefined;

// --- Terminal group identity (unchanged) ---
export const TERMINAL_GROUP_JID = process.env.TERMINAL_GROUP_JID || envConfig.TERMINAL_GROUP_JID || 'term:canary-group';
export const TERMINAL_GROUP_NAME = process.env.TERMINAL_GROUP_NAME || envConfig.TERMINAL_GROUP_NAME || 'Terminal Canary';
export const TERMINAL_RESET_SESSION_ON_START =
  (process.env.TERMINAL_RESET_SESSION_ON_START || envConfig.TERMINAL_RESET_SESSION_ON_START) === 'true';
export const TERMINAL_GROUP_FOLDER = process.env.TERMINAL_GROUP_FOLDER || envConfig.TERMINAL_GROUP_FOLDER || 'terminal_canary';
export const TERMINAL_USER_JID = process.env.TERMINAL_USER_JID || envConfig.TERMINAL_USER_JID || 'term:user';
export const TERMINAL_USER_NAME = process.env.TERMINAL_USER_NAME || envConfig.TERMINAL_USER_NAME || 'You';

// --- Timezone (unchanged) ---
function resolveConfigTimezone(): string {
  const candidates = [process.env.TZ, envConfig.TZ, Intl.DateTimeFormat().resolvedOptions().timeZone];
  for (const tz of candidates) { if (tz && isValidTimezone(tz)) return tz; }
  return 'UTC';
}
export const TIMEZONE = resolveConfigTimezone();

// --- Shadow execution (unchanged, dev/testing only) ---
export const SHADOW_EXECUTION_MODE = resolveShadowExecutionMode(
  process.env.SHADOW_EXECUTION_MODE || envConfig.SHADOW_EXECUTION_MODE,
);

// --- Trigger pattern (unchanged) ---
function escapeRegex(str: string): string { return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
export function buildTriggerPattern(trigger: string): RegExp { return new RegExp(`^${escapeRegex(trigger.trim())}\\b`, 'i'); }
export const DEFAULT_TRIGGER = `@${ASSISTANT_NAME}`;
export function getTriggerPattern(trigger?: string): RegExp { return buildTriggerPattern(trigger?.trim() || DEFAULT_TRIGGER); }
export const TRIGGER_PATTERN = buildTriggerPattern(DEFAULT_TRIGGER);

// --- NEW: Structured config from nanoclaw.config.json ---
let _appConfig: ResolvedNanoclawConfig | null = null;

export function initConfig(configPath: string): ResolvedNanoclawConfig {
  _appConfig = loadConfigFile(configPath);
  return _appConfig;
}

export function getAppConfig(): ResolvedNanoclawConfig {
  if (!_appConfig) throw new Error('Config not initialized. Call initConfig() first.');
  return _appConfig;
}

// --- Derived config values (replacing old env-var exports) ---
// These are lazy getters so they work after initConfig() is called.

export const DEFAULT_EXECUTION_MODE = {
  get value() { return getAppConfig().executionMode; },
};

export const EDGE_RUNNER_MODE = {
  get value() { return getAppConfig().edgeRunnerMode; },
};

export const EDGE_ENABLE_TOOLS = {
  get value() { return getAppConfig().edge.enableTools; },
};

export const EDGE_DISABLE_FALLBACK = {
  get value() { return getAppConfig().edge.disableFallback; },
};

export const TERMINAL_CHANNEL_ENABLED = {
  get value() { return getAppConfig().profile === 'terminal'; },
};

export const TERMINAL_GROUP_EXECUTION_MODE = {
  get value() { return getAppConfig().executionMode; },
};

// Profile accessor
export const NANOCLAW_PROFILE = {
  get value() { return getAppConfig().profile; },
};
```

> **Note:** The lazy getter pattern (`{ get value() { ... } }`) is used because many modules import these as plain values (e.g. `import { DEFAULT_EXECUTION_MODE } from './config.js'`). To avoid breaking all call sites simultaneously, we use this pattern so existing code like `DEFAULT_EXECUTION_MODE.value` or we update call sites in later tasks. An alternative is to re-export plain getter functions and update all imports. The actual migration will use whichever is least disruptive — the plan here shows the concept; implementation may use a simpler approach if the codebase patterns favor it.

**Implementation note:** In practice, we'll provide both:
- `getAppConfig()` for new code
- Keep the old flat export names as aliases to `getAppConfig().xxx` for gradual migration

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd packages/nanoclaw && pnpm vitest run src/config.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/nanoclaw/src/config.ts packages/nanoclaw/src/config.test.ts
git commit -m "refactor(nanoclaw): rewrite config.ts to load nanoclaw.config.json"
```

---

### Task 4: Update edge-backend.ts to use new provider config

**Files:**
- Modify: `packages/nanoclaw/src/backends/edge-backend.ts`

Currently `buildExecutionRequest()` reads `EDGE_RUNNER_PROVIDER`, `EDGE_API_BASE_URL`, `EDGE_API_KEY`, `EDGE_MODEL` from `config.ts`. Change it to read from `getAppConfig()`.

- [ ] **Step 1: Update imports in edge-backend.ts**

Replace:
```typescript
import {
  EDGE_API_BASE_URL,
  EDGE_API_KEY,
  EDGE_MODEL,
  EDGE_RUNNER_PROVIDER,
} from '../config.js';
```

With:
```typescript
import { getAppConfig } from '../config.js';
```

- [ ] **Step 2: Update buildExecutionRequest runner field**

In `buildExecutionRequest()`, replace the `runner` field construction:

```typescript
// OLD:
runner: {
  provider:
    EDGE_RUNNER_PROVIDER === 'anthropic' || EDGE_RUNNER_PROVIDER === 'openai'
      ? EDGE_RUNNER_PROVIDER
      : 'local',
  ...(EDGE_API_BASE_URL ? { apiBaseUrl: EDGE_API_BASE_URL } : {}),
  ...(EDGE_API_KEY ? { apiKey: EDGE_API_KEY } : {}),
  ...(EDGE_MODEL ? { model: EDGE_MODEL } : {}),
},

// NEW:
runner: {
  provider: getAppConfig().edgeProvider.type,
  ...(getAppConfig().edgeProvider.baseUrl ? { apiBaseUrl: getAppConfig().edgeProvider.baseUrl } : {}),
  ...(getAppConfig().edgeProvider.apiKey ? { apiKey: getAppConfig().edgeProvider.apiKey } : {}),
  ...(getAppConfig().edgeProvider.model ? { model: getAppConfig().edgeProvider.model } : {}),
},
```

- [ ] **Step 3: Update EDGE_DISABLE_FALLBACK import**

Replace:
```typescript
import { EDGE_DISABLE_FALLBACK } from '../config.js';
```

With:
```typescript
import { getAppConfig } from '../config.js';
```

And in `routeTaskNode()` calls in `policy-router.ts`, the fallback check changes from `EDGE_DISABLE_FALLBACK` to `getAppConfig().edge.disableFallback`. This is handled in Task 6.

- [ ] **Step 4: Run existing edge-backend tests**

Run: `cd packages/nanoclaw && pnpm vitest run src/backends/edge-backend.test.ts`
Expected: Some tests may fail due to config not being initialized. We'll fix this in Task 7 by adding test setup.

- [ ] **Step 5: Commit**

```bash
git add packages/nanoclaw/src/backends/edge-backend.ts
git commit -m "refactor(nanoclaw): edge-backend reads provider from structured config"
```

---

### Task 5: Update edge-runner.ts to use provider from request

**Files:**
- Modify: `packages/nanoclaw/src/edge-runner.ts`

Currently `AnthropicEdgeRunner` and `OpenAiCompatibleEdgeRunner` read `EDGE_ANTHROPIC_API_KEY`, `EDGE_ANTHROPIC_MODEL`, `EDGE_API_KEY`, `EDGE_API_BASE_URL`, `EDGE_MODEL` from config as fallbacks. Change them to read from `request.runner.*` only (which now comes from the resolved config via `buildExecutionRequest`).

- [ ] **Step 1: Remove old config imports**

Replace:
```typescript
import {
  EDGE_ANTHROPIC_API_BASE_URL,
  EDGE_ANTHROPIC_API_KEY,
  EDGE_ANTHROPIC_MODEL,
  EDGE_API_BASE_URL,
  EDGE_API_KEY,
  EDGE_MODEL,
} from './config.js';
```

With nothing (remove the import entirely).

- [ ] **Step 2: Update AnthropicEdgeRunner API key resolution**

In `AnthropicEdgeRunner.runTurn()`, replace:
```typescript
const apiKey =
  request.runner?.apiKey ||
  EDGE_ANTHROPIC_API_KEY ||
  process.env.EDGE_ANTHROPIC_API_KEY ||
  process.env.ANTHROPIC_API_KEY;
```

With:
```typescript
const apiKey = request.runner?.apiKey;
```

- [ ] **Step 3: Update AnthropicEdgeRunner base URL resolution**

Replace:
```typescript
const baseUrl = (
  request.runner?.apiBaseUrl ||
  EDGE_ANTHROPIC_API_BASE_URL ||
  'https://api.anthropic.com'
).replace(/\/+$/, '');
```

With:
```typescript
const baseUrl = (request.runner?.apiBaseUrl || 'https://api.anthropic.com').replace(/\/+$/, '');
```

- [ ] **Step 4: Update AnthropicEdgeRunner model resolution**

Replace:
```typescript
model: request.runner?.model || EDGE_ANTHROPIC_MODEL,
```

With:
```typescript
model: request.runner?.model || 'claude-sonnet-4-20250514',
```

- [ ] **Step 5: Update OpenAiCompatibleEdgeRunner similarly**

Replace apiKey:
```typescript
// OLD:
const apiKey = request.runner?.apiKey || EDGE_API_KEY || process.env.OPENAI_API_KEY;
// NEW:
const apiKey = request.runner?.apiKey;
```

Replace baseUrl:
```typescript
// OLD:
const baseUrl = (request.runner?.apiBaseUrl || EDGE_API_BASE_URL || 'https://api.openai.com/v1').replace(/\/+$/, '');
// NEW:
const baseUrl = (request.runner?.apiBaseUrl || 'https://api.openai.com/v1').replace(/\/+$/, '');
```

Replace model:
```typescript
// OLD:
const model = request.runner?.model || EDGE_MODEL || 'gpt-4o-mini';
// NEW:
const model = request.runner?.model || 'gpt-4o-mini';
```

- [ ] **Step 6: Update error messages**

Replace references to `EDGE_ANTHROPIC_API_KEY or ANTHROPIC_API_KEY` with `apiKey` in error messages. Same for `EDGE_API_KEY or OPENAI_API_KEY`.

- [ ] **Step 7: Run edge-runner tests**

Run: `cd packages/nanoclaw && pnpm vitest run src/edge-runner.test.ts`
Expected: Tests should still pass since `localEdgeRunner` tests don't depend on API keys.

- [ ] **Step 8: Commit**

```bash
git add packages/nanoclaw/src/edge-runner.ts
git commit -m "refactor(nanoclaw): edge-runner reads provider config from request only"
```

---

### Task 6: Update policy-router.ts for container availability

**Files:**
- Modify: `packages/nanoclaw/src/policy-router.ts`
- Modify: `packages/nanoclaw/src/policy-router.test.ts`

- [ ] **Step 1: Add test for container-unavailable routing**

Add to `packages/nanoclaw/src/policy-router.test.ts`:

```typescript
it('routes to edge when container provider is not anthropic', () => {
  // When container can only be anthropic, auto mode with non-anthropic container
  // should be treated as edge-only
  expect(
    routeTaskNode(
      undefined,
      { prompt: 'hello', script: 'echo 1' },
      'auto',
      false, // containerAvailable = false
    ),
  ).toMatchObject({
    backendId: 'edge',
    fallbackEligible: false,
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/nanoclaw && pnpm vitest run src/policy-router.test.ts`
Expected: FAIL — `routeTaskNode` doesn't accept `containerAvailable` parameter yet

- [ ] **Step 3: Add containerAvailable parameter to routeTaskNode**

In `policy-router.ts`, update the function signature:

```typescript
export function routeTaskNode(
  group: Pick<RegisteredGroup, 'executionMode'> | undefined,
  input: Pick<AgentRunInput, 'prompt' | 'script'>,
  defaultExecutionMode: ExecutionMode,
  containerAvailable: boolean = true,
): PolicyRouteDecision {
```

Add early return after the `edge` pin check:

```typescript
if (executionMode === 'edge') {
  return {
    executionMode,
    backendId: 'edge',
    requiredCapabilities: intent.requiredCapabilities,
    routeReason: 'group_pinned_edge',
    policyVersion: FRAMEWORK_POLICY_VERSION,
    fallbackEligible: containerAvailable && !EDGE_DISABLE_FALLBACK,
  };
}

// Container not available: force everything to edge
if (!containerAvailable) {
  return {
    executionMode: 'edge',
    backendId: 'edge',
    requiredCapabilities: intent.requiredCapabilities,
    routeReason: 'no_special_capabilities',
    policyVersion: FRAMEWORK_POLICY_VERSION,
    fallbackEligible: false,
  };
}
```

- [ ] **Step 4: Update EDGE_DISABLE_FALLBACK import**

Replace `import { EDGE_DISABLE_FALLBACK } from './config.js'` with `import { getAppConfig } from './config.js'`.

Replace `EDGE_DISABLE_FALLBACK` usage with `getAppConfig().edge.disableFallback`.

- [ ] **Step 5: Update backend-selection.ts to pass containerAvailable**

In `packages/nanoclaw/src/backend-selection.ts`, update `selectAgentBackend`:

```typescript
export function selectAgentBackend(
  group: Pick<RegisteredGroup, 'executionMode'> | undefined,
  input: Pick<AgentRunInput, 'script' | 'prompt'>,
  defaultExecutionMode: ExecutionMode,
  containerAvailable: boolean = true,
): BackendSelection {
  return routeTaskNode(group, input, defaultExecutionMode, containerAvailable);
}
```

Also update `deploymentRequiresContainerRuntime` to check container availability from config:

```typescript
export function deploymentRequiresContainerRuntime(
  groups: ReadonlyArray<Pick<RegisteredGroup, 'executionMode'>>,
  defaultExecutionMode: ExecutionMode,
  containerAvailable: boolean = true,
): boolean {
  if (!containerAvailable) return false;
  if (defaultExecutionMode !== 'edge') return true;
  return groups.some((group) =>
    groupMayUseContainerRuntime(group, defaultExecutionMode),
  );
}
```

- [ ] **Step 6: Run tests**

Run: `cd packages/nanoclaw && pnpm vitest run src/policy-router.test.ts src/backend-selection.test.ts`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add packages/nanoclaw/src/policy-router.ts packages/nanoclaw/src/policy-router.test.ts packages/nanoclaw/src/backend-selection.ts
git commit -m "feat(nanoclaw): add containerAvailable param to policy router"
```

---

### Task 7: Update index.ts for config initialization and profile-based startup

**Files:**
- Modify: `packages/nanoclaw/src/index.ts`
- Modify: `packages/nanoclaw/src/channels/terminal.ts`
- Modify: `packages/nanoclaw/src/channels/index.ts`

This is the integration step that wires everything together.

- [ ] **Step 1: Add initConfig() call at the top of main() in index.ts**

At the beginning of the `main()` function (or `function main()`), add config initialization before any other setup:

```typescript
import { initConfig, getAppConfig, NANOCLAW_PROFILE } from './config.js';

async function main(): Promise<void> {
  const configPath = resolveConfigPath(process.argv);
  const config = initConfig(configPath);
  // ... rest of initialization
```

Import `resolveConfigPath` from `./config-loader.js`.

- [ ] **Step 2: Replace TERMINAL_CHANNEL_ENABLED usage in index.ts**

Find all references to `TERMINAL_CHANNEL_ENABLED` in index.ts and replace with `config.profile === 'terminal'` or use `getAppConfig().profile`.

- [ ] **Step 3: Replace DEFAULT_EXECUTION_MODE usage in index.ts**

Replace `DEFAULT_EXECUTION_MODE` (which is now a getter object) with `config.executionMode` at the call sites where it's used as a plain string. Key locations: `createFrameworkRunContext()`, `runAgent()`, `deploymentRequiresContainerRuntime()`.

- [ ] **Step 4: Replace EDGE_RUNNER_MODE usage in edge-subprocess-runner.ts**

In `packages/nanoclaw/src/edge-subprocess-runner.ts`, replace `EDGE_RUNNER_MODE` with `getAppConfig().edgeRunnerMode`.

- [ ] **Step 5: Update channels/terminal.ts to remove TERMINAL_CHANNEL_ENABLED**

In `packages/nanoclaw/src/channels/terminal.ts`, at the bottom registration:

```typescript
// OLD:
registerChannel('terminal', (opts) => {
  if (!TERMINAL_CHANNEL_ENABLED) return null;
  return new TerminalChannel(opts);
});

// NEW:
registerChannel('terminal', (opts) => {
  return new TerminalChannel(opts);
});
```

Remove the `TERMINAL_CHANNEL_ENABLED` import. The profile check now happens in `index.ts` when deciding which channels to load.

- [ ] **Step 6: Update channels/index.ts for profile-aware loading**

```typescript
// OLD:
import './terminal.js';
// ... other commented-out imports

// NEW:
import { getAppConfig } from '../config.js';

const profile = getAppConfig().profile;

if (profile === 'terminal') {
  await import('./terminal.js');
} else if (profile === 'claw') {
  // Load remote channels (WhatsApp, Telegram, Discord etc.)
  // Currently only terminal is implemented, so this is a no-op placeholder
  // await import('./whatsapp.js');
  // await import('./telegram.js');
  // ...
}
```

**Note:** Since channel registration happens via side-effect imports, and claw mode needs remote channels (currently unimplemented), we load terminal for `terminal` profile and remote channels for `claw` profile. For now, claw profile with no remote channels configured will just log a warning.

- [ ] **Step 7: Run full test suite**

Run: `cd packages/nanoclaw && pnpm vitest run`
Expected: Most tests pass. Some integration tests may need config initialization in their setup — fix those by adding `initConfig()` calls in test `beforeEach` blocks using a minimal test config.

- [ ] **Step 8: Commit**

```bash
git add packages/nanoclaw/src/index.ts packages/nanoclaw/src/channels/terminal.ts packages/nanoclaw/src/channels/index.ts packages/nanoclaw/src/edge-subprocess-runner.ts
git commit -m "feat(nanoclaw): wire config initialization and profile-based channel loading"
```

---

### Task 8: Update package.json and add example config files

**Files:**
- Modify: `packages/nanoclaw/package.json`
- Create: `packages/nanoclaw/nanoclaw.config.terminal.example.json`
- Create: `packages/nanoclaw/nanoclaw.config.claw.example.json`
- Modify: `packages/nanoclaw/.gitignore` (add `nanoclaw.config.json`)

- [ ] **Step 1: Simplify npm scripts in package.json**

```json
{
  "scripts": {
    "build": "tsc",
    "dev": "tsx src/index.ts",
    "dev:claw": "tsx src/index.ts --config nanoclaw.config.claw.json",
    "start": "node dist/index.js",
    "start:claw": "node dist/index.js --config nanoclaw.config.claw.json",
    "typecheck": "tsc --noEmit",
    "format": "prettier --write \"src/**/*.ts\"",
    "format:fix": "prettier --write \"src/**/*.ts\"",
    "format:check": "prettier --check \"src/**/*.ts\"",
    "prepare": "cd ../.. && husky",
    "setup": "tsx setup/index.ts",
    "auth": "tsx src/whatsapp-auth.ts",
    "lint": "eslint src/",
    "lint:fix": "eslint src/ --fix",
    "test": "vitest run",
    "test:watch": "vitest"
  }
}
```

Remove the old `canary:terminal:*` and `dogfood:terminal` scripts.

- [ ] **Step 2: Create example config for terminal profile**

```json
// packages/nanoclaw/nanoclaw.config.terminal.example.json
{
  "profile": "terminal",
  "executionMode": "edge",
  "edgeRunnerMode": "edgejs",
  "providers": {
    "anthropic": {
      "type": "anthropic",
      "apiKey": "${ANTHROPIC_API_KEY}",
      "model": "claude-sonnet-4-20250514"
    }
  },
  "edge": {
    "provider": "anthropic",
    "enableTools": true,
    "disableFallback": false
  },
  "container": {
    "provider": "anthropic",
    "maxConcurrent": 5
  }
}
```

- [ ] **Step 3: Create example config for claw profile**

```json
// packages/nanoclaw/nanoclaw.config.claw.example.json
{
  "profile": "claw",
  "executionMode": "edge",
  "edgeRunnerMode": "edgejs",
  "providers": {
    "anthropic": {
      "type": "anthropic",
      "apiKey": "${ANTHROPIC_API_KEY}",
      "model": "claude-sonnet-4-20250514"
    },
    "openai": {
      "type": "openai",
      "apiKey": "${OPENAI_API_KEY}",
      "baseUrl": "https://api.openai.com/v1",
      "model": "gpt-4o"
    }
  },
  "edge": {
    "provider": "anthropic",
    "enableTools": true,
    "disableFallback": false
  },
  "container": {
    "provider": "anthropic",
    "maxConcurrent": 5
  }
}
```

- [ ] **Step 4: Add nanoclaw.config.json to .gitignore**

Append to `packages/nanoclaw/.gitignore`:
```
nanoclaw.config.json
```

- [ ] **Step 5: Run full test suite**

Run: `cd packages/nanoclaw && pnpm vitest run`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add packages/nanoclaw/package.json packages/nanoclaw/nanoclaw.config.terminal.example.json packages/nanoclaw/nanoclaw.config.claw.example.json packages/nanoclaw/.gitignore
git commit -m "feat(nanoclaw): add example configs and simplify npm scripts"
```

---

### Task 9: Fix remaining test failures from config migration

**Files:**
- Modify: Various test files that import removed config exports

Some tests will break because they import config values that changed (e.g., `EDGE_RUNNER_PROVIDER`, `EDGE_API_KEY`, `TERMINAL_CHANNEL_ENABLED`). Fix each by adding a minimal `initConfig()` in test setup.

- [ ] **Step 1: Create a test helper for config initialization**

```typescript
// packages/nanoclaw/src/test-config.ts
import { initConfig } from './config.js';
import type { NanoclawConfigFile } from './nanoclaw-config.js';

export const TEST_CONFIG: NanoclawConfigFile = {
  profile: 'terminal',
  executionMode: 'edge',
  edgeRunnerMode: 'node',
  providers: {
    testanthropic: {
      type: 'anthropic',
      apiKey: 'test-anthropic-key',
      model: 'claude-sonnet-4-20250514',
    },
    testopenai: {
      type: 'openai',
      apiKey: 'test-openai-key',
      baseUrl: 'https://api.test.com/v1',
      model: 'test-model',
    },
    testlocal: { type: 'local' },
  },
  edge: { provider: 'testanthropic' },
  container: { provider: 'testanthropic' },
};
```

- [ ] **Step 2: Find all broken tests**

Run: `cd packages/nanoclaw && pnpm vitest run 2>&1 | grep FAIL`

- [ ] **Step 3: Fix each broken test by importing and calling `initConfig()`**

For each failing test file, add:
```typescript
import { initConfig } from './config.js';
import { writeFileSync, mkdirSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

// In beforeEach or at top level:
const testConfigPath = join(tmpdir(), `nanoclaw-test-${Date.now()}.json`);
writeFileSync(testConfigPath, JSON.stringify(TEST_CONFIG));
initConfig(testConfigPath);

// In afterEach:
rmSync(testConfigPath);
```

- [ ] **Step 4: Run full test suite**

Run: `cd packages/nanoclaw && pnpm vitest run`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/nanoclaw/src/test-config.ts [fixed test files]
git commit -m "fix(nanoclaw): update tests for new config system"
```

---

### Task 10: Manual smoke test and cleanup

**Files:**
- Review: all modified files
- Delete: any dead code from old env var paths

- [ ] **Step 1: Typecheck the project**

Run: `cd packages/nanoclaw && pnpm typecheck`
Expected: No errors

- [ ] **Step 2: Run full test suite one final time**

Run: `cd packages/nanoclaw && pnpm vitest run`
Expected: All tests pass

- [ ] **Step 3: Manual smoke test with example config**

```bash
cd packages/nanoclaw
cp nanoclaw.config.terminal.example.json nanoclaw.config.json
ANTHROPIC_API_KEY=sk-test pnpm dev
```

Verify:
- Config loads without error
- Profile is `terminal`
- Terminal channel starts
- No startup errors about missing env vars

- [ ] **Step 4: Remove dead code**

Search for and remove any remaining references to removed env vars:
- `EDGE_RUNNER_PROVIDER`
- `EDGE_API_BASE_URL` / `EDGE_API_KEY` / `EDGE_MODEL`
- `EDGE_ANTHROPIC_API_BASE_URL` / `EDGE_ANTHROPIC_API_KEY` / `EDGE_ANTHROPIC_MODEL`
- `TERMINAL_CHANNEL` (env var name, not the module)

Run: `grep -r "EDGE_RUNNER_PROVIDER\|EDGE_API_BASE_URL\|EDGE_ANTHROPIC_API_KEY" packages/nanoclaw/src/`

- [ ] **Step 5: Final commit**

```bash
git add -A
git commit -m "chore(nanoclaw): remove dead env-var config references"
```
