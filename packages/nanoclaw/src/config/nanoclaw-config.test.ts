import { describe, expect, it } from 'vitest';

import {
  expandEnvVars,
  resolveConfig,
  validateConfigFile,
} from './nanoclaw-config.js';

import type { NanoclawConfigFile } from './nanoclaw-config.js';

describe('expandEnvVars', () => {
  it('replaces ${VAR} with the environment variable value', () => {
    process.env.NANOCLAW_TEST_VAR = 'hello';
    expect(expandEnvVars('${NANOCLAW_TEST_VAR}')).toBe('hello');
    delete process.env.NANOCLAW_TEST_VAR;
  });

  it('returns empty string for missing environment variables', () => {
    delete process.env.NANOCLAW_MISSING_VAR;
    expect(expandEnvVars('${NANOCLAW_MISSING_VAR}')).toBe('');
  });

  it('leaves plain text unchanged', () => {
    expect(expandEnvVars('just some text')).toBe('just some text');
  });

  it('handles mixed text and variables', () => {
    process.env.NANOCLAW_TEST_PREFIX = 'myapp';
    expect(expandEnvVars('prefix-${NANOCLAW_TEST_PREFIX}-suffix')).toBe(
      'prefix-myapp-suffix',
    );
    delete process.env.NANOCLAW_TEST_PREFIX;
  });

  it('handles multiple variables in one string', () => {
    process.env.NANOCLAW_HOST = 'example.com';
    process.env.NANOCLAW_PORT = '8080';
    expect(expandEnvVars('${NANOCLAW_HOST}:${NANOCLAW_PORT}')).toBe(
      'example.com:8080',
    );
    delete process.env.NANOCLAW_HOST;
    delete process.env.NANOCLAW_PORT;
  });
});

describe('validateConfigFile', () => {
  it('accepts a valid minimal config', () => {
    const config: NanoclawConfigFile = {
      providers: {
        anthropic: { type: 'anthropic', apiKey: 'sk-test' },
      },
    };
    expect(() => validateConfigFile(config)).not.toThrow();
  });

  it('accepts a valid config with multiple providers', () => {
    const config: NanoclawConfigFile = {
      providers: {
        anthropic: { type: 'anthropic', apiKey: 'sk-test' },
        openai: { type: 'openai', apiKey: 'sk-openai', model: 'gpt-4' },
        local: { type: 'local' },
      },
    };
    expect(() => validateConfigFile(config)).not.toThrow();
  });

  it('rejects config with no providers', () => {
    const config = { providers: {} } as NanoclawConfigFile;
    expect(() => validateConfigFile(config)).toThrow(/at least one provider/i);
  });

  it('rejects anthropic provider without apiKey', () => {
    const config: NanoclawConfigFile = {
      providers: {
        anthropic: { type: 'anthropic' },
      },
    };
    expect(() => validateConfigFile(config)).toThrow(/apiKey/i);
  });

  it('rejects openai provider without apiKey', () => {
    const config: NanoclawConfigFile = {
      providers: {
        openai: { type: 'openai', model: 'gpt-4' },
      },
    };
    expect(() => validateConfigFile(config)).toThrow(/apiKey/i);
  });

  it('rejects openai provider without model', () => {
    const config: NanoclawConfigFile = {
      providers: {
        openai: { type: 'openai', apiKey: 'sk-test' },
      },
    };
    expect(() => validateConfigFile(config)).toThrow(/model/i);
  });

  it('accepts local provider without apiKey or model', () => {
    const config: NanoclawConfigFile = {
      providers: {
        local: { type: 'local' },
      },
    };
    expect(() => validateConfigFile(config)).not.toThrow();
  });

  it('rejects edge.provider referencing non-existent provider', () => {
    const config: NanoclawConfigFile = {
      providers: {
        anthropic: { type: 'anthropic', apiKey: 'sk-test' },
      },
      edge: { provider: 'nonexistent' },
    };
    expect(() => validateConfigFile(config)).toThrow(
      /edge\.provider.*nonexistent/i,
    );
  });

  it('rejects container.provider referencing non-existent provider', () => {
    const config: NanoclawConfigFile = {
      providers: {
        anthropic: { type: 'anthropic', apiKey: 'sk-test' },
      },
      container: { provider: 'nonexistent' },
    };
    expect(() => validateConfigFile(config)).toThrow(
      /container\.provider.*nonexistent/i,
    );
  });

  it('rejects container.provider that is not anthropic type', () => {
    const config: NanoclawConfigFile = {
      providers: {
        openai: { type: 'openai', apiKey: 'sk-test', model: 'gpt-4' },
      },
      container: { provider: 'openai' },
    };
    expect(() => validateConfigFile(config)).toThrow(
      /container\.provider.*anthropic/i,
    );
  });
});

describe('resolveConfig', () => {
  it('applies all defaults for a minimal config', () => {
    const config: NanoclawConfigFile = {
      providers: {
        myanthropic: { type: 'anthropic', apiKey: 'sk-test' },
      },
    };
    const resolved = resolveConfig(config);
    expect(resolved.profile).toBe('terminal');
    expect(resolved.executionMode).toBe('edge');
    expect(resolved.edgeRunnerMode).toBe('edgejs');
    expect(resolved.edge.enableTools).toBe(true);
    expect(resolved.edge.disableFallback).toBe(false);
    expect(resolved.container.maxConcurrent).toBe(5);
  });

  it('resolves edge and container providers to first anthropic when not specified', () => {
    const config: NanoclawConfigFile = {
      providers: {
        local: { type: 'local' },
        myanthropic: { type: 'anthropic', apiKey: 'sk-test' },
        openai: { type: 'openai', apiKey: 'sk-openai', model: 'gpt-4' },
      },
    };
    const resolved = resolveConfig(config);
    expect(resolved.edgeProvider.name).toBe('myanthropic');
    expect(resolved.edgeProvider.type).toBe('anthropic');
    expect(resolved.containerProvider.name).toBe('myanthropic');
    expect(resolved.containerProvider.type).toBe('anthropic');
  });

  it('uses explicitly specified edge and container providers', () => {
    const config: NanoclawConfigFile = {
      providers: {
        anthropic1: { type: 'anthropic', apiKey: 'sk-1' },
        anthropic2: { type: 'anthropic', apiKey: 'sk-2' },
      },
      edge: { provider: 'anthropic1' },
      container: { provider: 'anthropic2' },
    };
    const resolved = resolveConfig(config);
    expect(resolved.edgeProvider.name).toBe('anthropic1');
    expect(resolved.containerProvider.name).toBe('anthropic2');
  });

  it('expands env vars in apiKeys', () => {
    process.env.NANOCLAW_API_KEY = 'resolved-key';
    const config: NanoclawConfigFile = {
      providers: {
        anthropic: {
          type: 'anthropic',
          apiKey: '${NANOCLAW_API_KEY}',
        },
      },
    };
    const resolved = resolveConfig(config);
    expect(resolved.providers.anthropic.apiKey).toBe('resolved-key');
    expect(resolved.edgeProvider.apiKey).toBe('resolved-key');
    delete process.env.NANOCLAW_API_KEY;
  });

  it('respects explicitly set profile, executionMode, and edgeRunnerMode', () => {
    const config: NanoclawConfigFile = {
      profile: 'claw',
      executionMode: 'container',
      edgeRunnerMode: 'node',
      providers: {
        anthropic: { type: 'anthropic', apiKey: 'sk-test' },
      },
    };
    const resolved = resolveConfig(config);
    expect(resolved.profile).toBe('claw');
    expect(resolved.executionMode).toBe('container');
    expect(resolved.edgeRunnerMode).toBe('node');
  });

  it('respects explicitly set edge and container options', () => {
    const config: NanoclawConfigFile = {
      providers: {
        anthropic: { type: 'anthropic', apiKey: 'sk-test' },
      },
      edge: {
        enableTools: false,
        disableFallback: true,
        provider: 'anthropic',
      },
      container: { maxConcurrent: 10, provider: 'anthropic' },
    };
    const resolved = resolveConfig(config);
    expect(resolved.edge.enableTools).toBe(false);
    expect(resolved.edge.disableFallback).toBe(true);
    expect(resolved.container.maxConcurrent).toBe(10);
  });

  it('includes all providers in resolved providers map with expanded env vars', () => {
    process.env.NANOCLAW_OPENAI_KEY = 'openai-resolved';
    const config: NanoclawConfigFile = {
      providers: {
        anthropic: { type: 'anthropic', apiKey: 'sk-ant' },
        openai: {
          type: 'openai',
          apiKey: '${NANOCLAW_OPENAI_KEY}',
          model: 'gpt-4',
        },
        local: { type: 'local', baseUrl: 'http://localhost:1234' },
      },
    };
    const resolved = resolveConfig(config);
    expect(Object.keys(resolved.providers)).toHaveLength(3);
    expect(resolved.providers.anthropic.apiKey).toBe('sk-ant');
    expect(resolved.providers.openai.apiKey).toBe('openai-resolved');
    expect(resolved.providers.local.baseUrl).toBe('http://localhost:1234');
    delete process.env.NANOCLAW_OPENAI_KEY;
  });

  it('expands env vars in baseUrl as well', () => {
    process.env.NANOCLAW_BASE = 'https://api.example.com';
    const config: NanoclawConfigFile = {
      providers: {
        anthropic: {
          type: 'anthropic',
          apiKey: 'sk-test',
          baseUrl: '${NANOCLAW_BASE}/v1',
        },
      },
    };
    const resolved = resolveConfig(config);
    expect(resolved.providers.anthropic.baseUrl).toBe(
      'https://api.example.com/v1',
    );
    delete process.env.NANOCLAW_BASE;
  });

  it('throws on invalid config', () => {
    const config = { providers: {} } as NanoclawConfigFile;
    expect(() => resolveConfig(config)).toThrow();
  });
});
