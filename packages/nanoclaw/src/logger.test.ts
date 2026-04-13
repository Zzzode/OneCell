import { afterEach, describe, expect, it, vi } from 'vitest';

const originalListeners = {
  uncaughtException: process.listeners('uncaughtException'),
  unhandledRejection: process.listeners('unhandledRejection'),
};

afterEach(() => {
  vi.resetModules();
  for (const listener of process.listeners('uncaughtException')) {
    if (!originalListeners.uncaughtException.includes(listener)) {
      process.removeListener('uncaughtException', listener);
    }
  }
  for (const listener of process.listeners('unhandledRejection')) {
    if (!originalListeners.unhandledRejection.includes(listener)) {
      process.removeListener('unhandledRejection', listener);
    }
  }
});

describe('logger process hooks', () => {
  it('registers process-level error handlers only once across module reloads', async () => {
    const uncaughtBefore = process.listenerCount('uncaughtException');
    const unhandledBefore = process.listenerCount('unhandledRejection');

    await import('./logger.js');
    vi.resetModules();
    await import('./logger.js');

    expect(process.listenerCount('uncaughtException')).toBe(uncaughtBefore + 1);
    expect(process.listenerCount('unhandledRejection')).toBe(
      unhandledBefore + 1,
    );
  });
});
