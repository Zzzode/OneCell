const LEVELS = { debug: 20, info: 30, warn: 40, error: 50, fatal: 60 } as const;
type Level = keyof typeof LEVELS;

const COLORS: Record<Level, string> = {
  debug: '\x1b[34m',
  info: '\x1b[32m',
  warn: '\x1b[33m',
  error: '\x1b[31m',
  fatal: '\x1b[41m\x1b[37m',
};
const KEY_COLOR = '\x1b[35m';
const MSG_COLOR = '\x1b[36m';
const RESET = '\x1b[39m';
const FULL_RESET = '\x1b[0m';

const envLevel =
  (process.env.LOG_LEVEL as Level | undefined) ||
  (process.env.TERMINAL_CHANNEL === 'true' ? 'silent' : 'info');
const SILENT = LEVELS.error;
const envThreshold =
  envLevel === 'silent' ? SILENT : (LEVELS[envLevel] ?? LEVELS.info);

// Runtime silence flag — set by the terminal channel when Ink is managing
// the screen.  Any write to stdout/stderr between Ink frames corrupts
// Ink's cursor tracking and causes duplicate output.
let silenced = false;

export function silenceLogger(): void {
  silenced = true;
}

export function unsilenceLogger(): void {
  silenced = false;
}

function formatErr(err: unknown): string {
  if (err instanceof Error) {
    return `{\n      "type": "${err.constructor.name}",\n      "message": "${err.message}",\n      "stack":\n          ${err.stack}\n    }`;
  }
  return JSON.stringify(err);
}

function formatData(data: Record<string, unknown>): string {
  let out = '';
  for (const [k, v] of Object.entries(data)) {
    if (k === 'err') {
      out += `\n    ${KEY_COLOR}err${RESET}: ${formatErr(v)}`;
    } else {
      out += `\n    ${KEY_COLOR}${k}${RESET}: ${JSON.stringify(v)}`;
    }
  }
  return out;
}

function ts(): string {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}.${String(d.getMilliseconds()).padStart(3, '0')}`;
}

function log(
  level: Level,
  dataOrMsg: Record<string, unknown> | string,
  msg?: string,
): void {
  if (LEVELS[level] < envThreshold) return;
  if (silenced && level !== 'fatal' && level !== 'error') return;
  const tag = `${COLORS[level]}${level.toUpperCase()}${level === 'fatal' ? FULL_RESET : RESET}`;
  const stream = LEVELS[level] >= LEVELS.warn ? process.stderr : process.stdout;
  if (typeof dataOrMsg === 'string') {
    stream.write(
      `[${ts()}] ${tag} (${process.pid}): ${MSG_COLOR}${dataOrMsg}${RESET}\n`,
    );
  } else {
    stream.write(
      `[${ts()}] ${tag} (${process.pid}): ${MSG_COLOR}${msg}${RESET}${formatData(dataOrMsg)}\n`,
    );
  }
}

export const logger = {
  debug: (dataOrMsg: Record<string, unknown> | string, msg?: string) =>
    log('debug', dataOrMsg, msg),
  info: (dataOrMsg: Record<string, unknown> | string, msg?: string) =>
    log('info', dataOrMsg, msg),
  warn: (dataOrMsg: Record<string, unknown> | string, msg?: string) =>
    log('warn', dataOrMsg, msg),
  error: (dataOrMsg: Record<string, unknown> | string, msg?: string) =>
    log('error', dataOrMsg, msg),
  fatal: (dataOrMsg: Record<string, unknown> | string, msg?: string) =>
    log('fatal', dataOrMsg, msg),
};

const LOGGER_PROCESS_HOOKS_KEY = Symbol.for(
  'onecell.nanoclaw.logger.processHooks',
);

type LoggerProcessHooks = {
  uncaughtException?: (err: unknown) => void;
  unhandledRejection?: (reason: unknown) => void;
};

const loggerProcessHooks = globalThis as typeof globalThis & {
  [LOGGER_PROCESS_HOOKS_KEY]?: LoggerProcessHooks;
};

function ensureProcessHook(
  eventName: 'uncaughtException',
  createHandler: (err: unknown) => void,
): void;
function ensureProcessHook(
  eventName: 'unhandledRejection',
  createHandler: (reason: unknown) => void,
): void;
function ensureProcessHook(
  eventName: 'uncaughtException' | 'unhandledRejection',
  createHandler: ((err: unknown) => void) | ((reason: unknown) => void),
): void {
  const hooks =
    loggerProcessHooks[LOGGER_PROCESS_HOOKS_KEY] ??
    (loggerProcessHooks[LOGGER_PROCESS_HOOKS_KEY] = {});

  if (eventName === 'uncaughtException') {
    const handler =
      hooks.uncaughtException ??
      (createHandler as NonNullable<LoggerProcessHooks['uncaughtException']>);
    hooks.uncaughtException = handler;
    if (!process.listeners('uncaughtException').includes(handler)) {
      process.on('uncaughtException', handler);
    }
    return;
  }

  const handler =
    hooks.unhandledRejection ??
    (createHandler as NonNullable<LoggerProcessHooks['unhandledRejection']>);
  hooks.unhandledRejection = handler;
  if (!process.listeners('unhandledRejection').includes(handler)) {
    process.on('unhandledRejection', handler);
  }
}

// Route uncaught errors through logger so they get timestamps in stderr
ensureProcessHook('uncaughtException', (err) => {
  logger.fatal({ err }, 'Uncaught exception');
  process.exit(1);
});

ensureProcessHook('unhandledRejection', (reason) => {
  logger.error({ err: reason }, 'Unhandled rejection');
});
