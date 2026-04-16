import React from 'react'
import { Text, Box } from 'ink'

interface FooterBarProps {
  backend: string
  agentCount: number
  runningCount: number
}

/**
 * Compact footer bar shown below the input box.
 * Displayed as a dim single-line status, matching Claude Code's PromptInputFooter style.
 */
export function FooterBar({ backend, agentCount, runningCount }: FooterBarProps) {
  return (
    <Box paddingX={2} gap={1}>
      <Text dimColor>{backend}</Text>
      {agentCount > 0 && (
        <>
          <Text dimColor>·</Text>
          <Text dimColor>{agentCount} agents</Text>
        </>
      )}
      {runningCount > 0 && (
        <>
          <Text dimColor>·</Text>
          <Text dimColor>{runningCount} running</Text>
        </>
      )}
    </Box>
  )
}

/**
 * @deprecated Use FooterBar instead.
 */
export const StatusBar = FooterBar
