/* eslint-disable no-control-regex */
import { describe, it, expect } from 'vitest'
import { renderToString } from 'ink'
import React from 'react'
import { Transcript } from './transcript.js'
import type { TerminalPanelTranscriptEntry } from '../terminal/terminal-panel.js'

function toolEntry(
  tool: string,
  args: Record<string, unknown>,
  overrides?: Partial<TerminalPanelTranscriptEntry>,
): TerminalPanelTranscriptEntry {
  return {
    at: '2026-04-14T12:00:00.000Z',
    role: 'tool',
    text: `${tool}(${Object.values(args)[0] ?? ''})`,
    toolData: { tool, args, status: 'success' },
    ...overrides,
  }
}

describe('Transcript', () => {
  it('renders user messages as plain text', () => {
    const entries: TerminalPanelTranscriptEntry[] = [
      { at: '2026-04-13T14:30:00Z', role: 'user', text: 'hello' },
    ]
    const output = renderToString(<Transcript entries={entries} width={80} />)
    expect(output).toContain('hello')
  })

  it('renders assistant messages with brand dot prefix', () => {
    const entries: TerminalPanelTranscriptEntry[] = [
      { at: '2026-04-13T14:30:01Z', role: 'assistant', text: 'I will analyze' },
    ]
    const output = renderToString(<Transcript entries={entries} width={80} />)
    expect(output).toContain('I will analyze')
  })

  it('merges assistant streaming chunks in the same turn', () => {
    const entries: TerminalPanelTranscriptEntry[] = [
      {
        at: '2026-04-13T14:30:01Z',
        role: 'assistant',
        text: 'chunk 1',
        turnId: 'turn:1',
      },
      {
        at: '2026-04-13T14:30:02Z',
        role: 'assistant',
        text: 'chunk 2',
        turnId: 'turn:1',
      },
    ]
    const output = renderToString(<Transcript entries={entries} width={80} />)
    const plain = output.replace(/\x1b\[[0-9;]*m/g, '')
    expect(plain).toContain('chunk 1')
    expect(plain).toContain('chunk 2')
  })

  it('renders system entries as indented steps', () => {
    const entries: TerminalPanelTranscriptEntry[] = [
      { at: '2026-04-13T14:30:02Z', role: 'system', text: 'reading auth.ts' },
    ]
    const output = renderToString(<Transcript entries={entries} width={80} />)
    expect(output).toContain('reading auth.ts')
  })

  it('shows placeholder when no entries', () => {
    const output = renderToString(
      <Transcript entries={[]} width={80} />,
    )
    expect(output).toContain('No transcript yet')
  })

  it('groups consecutive system entries under last assistant with tree lines', () => {
    const entries: TerminalPanelTranscriptEntry[] = [
      { at: '2026-04-13T14:30:00Z', role: 'user', text: 'check auth' },
      { at: '2026-04-13T14:30:01Z', role: 'assistant', text: 'I will look' },
      { at: '2026-04-13T14:30:02Z', role: 'system', text: 'reading auth.ts' },
      { at: '2026-04-13T14:30:03Z', role: 'system', text: 'parsing tokens' },
    ]
    const output = renderToString(<Transcript entries={entries} width={80} />)
    expect(output).toContain('check auth')
    expect(output).toContain('I will look')
    expect(output).toContain('reading auth.ts')
    expect(output).toContain('parsing tokens')
    // Tree connectors present
    expect(output).toContain('├─')
    expect(output).toContain('└─')
  })

  it('uses └─ for last step and ├─ for earlier steps', () => {
    const entries: TerminalPanelTranscriptEntry[] = [
      { at: '2026-04-13T14:30:00Z', role: 'system', text: 'step a' },
      { at: '2026-04-13T14:30:01Z', role: 'system', text: 'step b' },
      { at: '2026-04-13T14:30:02Z', role: 'system', text: 'step c' },
    ]
    const output = renderToString(<Transcript entries={entries} width={80} />)
    // step a and step b are not last, step c is last
    const aIdx = output.indexOf('step a')
    const bIdx = output.indexOf('step b')
    const cIdx = output.indexOf('step c')
    // Earlier steps use ├─, last uses └─
    expect(output.substring(Math.max(0, aIdx - 10), aIdx)).toContain('├─')
    expect(output.substring(Math.max(0, bIdx - 10), bIdx)).toContain('├─')
    expect(output.substring(Math.max(0, cIdx - 10), cIdx)).toContain('└─')
  })
})

describe('Transcript standard mode (verbose=false)', () => {
  it('renders each tool call as an independent line', () => {
    const entries: TerminalPanelTranscriptEntry[] = [
      toolEntry('workspace.read', { path: 'src/a.ts' }),
      toolEntry('workspace.read', { path: 'src/b.ts' }),
      toolEntry('workspace.search', { pattern: 'ExecutionEvent' }),
    ];
    const output = renderToString(
      <Transcript entries={entries} width={100} />,
    );
    const plain = output.replace(/\x1b\[[0-9;]*m/g, '');
    expect(plain).toContain('Reading src/a.ts');
    expect(plain).toContain('Reading src/b.ts');
    expect(plain).toContain('Searching "ExecutionEvent"');
    expect(plain).not.toContain('ctrl+o to expand');
  });

  it('renders running tools without aggregation', () => {
    const entries: TerminalPanelTranscriptEntry[] = [
      toolEntry('workspace.read', { path: 'src/a.ts' }, {
        toolData: { tool: 'workspace.read', args: { path: 'src/a.ts' }, status: 'running' },
      }),
    ];
    const output = renderToString(
      <Transcript entries={entries} width={100} />,
    );
    const plain = output.replace(/\x1b\[[0-9;]*m/g, '');
    expect(plain).toContain('Reading src/a.ts');
  });

  it('handles mixed system and tool entries', () => {
    const entries: TerminalPanelTranscriptEntry[] = [
      { at: '2026-04-14T12:00:00.000Z', role: 'system', text: 'execution started' },
      toolEntry('workspace.read', { path: 'src/a.ts' }),
    ];
    const output = renderToString(
      <Transcript entries={entries} width={100} />,
    );
    const plain = output.replace(/\x1b\[[0-9;]*m/g, '');
    expect(plain).toContain('execution started');
    expect(plain).toContain('Reading src/a.ts');
  });

  it('renders tool entries deterministically by order', () => {
    const entries: TerminalPanelTranscriptEntry[] = [
      {
        at: '2026-04-14T12:00:01.000Z',
        role: 'tool',
        text: 'workspace.search(pattern)',
        toolData: {
          tool: 'workspace.search',
          args: { pattern: 'x' },
          status: 'success',
          order: 2,
        },
      },
      {
        at: '2026-04-14T12:00:00.000Z',
        role: 'tool',
        text: 'workspace.read(a.ts)',
        toolData: {
          tool: 'workspace.read',
          args: { path: 'a.ts' },
          status: 'success',
          order: 1,
        },
      },
    ];
    const output = renderToString(
      <Transcript entries={entries} width={100} verbose />,
    );
    const plain = output.replace(/\x1b\[[0-9;]*m/g, '');
    expect(plain.indexOf('Reading a.ts')).toBeLessThan(plain.indexOf('Searching "x"'));
  });
});

describe('Transcript verbose mode (verbose=true)', () => {
  it('renders each tool call individually', () => {
    const entries: TerminalPanelTranscriptEntry[] = [
      toolEntry('workspace.read', { path: 'src/config.ts' }, {
        toolData: {
          tool: 'workspace.read',
          args: { path: 'src/config.ts' },
          result: '42 lines',
          status: 'success',
        },
      }),
      toolEntry('js.exec', { code: 'return 1 + 1' }, {
        toolData: {
          tool: 'js.exec',
          args: { code: 'return 1 + 1' },
          result: 2,
          status: 'success',
        },
      }),
    ];
    const output = renderToString(
      <Transcript entries={entries} width={100} verbose />,
    );
    const plain = output.replace(/\x1b\[[0-9;]*m/g, '');
    expect(plain).toContain('Reading src/config.ts');
    expect(plain).toContain('Executing JavaScript(return 1 + 1)');
    expect(plain).not.toContain('ctrl+o to expand');
  });

  it('renders errors for failed tool calls', () => {
    const entries: TerminalPanelTranscriptEntry[] = [
      toolEntry('workspace.read', { path: 'missing.ts' }, {
        toolData: {
          tool: 'workspace.read',
          args: { path: 'missing.ts' },
          status: 'error',
        },
      }),
    ];
    const output = renderToString(
      <Transcript entries={entries} width={100} verbose />,
    );
    const plain = output.replace(/\x1b\[[0-9;]*m/g, '');
    expect(plain).toContain('error');
  });

  it('renders user and assistant entries alongside tool entries', () => {
    const entries: TerminalPanelTranscriptEntry[] = [
      { at: '2026-04-14T12:00:00.000Z', role: 'user', text: 'list files' },
      toolEntry('workspace.read', { path: 'src/a.ts' }),
      { at: '2026-04-14T12:00:01.000Z', role: 'assistant', text: 'Here are the files' },
    ];
    const output = renderToString(
      <Transcript entries={entries} width={100} verbose />,
    );
    const plain = output.replace(/\x1b\[[0-9;]*m/g, '');
    expect(plain).toContain('list files');
    expect(plain).toContain('Reading src/a.ts');
    expect(plain).toContain('Here are the files');
  });
})
