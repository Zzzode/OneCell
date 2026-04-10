import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';

import { loadConfigFile, loadConfigFromArgv, resolveConfigPath } from './config-loader.js';

import type { ResolvedNanoclawConfig } from './nanoclaw-config.js';

const tempFiles: string[] = [];

function writeTempFile(filename: string, content: string): string {
  const filePath = path.join(os.tmpdir(), `nanoclaw-test-${Date.now()}-${filename}`);
  fs.writeFileSync(filePath, content, 'utf-8');
  tempFiles.push(filePath);
  return filePath;
}

afterAll(() => {
  for (const f of tempFiles) {
    try {
      fs.unlinkSync(f);
    } catch {
      // ignore cleanup errors
    }
  }
});

describe('resolveConfigPath', () => {
  it('returns the value after --config when provided', () => {
    const argv = ['node', 'script.js', '--config', '/custom/path/to/config.json'];
    expect(resolveConfigPath(argv)).toBe('/custom/path/to/config.json');
  });

  it('returns the value after --config with relative path', () => {
    const argv = ['node', 'script.js', '--config', './my-config.json'];
    expect(resolveConfigPath(argv)).toBe('./my-config.json');
  });

  it('returns default path when --config is not provided', () => {
    const argv = ['node', 'script.js'];
    const expected = path.join(process.cwd(), 'nanoclaw.config.json');
    expect(resolveConfigPath(argv)).toBe(expected);
  });

  it('returns default path when argv is empty', () => {
    const expected = path.join(process.cwd(), 'nanoclaw.config.json');
    expect(resolveConfigPath([])).toBe(expected);
  });

  it('picks the first --config when multiple are provided', () => {
    const argv = ['--config', 'first.json', '--config', 'second.json'];
    expect(resolveConfigPath(argv)).toBe('first.json');
  });
});

describe('loadConfigFile', () => {
  it('loads and parses a valid config file', () => {
    const configPath = writeTempFile(
      'valid.json',
      JSON.stringify({
        providers: {
          anthropic: { type: 'anthropic', apiKey: 'sk-test-key' },
        },
      }),
    );

    const resolved = loadConfigFile(configPath);

    expect(resolved.profile).toBe('terminal');
    expect(resolved.executionMode).toBe('edge');
    expect(resolved.edgeProvider.name).toBe('anthropic');
    expect(resolved.edgeProvider.apiKey).toBe('sk-test-key');
  });

  it('expands environment variables in loaded config', () => {
    process.env.NANOCLAW_LOADER_TEST_KEY = 'expanded-api-key';
    const configPath = writeTempFile(
      'envvar.json',
      JSON.stringify({
        providers: {
          anthropic: { type: 'anthropic', apiKey: '${NANOCLAW_LOADER_TEST_KEY}' },
        },
      }),
    );

    const resolved = loadConfigFile(configPath);
    expect(resolved.edgeProvider.apiKey).toBe('expanded-api-key');

    delete process.env.NANOCLAW_LOADER_TEST_KEY;
  });

  it('throws a descriptive error for missing file', () => {
    const missingPath = path.join(os.tmpdir(), `nanoclaw-missing-${Date.now()}.json`);
    expect(() => loadConfigFile(missingPath)).toThrow(/not found|does not exist|ENOENT|no such file/i);
  });

  it('throws a descriptive error for invalid JSON', () => {
    const configPath = writeTempFile('invalid.json', '{ not valid json }}}');
    expect(() => loadConfigFile(configPath)).toThrow(/JSON|parse/i);
  });

  it('throws a descriptive error for valid JSON that is not a valid config', () => {
    const configPath = writeTempFile('badconfig.json', JSON.stringify({ providers: {} }));
    expect(() => loadConfigFile(configPath)).toThrow(/at least one provider/i);
  });
});

describe('loadConfigFromArgv', () => {
  it('loads config from --config path', () => {
    const configPath = writeTempFile(
      'argv.json',
      JSON.stringify({
        providers: {
          anthropic: { type: 'anthropic', apiKey: 'sk-argv-test' },
        },
      }),
    );

    const argv = ['--config', configPath];
    const resolved = loadConfigFromArgv(argv);

    expect(resolved.edgeProvider.name).toBe('anthropic');
    expect(resolved.edgeProvider.apiKey).toBe('sk-argv-test');
  });

  it('loads config from default path when --config is not present', () => {
    // Write a config to the default path (cwd/nanoclaw.config.json)
    const defaultPath = path.join(process.cwd(), 'nanoclaw.config.json');
    fs.writeFileSync(
      defaultPath,
      JSON.stringify({
        providers: {
          anthropic: { type: 'anthropic', apiKey: 'sk-default-test' },
        },
      }),
      'utf-8',
    );
    tempFiles.push(defaultPath);

    try {
      const resolved = loadConfigFromArgv([]);
      expect(resolved.edgeProvider.apiKey).toBe('sk-default-test');
    } finally {
      // Cleanup default config
      try {
        fs.unlinkSync(defaultPath);
      } catch {
        // ignore
      }
    }
  });
});
