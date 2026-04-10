#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import process from 'node:process';

function usage() {
  console.error(
      'Usage: capture-edge-startup-profile.mjs <json-out> <markdown-out> <command>');
  process.exit(1);
}

function extractProfileJson(stderr) {
  const candidates = stderr
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.startsWith('{') && line.includes('"bootstrap_profile"'));
  return candidates.length === 0 ? null : candidates[candidates.length - 1];
}

function formatValue(value) {
  if (typeof value !== 'number') return String(value);
  if (Number.isInteger(value)) return String(value);
  return value.toFixed(3);
}

function renderMarkdown(command, profile) {
  if (profile.enabled === false) {
    return [
      '# Edge Startup Profile',
      '',
      `Command: \`${command}\``,
      '',
      'Startup profiling is unavailable in this binary.',
      '',
      'Build with `-DEDGE_ENABLE_STARTUP_PROFILE=ON` to embed the internal profiler.',
      '',
    ].join('\n');
  }
  const rows = Object.entries(profile).map(
      ([key, value]) => `| \`${key}\` | ${formatValue(value)} |`);
  return [
    '# Edge Startup Profile',
    '',
    `Command: \`${command}\``,
    '',
    '| Metric | Value |',
    '| --- | ---: |',
    ...rows,
    '',
  ].join('\n');
}

async function main() {
  const [, , jsonOut, markdownOut, command] = process.argv;
  if (!jsonOut || !markdownOut || !command) usage();

  const result = spawnSync(command, {
    shell: true,
    encoding: 'utf8',
    env: {
      ...process.env,
      EDGE_STARTUP_PROFILE: '1',
    },
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    if (result.stdout) process.stdout.write(result.stdout);
    if (result.stderr) process.stderr.write(result.stderr);
    process.exit(result.status ?? 1);
  }

  const profileLine = extractProfileJson(result.stderr ?? '');
  const profile = profileLine == null ?
    {
      enabled: false,
      reason: 'binary built without EDGE_ENABLE_STARTUP_PROFILE',
    } :
    JSON.parse(profileLine);

  await writeFile(jsonOut, `${JSON.stringify(profile, null, 2)}\n`);
  await writeFile(markdownOut, renderMarkdown(command, profile));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
