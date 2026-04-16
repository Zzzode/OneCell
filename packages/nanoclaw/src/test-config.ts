import fs from 'fs';
import path from 'path';
import os from 'os';
import { initConfig } from './config/config.js';
import type { NanoclawConfigFile } from './config/nanoclaw-config.js';

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
  edge: { provider: 'testlocal' },
  container: { provider: 'testanthropic' },
};

let _testConfigPath: string | null = null;

export function initTestConfig(): string {
  _testConfigPath = path.join(
    os.tmpdir(),
    `nanoclaw-test-config-${process.pid}.json`,
  );
  fs.writeFileSync(_testConfigPath, JSON.stringify(TEST_CONFIG));
  initConfig(_testConfigPath);
  return _testConfigPath;
}

/**
 * Write the test config file and return its path, without calling initConfig().
 * Use this with freshly-imported config modules after vi.resetModules().
 * Accepts partial overrides to merge into the default TEST_CONFIG.
 */
export function writeTestConfigFile(
  overrides?: Partial<NanoclawConfigFile>,
): string {
  const configPath = path.join(
    os.tmpdir(),
    `nanoclaw-test-config-${process.pid}.json`,
  );
  const merged = overrides ? { ...TEST_CONFIG, ...overrides } : TEST_CONFIG;
  fs.writeFileSync(configPath, JSON.stringify(merged));
  return configPath;
}

export function cleanupTestConfig(): void {
  if (_testConfigPath) {
    try {
      fs.unlinkSync(_testConfigPath);
    } catch {}
    _testConfigPath = null;
  }
}
