import { describe, it, expect } from 'vitest'
import { renderToString } from 'ink'
import React from 'react'
import { TerminalApp } from './terminal-app.js'
import type { TerminalPanelTranscriptEntry } from './terminal-panel.js'

describe('TerminalApp', () => {
  it('renders idle state without crashing', () => {
    const output = renderToString(
      <TerminalApp
        backend="edge"
        busy={false}
        recentTranscript={[]}
        sidePanel={{ isOpen: false, tab: '', body: null }}
        drawer={{ isOpen: false, tab: '', body: null }}
        overlay={{ kind: null, body: null }}
      />,
    )
    expect(output).toContain('NanoClaw')
    expect(output).toContain('edge')
  })

  it('renders user message in transcript', () => {
    const entries: TerminalPanelTranscriptEntry[] = [
      { at: '2026-04-13T14:30:00Z', role: 'user', text: 'hello world' },
    ]
    const output = renderToString(
      <TerminalApp
        backend="edge"
        busy={false}
        recentTranscript={entries}
        sidePanel={{ isOpen: false, tab: '', body: null }}
        drawer={{ isOpen: false, tab: '', body: null }}
        overlay={{ kind: null, body: null }}
      />,
    )
    expect(output).toContain('hello world')
  })
})
