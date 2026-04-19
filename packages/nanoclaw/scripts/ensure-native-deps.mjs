import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire(import.meta.url);

function loadBetterSqlite3() {
  const Database = require('better-sqlite3');
  const db = new Database(':memory:');
  db.close();
}

function rebuildBetterSqlite3(packageDir) {
  console.warn(
    '[nanoclaw] better-sqlite3 bindings are missing or incompatible; rebuilding native module...',
  );

  execFileSync('pnpm', ['--dir', packageDir, 'run', 'install'], {
    stdio: 'inherit',
  });
}

function isRecoverableNativeError(error) {
  if (!(error instanceof Error)) {
    return false;
  }

  return [
    'Could not locate the bindings file',
    'was compiled against a different Node.js version',
    'Cannot find module',
    '.node',
  ].some((fragment) => error.message.includes(fragment));
}

function main() {
  let packageJsonPath;
  try {
    packageJsonPath = require.resolve('better-sqlite3/package.json');
  } catch (error) {
    throw new Error(
      '[nanoclaw] better-sqlite3 is not installed. Run `pnpm install` in the repository root.',
      { cause: error },
    );
  }

  try {
    loadBetterSqlite3();
    return;
  } catch (error) {
    if (!isRecoverableNativeError(error)) {
      throw error;
    }
  }

  rebuildBetterSqlite3(path.dirname(packageJsonPath));
  loadBetterSqlite3();
}

main();
