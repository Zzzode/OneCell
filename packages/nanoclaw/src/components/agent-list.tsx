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
      return '\u25CF'
    case 'completed':
      return '\u2713'
    case 'failed':
      return '\u2717'
    default:
      return '\u25CB'
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
        const marker = focused ? '\u25B8' : '  '
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
