# Tool Output UI Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add collapsed summary + verbose detail toggle for tool call output in the nanoclaw terminal UI.

**Architecture:** Extend the transcript data model with structured tool entries, pair tool_call/tool_result events in the event dispatcher, and add a ctrl+o toggle that switches between aggregated summaries and per-tool verbose rendering in the transcript component.

**Tech Stack:** TypeScript, React (Ink), Vitest

---

### Task 1: Data model — extend transcript entry type

**Files:**
- Modify: `packages/nanoclaw/src/terminal-panel.ts`

- [ ] **Step 1: Update the type definitions**

```ts
// packages/nanoclaw/src/terminal-panel.ts

export interface ToolTranscriptEntry {
  tool: string;
  args: Record<string, unknown>;
  result?: unknown;
  status: 'running' | 'success' | 'error';
}

export interface TerminalPanelTranscriptEntry {
  at: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
  text: string;
  toolData?: ToolTranscriptEntry;
}
```

- [ ] **Step 2: Run typecheck to verify no downstream breaks**

Run: `pnpm --filter @onecell/nanoclaw run typecheck`
Expected: PASS (the `tool` role and `toolData` are additive; existing consumers use `system`/`user`/`assistant` roles)

- [ ] **Step 3: Commit**

```bash
git add packages/nanoclaw/src/terminal-panel.ts
git commit -m "feat(nanoclaw): add tool transcript entry type with structured toolData"
```

---

### Task 2: Terminal channel — add tool event emitter and refresh

**Files:**
- Modify: `packages/nanoclaw/src/channels/terminal.tsx`

The terminal channel module (`channels/terminal.tsx`) already exports `emitTerminalSystemEvent`. We add two new exports:
- `emitTerminalToolEvent(jid, text, toolData)` — creates a `{ role: 'tool', text, toolData }` transcript entry and triggers render. Returns the entry reference.
- `emitTerminalRefresh(jid)` — triggers render without adding a transcript entry.

- [ ] **Step 1: Add `recordTerminalToolEntry` function**

Add this function right after `recordTerminalTranscript` (around line 298):

```ts
function recordTerminalToolEntry(
  text: string,
  toolData: import('../terminal-panel.js').ToolTranscriptEntry,
): import('../terminal-panel.js').TerminalPanelTranscriptEntry {
  const normalized = text.trim();
  if (!normalized) {
    // still create entry even if text is empty, the toolData matters
  }
  const at = new Date().toISOString();
  const entry: import('../terminal-panel.js').TerminalPanelTranscriptEntry = {
    at,
    role: 'tool',
    text: normalized,
    toolData,
  };
  terminalTranscript.push(entry);
  if (terminalTranscript.length > TERMINAL_TRANSCRIPT_LIMIT) {
    terminalTranscript = terminalTranscript.slice(-TERMINAL_TRANSCRIPT_LIMIT);
  }
  return entry;
}
```

- [ ] **Step 2: Add `emitTerminalToolEvent` and `emitTerminalRefresh` exports**

Add after the existing `emitTerminalSystemEvent` function (around line 957):

```ts
export function emitTerminalToolEvent(
  jid: string,
  text: string,
  toolData: import('../terminal-panel.js').ToolTranscriptEntry,
): import('../terminal-panel.js').TerminalPanelTranscriptEntry | null {
  if (!activeTerminalChannel?.ownsJid(jid)) return null;
  const normalized = text.trim();
  recordTerminalEvent(normalized || `tool: ${toolData.tool}`);
  const entry = recordTerminalToolEntry(normalized, toolData);
  activeTerminalChannel['renderScreen'](true);
  return entry;
}

export function emitTerminalRefresh(jid: string): void {
  if (!activeTerminalChannel?.ownsJid(jid)) return;
  activeTerminalChannel['renderScreen'](true);
}
```

Note: `renderScreen` is a private method. We access it via bracket notation on the class instance from these module-level exports, consistent with the existing pattern where `emitTerminalSystemEvent` calls `sendSystemEvent` which calls `renderScreen`. If bracket access is undesirable, add a package-private `refresh()` method to `TerminalChannel` and call that instead.

- [ ] **Step 3: Run typecheck**

Run: `pnpm --filter @onecell/nanoclaw run typecheck`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add packages/nanoclaw/src/channels/terminal.tsx
git commit -m "feat(nanoclaw): add emitTerminalToolEvent and emitTerminalRefresh exports"
```

---

### Task 3: Event dispatcher — pair tool_call and tool_result

**Files:**
- Modify: `packages/nanoclaw/src/edge-event-dispatcher.ts`

- [ ] **Step 1: Update the imports to include the new terminal exports**

At the top of `edge-event-dispatcher.ts`, the `emitTerminalSystemEvent` import is currently a dynamic import inside `onToolCall`. Add a module-level import for the new functions. Since the file uses dynamic import for the terminal channel, keep the same pattern but import all three functions:

In `onToolCall`, change the dynamic import line:
```ts
// FROM:
const { emitTerminalSystemEvent } = await import('./channels/terminal.js');
// TO:
const { emitTerminalToolEvent } = await import('./channels/terminal.js');
```

In `onToolResult`, add a dynamic import:
```ts
const { emitTerminalRefresh } = await import('./channels/terminal.js');
```

- [ ] **Step 2: Add pendingToolCalls map inside createPersistentExecutionEventHooks**

At the top of `createPersistentExecutionEventHooks` function body (after the `roleTitle` line, around line 94), add:

```ts
const pendingToolCalls = new Map<string, import('./terminal-panel.js').TerminalPanelTranscriptEntry>();
```

- [ ] **Step 3: Rewrite onToolCall to create structured tool entries**

Replace the existing `onToolCall` handler (lines 139-147):

```ts
async onToolCall(event) {
  const args =
    event.args && typeof event.args === 'object' && !Array.isArray(event.args)
      ? event.args as Record<string, unknown>
      : {};
  const detail = summarizeToolArgs(event.tool, args);
  const label = detail ? `${event.tool}(${detail})` : event.tool;
  const { emitTerminalToolEvent } = await import('./channels/terminal.js');
  const entry = emitTerminalToolEvent(request.chatJid, label, {
    tool: event.tool,
    args,
    status: 'running',
  });
  if (entry) {
    pendingToolCalls.set(event.executionId, entry);
  }
},
```

- [ ] **Step 4: Implement onToolResult to update pending entries**

Replace the existing `onToolResult` handler (lines 149-152):

```ts
async onToolResult(event) {
  const entry = pendingToolCalls.get(event.executionId);
  if (entry?.toolData) {
    const isError = typeof event.result === 'object' && event.result !== null
      && 'ok' in (event.result as Record<string, unknown>)
      && (event.result as Record<string, unknown>).ok === false;
    entry.toolData.result = event.result;
    entry.toolData.status = isError ? 'error' : 'success';
    pendingToolCalls.delete(event.executionId);
    const { emitTerminalRefresh } = await import('./channels/terminal.js');
    emitTerminalRefresh(request.chatJid);
  }
},
```

- [ ] **Step 5: Clear pendingToolCalls on onFinal and onError**

In `onFinal` (around line 202), add at the start:
```ts
pendingToolCalls.clear();
```

In `onError` (around line 227), add at the start:
```ts
pendingToolCalls.clear();
```

- [ ] **Step 6: Run typecheck**

Run: `pnpm --filter @onecell/nanoclaw run typecheck`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add packages/nanoclaw/src/edge-event-dispatcher.ts
git commit -m "feat(nanoclaw): pair tool_call and tool_result into structured transcript entries"
```

---

### Task 4: Transcript aggregation and verbose rendering

**Files:**
- Modify: `packages/nanoclaw/src/components/transcript.tsx`

This is the largest task. We add:
1. A tool-category classification function
2. An aggregation function for collapsed mode
3. Per-tool verbose rendering
4. A `verbose` prop on the `Transcript` component

- [ ] **Step 1: Add tool category classification**

Add after the existing `wrapText` function (around line 87):

```ts
type ToolCategory = 'read' | 'search' | 'write' | 'http' | 'js' | 'message' | 'task' | 'other';

function classifyTool(tool: string): ToolCategory {
  if (tool === 'workspace.read' || tool === 'workspace.list') return 'read';
  if (tool === 'workspace.search') return 'search';
  if (tool === 'workspace.write' || tool === 'workspace.apply_patch') return 'write';
  if (tool === 'http.fetch') return 'http';
  if (tool === 'js.exec') return 'js';
  if (tool === 'message.send') return 'message';
  if (tool.startsWith('task.')) return 'task';
  return 'other';
}
```

- [ ] **Step 2: Add collapsed aggregation builder**

Add after `classifyTool`:

```ts
interface ToolAggregate {
  read: number;
  search: number;
  write: number;
  http: number;
  js: number;
  message: number;
  task: number;
  other: number;
  errors: number;
  hasRunning: boolean;
}

function buildCollapsedSummary(entries: TerminalPanelTranscriptEntry[]): string {
  const agg: ToolAggregate = {
    read: 0, search: 0, write: 0, http: 0, js: 0,
    message: 0, task: 0, other: 0, errors: 0, hasRunning: false,
  };
  for (const entry of entries) {
    if (entry.role !== 'tool' || !entry.toolData) continue;
    const cat = classifyTool(entry.toolData.tool);
    agg[cat]++;
    if (entry.toolData.status === 'error') agg.errors++;
    if (entry.toolData.status === 'running') agg.hasRunning = true;
  }
  const parts: string[] = [];
  if (agg.read > 0) parts.push(`Read ${agg.read} file${agg.read > 1 ? 's' : ''}`);
  if (agg.search > 0) parts.push(`searched ${agg.search} pattern${agg.search > 1 ? 's' : ''}`);
  if (agg.write > 0) parts.push(`wrote ${agg.write} file${agg.write > 1 ? 's' : ''}`);
  if (agg.http > 0) parts.push(`fetched ${agg.http} URL${agg.http > 1 ? 's' : ''}`);
  if (agg.js > 0) parts.push(`executed ${agg.js} JS snippet${agg.js > 1 ? 's' : ''}`);
  if (agg.message > 0) parts.push(`sent ${agg.message} message${agg.message > 1 ? 's' : ''}`);
  if (agg.task > 0) parts.push('managed tasks');
  if (agg.other > 0) parts.push(`used ${agg.other} tool${agg.other > 1 ? 's' : ''}`);

  const hasErrors = agg.errors > 0;
  const suffix = agg.hasRunning
    ? '...'
    : (hasErrors ? `, ${agg.errors} failed` : '');
  return parts.join(', ') + suffix;
}
```

- [ ] **Step 3: Add per-tool verbose line builder**

Add after `buildCollapsedSummary`:

```ts
function formatVerboseToolLine(
  entry: TerminalPanelTranscriptEntry,
  maxWidth: number,
): string {
  const td = entry.toolData!;
  const indent = '    ';
  const maxContent = maxWidth - indent.length - 1;

  switch (classifyTool(td.tool)) {
    case 'read': {
      const path = typeof td.args.path === 'string' ? td.args.path : '?';
      if (td.status === 'error') return `${indent}Read ${path} — error`;
      const resultStr = formatResultSummary(td.result, 40);
      return `${indent}Read ${path}${resultStr ? ` (${resultStr})` : ''}`;
    }
    case 'search': {
      const pattern = typeof td.args.pattern === 'string' ? td.args.pattern : '?';
      const path = typeof td.args.path === 'string' ? ` in ${td.args.path}` : '';
      if (td.status === 'error') return `${indent}Search "${pattern}"${path} — error`;
      const resultStr = formatResultSummary(td.result, 40);
      return `${indent}Search "${pattern}"${path}${resultStr ? ` (${resultStr})` : ''}`;
    }
    case 'write': {
      const path = typeof td.args.path === 'string' ? td.args.path : '?';
      if (td.status === 'error') return `${indent}Write ${path} — error`;
      return `${indent}Write ${path}`;
    }
    case 'http': {
      const url = typeof td.args.url === 'string' ? td.args.url : '?';
      if (td.status === 'error') return `${indent}Fetch ${url} — error`;
      const resultStr = formatResultSummary(td.result, 40);
      return `${indent}Fetch ${url}${resultStr ? ` (${resultStr})` : ''}`;
    }
    case 'js': {
      const resultStr = td.status === 'success'
        ? ` \u2192 ${formatResultSummary(td.result, 30)}`
        : td.status === 'error'
          ? ' — error'
          : '...';
      let line = `${indent}js.exec${resultStr}`;
      // Add code preview below if space allows
      const code = typeof td.args.code === 'string' ? td.args.code : '';
      if (code) {
        const codePreview = code.length > maxContent
          ? code.slice(0, maxContent - 1) + '\u2026'
          : code;
        line += '\n' + indent + codePreview;
      }
      return line;
    }
    case 'message': {
      const text = typeof td.args.text === 'string'
        ? (td.args.text.length > 40 ? td.args.text.slice(0, 39) + '\u2026' : td.args.text)
        : '?';
      return `${indent}Send "${text}"`;
    }
    case 'task':
      return `${indent}${td.tool}(${formatResultSummary(td.result, 30)})`;
    default:
      return `${indent}${td.tool}(${entry.text})`;
  }
}

function formatResultSummary(result: unknown, maxLen: number): string {
  if (result === undefined) return '';
  if (typeof result === 'string') {
    return result.length > maxLen ? result.slice(0, maxLen - 1) + '\u2026' : result;
  }
  const str = JSON.stringify(result);
  return str.length > maxLen ? str.slice(0, maxLen - 1) + '\u2026' : str;
}
```

- [ ] **Step 4: Update the Transcript component to support verbose mode and tool aggregation**

Replace the entire `Transcript` component and its helper logic. The key change is:
- Add `verbose` prop
- In the `flushSteps` logic, when a group of entries includes tool entries, either aggregate them (collapsed) or render individually (verbose)

Replace the `Transcript` function (line 89 through end of file):

```tsx
export function Transcript({ entries, width, maxLines = 12, verbose = false }: TranscriptProps & { verbose?: boolean }) {
  if (entries.length === 0) {
    return <Text color={theme.subtle}>No transcript yet.</Text>;
  }

  const visible = entries.slice(-maxLines);
  const lines: React.ReactNode[] = [];
  let pendingSteps: TerminalPanelTranscriptEntry[] = [];
  let lastRole: 'user' | 'assistant' | 'system' | 'tool' | null = null;

  function flushSteps() {
    if (pendingSteps.length === 0) return;

    const toolEntries = pendingSteps.filter((e) => e.role === 'tool');
    const systemEntries = pendingSteps.filter((e) => e.role === 'system');

    // Render system entries as before
    for (const entry of systemEntries) {
      const idx = pendingSteps.indexOf(entry);
      const isLast = idx === pendingSteps.length - 1 && toolEntries.length === 0;
      lines.push(
        <StepLine
          key={`step-${lines.length}`}
          text={entry.text}
          isLast={isLast}
          width={width}
        />,
      );
    }

    // Render tool entries
    if (toolEntries.length > 0) {
      if (verbose) {
        for (let i = 0; i < toolEntries.length; i++) {
          const entry = toolEntries[i];
          const isLast = i === toolEntries.length - 1;
          const verboseText = formatVerboseToolLine(entry, width ?? 100);
          // Split multi-line verbose output (e.g. js.exec with code preview)
          const verboseLines = verboseText.split('\n');
          for (let j = 0; j < verboseLines.length; j++) {
            const prefix = j === 0
              ? (isLast ? '  └─ ' : '  ├─ ')
              : '  │   ';
            const color = entry.toolData?.status === 'error' ? 'red' : theme.inactive;
            lines.push(
              <Box key={`tool-${lines.length}`}>
                <Text color={theme.subtle}>{prefix}</Text>
                <Text color={color}>{verboseLines[j]}</Text>
              </Box>,
            );
          }
        }
      } else {
        // Collapsed: aggregate tool entries into one summary line
        const summary = buildCollapsedSummary(toolEntries);
        const hint = ' (ctrl+o to expand)';
        const fullText = summary + hint;
        const isLast = true;
        lines.push(
          <StepLine
            key={`tool-agg-${lines.length}`}
            text={fullText}
            isLast={isLast}
            width={width}
          />,
        );
      }
    }

    pendingSteps = [];
  }

  for (const entry of visible) {
    if (entry.role === 'system' || entry.role === 'tool') {
      pendingSteps.push(entry);
    } else {
      flushSteps();
      if (entry.role === 'user') {
        if (lines.length > 0) {
          lines.push(
            <Text key={`sep-${lines.length}`} color={theme.subtle}>{'\u2500'.repeat(Math.max(1, (width ?? 100) - 2))}</Text>,
          );
        }
        lines.push(<UserLine key={lines.length} text={entry.text} />);
        lastRole = 'user';
      } else {
        if (lastRole === 'user') {
          lines.push(<Box key={`gap-${lines.length}`} height={1} />);
        }
        lines.push(<AssistantLine key={lines.length} text={entry.text} />);
        lastRole = 'assistant';
      }
    }
  }
  flushSteps();

  return (
    <Box flexDirection="column">
      {lines}
    </Box>
  );
}
```

- [ ] **Step 5: Update the TranscriptProps interface**

Update the `TranscriptProps` interface at line 8:

```ts
interface TranscriptProps {
  entries: TerminalPanelTranscriptEntry[]
  width?: number
  maxLines?: number
  verbose?: boolean
}
```

- [ ] **Step 6: Run typecheck**

Run: `pnpm --filter @onecell/nanoclaw run typecheck`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add packages/nanoclaw/src/components/transcript.tsx
git commit -m "feat(nanoclaw): add collapsed aggregation and verbose per-tool rendering"
```

---

### Task 5: Wire verbose toggle through TerminalApp and TerminalChannel

**Files:**
- Modify: `packages/nanoclaw/src/terminal-app.tsx`
- Modify: `packages/nanoclaw/src/channels/terminal.tsx`

- [ ] **Step 1: Add verbose prop to TerminalApp**

In `terminal-app.tsx`, update the props interface and forward verbose to Transcript:

Add `verbose?: boolean` to `TerminalAppProps` (around line 60):

```ts
interface TerminalAppProps {
  backend: string
  busy: boolean
  latestSystemEvent?: string | null
  latestAssistantMessage?: string | null
  recentSystemEvents?: string[]
  recentTranscript?: TerminalPanelTranscriptEntry[]
  sidePanel?: { isOpen: boolean; tab: string; body: string | null }
  drawer?: { isOpen: boolean; tab: string; body: string | null }
  overlay?: { kind: string | null; body: string | null }
  verbose?: boolean
  chatJid?: string
  width?: number
  height?: number
  onSubmit?: (text: string) => void
  onEscape?: () => void
  onShiftUp?: () => void
  onShiftDown?: () => void
}
```

Destructure `verbose` in the component (around line 65):

```ts
export function TerminalApp({
  backend,
  busy,
  recentTranscript = [],
  sidePanel,
  drawer,
  overlay,
  verbose = false,
  width = 100,
  onSubmit,
  onEscape,
  onShiftUp,
  onShiftDown,
}: TerminalAppProps) {
```

Pass verbose to Transcript (around line 97):

```tsx
<Transcript entries={recentTranscript} width={width} verbose={verbose} />
```

- [ ] **Step 2: Add verbose state and ctrl+o binding to TerminalChannel**

In `channels/terminal.tsx`, in the `TerminalChannel` class:

Add a new private field after `overlay` (around line 570):

```ts
private verbose = false;
```

In `renderScreen`, add `verbose` to the props object (around line 808):

```ts
const props = {
  backend: TERMINAL_GROUP_EXECUTION_MODE,
  busy,
  verbose: this.verbose,
  width,
  // ... rest unchanged
};
```

- [ ] **Step 3: Add ctrl+o handler**

We need ctrl+o to work globally (even when busy). Add an `onCtrlO` callback to the TerminalApp props and bind it in the text-input component's `useInput` handler.

First, add `onCtrlO` to `TerminalAppProps`:

```ts
interface TerminalAppProps {
  // ... existing props
  onCtrlO?: () => void
}
```

In `TerminalApp`, pass it to `TextInput`:

```tsx
<TextInput
  value={inputValue}
  onChange={setInputValue}
  onSubmit={handleSubmit}
  onEscape={onEscape ?? (() => {})}
  onShiftUp={onShiftUp}
  onShiftDown={onShiftDown}
  onCtrlO={onCtrlO}
  busy={busy}
  placeholder={busy ? 'processing...' : 'Type your message...'}
/>
```

In `components/text-input.tsx`, add `onCtrlO` prop:

```ts
interface TextInputProps {
  placeholder?: string
  onSubmit: (text: string) => void
  onEscape: () => void
  onShiftUp?: () => void
  onShiftDown?: () => void
  onCtrlO?: () => void
  busy?: boolean
  value?: string
  onChange?: (value: string) => void
}
```

In the first `useInput` block (the one that handles ESC and Shift arrows, line 52-67), add:

```ts
useInput(
  (input, key) => {
    if (key.escape) {
      onEscape();
      return;
    }
    if (key.ctrl && input === 'o') {
      onCtrlO?.();
      return;
    }
    if (key.shift && key.upArrow) {
      onShiftUp?.();
      return;
    }
    if (key.shift && key.downArrow) {
      onShiftDown?.();
      return;
    }
  },
);
```

- [ ] **Step 4: Wire the callback in TerminalChannel**

In `channels/terminal.tsx`, add `onCtrlO` to the props in `renderScreen`:

```ts
const props = {
  // ... existing
  onCtrlO: () => { this.verbose = !this.verbose; this.renderScreen(true); },
};
```

- [ ] **Step 5: Run typecheck**

Run: `pnpm --filter @onecell/nanoclaw run typecheck`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add packages/nanoclaw/src/terminal-app.tsx packages/nanoclaw/src/channels/terminal.tsx packages/nanoclaw/src/components/text-input.tsx
git commit -m "feat(nanoclaw): wire ctrl+o verbose toggle through TerminalApp"
```

---

### Task 6: Tests

**Files:**
- Modify: `packages/nanoclaw/src/channels/terminal.test.ts`
- Modify: `packages/nanoclaw/src/components/transcript.test.ts` (create if not exists)

- [ ] **Step 1: Write tests for tool transcript aggregation and verbose rendering**

Create or update `packages/nanoclaw/src/components/transcript.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { renderToString } from 'ink';
import React from 'react';
import { Transcript } from './transcript.js';
import type { TerminalPanelTranscriptEntry } from '../terminal-panel.js';

function toolEntry(tool: string, args: Record<string, unknown>, overrides?: Partial<TerminalPanelTranscriptEntry>): TerminalPanelTranscriptEntry {
  return {
    at: '2026-04-14T12:00:00.000Z',
    role: 'tool',
    text: `${tool}(${Object.values(args)[0] ?? ''})`,
    toolData: { tool, args, status: 'success' },
    ...overrides,
  };
}

describe('Transcript collapsed mode (verbose=false)', () => {
  it('aggregates consecutive tool entries into one summary line', () => {
    const entries: TerminalPanelTranscriptEntry[] = [
      toolEntry('workspace.read', { path: 'src/a.ts' }),
      toolEntry('workspace.read', { path: 'src/b.ts' }),
      toolEntry('workspace.search', { pattern: 'ExecutionEvent' }),
    ];
    const output = renderToString(<Transcript entries={entries} width={100} />);
    const plain = output.replace(/\x1b\[[0-9;]*m/g, '');
    expect(plain).toContain('Read 2 files');
    expect(plain).toContain('searched 1 pattern');
    expect(plain).toContain('ctrl+o to expand');
  });

  it('shows present progressive for running tools', () => {
    const entries: TerminalPanelTranscriptEntry[] = [
      toolEntry('workspace.read', { path: 'src/a.ts' }, { toolData: { tool: 'workspace.read', args: { path: 'src/a.ts' }, status: 'running' } }),
    ];
    const output = renderToString(<Transcript entries={entries} width={100} />);
    const plain = output.replace(/\x1b\[[0-9;]*m/g, '');
    expect(plain).toContain('...');
  });
});

describe('Transcript verbose mode (verbose=true)', () => {
  it('renders each tool call individually', () => {
    const entries: TerminalPanelTranscriptEntry[] = [
      toolEntry('workspace.read', { path: 'src/config.ts' }, { toolData: { tool: 'workspace.read', args: { path: 'src/config.ts' }, result: '42 lines', status: 'success' } }),
      toolEntry('js.exec', { code: 'return 1 + 1' }, { toolData: { tool: 'js.exec', args: { code: 'return 1 + 1' }, result: 2, status: 'success' } }),
    ];
    const output = renderToString(<Transcript entries={entries} width={100} verbose />);
    const plain = output.replace(/\x1b\[[0-9;]*m/g, '');
    expect(plain).toContain('Read src/config.ts');
    expect(plain).toContain('js.exec');
    expect(plain).not.toContain('ctrl+o to expand');
  });

  it('renders errors in red for failed tool calls', () => {
    const entries: TerminalPanelTranscriptEntry[] = [
      toolEntry('workspace.read', { path: 'missing.ts' }, { toolData: { tool: 'workspace.read', args: { path: 'missing.ts' }, status: 'error' } }),
    ];
    const output = renderToString(<Transcript entries={entries} width={100} verbose />);
    const plain = output.replace(/\x1b\[[0-9;]*m/g, '');
    expect(plain).toContain('error');
  });
});
```

- [ ] **Step 2: Run the transcript tests**

Run: `pnpm --filter @onecell/nanoclaw run test -- --reporter verbose src/components/transcript.test.ts`
Expected: All tests PASS

- [ ] **Step 3: Write integration test for ctrl+o toggle in terminal.test.ts**

Add to `packages/nanoclaw/src/channels/terminal.test.ts`, after the existing tests:

```ts
it('toggles verbose mode via ctrl+o and re-renders transcript', async () => {
  const writeSpy = vi
    .spyOn(process.stdout, 'write')
    .mockImplementation(() => true);

  try {
    const factory = getChannelFactory('terminal');
    const channel = factory!({
      onMessage: vi.fn(),
      onChatMetadata: vi.fn(),
      registeredGroups: () => ({}),
    });

    expect(channel).not.toBeNull();
    await channel!.connect();

    // Simulate a tool event being emitted
    const { emitTerminalToolEvent } = await import('./terminal.js');
    emitTerminalToolEvent('term:canary-group', 'workspace.read(src/config.ts)', {
      tool: 'workspace.read',
      args: { path: 'src/config.ts' },
      status: 'success',
    });
    await new Promise((resolve) => setTimeout(resolve, 0));

    // Extract onCtrlO from rendered props and call it
    const props = inkHarness.getLastProps();
    const onCtrlO = props.onCtrlO as (() => void) | undefined;
    expect(onCtrlO).toBeTypeOf('function');
    onCtrlO!();
    await new Promise((resolve) => setTimeout(resolve, 0));

    const finalFrame = String(writeSpy.mock.calls.at(-1)?.[0] ?? '').replace(
      /\x1b\[[0-9;]*m/g,
      '',
    );
    // In verbose mode, tool details should be visible without the collapsed summary
    expect(finalFrame).toContain('src/config.ts');
    expect(finalFrame).not.toContain('ctrl+o to expand');

    await channel!.disconnect();
  } finally {
    writeSpy.mockRestore();
  }
});
```

- [ ] **Step 4: Run all nanoclaw tests**

Run: `pnpm --filter @onecell/nanoclaw run test`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add packages/nanoclaw/src/components/transcript.test.ts packages/nanoclaw/src/channels/terminal.test.ts
git commit -m "test(nanoclaw): add tests for tool output aggregation, verbose rendering, and ctrl+o toggle"
```

---

### Task 7: Final verification

- [ ] **Step 1: Run full typecheck**

Run: `pnpm --filter @onecell/nanoclaw run typecheck`
Expected: PASS

- [ ] **Step 2: Run full lint**

Run: `pnpm --filter @onecell/nanoclaw run lint`
Expected: PASS

- [ ] **Step 3: Run full test suite**

Run: `pnpm --filter @onecell/nanoclaw run test`
Expected: All tests PASS

- [ ] **Step 4: Manual smoke test (if edgejs binary available)**

Run the terminal app and verify:
1. Tool calls show aggregated summary with "(ctrl+o to expand)"
2. Pressing ctrl+o toggles to verbose mode showing individual tool details
3. Pressing ctrl+o again returns to collapsed mode
4. Tool results update the status from "running" to success/error
