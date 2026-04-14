import React, { useState, useCallback } from 'react'
import { Box, Text } from 'ink'
import { getTheme, resolveTheme } from './theme.js'
import { StatusBar } from './components/status-bar.js'
import { Transcript } from './components/transcript.js'
import { Spinner } from './components/spinner.js'
import { TextInput } from './components/text-input.js'
import type { TerminalPanelTranscriptEntry } from './terminal-panel.js'

const theme = getTheme(resolveTheme())

function sidePanelTitle(tab: string): string {
  switch (tab) {
    case 'turn':
      return 'Details · Turn'
    case 'agents':
      return 'Details · Agents'
    case 'graph':
      return 'Details · Graph'
    case 'tasks':
      return 'Details · Tasks'
    default:
      return 'Details'
  }
}

function overlayTitle(kind: string): string {
  switch (kind) {
    case 'help':
      return 'Help'
    case 'focus':
      return 'Focus'
    case 'system':
      return 'System'
    case 'session':
      return 'Session'
    case 'retry-container':
      return 'Retry'
    case 'interrupt':
      return 'Interrupt'
    default:
      return 'Overlay'
  }
}

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
  onSubmit?: (text: string) => void
  verbose?: boolean
  onEscape?: () => void
  onShiftUp?: () => void
  onShiftDown?: () => void
  onCtrlO?: () => void
}

export function TerminalApp({
  backend,
  busy,
  verbose,
  recentTranscript = [],
  sidePanel,
  drawer,
  overlay,
  width = 100,
  onSubmit,
  onEscape,
  onShiftUp,
  onShiftDown,
  onCtrlO,
}: TerminalAppProps) {
  const [inputValue, setInputValue] = useState('')

  const handleSubmit = useCallback(
    (text: string) => {
      setInputValue('')
      onSubmit?.(text)
    },
    [onSubmit],
  )

  return (
    <Box flexDirection="column" width={width}>
      <StatusBar
        backend={backend}
        agentCount={0}
        runningCount={0}
      />
      <Text color={theme.border}>{'─'.repeat(Math.max(1, width))}</Text>

      <Transcript entries={recentTranscript} width={width} verbose={verbose} />

      {sidePanel?.isOpen && sidePanel.body && (
        <Box flexDirection="column" marginTop={1}>
          <Text color={theme.brand}>{sidePanelTitle(sidePanel.tab)}</Text>
          {sidePanel.body.split('\n').map((line, i) => (
            <Text key={i} color={theme.inactive}>{line}</Text>
          ))}
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
          <Text color={theme.brand}>{overlayTitle(overlay.kind)}</Text>
          {overlay.body.split('\n').map((line, i) => (
            <Text key={i} color={theme.text}>{line}</Text>
          ))}
        </Box>
      )}

      <Box
        flexDirection="column"
        marginTop={1}
        borderColor={theme.border}
        borderStyle="round"
        paddingX={1}
      >
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
      </Box>

      {busy && (
        <Box marginLeft={2} gap={1}>
          <Spinner />
          <Text color={theme.inactive}>thinking...</Text>
        </Box>
      )}
    </Box>
  )
}
