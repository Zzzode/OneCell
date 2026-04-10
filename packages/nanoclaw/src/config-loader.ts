import * as fs from 'node:fs';
import * as path from 'node:path';

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
  return path.join(process.cwd(), 'nanoclaw.config.json');
}

/**
 * Read a JSON config file from disk, parse it, and resolve it into a fully
 * validated `ResolvedNanoclawConfig`. Throws descriptive errors for missing
 * files, invalid JSON, or validation failures.
 */
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
      throw new Error(`Config file not found: ${configPath}`);
    }
    throw err;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`Failed to parse config file as JSON: ${configPath}`);
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
