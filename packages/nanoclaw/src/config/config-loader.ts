import * as fs from 'node:fs';
import * as path from 'node:path';

const DEFAULT_CONFIG_BASENAME = 'nanoclaw.config.json';
const TERMINAL_EXAMPLE_CONFIG_BASENAME =
  'nanoclaw.config.terminal.example.json';

import type { NanoclawConfigFile } from './nanoclaw-config.js';
import type { ResolvedNanoclawConfig } from './nanoclaw-config.js';
import { resolveConfig } from './nanoclaw-config.js';

/**
 * Parse `--config <path>` from an argv array. Returns the value after
 * `--config` if found, otherwise defaults to `nanoclaw.config.json` in the
 * current working directory.
 */
export function resolveConfigPath(argv: string[]): string {
  for (let i = 0; i < argv.length - 1; i++) {
    if (argv[i] === '--config') {
      return argv[i + 1]!;
    }
  }
  return path.join(process.cwd(), DEFAULT_CONFIG_BASENAME);
}

/**
 * Read a JSON config file from disk, parse it, and resolve it into a fully
 * validated `ResolvedNanoclawConfig`. Throws descriptive errors for missing
 * files, invalid JSON, or validation failures.
 */
export function renderStartupConfigError(
  error: unknown,
  configPath: string,
): string | null {
  const message = error instanceof Error ? error.message : String(error);
  const isMissingConfig =
    message.startsWith('Config file not found:') &&
    path.basename(configPath) === DEFAULT_CONFIG_BASENAME;

  if (!isMissingConfig) {
    return null;
  }

  return [
    `缺少配置文件：${DEFAULT_CONFIG_BASENAME}`,
    `cp ${TERMINAL_EXAMPLE_CONFIG_BASENAME} ${DEFAULT_CONFIG_BASENAME} 后填入 API key，或 --config ${TERMINAL_EXAMPLE_CONFIG_BASENAME}`,
  ].join('\n');
}

export function loadConfigFile(configPath: string): ResolvedNanoclawConfig {
  let raw: string;
  try {
    raw = fs.readFileSync(configPath, 'utf-8');
  } catch (err: unknown) {
    if (
      err instanceof Error &&
      'code' in err &&
      (err as NodeJS.ErrnoException).code === 'ENOENT'
    ) {
      throw new Error(`Config file not found: ${configPath}`, { cause: err });
    }
    throw err;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (parseError: unknown) {
    throw new Error(`Failed to parse config file as JSON: ${configPath}`, { cause: parseError });
  }

  return resolveConfig(parsed as NanoclawConfigFile);
}

/**
 * Convenience wrapper: resolve the config path from argv, then load the file.
 */
export function loadConfigFromArgv(argv: string[]): ResolvedNanoclawConfig {
  const configPath = resolveConfigPath(argv);
  return loadConfigFile(configPath);
}
