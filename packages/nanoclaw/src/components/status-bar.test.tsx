import { describe, it, expect } from 'vitest'
import { renderToString } from 'ink'
import React from 'react'
import { StatusBar } from './status-bar.js'

describe('StatusBar', () => {
  it('renders brand marker and backend name', () => {
    const output = renderToString(
      <StatusBar backend="edge" agentCount={3} runningCount={1} />,
    )
    expect(output).toContain('NanoClaw')
    expect(output).toContain('edge')
    expect(output).toContain('3 agents')
  })

  it('shows running count in success color when > 0', () => {
    const output = renderToString(
      <StatusBar backend="edge" agentCount={3} runningCount={1} />,
    )
    expect(output).toContain('1 running')
  })

  it('omits running count when 0', () => {
    const output = renderToString(
      <StatusBar backend="edge" agentCount={2} runningCount={0} />,
    )
    expect(output).toContain('2 agents')
    expect(output).not.toContain('0 running')
  })
})
