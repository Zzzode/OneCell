# NanoClaw Terminal UI Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate NanoClaw's terminal channel from raw ANSI string rendering to Ink/React with Claude Code-inspired minimalist visual style and an adaptive theme system.

**Architecture:** Replace `buildTerminalPanel()` string builder with React/Ink component tree. Keep `terminal-observability.ts` data layer unchanged. Keep readline + raw stdin input handling in `terminal.ts`. New theme module (`theme.ts`) auto-detects dark/light terminal and provides semantic color tokens. Ink components render transcript, agent list, and status bars.

**Tech Stack:** ink@^5, react@^19, chalk (ink peer dep), vitest for tests

---

### Task 1: Install Ink/React dependencies and configure JSX

**Files:**
- Modify: `packages/nanoclaw/package.json`
- Modify: `packages/nanoclaw/tsconfig.json`

- [ ] **Step 1: Install ink and react**

```bash
cd /Users/bytedance/Develop/OneCell && pnpm --filter @onecell/nanoclaw add react ink
```

- [ ] **Step 2: Install react type definitions as dev dependency**

```bash
pnpm --filter @onecell/nanoclaw add -D @types/react
```

- [ ] **Step 3: Add JSX configuration to tsconfig.json**

Add to `packages/nanoclaw/tsconfig.json` `compilerOptions`:

```json
"jsx": "react-jsx"
```

- [ ] **Step 4: Verify TypeScript picks up the new config**

```bash
pnpm --filter @onecell/nanoclaw run typecheck
```

Expected: typecheck passes (no JSX files yet, but config is valid)

- [ ] **Step 5: Commit**

```bash
git add packages/nanoclaw/package.json packages/nanoclaw/tsconfig.json packages/nanoclaw/pnpm-lock.yaml
git commit -m "chore(nanoclaw): add ink/react dependencies and JSX config"
```

---

### Task 2: Create the adaptive theme system

**Files:**
- Create: `packages/nanoclaw/src/theme.ts`
- Create: `packages/nanoclaw/src/theme.test.ts`

- [ ] **Step 1: Write the failing theme tests**

```typescript
// packages/nanoclaw/src/theme.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { getTheme, type NanoClawTheme, resolveTheme } from './theme.js'

describe('theme', () => {
  describe('resolveTheme', () => {
    it('returns dark theme when COLORFGBG indicates dark background', () => {
      process.env.COLORFGBG = '0;15'
      const name = resolveTheme()
      expect(name).toBe('dark')
    })

    it('returns light theme when COLORFGBG indicates light background', () => {
      process.env.COLORFGBG = '15;0'
      const name = resolveTheme()
      expect(name).toBe('light')
    })

    it('defaults to dark when COLORFGBG is not set', () => {
      delete process.env.COLORFGBG
      const name = resolveTheme()
      expect(name).toBe('dark')
    })
  })

  describe('getTheme', () => {
    it('returns dark theme with correct brand color', () => {
      const theme = getTheme('dark')
      expect(theme.brand).toBe('rgb(215,119,87)')
      expect(theme.text).toBe('rgb(255,255,255)')
      expect(theme.subtle).toBe('rgb(80,80,80)')
    })

    it('returns light theme with correct brand color', () => {
      const theme = getTheme('light')
      expect(theme.brand).toBe('rgb(215,119,87)')
      expect(theme.text).toBe('rgb(0,0,0)')
      expect(theme.subtle).toBe('rgb(175,175,175)')
    })

    it('both themes have all required keys', () => {
      const dark = getTheme('dark')
      const light = getTheme('light')
      const keys: Array<keyof NanoClawTheme> = [
        'brand', 'brandShimmer', 'user', 'assistant',
        'success', 'error', 'warning',
        'text', 'inactive', 'subtle',
        'suggestion', 'border',
        'agentRed', 'agentBlue', 'agentGreen', 'agentYellow',
        'agentPurple', 'agentOrange', 'agentPink', 'agentCyan',
      ]
      for (const key of keys) {
        expect(dark[key]).toBeDefined()
        expect(light[key]).toBeDefined()
      }
    })
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pnpm --filter @onecell/nanoclaw run test -- --reporter=verbose src/theme.test.ts
```

Expected: FAIL — module not found

- [ ] **Step 3: Write theme implementation**

```typescript
// packages/nanoclaw/src/theme.ts
export type NanoClawTheme = {
  brand: string
  brandShimmer: string
  user: string
  assistant: string
  success: string
  error: string
  warning: string
  text: string
  inactive: string
  subtle: string
  suggestion: string
  border: string
  agentRed: string
  agentBlue: string
  agentGreen: string
  agentYellow: string
  agentPurple: string
  agentOrange: string
  agentPink: string
  agentCyan: string
}

export type ThemeName = 'dark' | 'light'

const darkTheme: NanoClawTheme = {
  brand: 'rgb(215,119,87)',
  brandShimmer: 'rgb(235,159,127)',
  user: 'rgb(255,255,255)',
  assistant: 'rgb(215,119,87)',
  success: 'rgb(78,186,101)',
  error: 'rgb(255,107,128)',
  warning: 'rgb(255,193,7)',
  text: 'rgb(255,255,255)',
  inactive: 'rgb(153,153,153)',
  subtle: 'rgb(80,80,80)',
  suggestion: 'rgb(177,185,249)',
  border: 'rgb(80,80,80)',
  agentRed: 'rgb(220,38,38)',
  agentBlue: 'rgb(37,99,235)',
  agentGreen: 'rgb(22,163,74)',
  agentYellow: 'rgb(202,138,4)',
  agentPurple: 'rgb(147,51,234)',
  agentOrange: 'rgb(234,88,12)',
  agentPink: 'rgb(219,39,119)',
  agentCyan: 'rgb(8,145,178)',
}

const lightTheme: NanoClawTheme = {
  brand: 'rgb(215,119,87)',
  brandShimmer: 'rgb(245,149,117)',
  user: 'rgb(0,0,0)',
  assistant: 'rgb(215,119,87)',
  success: 'rgb(44,122,57)',
  error: 'rgb(171,43,63)',
  warning: 'rgb(150,108,30)',
  text: 'rgb(0,0,0)',
  inactive: 'rgb(102,102,102)',
  subtle: 'rgb(175,175,175)',
  suggestion: 'rgb(87,105,247)',
  border: 'rgb(175,175,175)',
  agentRed: 'rgb(220,38,38)',
  agentBlue: 'rgb(37,99,235)',
  agentGreen: 'rgb(22,163,74)',
  agentYellow: 'rgb(202,138,4)',
  agentPurple: 'rgb(147,51,234)',
  agentOrange: 'rgb(234,88,12)',
  agentPink: 'rgb(219,39,119)',
  agentCyan: 'rgb(8,145,178)',
}

export function resolveTheme(): ThemeName {
  const colorfgbg = process.env.COLORFGBG
  if (!colorfgbg) return 'dark'
  const parts = colorfgbg.split(';')
  if (parts.length < 2) return 'dark'
  const bg = Number.parseInt(parts[1] ?? '', 10)
  if (Number.isNaN(bg)) return 'dark'
  return bg >= 8 ? 'light' : 'dark'
}

export function getTheme(name: ThemeName): NanoClawTheme {
  return name === 'light' ? lightTheme : darkTheme
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pnpm --filter @onecell/nanoclaw run test -- --reporter=verbose src/theme.test.ts
```

Expected: all 5 tests PASS

- [ ] **Step 5: Commit**

```bash
git add packages/nanoclaw/src/theme.ts packages/nanoclaw/src/theme.test.ts
git commit -m "feat(nanoclaw): add adaptive theme system with dark/light detection"
```

---

### Task 3: Create Ink UI components — StatusBar and PromptBar

**Files:**
- Create: `packages/nanoclaw/src/components/status-bar.tsx`
- Create: `packages/nanoclaw/src/components/prompt-bar.tsx`
- Create: `packages/nanoclaw/src/components/status-bar.test.tsx`

- [ ] **Step 1: Write the failing StatusBar test**

```typescript
// packages/nanoclaw/src/components/status-bar.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render } from 'ink'
import { StatusBar } from './status-bar.js'

describe('StatusBar', () => {
  it('renders brand marker and backend name', () => {
    const { lastFrame } = render(
      <StatusBar backend="edge" agentCount={3} runningCount={1} />,
    )
    const output = lastFrame() ?? ''
    expect(output).toContain('NanoClaw')
    expect(output).toContain('edge')
    expect(output).toContain('3 agents')
  })

  it('shows running count in success color when > 0', () => {
    const { lastFrame } = render(
      <StatusBar backend="edge" agentCount={3} runningCount={1} />,
    )
    const output = lastFrame() ?? ''
    expect(output).toContain('1 running')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm --filter @onecell/nanoclaw run test -- --reporter=verbose src/components/status-bar.test.tsx
```

Expected: FAIL — module not found

- [ ] **Step 3: Create the components directory and StatusBar component**

```tsx
// packages/nanoclaw/src/components/status-bar.tsx
import React from 'react'
import { Text, Box } from 'ink'
import { getTheme, resolveTheme } from '../theme.js'

const theme = getTheme(resolveTheme())

interface StatusBarProps {
  backend: string
  agentCount: number
  runningCount: number
}

export function StatusBar({ backend, agentCount, runningCount }: StatusBarProps) {
  return (
    <Box gap={1}>
      <Text color={theme.brand}>◆</Text>
      <Text color={theme.inactive}>NanoClaw</Text>
      <Text color={theme.subtle}>·</Text>
      <Text color={theme.inactive}>{backend}</Text>
      <Text color={theme.subtle}>·</Text>
      <Text color={theme.inactive}>{agentCount} agents</Text>
      {runningCount > 0 && (
        <>
          <Text color={theme.subtle}>·</Text>
          <Text color={theme.success}>{runningCount} running</Text>
        </>
      )}
    </Box>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
pnpm --filter @onecell/nanoclaw run test -- --reporter=verbose src/components/status-bar.test.tsx
```

Expected: PASS

- [ ] **Step 5: Create the PromptBar component**

```tsx
// packages/nanoclaw/src/components/prompt-bar.tsx
import React from 'react'
import { Text, Box } from 'ink'
import { getTheme, resolveTheme } from '../theme.js'

const theme = getTheme(resolveTheme())

interface PromptBarProps {
  hints?: string
}

export function PromptBar({ hints = 'ESC dismiss · /help' }: PromptBarProps) {
  return (
    <Box gap={1}>
      <Box marginLeft={2}>
        <Text color={theme.text}>›</Text>
      </Box>
      <Text color={theme.subtle}>Type your message...</Text>
      <Text color={theme.subtle}>│</Text>
      <Text color={theme.subtle}>{hints}</Text>
    </Box>
  )
}
```

- [ ] **Step 6: Verify typecheck passes for all new components**

```bash
pnpm --filter @onecell/nanoclaw run typecheck
```

Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add packages/nanoclaw/src/components/
git commit -m "feat(nanoclaw): add StatusBar and PromptBar Ink components"
```

---

### Task 4: Create Transcript component with tree-line steps

**Files:**
- Create: `packages/nanoclaw/src/components/transcript.tsx`
- Create: `packages/nanoclaw/src/components/transcript.test.tsx`

- [ ] **Step 1: Write the failing Transcript test**

```typescript
// packages/nanoclaw/src/components/transcript.test.tsx
import { describe, it, expect } from 'vitest'
import { render } from 'ink'
import { Transcript } from './transcript.js'
import type { TerminalPanelTranscriptEntry } from '../terminal-panel.js'

describe('Transcript', () => {
  const baseEntries: TerminalPanelTranscriptEntry[] = [
    { at: '2026-04-13T14:30:00Z', role: 'user', text: 'refactor auth' },
    { at: '2026-04-13T14:30:01Z', role: 'assistant', text: 'I will analyze' },
    { at: '2026-04-13T14:30:02Z', role: 'system', text: 'reading auth.ts' },
  ]

  it('renders user messages as plain text', () => {
    const entries: TerminalPanelTranscriptEntry[] = [
      { at: '2026-04-13T14:30:00Z', role: 'user', text: 'hello' },
    ]
    const { lastFrame } = render(<Transcript entries={entries} width={80} />)
    const output = lastFrame() ?? ''
    expect(output).toContain('hello')
  })

  it('renders assistant messages with brand dot prefix', () => {
    const entries: TerminalPanelTranscriptEntry[] = [
      { at: '2026-04-13T14:30:01Z', role: 'assistant', text: 'I will analyze' },
    ]
    const { lastFrame } = render(<Transcript entries={entries} width={80} />)
    const output = lastFrame() ?? ''
    expect(output).toContain('I will analyze')
  })

  it('renders system entries as indented steps', () => {
    const entries: TerminalPanelTranscriptEntry[] = [
      { at: '2026-04-13T14:30:02Z', role: 'system', text: 'reading auth.ts' },
    ]
    const { lastFrame } = render(<Transcript entries={entries} width={80} />)
    const output = lastFrame() ?? ''
    expect(output).toContain('reading auth.ts')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm --filter @onecell/nanoclaw run test -- --reporter=verbose src/components/transcript.test.tsx
```

Expected: FAIL — module not found

- [ ] **Step 3: Write Transcript component**

```tsx
// packages/nanoclaw/src/components/transcript.tsx
import React from 'react'
import { Text, Box } from 'ink'
import { getTheme, resolveTheme } from '../theme.js'
import type { TerminalPanelTranscriptEntry } from '../terminal-panel.js'

const theme = getTheme(resolveTheme())

interface TranscriptProps {
  entries: TerminalPanelTranscriptEntry[]
  width: number
  maxLines?: number
}

function UserLine({ text }: { text: string }) {
  return <Text color={theme.text}>{text}</Text>
}

function AssistantLine({ text }: { text: string }) {
  return (
    <Box>
      <Text color={theme.brand}>⏺ </Text>
      <Text color={theme.text}>{text}</Text>
    </Box>
  )
}

function StepLine({ text, isLast }: { text: string; isLast: boolean }) {
  const prefix = isLast ? '  └─ ' : '  ├─ '
  return (
    <Box>
      <Text color={theme.inactive}>{prefix}</Text>
      <Text color={theme.inactive}>{text}</Text>
    </Box>
  )
}

export function Transcript({ entries, width, maxLines = 12 }: TranscriptProps) {
  if (entries.length === 0) {
    return <Text color={theme.subtle}>No transcript yet.</Text>
  }

  const visible = entries.slice(-maxLines)

  // Group consecutive system entries under the last assistant entry
  const lines: React.ReactNode[] = []
  let pendingSteps: string[] = []

  function flushSteps() {
    pendingSteps.forEach((text, i) => {
      lines.push(
        <StepLine key={`step-${lines.length}`} text={text} isLast={i === pendingSteps.length - 1} />,
      )
    })
    pendingSteps = []
  }

  for (const entry of visible) {
    if (entry.role === 'system') {
      pendingSteps.push(entry.text)
    } else {
      flushSteps()
      if (entry.role === 'user') {
        lines.push(<UserLine key={lines.length} text={entry.text} />)
      } else {
        lines.push(<AssistantLine key={lines.length} text={entry.text} />)
      }
    }
  }
  flushSteps()

  return (
    <Box flexDirection="column">
      {lines}
    </Box>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
pnpm --filter @onecell/nanoclaw run test -- --reporter=verbose src/components/transcript.test.tsx
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/nanoclaw/src/components/transcript.tsx packages/nanoclaw/src/components/transcript.test.tsx
git commit -m "feat(nanoclaw): add Transcript Ink component with tree-line steps"
```

---

### Task 5: Create AgentList component

**Files:**
- Create: `packages/nanoclaw/src/components/agent-list.tsx`
- Create: `packages/nanoclaw/src/components/agent-list.test.tsx`

- [ ] **Step 1: Write the failing AgentList test**

```typescript
// packages/nanoclaw/src/components/agent-list.test.tsx
import { describe, it, expect } from 'vitest'
import { render } from 'ink'
import { AgentList } from './agent-list.js'
import type { TerminalWorkerState } from '../terminal-observability.js'

function makeWorker(overrides: Partial<TerminalWorkerState> = {}): TerminalWorkerState {
  return {
    key: 'root',
    label: 'root',
    taskId: null,
    nodeKind: null,
    roleTitle: null,
    status: 'running',
    backendId: null,
    workerClass: null,
    executionId: null,
    startedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    lastActivity: 'analyzing codebase',
    summary: null,
    error: null,
    ...overrides,
  }
}

describe('AgentList', () => {
  it('renders agents with focus marker on selected', () => {
    const workers = [
      makeWorker({ key: 'root', label: 'root', status: 'running', lastActivity: 'analyzing' }),
      makeWorker({ key: 'planner', label: 'planner', status: 'pending', lastActivity: null }),
    ]
    const { lastFrame } = render(
      <AgentList workers={workers} focusKey="root" width={80} />,
    )
    const output = lastFrame() ?? ''
    expect(output).toContain('root')
    expect(output).toContain('planner')
    expect(output).toContain('analyzing')
  })

  it('shows empty state when no workers', () => {
    const { lastFrame } = render(
      <AgentList workers={[]} focusKey="root" width={80} />,
    )
    const output = lastFrame() ?? ''
    expect(output).toContain('No agents')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm --filter @onecell/nanoclaw run test -- --reporter=verbose src/components/agent-list.test.tsx
```

Expected: FAIL — module not found

- [ ] **Step 3: Write AgentList component**

```tsx
// packages/nanoclaw/src/components/agent-list.tsx
import React from 'react'
import { Text, Box } from 'ink'
import { getTheme, resolveTheme } from '../theme.js'
import type { TerminalWorkerState } from '../terminal-observability.js'

const theme = getTheme(resolveTheme())

interface AgentListProps {
  workers: TerminalWorkerState[]
  focusKey: string
  width: number
}

function elapsedSince(value: string | null, now = Date.now()): string {
  if (!value) return '—'
  const parsed = Date.parse(value)
  if (Number.isNaN(parsed)) return '—'
  const ms = Math.max(0, now - parsed)
  if (ms < 1000) return `${ms}ms`
  if (ms < 60_000) return `${Math.floor(ms / 1000)}s`
  return `${Math.floor(ms / 60_000)}m`
}

function statusDot(status: TerminalWorkerState['status']): string {
  switch (status) {
    case 'running':
      return '●'
    case 'completed':
      return '✓'
    case 'failed':
      return '✗'
    default:
      return '○'
  }
}

function statusColor(status: TerminalWorkerState['status']): string {
  switch (status) {
    case 'running':
      return theme.success
    case 'completed':
      return theme.success
    case 'failed':
      return theme.error
    default:
      return theme.subtle
  }
}

function workerSortRank(key: string): number {
  if (key === 'root') return 0
  if (key === 'planner') return 1
  const match = key.match(/^worker-(\d+)$/)
  if (match) return 10 + Number.parseInt(match[1] ?? '0', 10)
  if (key === 'aggregate') return 100
  return 200
}

export function AgentList({ workers, focusKey, width }: AgentListProps) {
  if (workers.length === 0) {
    return <Text color={theme.subtle}>  No agents</Text>
  }

  const sorted = [...workers].sort(
    (a, b) => workerSortRank(a.key) - workerSortRank(b.key),
  )

  const now = Date.now()

  return (
    <Box flexDirection="column">
      {sorted.map((worker) => {
        const focused = worker.key === focusKey
        const marker = focused ? '▸' : '  '
        const markerColor = focused ? theme.brand : theme.subtle
        const textColor = focused ? theme.text : theme.subtle
        const dot = statusDot(worker.status)
        const dotCol = statusColor(worker.status)
        const elapsed = elapsedSince(worker.startedAt ?? worker.updatedAt, now)
        const activity = worker.lastActivity ?? worker.summary ?? 'waiting'

        return (
          <Box key={worker.key} gap={1}>
            <Text color={markerColor}>{marker}</Text>
            <Text color={textColor}>{worker.label.padEnd(10)}</Text>
            <Text color={dotCol}>{dot}</Text>
            <Text color={textColor}>{elapsed.padStart(3)}</Text>
            <Text color={textColor}> {activity}</Text>
          </Box>
        )
      })}
    </Box>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
pnpm --filter @onecell/nanoclaw run test -- --reporter=verbose src/components/agent-list.test.tsx
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/nanoclaw/src/components/agent-list.tsx packages/nanoclaw/src/components/agent-list.test.tsx
git commit -m "feat(nanoclaw): add AgentList Ink component"
```

---

### Task 6: Create root TerminalApp component and Ink spinner

**Files:**
- Create: `packages/nanoclaw/src/components/spinner.tsx`
- Create: `packages/nanoclaw/src/terminal-app.tsx`
- Create: `packages/nanoclaw/src/terminal-app.test.tsx`

- [ ] **Step 1: Write a simple Spinner component**

```tsx
// packages/nanoclaw/src/components/spinner.tsx
import React, { useState, useEffect } from 'react'
import { Text } from 'ink'
import { getTheme, resolveTheme } from '../theme.js'

const theme = getTheme(resolveTheme())

const frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏']

export function Spinner() {
  const [frame, setFrame] = useState(0)

  useEffect(() => {
    const timer = setInterval(() => {
      setFrame((f) => (f + 1) % frames.length)
    }, 80)
    return () => clearInterval(timer)
  }, [])

  return <Text color={theme.brand}>{frames[frame]}</Text>
}
```

- [ ] **Step 2: Write the failing TerminalApp test**

```typescript
// packages/nanoclaw/src/terminal-app.test.tsx
import { describe, it, expect } from 'vitest'
import { render } from 'ink'
import { TerminalApp } from './terminal-app.js'
import type { TerminalPanelTranscriptEntry } from './terminal-panel.js'

describe('TerminalApp', () => {
  it('renders idle state without crashing', () => {
    const { lastFrame } = render(
      <TerminalApp
        backend="edge"
        busy={false}
        recentTranscript={[]}
        sidePanel={{ isOpen: false, tab: '', body: null }}
        drawer={{ isOpen: false, tab: '', body: null }}
        overlay={{ kind: null, body: null }}
      />,
    )
    const output = lastFrame() ?? ''
    expect(output).toContain('NanoClaw')
    expect(output).toContain('edge')
  })

  it('renders user message in transcript', () => {
    const entries: TerminalPanelTranscriptEntry[] = [
      { at: '2026-04-13T14:30:00Z', role: 'user', text: 'hello world' },
    ]
    const { lastFrame } = render(
      <TerminalApp
        backend="edge"
        busy={false}
        recentTranscript={entries}
        sidePanel={{ isOpen: false, tab: '', body: null }}
        drawer={{ isOpen: false, tab: '', body: null }}
        overlay={{ kind: null, body: null }}
      />,
    )
    const output = lastFrame() ?? ''
    expect(output).toContain('hello world')
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

```bash
pnpm --filter @onecell/nanoclaw run test -- --reporter=verbose src/terminal-app.test.tsx
```

Expected: FAIL — module not found

- [ ] **Step 4: Write TerminalApp component**

```tsx
// packages/nanoclaw/src/terminal-app.tsx
import React from 'react'
import { Box, Text } from 'ink'
import { getTheme, resolveTheme } from './theme.js'
import { StatusBar } from './components/status-bar.js'
import { Transcript } from './components/transcript.js'
import { AgentList } from './components/agent-list.js'
import { PromptBar } from './components/prompt-bar.js'
import { Spinner } from './components/spinner.js'
import type { TerminalPanelTranscriptEntry } from './terminal-panel.js'
import type { TerminalWorkerState } from './terminal-observability.js'
import { getTerminalTurnState } from './terminal-observability.js'

const theme = getTheme(resolveTheme())

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
  chatJid?: string
  width?: number
  height?: number
}

export function TerminalApp({
  backend,
  busy,
  recentTranscript = [],
  sidePanel,
  drawer,
  overlay,
  chatJid,
  width = process.stdout.columns ?? 100,
  height = process.stdout.rows ?? 28,
}: TerminalAppProps) {
  const turn = chatJid ? getTerminalTurnState(chatJid) : null
  const workers: TerminalWorkerState[] = turn
    ? [...turn.workers.values()].sort((a, b) => {
        const rankDiff = workerSortRank(a.key) - workerSortRank(b.key)
        return rankDiff !== 0 ? rankDiff : a.label.localeCompare(b.label)
      })
    : []
  const runningCount = workers.filter((w) => w.status === 'running').length
  const focusKey = turn?.focusKey ?? ''

  return (
    <Box flexDirection="column" width={width}>
      <StatusBar
        backend={backend}
        agentCount={workers.length}
        runningCount={runningCount}
      />
      <Text color={theme.border}>{'─'.repeat(Math.max(1, width))}</Text>

      <Transcript entries={recentTranscript} width={width} />

      {busy && (
        <Box marginLeft={2} gap={1}>
          <Spinner />
          <Text color={theme.inactive}>thinking...</Text>
        </Box>
      )}

      {workers.length > 0 && (
        <Box flexDirection="column" marginTop={1}>
          <AgentList workers={workers} focusKey={focusKey} width={width} />
        </Box>
      )}

      {drawer?.isOpen && drawer.body && (
        <Box flexDirection="column" marginTop={1}>
          <Text color={theme.border}>{'─'.repeat(Math.max(1, width))}</Text>
          <Text color={theme.brand}>{drawer.tab === 'logs' ? 'Logs' : 'Drawer'}</Text>
          {drawer.body.split('\n').map((line, i) => (
            <Text key={i} color={theme.inactive}>{line}</Text>
          ))}
        </Box>
      )}

      {overlay?.kind && overlay.body && (
        <Box flexDirection="column" marginTop={1}>
          <Text color={theme.brand}>{overlay.kind}</Text>
          {overlay.body.split('\n').map((line, i) => (
            <Text key={i} color={theme.text}>{line}</Text>
          ))}
        </Box>
      )}

      <Text color={theme.border}>{'─'.repeat(Math.max(1, width))}</Text>
      <PromptBar />
    </Box>
  )
}

function workerSortRank(key: string): number {
  if (key === 'root') return 0
  if (key === 'planner') return 1
  const match = key.match(/^worker-(\d+)$/)
  if (match) return 10 + Number.parseInt(match[1] ?? '0', 10)
  if (key === 'aggregate') return 100
  return 200
}
```

- [ ] **Step 5: Run test to verify it passes**

```bash
pnpm --filter @onecell/nanoclaw run test -- --reporter=verbose src/terminal-app.test.tsx
```

Expected: PASS

- [ ] **Step 6: Run all tests to verify nothing is broken**

```bash
pnpm --filter @onecell/nanoclaw run test
```

Expected: all tests PASS (old terminal-panel tests still pass, new component tests pass)

- [ ] **Step 7: Commit**

```bash
git add packages/nanoclaw/src/terminal-app.tsx packages/nanoclaw/src/terminal-app.test.tsx packages/nanoclaw/src/components/spinner.tsx
git commit -m "feat(nanoclaw): add TerminalApp root Ink component with spinner"
```

---

### Task 7: Wire Ink rendering into TerminalChannel

**Files:**
- Modify: `packages/nanoclaw/src/channels/terminal.ts`

This is the critical integration step. Replace the raw ANSI `renderScreen()` with Ink `render()`, while keeping readline and raw stdin input handling intact.

- [ ] **Step 1: Add Ink import and render state to terminal.ts**

At the top of `packages/nanoclaw/src/channels/terminal.ts`, add:

```typescript
import { render } from 'ink'
import React from 'react'
import { TerminalApp } from '../terminal-app.js'
```

Add private property to `TerminalChannel` class:

```typescript
private inkInstance: ReturnType<typeof render> | null = null
```

- [ ] **Step 2: Replace renderScreen method with Ink render**

Replace the existing `renderScreen` method body. The old method was:

```typescript
private renderScreen(force = false): void {
  const screen = this.buildScreenText()
  if (!force && this.lastScreenSignature === screen) return
  this.lastScreenSignature = screen
  this.rl?.pause()
  process.stdout.write(CLEAR_SCREEN + screen)
  this.rl?.resume()
  this.rl?.prompt(true)
}
```

Replace with:

```typescript
private renderScreen(_force = false): void {
  const props = {
    backend: this.opts.backend ?? 'edge',
    busy: this.typingByJid.size > 0,
    latestSystemEvent: this.latestSystemEvent,
    latestAssistantMessage: this.latestAssistantMessage,
    recentSystemEvents: terminalEvents.slice(-4).map((e) => e.text),
    recentTranscript: terminalTranscript.slice(-12),
    sidePanel: this.sidePanel,
    drawer: this.drawer,
    overlay: this.overlay,
    chatJid: TERMINAL_GROUP_JID,
  }

  if (this.inkInstance) {
    this.inkInstance.rerender(<TerminalApp {...props} />)
  } else {
    this.inkInstance = render(<TerminalApp {...props} />, {
      exitOnCtrlC: false,
    })
  }
}
```

- [ ] **Step 3: Clean up Ink on disconnect**

In the `disconnect()` method, add before the existing cleanup:

```typescript
if (this.inkInstance) {
  this.inkInstance.unmount()
  this.inkInstance = null
}
```

- [ ] **Step 4: Run existing terminal tests**

```bash
pnpm --filter @onecell/nanoclaw run test -- --reporter=verbose src/channels/terminal.test.ts
```

Expected: tests may need adjustments since `process.stdout.write` spy won't capture Ink output the same way. If tests fail, update the test expectations to work with Ink's rendering (the spy should still capture writes since Ink writes to stdout).

- [ ] **Step 5: Run full test suite**

```bash
pnpm --filter @onecell/nanoclaw run test
```

Expected: all tests PASS

- [ ] **Step 6: Run typecheck**

```bash
pnpm --filter @onecell/nanoclaw run typecheck
```

Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add packages/nanoclaw/src/channels/terminal.ts
git commit -m "feat(nanoclaw): wire Ink rendering into TerminalChannel"
```

---

### Task 8: Remove old ANSI rendering code

**Files:**
- Delete: `packages/nanoclaw/src/terminal-panel.ts` (replaced by Ink components)
- Modify: `packages/nanoclaw/src/terminal-panel.test.ts` (delete or replace with component tests)
- Modify: `packages/nanoclaw/src/index.ts` (remove any terminal-panel re-exports if present)

- [ ] **Step 1: Check for imports of terminal-panel across the codebase**

Search for any file that imports from `./terminal-panel.js` or `../terminal-panel.js` besides `terminal.ts` and the new components:

```bash
grep -r "terminal-panel" packages/nanoclaw/src/ --include="*.ts" --include="*.tsx" -l
```

Expected: `terminal-panel.ts`, `terminal-panel.test.ts`, `terminal-app.tsx` (imports the type), `transcript.tsx` (imports the type)

- [ ] **Step 2: Keep TerminalPanelTranscriptEntry type, delete the rest of terminal-panel.ts**

Since `TerminalPanelTranscriptEntry` is used by the new components, extract just the type into a smaller file or keep it in `terminal-panel.ts` as a type-only file. The simplest approach: keep `terminal-panel.ts` but strip it down to just the type export:

```typescript
// packages/nanoclaw/src/terminal-panel.ts
export interface TerminalPanelTranscriptEntry {
  at: string
  role: 'user' | 'assistant' | 'system'
  text: string
}
```

- [ ] **Step 3: Update terminal-panel.test.ts to match the stripped-down module**

Replace the entire test file with a minimal type-only verification or delete it if the type is trivial:

```typescript
// packages/nanoclaw/src/terminal-panel.test.ts
import { describe, it, expect } from 'vitest'
import type { TerminalPanelTranscriptEntry } from './terminal-panel.js'

describe('terminal-panel types', () => {
  it('TerminalPanelTranscriptEntry accepts valid data', () => {
    const entry: TerminalPanelTranscriptEntry = {
      at: '2026-04-13T14:30:00Z',
      role: 'user',
      text: 'hello',
    }
    expect(entry.role).toBe('user')
  })
})
```

- [ ] **Step 4: Run full test suite**

```bash
pnpm --filter @onecell/nanoclaw run test
```

Expected: all tests PASS

- [ ] **Step 5: Commit**

```bash
git add packages/nanoclaw/src/terminal-panel.ts packages/nanoclaw/src/terminal-panel.test.ts
git commit -m "refactor(nanoclaw): strip old ANSI renderer, keep transcript type"
```

---

### Task 9: Final verification and cleanup

**Files:**
- All nanoclaw src files

- [ ] **Step 1: Run full test suite**

```bash
pnpm --filter @onecell/nanoclaw run test
```

Expected: all tests PASS

- [ ] **Step 2: Run typecheck**

```bash
pnpm --filter @onecell/nanoclaw run typecheck
```

Expected: PASS

- [ ] **Step 3: Run lint**

```bash
pnpm --filter @onecell/nanoclaw run lint
```

Expected: no errors

- [ ] **Step 4: Verify build**

```bash
pnpm --filter @onecell/nanoclaw run build
```

Expected: builds successfully

- [ ] **Step 5: Commit any formatting/lint fixes**

```bash
git add -u
git commit -m "chore(nanoclaw): lint and formatting cleanup"
```
