import { describe, it, expect } from 'vitest'
import { renderToString } from 'ink'
import React from 'react'
import { FooterBar } from './status-bar.js'

describe('FooterBar', () => {
  it('renders backend name', () => {
    const output = renderToString(
      <FooterBar backend="edge" agentCount={3} runningCount={1} />,
    )
    expect(output).toContain('edge')
    expect(output).toContain('3 agents')
  })

  it('shows running count when > 0', () => {
    const output = renderToString(
      <FooterBar backend="edge" agentCount={3} runningCount={1} />,
    )
    expect(output).toContain('1 running')
  })

  it('shows waiting state when idle', () => {
    const output = renderToString(
      <FooterBar backend="edge" agentCount={0} runningCount={0} waitingForUser />,
    )
    expect(output).toContain('waiting for input')
  })

  it('shows idle state when not waiting', () => {
    const output = renderToString(
      <FooterBar backend="edge" agentCount={0} runningCount={0} waitingForUser={false} />,
    )
    expect(output).toContain('idle')
  })

  it('renders transient notice when present', () => {
    const output = renderToString(
      <FooterBar
        backend="edge"
        agentCount={0}
        runningCount={0}
        transientNotice="processing started"
      />,
    )
    expect(output).toContain('processing started')
  })
})
