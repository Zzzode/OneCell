import React from 'react'
import { Text, Box } from 'ink'
import { getTheme, resolveTheme } from '../theme.js'

const theme = getTheme(resolveTheme())

interface StatusBarProps {
  backend: string
  agentCount: number
  runningCount: number
}

export function StatusBar({ backend, agentCount, runningCount }: StatusBarProps) {
  return (
    <Box gap={1}>
      <Text color={theme.brand}>◆</Text>
      <Text color={theme.inactive}>NanoClaw</Text>
      <Text color={theme.subtle}>·</Text>
      <Text color={theme.inactive}>{backend}</Text>
      <Text color={theme.subtle}>·</Text>
      <Text color={theme.inactive}>{agentCount} agents</Text>
      {runningCount > 0 && (
        <>
          <Text color={theme.subtle}>·</Text>
          <Text color={theme.success}>{runningCount} running</Text>
        </>
      )}
    </Box>
  )
}
