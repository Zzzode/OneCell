import { TERMINAL_GROUP_JID } from './config.js';
import {
  getTerminalTurnState,
  type TerminalTimelineEntry,
  type TerminalTurnState,
  type TerminalWorkerState,
} from './terminal-observability.js';

export interface TerminalPanelTranscriptEntry {
  at: string;
  role: 'user' | 'assistant' | 'system';
  text: string;
}

interface TerminalFeedEntry {
  at: string;
  role: 'user' | 'assistant' | 'system' | 'step';
  text: string;
}

const ANSI_RESET = '\x1b[0m';
const ANSI_DIM = '\x1b[90m';
const ANSI_TEXT = '\x1b[37m';
const ANSI_ACCENT = '\x1b[38;5;111m';
const ANSI_BORDER = '\x1b[38;5;240m';
const ANSI_SUCCESS = '\x1b[38;5;114m';
const ANSI_WARNING = '\x1b[38;5;179m';
const ANSI_DANGER = '\x1b[38;5;174m';

function tone(text: string, color: string): string {
  return `${color}${text}${ANSI_RESET}`;
}

function rule(width: number): string {
  return tone('─'.repeat(Math.max(1, width)), ANSI_BORDER);
}

function sectionTitle(title: string): string {
  return tone(title, ANSI_ACCENT);
}

function sidePanelTitle(tab: string): string {
  switch (tab) {
    case 'turn':
      return 'Details · Turn';
    case 'agents':
      return 'Details · Agents';
    case 'graph':
      return 'Details · Graph';
    case 'tasks':
      return 'Details · Tasks';
    default:
      return 'Details';
  }
}

function drawerTitle(tab: string): string {
  return tab === 'logs' ? 'Logs' : 'Drawer';
}

function overlayTitle(kind: string): string {
  switch (kind) {
    case 'help':
      return 'Help';
    case 'focus':
      return 'Focus';
    case 'system':
      return 'System';
    case 'session':
      return 'Session';
    case 'retry-container':
      return 'Retry';
    case 'interrupt':
      return 'Interrupt';
    default:
      return 'Overlay';
  }
}

const DEFAULT_WIDTH = 100;
const DEFAULT_HEIGHT = 28;
const MIN_WIDTH = 48;
const COLUMN_BREAKPOINT = 140;
const COLUMN_GAP = 3;

function stripAnsi(value: string): string {
  return value.replace(/\x1b\[[0-9;]*m/g, '');
}

function clampText(value: string, width: number): string {
  if (width <= 0) return '';
  if (value.length <= width) return value;
  if (width === 1) return value.slice(0, 1);
  return `${value.slice(0, width - 3)}...`;
}

function padRight(value: string, width: number): string {
  const trimmed = clampText(value, width);
  if (trimmed.length >= width) return trimmed;
  return `${trimmed}${' '.repeat(width - trimmed.length)}`;
}

function wrapText(value: string, width: number, maxLines: number): string[] {
  const normalized = value.replace(/\s+/g, ' ').trim();
  if (!normalized) return [];
  if (width <= 8) return [clampText(normalized, Math.max(1, width))];

  const words = normalized.split(' ');
  const lines: string[] = [];
  let current = '';

  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length <= width) {
      current = next;
      continue;
    }
    if (current) {
      lines.push(current);
      if (lines.length >= maxLines) {
        return finalizeWrappedLines(lines, width, normalized);
      }
    }
    if (word.length > width) {
      lines.push(clampText(word, width));
      current = '';
      if (lines.length >= maxLines) {
        return finalizeWrappedLines(lines, width, normalized);
      }
      continue;
    }
    current = word;
  }

  if (current) {
    lines.push(current);
  }

  return finalizeWrappedLines(lines, width, normalized);
}

function finalizeWrappedLines(
  lines: string[],
  width: number,
  original: string,
): string[] {
  if (lines.length === 0) return [];
  const joined = lines.join(' ');
  if (joined.length >= original.length) {
    return lines;
  }
  const copy = [...lines];
  const last = copy[copy.length - 1] || '';
  copy[copy.length - 1] = clampText(`${last} ...`, width);
  return copy;
}

function shortTime(value: string): string {
  return new Date(value).toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

function elapsedSince(value: string | null, now = Date.now()): string {
  if (!value) return 'n/a';
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return 'n/a';
  const ms = Math.max(0, now - parsed);
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${Math.floor(ms / 1000)}s`;
  return `${Math.floor(ms / 60_000)}m`;
}

function pushUnique(lines: string[], line: string | null | undefined): void {
  const normalized = line?.trim();
  if (!normalized) return;
  if (!lines.includes(normalized)) {
    lines.push(normalized);
  }
}

function readableStatus(
  status: TerminalWorkerState['status'] | TerminalTurnState['status'],
): string {
  switch (status) {
    case 'running':
      return 'running';
    case 'completed':
      return 'done';
    case 'failed':
      return 'failed';
    case 'pending':
      return 'pending';
    default:
      return 'idle';
  }
}

function workerSortRank(key: string): number {
  if (key === 'root') return 0;
  if (key === 'planner') return 1;
  const workerMatch = key.match(/^worker-(\d+)$/);
  if (workerMatch) return 10 + Number.parseInt(workerMatch[1] || '0', 10);
  if (key === 'aggregate') return 100;
  return 200;
}

function sortedWorkers(turn: TerminalTurnState): TerminalWorkerState[] {
  return [...turn.workers.values()].sort((left, right) => {
    const rankDiff = workerSortRank(left.key) - workerSortRank(right.key);
    if (rankDiff !== 0) return rankDiff;
    return left.label.localeCompare(right.label);
  });
}

function formatBackend(worker: TerminalWorkerState): string {
  return `${worker.backendId ?? 'unknown'}/${worker.workerClass ?? 'unknown'}`;
}

function buildFocusTimeline(
  turn: TerminalTurnState,
  focusKey: string,
  maxLines: number,
): TerminalTimelineEntry[] {
  const filtered =
    focusKey === 'root'
      ? turn.timeline
      : turn.timeline.filter(
          (entry) => entry.targetKey === focusKey || entry.targetKey === 'root',
        );
  return filtered.slice(-maxLines);
}

function statusTag(
  status: TerminalWorkerState['status'] | TerminalTurnState['status'],
): string {
  switch (status) {
    case 'running':
      return '[run]';
    case 'completed':
      return '[done]';
    case 'failed':
      return '[fail]';
    case 'pending':
      return '[wait]';
    default:
      return '[idle]';
  }
}

function section(
  title: string,
  lines: string[],
  width: number,
  maxWrapLines = 2,
  preserveSpacing = false,
): string[] {
  const body = lines.length > 0 ? lines : [tone('empty', ANSI_DIM)];
  const output = [sectionTitle(title)];
  for (const line of body) {
    const wrapped = preserveSpacing
      ? [clampText(line, width)]
      : line.includes('\n')
        ? line
            .split('\n')
            .flatMap((segment) => wrapText(segment, width, maxWrapLines))
        : wrapText(line, width, maxWrapLines);
    if (wrapped.length === 0) {
      output.push('');
      continue;
    }
    for (const wrappedLine of wrapped) {
      output.push(clampText(wrappedLine, width));
    }
  }
  output.push('');
  return output;
}

function mergeColumns(
  left: string[],
  right: string[],
  totalWidth: number,
): string[] {
  if (totalWidth < COLUMN_BREAKPOINT) {
    return [...left, ...right];
  }

  const leftWidth = Math.max(52, Math.floor((totalWidth - COLUMN_GAP) * 0.58));
  const rightWidth = Math.max(24, totalWidth - leftWidth - COLUMN_GAP);
  const maxLines = Math.max(left.length, right.length);
  const merged: string[] = [];

  for (let index = 0; index < maxLines; index += 1) {
    const leftLine = left[index] ?? '';
    const rightLine = right[index] ?? '';
    merged.push(
      `${padRight(leftLine, leftWidth)}${' '.repeat(COLUMN_GAP)}${clampText(rightLine, rightWidth)}`,
    );
  }

  return merged;
}

function buildOverviewLines(
  turn: TerminalTurnState,
  focus: TerminalWorkerState | null,
  busy: boolean,
): string[] {
  const lines = [
    `Now: ${busy ? 'thinking' : readableStatus(turn.status)}`,
    `Selected: ${focus?.label ?? 'root'} (${readableStatus(focus?.status ?? turn.status)})`,
    `Stage: ${turn.stage}`,
    `Doing: ${focus?.lastActivity ?? turn.lastActivity ?? 'waiting'}`,
  ];
  if (focus?.error ?? turn.error) {
    lines.push(`Error: ${focus?.error ?? turn.error}`);
  } else if (focus?.summary && turn.status === 'completed') {
    lines.push(`Result: ${focus.summary}`);
  }
  return lines;
}

function isNoisyStep(text: string): boolean {
  return /heartbeat/i.test(text);
}

function isFailureLike(value: string | null | undefined): boolean {
  return /失败|错误|异常|降级|fallback|failed|error|timeout|stale|warning|unhealthy|retry/i.test(
    value ?? '',
  );
}

function buildFailureLines(
  turn: TerminalTurnState,
  focus: TerminalWorkerState | null,
  latestSystemEvent: string | null | undefined,
): string[] {
  const lines: string[] = [];
  pushUnique(
    lines,
    (focus?.error ?? turn.error)
      ? tone(`Error: ${focus?.error ?? turn.error}`, ANSI_DANGER)
      : null,
  );
  if (turn.fallback) {
    pushUnique(
      lines,
      tone(
        `Retry available: ${turn.fallback.fromBackend ?? 'edge'} → ${turn.fallback.toBackend ?? 'container'} · ${turn.fallback.reason}`,
        ANSI_WARNING,
      ),
    );
    pushUnique(
      lines,
      turn.fallback.detail ? `Detail: ${turn.fallback.detail}` : null,
    );
  }
  if (turn.status === 'failed' && !turn.error && !turn.fallback) {
    pushUnique(lines, `Turn failed during stage: ${turn.stage}`);
  }
  if (isFailureLike(latestSystemEvent)) {
    pushUnique(lines, latestSystemEvent);
  }
  return lines;
}

function buildAgentLines(
  turn: TerminalTurnState,
  workers: TerminalWorkerState[],
  width: number,
  height: number,
): string[] {
  const maxAgents = height < 28 ? 6 : 10;
  const now = Date.now();
  const lines = workers.slice(0, maxAgents).map((worker) => {
    const focused = worker.key === turn.focusKey;
    const marker = focused ? tone('›', ANSI_ACCENT) : tone('·', ANSI_DIM);
    const status = readableStatus(worker.status).padEnd(7);
    const elapsed = elapsedSince(
      worker.startedAt ?? worker.updatedAt,
      now,
    ).padStart(4);
    const summary = worker.lastActivity ?? worker.summary ?? 'waiting';
    const line = `${marker} ${worker.label.padEnd(10)} ${status} ${elapsed} ${summary}`;
    return focused
      ? tone(clampText(line, width), ANSI_TEXT)
      : clampText(line, width);
  });

  if (workers.length > maxAgents) {
    lines.push(tone(`+${workers.length - maxAgents} more agents`, ANSI_DIM));
  }

  return lines;
}

function buildGraphLines(
  turn: TerminalTurnState,
  workers: TerminalWorkerState[],
): string[] {
  const completed = workers.filter(
    (worker) => worker.status === 'completed',
  ).length;
  const running = workers.filter(
    (worker) => worker.status === 'running',
  ).length;
  const failed = workers.filter((worker) => worker.status === 'failed').length;

  return [
    `${workers.length} agents | ${running} running | ${completed} done | ${failed} failed`,
    `Elapsed: ${elapsedSince(turn.startedAt)} | Updated: ${shortTime(turn.updatedAt)}`,
  ];
}

function simplifyTimelineText(text: string): string {
  return text.replace(/^(root|planner|worker \d+|aggregate) ·\s*/, '');
}

function speakerLabel(role: TerminalFeedEntry['role']): string {
  switch (role) {
    case 'user':
      return tone('you', ANSI_TEXT);
    case 'assistant':
      return tone('andy', ANSI_ACCENT);
    case 'step':
      return tone('step', ANSI_DIM);
    default:
      return tone('system', ANSI_DIM);
  }
}

function buildTranscriptFeed(
  turn: TerminalTurnState | null,
  focus: TerminalWorkerState | null,
  entries: TerminalPanelTranscriptEntry[] | undefined,
  height: number,
  fallbacks?: Array<TerminalPanelTranscriptEntry | null>,
): TerminalFeedEntry[] {
  const feed: TerminalFeedEntry[] = [];
  const transcript =
    entries && entries.length > 0
      ? entries
      : (fallbacks ?? []).filter(
          (entry): entry is TerminalPanelTranscriptEntry =>
            Boolean(entry && entry.text.trim()),
        );
  for (const entry of transcript) {
    feed.push({
      at: entry.at,
      role: entry.role,
      text: entry.text.replace(/\s+/g, ' ').trim(),
    });
  }

  if (turn) {
    const timeline = buildFocusTimeline(
      turn,
      focus?.key ?? 'root',
      height < 28 ? 8 : 12,
    );
    for (const entry of timeline) {
      const text = simplifyTimelineText(entry.text).replace(/\s+/g, ' ').trim();
      if (!text || isNoisyStep(text)) continue;
      feed.push({ at: entry.at, role: 'step', text });
    }
  }

  const deduped: TerminalFeedEntry[] = [];
  const seen = new Set<string>();
  for (const entry of feed.sort(
    (left, right) => Date.parse(left.at) - Date.parse(right.at),
  )) {
    const key = `${entry.role}:${entry.text}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(entry);
  }

  return deduped;
}

function buildTranscriptLines(
  turn: TerminalTurnState | null,
  focus: TerminalWorkerState | null,
  entries: TerminalPanelTranscriptEntry[] | undefined,
  height: number,
  fallbacks?: Array<TerminalPanelTranscriptEntry | null>,
): string[] {
  const feed = buildTranscriptFeed(turn, focus, entries, height, fallbacks);
  if (feed.length === 0) return [tone('No transcript yet.', ANSI_DIM)];
  const maxEntries = height < 28 ? 8 : 12;
  return feed.slice(-maxEntries).map((entry) => {
    const time = tone(shortTime(entry.at), ANSI_DIM);
    return `${time}  ${speakerLabel(entry.role)}  ${entry.text}`;
  });
}

function buildFocusDetailLines(focus: TerminalWorkerState | null): string[] {
  if (!focus) {
    return [tone('No focused worker.', ANSI_DIM)];
  }

  const lines = [
    `${focus.label} | ${readableStatus(focus.status)}`,
    `Doing: ${focus.lastActivity ?? 'waiting'}`,
  ];
  if (focus.roleTitle) {
    lines.push(`Role: ${focus.roleTitle}`);
  }
  if (focus.summary) {
    lines.push(`Latest result: ${focus.summary}`);
  }
  if (focus.error) {
    lines.push(`Error: ${focus.error}`);
  }
  lines.push(`Updated: ${shortTime(focus.updatedAt)}`);
  return lines;
}

function buildRecentLines(
  entries: string[] | undefined,
  fallback: string | null | undefined,
  label: 'reply' | 'system',
): string[] {
  const source =
    entries && entries.length > 0 ? entries : fallback ? [fallback] : [];
  if (source.length === 0) {
    return [tone(`No recent ${label} messages.`, ANSI_DIM)];
  }
  return source
    .slice(-4)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function buildSurfaceLines(body: string | null | undefined): string[] {
  if (!body) return [tone('empty', ANSI_DIM)];
  return body.split('\n').map((line) => line.trimEnd());
}

function renderFrame(options: {
  width: number;
  statusLine: string;
  top: string[];
  left: string[];
  right: string[];
  bottom?: string[];
  footer: string;
}): string {
  const blocks = [
    tone('NanoClaw terminal', ANSI_TEXT),
    options.statusLine,
    rule(options.width),
    ...options.top,
    ...mergeColumns(options.left, options.right, options.width),
  ];
  if (options.bottom && options.bottom.length > 0) {
    blocks.push(rule(options.width), ...options.bottom);
  }
  blocks.push(rule(options.width), options.footer);
  return blocks.map((line) => clampText(line, options.width)).join('\n');
}

function buildIdlePanel(options: {
  statusLine: string;
  busy: boolean;
  latestSystemEvent?: string | null;
  latestAssistantMessage?: string | null;
  recentSystemEvents?: string[];
  recentReplies?: string[];
  recentTranscript?: TerminalPanelTranscriptEntry[];
  sidePanel?: { isOpen: boolean; tab: string; body: string | null };
  drawer?: { isOpen: boolean; tab: string; body: string | null };
  overlay?: { kind: string | null; body: string | null };
  width: number;
  height: number;
}): string {
  const top = section(
    'Transcript',
    buildTranscriptLines(null, null, options.recentTranscript, options.height, [
      options.latestSystemEvent
        ? {
            at: new Date().toISOString(),
            role: 'system',
            text: options.latestSystemEvent,
          }
        : null,
      options.latestAssistantMessage
        ? {
            at: new Date().toISOString(),
            role: 'assistant',
            text: options.latestAssistantMessage,
          }
        : null,
    ]),
    options.width,
    1,
  );
  const left = [
    ...section(
      'Status',
      [`State: ${options.busy ? 'processing request' : 'idle'}`],
      Math.max(20, options.width),
      1,
    ),
  ];
  const right = [
    ...section(
      'Recent system',
      buildRecentLines(
        options.recentSystemEvents,
        options.latestSystemEvent,
        'system',
      ),
      Math.max(20, options.width),
      1,
    ),
  ];
  const rightExtras = options.sidePanel?.isOpen
    ? [
        ...section(
          sidePanelTitle(options.sidePanel.tab),
          buildSurfaceLines(options.sidePanel.body),
          Math.max(20, options.width),
          1,
        ),
      ]
    : [];
  right.push(...rightExtras);
  const bottom = options.drawer?.isOpen
    ? [
        ...section(
          drawerTitle(options.drawer.tab),
          buildSurfaceLines(options.drawer.body),
          Math.max(20, options.width),
          1,
          true,
        ),
      ]
    : [];
  const overlay = options.overlay?.kind
    ? [
        ...section(
          overlayTitle(options.overlay.kind ?? ''),
          buildSurfaceLines(options.overlay.body),
          Math.max(20, options.width),
          1,
          true,
        ),
      ]
    : [];

  return renderFrame({
    width: options.width,
    statusLine: options.statusLine,
    top: [...top, ...overlay],
    left,
    right,
    bottom,
    footer:
      'Shift+↑/↓ focus | ESC dismiss / interrupt | /logs raw events | /help',
  });
}

export function buildTerminalPanel(options: {
  statusLine: string;
  busy: boolean;
  latestSystemEvent?: string | null;
  latestAssistantMessage?: string | null;
  recentSystemEvents?: string[];
  recentReplies?: string[];
  recentTranscript?: TerminalPanelTranscriptEntry[];
  sidePanel?: { isOpen: boolean; tab: string; body: string | null };
  drawer?: { isOpen: boolean; tab: string; body: string | null };
  overlay?: { kind: string | null; body: string | null };
  chatJid?: string;
  width?: number;
  height?: number;
}): string {
  const width = Math.max(
    MIN_WIDTH,
    Math.trunc(options.width ?? process.stdout.columns ?? DEFAULT_WIDTH),
  );
  const height = Math.max(
    18,
    Math.trunc(options.height ?? process.stdout.rows ?? DEFAULT_HEIGHT),
  );
  const turn = getTerminalTurnState(options.chatJid ?? TERMINAL_GROUP_JID);

  if (!turn) {
    return buildIdlePanel({ ...options, width, height });
  }

  const focus =
    turn.workers.get(turn.focusKey) ?? turn.workers.get('root') ?? null;
  const workers = sortedWorkers(turn);
  const failureLines = buildFailureLines(
    turn,
    focus,
    options.latestSystemEvent,
  );
  const showSelection =
    focus !== null &&
    (focus.key !== 'root' || Boolean(focus.roleTitle || focus.error));
  const top = section(
    'Transcript',
    buildTranscriptLines(turn, focus, options.recentTranscript, height),
    width,
    1,
  );
  const left = [
    ...section(
      'Current',
      buildOverviewLines(turn, focus, options.busy),
      Math.max(24, width),
      1,
    ),
    ...(failureLines.length > 0
      ? [...section('Attention', failureLines, Math.max(24, width), 1)]
      : []),
  ];
  const right = [
    ...section(
      'Agents',
      buildAgentLines(turn, workers, Math.max(24, width), height),
      Math.max(24, width),
      1,
    ),
    ...(showSelection
      ? [
          ...section(
            'Selection',
            buildFocusDetailLines(focus),
            Math.max(24, width),
            1,
          ),
        ]
      : []),
    ...section(
      'Progress',
      buildGraphLines(turn, workers),
      Math.max(24, width),
      1,
    ),
  ];
  if (options.sidePanel?.isOpen) {
    right.push(
      ...section(
        sidePanelTitle(options.sidePanel.tab),
        buildSurfaceLines(options.sidePanel.body),
        Math.max(24, width),
        1,
        true,
      ),
    );
  }
  const bottom = options.drawer?.isOpen
    ? [
        ...section(
          drawerTitle(options.drawer.tab),
          buildSurfaceLines(options.drawer.body),
          width,
          1,
          true,
        ),
      ]
    : [];
  const overlay = options.overlay?.kind
    ? [
        ...section(
          overlayTitle(options.overlay.kind ?? ''),
          buildSurfaceLines(options.overlay.body),
          width,
          1,
          true,
        ),
      ]
    : [];

  return renderFrame({
    width,
    statusLine: options.statusLine,
    top: [...top, ...overlay],
    left,
    right,
    bottom,
    footer:
      'Shift+↑/↓ focus agent | ESC dismiss / interrupt | /focus <agent> | /logs raw events',
  });
}
