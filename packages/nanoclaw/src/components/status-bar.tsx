import React from 'react'
import { Text, Box } from 'ink'
import { getTheme, resolveTheme } from '../infra/theme.js'

interface FooterBarProps {
  backend: string
  agentCount: number
  runningCount: number
  waitingForUser?: boolean
  transientNotice?: string | null
}

/**
 * Compact footer bar shown below the input box.
 * Displayed as a dim single-line status, matching Claude Code's PromptInputFooter style.
 */
export function FooterBar({
  backend,
  agentCount,
  runningCount,
  waitingForUser = false,
  transientNotice,
}: FooterBarProps) {
  const theme = getTheme(resolveTheme())
  return (
    <Box flexDirection="column" paddingX={2}>
      <Box gap={1}>
        <Text color={theme.statusInfo}>{backend}</Text>
        {agentCount > 0 && (
          <>
            <Text color={theme.toolStepPrefix}>·</Text>
            <Text color={theme.statusInfo}>{agentCount} agents</Text>
          </>
        )}
        {runningCount > 0 && (
          <>
            <Text color={theme.toolStepPrefix}>·</Text>
            <Text color={theme.statusBusy}>{runningCount} running</Text>
          </>
        )}
        {runningCount === 0 && (
          <>
            <Text color={theme.toolStepPrefix}>·</Text>
            <Text color={waitingForUser ? theme.statusWaiting : theme.statusInfo}>
              {waitingForUser ? 'waiting for input' : 'idle'}
            </Text>
          </>
        )}
      </Box>
      {transientNotice ? (
        <Text color={theme.statusWaiting}>{transientNotice}</Text>
      ) : null}
    </Box>
  )
}

/**
 * @deprecated Use FooterBar instead.
 */
export const StatusBar = FooterBar
