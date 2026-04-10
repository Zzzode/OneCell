import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { existsSync } from 'node:fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..', '..');

const presetBinary = join(root, 'build-release', 'edge');
const legacyBinary = join(root, 'build-edge', 'edge');

const _resolve = () => {
  if (process.env.EDGEJS_BIN) return process.env.EDGEJS_BIN;
  if (existsSync(presetBinary)) return presetBinary;
  if (existsSync(legacyBinary)) return legacyBinary;
  return presetBinary;
};

export const binaryPath = _resolve();
