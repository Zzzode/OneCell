import React from 'react'
import { Box, Text } from 'ink'
import { getTheme, resolveTheme } from './theme.js'
import { StatusBar } from './components/status-bar.js'
import { Transcript } from './components/transcript.js'
import { AgentList } from './components/agent-list.js'
import { PromptBar } from './components/prompt-bar.js'
import { Spinner } from './components/spinner.js'
import type { TerminalPanelTranscriptEntry } from './terminal-panel.js'

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
  width = 100,
}: TerminalAppProps) {
  return (
    <Box flexDirection="column" width={width}>
      <StatusBar
        backend={backend}
        agentCount={0}
        runningCount={0}
      />
      <Text color={theme.border}>{'─'.repeat(Math.max(1, width))}</Text>

      <Transcript entries={recentTranscript} width={width} />

      {busy && (
        <Box marginLeft={2} gap={1}>
          <Spinner />
          <Text color={theme.inactive}>thinking...</Text>
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
