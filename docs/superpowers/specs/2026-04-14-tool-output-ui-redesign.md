# Tool Output UI Redesign

**Date:** 2026-04-14
**Status:** Approved
**Approach:** A — Transcript-entry-level redesign

## Problem

1. Tool call output in the nanoclaw terminal is flat, truncated text with no way to expand details.
2. Tool results are discarded entirely (`onToolResult` is a no-op).
3. There is no mechanism for users to inspect what tools did, what args they received, or what they returned.

Reference: claude-code implements this via ctrl+o transcript toggle and collapsed summary aggregation.

## Design

### Data Model

Extend `TerminalPanelTranscriptEntry` with a new `role: 'tool'` carrying structured tool data.

```ts
interface ToolTranscriptEntry {
  tool: string          // e.g. 'workspace.read', 'js.exec'
  args: Record<string, unknown>
  result?: unknown      // undefined until tool_result arrives
  status: 'running' | 'success' | 'error'
}

interface TerminalPanelTranscriptEntry {
  at: string
  role: 'user' | 'assistant' | 'system' | 'tool'
  text: string                    // summary text for system/assistant/user
  toolData?: ToolTranscriptEntry  // only when role === 'tool'
}
```

Each tool call is a single entry created on `tool_call`, updated on `tool_result`.

### Event Pipeline

`edge-event-dispatcher.ts` changes:

```
onToolCall(event):
  1. Build summary text via summarizeToolArgs() (existing logic)
  2. Emit via new emitTerminalToolEvent(jid, summary, { tool, args, status: 'running' })
     — this creates a { role: 'tool', text, toolData } entry in the transcript
     — the function returns the entry object reference
  3. Store entry reference in pendingToolCalls map keyed by executionId

onToolResult(event):
  1. Look up pendingToolCalls.get(executionId) for this tool
  2. Mutate entry.toolData in place: result = event.result, status = 'success' | 'error'
  3. Remove from pendingToolCalls map
  4. Call emitTerminalRefresh(jid) to trigger re-render (no new transcript entry added)

onFinal/onError:
  Clear any orphaned pendingToolCalls entries
```

New exports from `channels/terminal.ts`:
- `emitTerminalToolEvent(jid, text, toolData)` — creates a tool transcript entry and triggers render. Returns the entry reference.
- `emitTerminalRefresh(jid)` — triggers render without adding a transcript entry.

The pending map is a local variable inside `createPersistentExecutionEventHooks`. No global state needed. `tool_call` and `tool_result` events arrive sequentially from the same runner iteration, so matching is straightforward. Each hook instance serves a single execution, so the map holds at most one pending entry at a time.

### Transcript Rendering

`transcript.tsx` gains a `verbose` boolean prop controlling two display modes.

#### Collapsed Mode (default, verbose=false)

Consecutive `role: 'tool'` entries are aggregated into one summary line:

```
  ├─ Read 2 files, searched 1 pattern (ctrl+o to expand)
  └─ ⏺ assistant reply text
```

Aggregation counts by category:
- `workspace.read` / `workspace.list` → "Read N files"
- `workspace.search` → "Searched N patterns"
- `workspace.write` / `workspace.apply_patch` → "Wrote N files"
- `http.fetch` → "Fetched N URLs"
- `js.exec` → "Executed N JS snippets"
- `message.send` → "Sent N messages"
- `task.*` → "Managed tasks"
- other → "Used N tools"

Running calls use present progressive: "Reading 2 files... (ctrl+o to expand)".
Failed calls show error count in red: "Read 2 files, **1 failed** (ctrl+o to expand)".

#### Verbose Mode (verbose=true, toggled by ctrl+o)

Each tool call renders individually with full args and result:

```
  ├─ Read src/config.ts (42 lines)
  ├─ Search "ExecutionEvent" in src/ (3 results)
  ├─ Write src/terminal.tsx (+12 lines)
  ├─ js.exec (→ "Monday")
  │   const days = ['Sunday', 'Monday', ...]
  │   const today = new Date().getDay()
  │   return days[today]
  └─ ⏺ assistant reply text
```

Per-tool verbose format:
- `workspace.read` → `Read <path> (<N> lines)` or error detail
- `workspace.search` → `Search "<pattern>" in <path> (<N> results)`
- `workspace.write` → `Write <path> (+<N> lines)` or `(patch applied)`
- `js.exec` → `js.exec (→ <truncated result>)` with indented code below
- `http.fetch` → `Fetch <url> (<status>)`
- other → `<tool>(<summary>) → <truncated result>`

Long outputs truncated to terminal width minus indent. Errors rendered in red.

### ctrl+o Toggle

`terminal.tsx` (`TerminalChannel`) adds:
- `private verbose = false` state
- ctrl+o binding in Ink `useInput` handler (outside text-input scope, works even when busy)
- Passes `verbose` through to `TerminalApp` → `Transcript`

The hint `(ctrl+o to expand)` is visible on the aggregated line in non-verbose mode.

## Files Changed

| File | Change |
|------|--------|
| `terminal-panel.ts` | Add `ToolTranscriptEntry`, extend `TerminalPanelTranscriptEntry` with `role: 'tool'` and `toolData` |
| `edge-event-dispatcher.ts` | Add `pendingToolCalls` map, pair `tool_call`/`tool_result` into structured entries, clear on final/error |
| `transcript.tsx` | Add `verbose` prop, aggregation logic (`aggregateToolEntries()`), tool-name-to-category map, per-tool verbose rendering |
| `terminal-app.tsx` | Add `verbose` prop, forward to `Transcript` |
| `terminal.tsx` | Add `verbose` state, bind ctrl+o to toggle, pass to `TerminalApp` |
| `channels/terminal.ts` | Add `emitTerminalToolEvent` and `emitTerminalRefresh` exports; update `recordTerminalTranscript` to handle `tool` role |
| `channels/terminal.test.ts` | Tests for verbose toggle, aggregation, and tool entry rendering |

**Unchanged:** `edge-runner.ts`, `edge-backend.ts`, `agent-backend.ts`, `text-input.tsx` — event flow and key handling stay the same (ctrl+o bound in `terminal.tsx` useInput, outside the text input handler).
