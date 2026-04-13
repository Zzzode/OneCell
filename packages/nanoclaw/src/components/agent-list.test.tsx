import { describe, it, expect } from 'vitest'
import { renderToString } from 'ink'
import React from 'react'
import { AgentList } from './agent-list.js'
import type { TerminalWorkerState } from '../terminal-observability.js'

function makeWorker(
  overrides: Partial<TerminalWorkerState> = {},
): TerminalWorkerState {
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
    startedAt: null,
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
      makeWorker({
        key: 'root',
        label: 'root',
        status: 'running',
        lastActivity: 'analyzing',
      }),
      makeWorker({
        key: 'planner',
        label: 'planner',
        status: 'pending',
        lastActivity: null,
      }),
    ]
    const output = renderToString(
      <AgentList workers={workers} focusKey="root" width={80} />,
    )
    expect(output).toContain('root')
    expect(output).toContain('planner')
    expect(output).toContain('analyzing')
  })

  it('shows empty state when no workers', () => {
    const output = renderToString(
      <AgentList workers={[]} focusKey="root" width={80} />,
    )
    expect(output).toContain('No agents')
  })
})
