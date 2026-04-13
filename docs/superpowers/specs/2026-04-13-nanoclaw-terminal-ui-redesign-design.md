---
name: nanoclaw-terminal-ui-redesign
description: NanoClaw terminal channel UI redesign — migrate from raw ANSI to Ink/React with Claude Code-inspired visual style
type: project
created: 2026-04-13
---

# NanoClaw Terminal UI Redesign

Migrate the terminal channel from raw ANSI string rendering to Ink/React with an adaptive theme system and Claude Code-inspired minimalist visual style.

## Why

The current terminal panel (`terminal-panel.ts`, ~794 lines) renders by concatenating ANSI escape sequences into a single string and writing it to stdout. This approach:
- Cannot render interactive components or animations
- Has no theme system — 7 hardcoded 256-color codes don't adapt to light/dark terminals
- Produces flat, visually undifferentiated output — all sections look the same
- Makes iteration painful — every visual change requires manual width/ANSI calculations

Claude Code, Codex, and OpenCode all use component-based rendering (Ink, Ratatui, opentui) with semantic theme tokens. NanoClaw should too.

## Scope

### In scope
1. **Ink/React rendering** — Replace raw ANSI with standard `ink` npm package
2. **Adaptive theme system** — Auto-detect terminal dark/light, ~15 semantic color tokens, NanoClaw brand accent
3. **Claude Code-inspired visual style** — Minimal layout, brand dot markers, tree-line tool steps, compact agent lines, one-line status bars
4. **Spinner animation** — Ink spinner for thinking/running states
5. **Preserve existing functionality** — All surfaces (transcript, agents, side panel, drawer, overlay) continue to work

### Out of scope
- Full theme library with swappable themes (OpenCode-style)
- Syntax highlighting / diff rendering (future)
- Shimmer animation effects (future)
- Migration of the readline input handling (keep existing approach, wrap in Ink)

## Architecture

### Theme system

New file: `src/theme.ts`

```typescript
type NanoClawTheme = {
  // Brand
  brand: string           // #d77757 — NanoClaw orange
  brandShimmer: string    // lighter variant for spinner

  // Identity
  user: string            // #ffffff — user messages
  assistant: string       // same as brand

  // Status
  success: string         // #4eb865
  error: string           // #ff6b80
  warning: string         // #ffc107

  // Text levels
  text: string            // #ffffff — primary
  inactive: string        // #999999 — secondary
  subtle: string          // #505050 — very dim

  // UI elements
  suggestion: string      // #b1b9f9 — links, tool names
  border: string          // #505050 — dividers

  // Agent palette (8 colors for agent identity)
  agentRed: string
  agentBlue: string
  agentGreen: string
  agentYellow: string
  agentPurple: string
  agentOrange: string
  agentPink: string
  agentCyan: string
}
```

Two concrete themes: `darkTheme` and `lightTheme` (matching Claude Code's approach). Theme auto-detection via `$COLORFGBG` env var or OSC 11 query. Fallback to dark.

### Visual style

**Status bar (top, one line):**
```
◆ NanoClaw · edge · 3 agents · 1 running
```
- `◆` in brand color
- Name, backend, agent counts in inactive color
- Running count in success color when > 0

**Transcript — user messages:**
```
help me refactor auth
```
- Plain white text, no prefix, no background
- Full width

**Transcript — assistant messages:**
```
⏺ I'll analyze the module and create a plan
  ├─ Read src/auth.ts
  ├─ Read src/middleware.ts
  └─ 2 files read
```
- `⏺` brand orange dot prefix
- Tool steps indented with `├─ └─` tree connectors in inactive color
- Tool names (Read, Write, Bash) in suggestion color
- Success/failure indicators in success/error color

**Agent list:**
```
  ▸ root     ● 4s  analyzing codebase
    planner  ○ —   waiting
    worker-1 ● 2s  reading files
```
- `▸` focus marker in brand color for selected agent
- Other agents get subtle indent
- `●` running in success, `○` idle in subtle
- Agent name, status dot, elapsed, summary
- No section title, no table borders

**Status bar (bottom, one line):**
```
  › Type your message... │ ESC dismiss · /help
```
- `›` prompt indicator in text color
- Hints in subtle color

**Surfaces (side panel, drawer, overlay):**
- Side panel: renders below agent list, same visual treatment, title in brand color
- Drawer: separated by subtle `─` rule, content below
- Overlay: full-width block with title in brand color

### Component structure

New/modified files:

```
src/theme.ts                    — Theme definitions and auto-detection
src/terminal-app.tsx            — Root Ink component, renders the full panel
src/components/status-bar.tsx   — Top status bar
src/components/transcript.tsx   — Transcript feed (user + assistant messages + steps)
src/components/agent-list.tsx   — Agent status lines
src/components/prompt-bar.tsx   — Bottom prompt bar with hints
src/components/surface.tsx      — Side panel / drawer / overlay surfaces
src/components/spinner.tsx      — Ink spinner for thinking state
```

Modified files:

```
src/channels/terminal.ts        — Replace renderScreen() with Ink render, keep readline + input handling
src/terminal-panel.ts           — Removed (logic moves to components)
src/terminal-observability.ts   — Unchanged (data layer)
```

### Ink integration approach

The terminal channel currently:
1. Uses readline for input
2. Manages raw stdin for keyboard shortcuts (Shift+Up/Down, ESC)
3. Calls `buildTerminalPanel()` to get a string
4. Writes `\x1b[2J\x1b[H` + string to stdout

Migration:
- **Keep readline and raw stdin handling** in `terminal.ts`
- **Replace the render path**: instead of building a string, render an Ink `<TerminalApp>` component
- Ink's `<Box>` and `<Text>` handle all layout and color
- Use `ink.useInput()` for keyboard handling (migrate from raw stdin over time)
- Ink renders to an alternate screen buffer by default — configure for inline rendering if needed

### Ink render lifecycle

```typescript
// terminal.ts
import { render } from 'ink'
import { TerminalApp } from './terminal-app.js'

// In TerminalChannel:
private inkInstance: ReturnType<typeof render> | null = null

startRenderLoop() {
  this.inkInstance = render(
    <TerminalApp
      statusLine={this.buildStatusLine()}
      busy={this.busy}
      turn={this.currentTurn}
      recentTranscript={this.transcript}
      // ... other props
    />,
    { exitOnCtrlC: false }
  )
}

updateRender() {
  // Ink re-renders on state change — use React state or props
}
```

The key insight: Ink is React. We don't manually trigger re-renders. We update state/props and Ink handles the rest.

### Data flow

```
terminal-observability.ts  →  TerminalApp (Ink root)
                                  ├── StatusBar (props: backend, agentCount, runningCount)
                                  ├── Transcript (props: entries, turn)
                                  │     ├── UserMessage
                                  │     ├── AssistantBlock (dot + tree steps)
                                  │     └── ToolStep (├─ / └─ line)
                                  ├── AgentList (props: workers, focusKey)
                                  ├── Surface (props: sidePanel/drawer/overlay)
                                  └── PromptBar (props: footer hints)
```

## Dependencies

- `ink` — React-based terminal rendering (latest stable, ~5.x)
- `react` — Peer dependency of ink
- `chalk` — For color conversion if needed (ink uses chalk internally)

## Risks

1. **Ink + readline coexistence** — Ink takes over stdout. We need to ensure readline input still works alongside Ink rendering. Mitigation: Ink supports `exitOnCtrlC: false` and can be configured for non-fullscreen mode. Test early.

2. **Performance** — Current panel renders on every update. Ink re-renders on state change but uses React's virtual DOM diffing. Should be equal or better. Mitigation: profile with large agent counts.

3. **Terminal compatibility** — Ink works best with truecolor terminals. Mitigation: theme system provides fallback values for 256-color and 16-color terminals (like Claude Code's `dark-ansi` theme).

## Verification

- All existing tests in `terminal.test.ts` must continue to pass
- New theme tests: verify dark/light detection, color token resolution
- New component tests: verify rendering of each visual element
- Manual verification: run in both dark and light terminal themes
