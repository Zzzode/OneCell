import React, { useState, useCallback } from 'react'
import { Box, Text, useInput } from 'ink'
import { getTheme, resolveTheme } from '../theme.js'

const theme = getTheme(resolveTheme())

interface TextInputProps {
  /** Placeholder shown when input is empty */
  placeholder?: string
  /** Called when the user presses Enter with non-empty text */
  onSubmit: (text: string) => void
  /** Called when the user presses Escape with no active surfaces to dismiss */
  onEscape: () => void
  /** Called on Shift+Up */
  onShiftUp?: () => void
  /** Called on Shift+Down */
  onShiftDown?: () => void
  /** Whether the app is busy processing */
  busy?: boolean
  /** External value override — when set, the component is controlled */
  value?: string
  /** External value change handler for controlled mode */
  onChange?: (value: string) => void
}

export function TextInput({
  placeholder = 'Type your message...',
  onSubmit,
  onEscape,
  onShiftUp,
  onShiftDown,
  busy = false,
  value: externalValue,
  onChange,
}: TextInputProps) {
  const [internalValue, setInternalValue] = useState('')
  const [cursorOffset, setCursorOffset] = useState(0)

  const value = externalValue !== undefined ? externalValue : internalValue
  const setValue = useCallback(
    (next: string) => {
      if (externalValue !== undefined) {
        onChange?.(next)
      } else {
        setInternalValue(next)
      }
    },
    [externalValue, onChange],
  )

  useInput(
    (input, key) => {
      if (key.shift && key.upArrow) {
        onShiftUp?.()
        return
      }
      if (key.shift && key.downArrow) {
        onShiftDown?.()
        return
      }

      if (key.return) {
        const trimmed = value.trim()
        if (trimmed) {
          onSubmit(trimmed)
          setValue('')
          setCursorOffset(0)
        }
        return
      }

      if (key.escape) {
        onEscape()
        return
      }

      // Backspace: delete character before cursor
      if (key.backspace) {
        if (cursorOffset > 0) {
          const before = value.slice(0, cursorOffset - 1)
          const after = value.slice(cursorOffset)
          setValue(before + after)
          setCursorOffset(cursorOffset - 1)
        }
        return
      }

      // Delete: delete character at cursor
      if (key.delete) {
        if (cursorOffset < value.length) {
          const before = value.slice(0, cursorOffset)
          const after = value.slice(cursorOffset + 1)
          setValue(before + after)
        }
        return
      }

      // Left arrow
      if (key.leftArrow) {
        if (cursorOffset > 0) {
          setCursorOffset(cursorOffset - 1)
        }
        return
      }

      // Right arrow
      if (key.rightArrow) {
        if (cursorOffset < value.length) {
          setCursorOffset(cursorOffset + 1)
        }
        return
      }

      // Home / Ctrl+A
      if (key.home || (key.ctrl && input === 'a')) {
        setCursorOffset(0)
        return
      }

      // End / Ctrl+E
      if (key.end || (key.ctrl && input === 'e')) {
        setCursorOffset(value.length)
        return
      }

      // Ignore other control sequences (ctrl+*, tab, etc.)
      if (key.ctrl || key.meta || key.tab) return

      // Printable character
      if (input.length > 0) {
        const before = value.slice(0, cursorOffset)
        const after = value.slice(cursorOffset)
        setValue(before + input + after)
        setCursorOffset(cursorOffset + input.length)
      }
    },
    { isActive: !busy },
  )

  // Build display with cursor indicator
  const beforeCursor = value.slice(0, cursorOffset)
  const atCursor = value.slice(cursorOffset, cursorOffset + 1)
  const afterCursor = value.slice(cursorOffset + 1)

  return (
    <Box>
      <Text> </Text>
      <Text color={theme.text}>{busy ? '…' : '›'} </Text>
      {busy ? (
        <Text color={theme.subtle}>{placeholder}</Text>
      ) : value.length === 0 ? (
        <Text color={theme.subtle}>{placeholder}</Text>
      ) : (
        <Text>
          <Text color={theme.text}>{beforeCursor}</Text>
          <Text color={theme.text} inverse>
            {atCursor || ' '}
          </Text>
          <Text color={theme.text}>{afterCursor}</Text>
        </Text>
      )}
    </Box>
  )
}
