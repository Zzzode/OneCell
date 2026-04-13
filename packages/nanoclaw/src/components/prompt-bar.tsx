import React from 'react'
import { Text, Box } from 'ink'
import { getTheme, resolveTheme } from '../theme.js'

const theme = getTheme(resolveTheme())

interface PromptBarProps {
  hints?: string
}

export function PromptBar({ hints = 'ESC dismiss · /help' }: PromptBarProps) {
  return (
    <Box gap={1}>
      <Box marginLeft={2}>
        <Text color={theme.text}>›</Text>
      </Box>
      <Text color={theme.subtle}>Type your message...</Text>
      <Text color={theme.subtle}>│</Text>
      <Text color={theme.subtle}>{hints}</Text>
    </Box>
  )
}
