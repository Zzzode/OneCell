import React, { useState, useCallback } from 'react'
import { Box, Text } from 'ink'
import { getTheme, resolveTheme } from '../infra/theme.js'
import { FooterBar } from '../components/status-bar.js'
import { Transcript } from '../components/transcript.js'
import { Spinner } from '../components/spinner.js'
import { TextInput } from '../components/text-input.js'
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
  transcriptOffset?: number
  transcriptMaxLines?: number
  sidePanel?: { isOpen: boolean; tab: string; body: string | null }
  drawer?: { isOpen: boolean; tab: string; body: string | null }
  overlay?: { kind: string | null; body: string | null }
  waitingForUser?: boolean
  chatJid?: string
  width?: number
  height?: number
  onSubmit?: (text: string) => void
  verbose?: boolean
  onEscape?: () => void
  onShiftUp?: () => void
  onShiftDown?: () => void
  onCtrlO?: () => void
  onPageUp?: () => void
  onPageDown?: () => void
}

export function TerminalApp({
  backend,
  busy,
  latestSystemEvent,
  verbose,
  recentTranscript = [],
  transcriptOffset = 0,
  transcriptMaxLines,
  sidePanel,
  drawer,
  overlay,
  waitingForUser = false,
  width = 100,
  height,
  onSubmit,
  onEscape,
  onShiftUp,
  onShiftDown,
  onCtrlO,
  onPageUp,
  onPageDown,
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
    <Box flexDirection="column" width={width} {...(height ? { height } : {})}>
      {/* Scrollable transcript area — takes remaining vertical space */}
      <Box flexDirection="column" flexGrow={1} overflowY="hidden">
        <Transcript
          entries={recentTranscript}
          width={width}
          maxLines={transcriptMaxLines}
          offset={transcriptOffset}
          verbose={verbose}
        />

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

        {/* Spacer pushes spinner to the bottom of the scrollable area */}
        <Box flexGrow={1} />
      </Box>

      {/* Spinner: just above input box, pinned at bottom of scrollable area */}
      {busy && (
        <Box marginTop={1} gap={1}>
          <Spinner />
          <Text color={theme.statusBusy}>thinking...</Text>
        </Box>
      )}
      {waitingForUser && !busy && (
        <Box marginTop={1}>
          <Text color={theme.statusWaiting}>waiting for your input...</Text>
        </Box>
      )}

      <Box
        flexDirection="column"
        borderColor={theme.border}
        borderStyle="round"
        borderLeft={false}
        borderRight={false}
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
          onPageUp={onPageUp}
          onPageDown={onPageDown}
          busy={busy}
          placeholder={busy ? 'processing...' : 'Type your message...'}
        />
      </Box>

      {/* Footer: below input box */}
      <FooterBar
        backend={backend}
        agentCount={0}
        runningCount={busy ? 1 : 0}
        waitingForUser={waitingForUser}
        transientNotice={latestSystemEvent ?? null}
      />
    </Box>
  )
}
