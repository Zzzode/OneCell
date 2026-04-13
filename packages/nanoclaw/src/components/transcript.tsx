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
