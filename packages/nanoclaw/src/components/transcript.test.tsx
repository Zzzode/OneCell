import { describe, it, expect } from 'vitest'
import { renderToString } from 'ink'
import React from 'react'
import { Transcript } from './transcript.js'
import type { TerminalPanelTranscriptEntry } from '../terminal-panel.js'

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
