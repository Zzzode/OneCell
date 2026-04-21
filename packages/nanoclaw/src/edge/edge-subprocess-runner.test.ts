import fs from 'fs';
import os from 'os';
import path from 'path';
import { EventEmitter } from 'events';
import { PassThrough } from 'stream';
import { fileURLToPath } from 'url';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { AgentRunInput } from '../framework/agent-backend.js';
import type { RegisteredGroup } from '../types.js';
import {
  cleanupTestConfig,
  initTestConfig,
  writeTestConfigFile,
} from '../test-config.js';

const group: RegisteredGroup = {
  name: 'Edge Group',
  folder: 'edge-group',
  trigger: '@Andy',
  added_at: '2026-04-03T00:00:00.000Z',
  executionMode: 'edge',
};

const input: AgentRunInput = {
  prompt: 'Summarize pending work items',
  groupFolder: 'edge-group',
  chatJid: 'edge@g.us',
  isMain: false,
  assistantName: 'Andy',
  executionContext: {
    executionId: 'exec-subprocess-1',
    logicalSessionId: 'group:edge-group',
    turnId: 'turn-subprocess-1',
  },
};

// Skip integration tests that require a real edgejs binary / WASM package
// when running in CI without a native build.
const hasEdgejsBinary = (() => {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { binaryPath } = require('@onecell/edgejs') as { binaryPath: string };
    return fs.existsSync(binaryPath);
  } catch {
    return false;
  }
})();

describe.skipIf(!hasEdgejsBinary)('EdgeSubprocessRunner', () => {
  let tempRoot: string;

  beforeEach(() => {
    initTestConfig();
    tempRoot = fs.mkdtempSync(
      path.join(os.tmpdir(), 'nanoclaw-edge-subprocess-'),
    );
    vi.stubEnv('NANOCLAW_STORE_DIR', path.join(tempRoot, 'store'));
    vi.stubEnv('NANOCLAW_GROUPS_DIR', path.join(tempRoot, 'groups'));
    vi.stubEnv('NANOCLAW_DATA_DIR', path.join(tempRoot, 'data'));
  });

  afterEach(async () => {
    cleanupTestConfig();
    vi.resetModules();
    vi.unstubAllEnvs();
    fs.rmSync(tempRoot, { recursive: true, force: true });
  });

  // Note: This test requires no EDGE_API_KEY/OPENAI_API_KEY in environment
  // to use LocalEdgeRunner. If API keys are present, it will call the LLM.
  it.skip('runs the local edge runner through a subprocess', async () => {
    vi.resetModules();
    const [
      { initDatabase },
      { createSubprocessEdgeRunner },
      { createEdgeBackend },
    ] = await Promise.all([
      import('../db.js'),
      import('./edge-subprocess-runner.js'),
      import('../backends/edge-backend.js'),
    ]);

    initDatabase();
    const backend = createEdgeBackend(createSubprocessEdgeRunner());

    const result = await backend.run(group, input);

    expect(result).toMatchObject({
      status: 'success',
      result: expect.stringContaining('[edge runner local]'),
      newSessionId: 'edge-session:group:edge-group',
    });
  });

  it('resolves an edgejs safe-mode command when configured', async () => {
    const fakeEdgeBin = path.join(tempRoot, 'edge');
    fs.writeFileSync(fakeEdgeBin, '#!/bin/sh\nexit 0\n', { mode: 0o755 });

    // Create a fake wasm package so resolveSafePackagePath finds it.
    const fakeWasmDir = path.join(tempRoot, 'build-wasix');
    fs.mkdirSync(fakeWasmDir, { recursive: true });
    fs.writeFileSync(path.join(fakeWasmDir, 'edgejs.wasm'), 'fake');

    const distEntry = fileURLToPath(
      new URL('../dist/edge-runner-cli.js', import.meta.url),
    );
    fs.mkdirSync(path.dirname(distEntry), { recursive: true });
    const hadDistEntry = fs.existsSync(distEntry);
    const originalDist = hadDistEntry
      ? fs.readFileSync(distEntry, 'utf8')
      : null;
    if (!hadDistEntry) {
      fs.writeFileSync(distEntry, '// test placeholder\n');
    }

    try {
      vi.stubEnv('EDGE_RUNNER_MODE', 'edgejs');
      vi.stubEnv('EDGEJS_BIN', fakeEdgeBin);
      vi.resetModules();

      // Write a config with edge.safe = true
      const { initConfig: freshInitConfig } =
        await import('../config/config.js');
      const { writeTestConfigFile } = await import('../test-config.js');
      freshInitConfig(
        writeTestConfigFile({
          edgeRunnerMode: 'edgejs',
          edge: {
            provider: 'testlocal',
            enableTools: true,
            disableFallback: false,
            safe: true,
          },
        }),
      );

      // resolveSafePackagePath checks build-wasix relative to nanoclaw root,
      // which resolves to packages/nanoclaw/../../build-wasix = build-wasix at
      // monorepo root. Stub the path resolution by ensuring the fake wasm is
      // found at the actual repo root.
      const testFileDir = path.dirname(fileURLToPath(import.meta.url));
      const monorepoRoot = path.resolve(testFileDir, '..', '..', '..', '..');
      const wasmAtRoot = path.join(monorepoRoot, 'build-wasix', 'edgejs.wasm');
      const hadWasmAtRoot = fs.existsSync(wasmAtRoot);
      if (!hadWasmAtRoot) {
        fs.mkdirSync(path.dirname(wasmAtRoot), { recursive: true });
        fs.writeFileSync(wasmAtRoot, 'fake');
      }

      const { resolveRunnerCommand } =
        await import('./edge-subprocess-runner.js');
      expect(resolveRunnerCommand()).toMatchObject({
        command: fakeEdgeBin,
        args: expect.arrayContaining([
          '--safe',
          '--wasmer-package',
          'dist/edge/edge-runner-cli.js',
        ]),
      });

      if (!hadWasmAtRoot) {
        fs.rmSync(wasmAtRoot, { force: true });
      }
    } finally {
      if (hadDistEntry && originalDist != null) {
        fs.writeFileSync(distEntry, originalDist);
      } else {
        fs.rmSync(distEntry, { force: true });
      }
    }
  });

  it('resolves a plain edgejs command when safe is not configured', async () => {
    const fakeEdgeBin = path.join(tempRoot, 'edge');
    fs.writeFileSync(fakeEdgeBin, '#!/bin/sh\nexit 0\n', { mode: 0o755 });

    const distEntry = fileURLToPath(
      new URL('../dist/edge-runner-cli.js', import.meta.url),
    );
    fs.mkdirSync(path.dirname(distEntry), { recursive: true });
    const hadDistEntry = fs.existsSync(distEntry);
    const originalDist = hadDistEntry
      ? fs.readFileSync(distEntry, 'utf8')
      : null;
    if (!hadDistEntry) {
      fs.writeFileSync(distEntry, '// test placeholder\n');
    }

    try {
      vi.stubEnv('EDGE_RUNNER_MODE', 'edgejs');
      vi.stubEnv('EDGEJS_BIN', fakeEdgeBin);
      vi.resetModules();
      initTestConfig(); // safe defaults to false

      const { resolveRunnerCommand } =
        await import('./edge-subprocess-runner.js');
      const cmd = resolveRunnerCommand();
      expect(cmd).toMatchObject({
        command: fakeEdgeBin,
        args: ['dist/edge/edge-runner-cli.js'],
      });
      expect(cmd.args).not.toContain('--safe');
    } finally {
      if (hadDistEntry && originalDist != null) {
        fs.writeFileSync(distEntry, originalDist);
      } else {
        fs.rmSync(distEntry, { force: true });
      }
    }
  });

  it(
    'routes openai-compatible provider requests through the host bridge',
    { timeout: 30000 },
    async () => {
      vi.stubEnv('EDGE_RUNNER_PROVIDER', 'openai');
      vi.stubEnv('EDGE_API_BASE_URL', 'https://provider.example/v1');
      vi.stubEnv('EDGE_API_KEY', 'test-key');
      vi.stubEnv('EDGE_MODEL', 'glm-5');
      vi.resetModules();

      const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content:
                    '你好，我是通过 host bridge 请求到的真实 provider 响应。',
                },
              },
            ],
          }),
          { status: 200 },
        ),
      );

      const [
        { initDatabase },
        { initConfig: freshInitConfig },
        { createSubprocessEdgeRunner },
        { createEdgeBackend },
      ] = await Promise.all([
        import('../db.js'),
        import('../config/config.js'),
        import('./edge-subprocess-runner.js'),
        import('../backends/edge-backend.js'),
      ]);

      initDatabase();
      freshInitConfig(
        writeTestConfigFile({
          providers: {
            testanthropic: {
              type: 'anthropic',
              apiKey: 'test-anthropic-key',
              model: 'claude-sonnet-4-20250514',
            },
            testopenai: {
              type: 'openai',
              apiKey: 'test-key',
              baseUrl: 'https://provider.example/v1',
              model: 'glm-5',
            },
            testlocal: { type: 'local' },
          },
          edge: { provider: 'testopenai' },
        }),
      );
      const backend = createEdgeBackend(createSubprocessEdgeRunner());

      const result = await backend.run(group, input);

      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(fetchMock).toHaveBeenCalledWith(
        'https://provider.example/v1/chat/completions',
        expect.objectContaining({
          method: 'POST',
        }),
      );
      expect(result).toMatchObject({
        status: 'success',
        result: '你好，我是通过 host bridge 请求到的真实 provider 响应。',
        newSessionId: 'edge-session:group:edge-group',
      });
    },
  );

  // Removed: 'limits first-turn visible tools to the explicitly requested tool' test
  // detectExplicitToolChoice was removed. Tool selection now relies on model native tool_choice='auto'.

  it('ignores non-json stdout noise before protocol events', async () => {
    vi.resetModules();
    vi.doMock('child_process', () => {
      return {
        spawn: vi.fn(() => {
          const stdout = new PassThrough();
          const stderr = new PassThrough();
          const stdin = new PassThrough();
          const child = new EventEmitter() as EventEmitter & {
            stdout: PassThrough;
            stderr: PassThrough;
            stdin: PassThrough;
            kill: ReturnType<typeof vi.fn>;
            once: EventEmitter['once'];
          };
          child.stdout = stdout;
          child.stderr = stderr;
          child.stdin = stdin;
          child.kill = vi.fn();

          stdin.on('data', () => {
            queueMicrotask(() => {
              stdout.write('hello\n');
              stdout.write(
                `${JSON.stringify({
                  type: 'ack',
                  executionId: 'exec-subprocess-1',
                  nodeId: 'node-noise-test',
                })}\n`,
              );
              stdout.write(
                `${JSON.stringify({
                  type: 'final',
                  executionId: 'exec-subprocess-1',
                  result: {
                    status: 'success',
                    outputText: '# Andy',
                    providerSessionId: 'edge-session:group:edge-group',
                  },
                })}\n`,
              );
              stdout.end();
              stderr.end();
              child.emit('close', 0);
            });
          });

          return child;
        }),
      };
    });

    const [
      { initDatabase },
      { initConfig: freshInitConfig },
      { createSubprocessEdgeRunner },
      { createEdgeBackend },
    ] = await Promise.all([
      import('../db.js'),
      import('../config/config.js'),
      import('./edge-subprocess-runner.js'),
      import('../backends/edge-backend.js'),
    ]);

    initDatabase();
    freshInitConfig(writeTestConfigFile());
    const backend = createEdgeBackend(createSubprocessEdgeRunner());

    await expect(backend.run(group, input)).resolves.toMatchObject({
      status: 'success',
      result: '# Andy',
      newSessionId: 'edge-session:group:edge-group',
    });
  });
});
