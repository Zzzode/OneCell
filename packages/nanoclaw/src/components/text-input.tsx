import React, { useState, useCallback, useEffect } from 'react'
import { Box, Text, useInput } from 'ink'
import { getTheme, resolveTheme } from '../infra/theme.js'

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
  /** Called on Ctrl+O (verbose toggle) */
  onCtrlO?: () => void
  /** Called on PageUp */
  onPageUp?: () => void
  /** Called on PageDown */
  onPageDown?: () => void
  /** Whether the app is busy processing */
  busy?: boolean
  /** External value override — when set, the component is controlled */
  value?: string
  /** External value change handler for controlled mode */
  onChange?: (value: string) => void
}

type InputMode = 'normal' | 'command'

export function TextInput({
  placeholder = 'Type your message...',
  onSubmit,
  onEscape,
  onShiftUp,
  onShiftDown,
  onCtrlO,
  onPageUp,
  onPageDown,
  busy = false,
  value: externalValue,
  onChange,
}: TextInputProps) {
  const [internalValue, setInternalValue] = useState('')
  const [cursorOffset, setCursorOffset] = useState(0)
  const [mode, setMode] = useState<InputMode>('normal')
  const [pasteNotice, setPasteNotice] = useState<string | null>(null)

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

  useEffect(() => {
    if (!pasteNotice) return
    const timer = setTimeout(() => setPasteNotice(null), 1200)
    return () => clearTimeout(timer)
  }, [pasteNotice])

  const submitCurrentValue = useCallback(() => {
    const text = mode === 'command' ? value.trim() : value
    if (!text.trim()) return
    onSubmit(text)
    setValue('')
    setCursorOffset(0)
    setMode('normal')
  }, [mode, onSubmit, setValue, value])

  // ESC/scroll/focus hotkeys must work even when busy
  useInput(
    (input, key) => {
      if (key.ctrl && input === 'o') {
        onCtrlO?.()
        return
      }
      if (key.ctrl && input === 'l') {
        setMode((prev) => (prev === 'command' ? 'normal' : 'command'))
        return
      }
      if (key.escape) {
        onEscape()
        return
      }
      if (key.pageUp) {
        onPageUp?.()
        return
      }
      if (key.pageDown) {
        onPageDown?.()
        return
      }
      if (key.shift && key.upArrow) {
        onShiftUp?.()
        return
      }
      if (key.shift && key.downArrow) {
        onShiftDown?.()
        return
      }
    },
  )

  // Text editing input — disabled when busy
  useInput(
    (input, key) => {
      if (key.return) {
        if (busy) return
        if (key.shift) {
          const before = value.slice(0, cursorOffset)
          const after = value.slice(cursorOffset)
          setValue(before + '\n' + after)
          setCursorOffset(cursorOffset + 1)
          return
        }
        submitCurrentValue()
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
        if (input.length > 1 || input.includes('\n')) {
          setPasteNotice('pasted content detected · shift+enter inserts newline')
        }
        const before = value.slice(0, cursorOffset)
        const after = value.slice(cursorOffset)
        const nextValue = before + input + after
        setValue(nextValue)
        setCursorOffset(cursorOffset + input.length)
        setMode(nextValue.startsWith('/') ? 'command' : 'normal')
      }
    },
    { isActive: !busy },
  )

  // Render only the active logical line for stable input UX with long multiline content.
  const safeCursorOffset = Math.min(Math.max(0, cursorOffset), value.length)
  const lineStart = value.lastIndexOf('\n', Math.max(0, safeCursorOffset - 1)) + 1
  const lineEnd = (() => {
    const idx = value.indexOf('\n', safeCursorOffset)
    return idx === -1 ? value.length : idx
  })()
  const activeLine = value.slice(lineStart, lineEnd)
  const cursorInLine = safeCursorOffset - lineStart

  const previewMax = 96
  let windowStart = Math.max(0, cursorInLine - Math.floor(previewMax / 2))
  let windowEnd = Math.min(activeLine.length, windowStart + previewMax)
  if (windowEnd - windowStart < previewMax) {
    windowStart = Math.max(0, windowEnd - previewMax)
  }

  const clippedLeft = windowStart > 0
  const clippedRight = windowEnd < activeLine.length
  const visibleLine = activeLine.slice(windowStart, windowEnd)
  const visibleCursor = cursorInLine - windowStart
  const beforeCursor = visibleLine.slice(0, visibleCursor)
  const atCursor = visibleLine.slice(visibleCursor, visibleCursor + 1)
  const afterCursor = visibleLine.slice(visibleCursor + 1)

  const totalLines = value.length === 0 ? 1 : value.split('\n').length
  const currentLine = value.slice(0, safeCursorOffset).split('\n').length

  return (
    <Box flexDirection="column">
      <Box>
        <Text color={theme.inputPrompt} dimColor={busy}>{'❯'} </Text>
        {busy ? (
          <Text color={theme.inputHint}>{placeholder}</Text>
        ) : value.length === 0 ? (
          <Text color={theme.inputHint}>{placeholder}</Text>
        ) : (
          <Text>
            <Text color={theme.textMuted}>{clippedLeft ? '…' : ''}{beforeCursor}</Text>
            <Text color={theme.text} inverse>
              {atCursor || ' '}
            </Text>
            <Text color={theme.textMuted}>{afterCursor}{clippedRight ? '…' : ''}</Text>
          </Text>
        )}
      </Box>
      <Box>
        <Text color={theme.inputHint}>
          enter send · shift+enter newline · ctrl+l command
        </Text>
      </Box>
      {totalLines > 1 && !busy ? (
        <Text color={theme.inputHint}>{`editing line ${currentLine}/${totalLines}`}</Text>
      ) : null}
      {pasteNotice ? <Text color={theme.inputPasteNotice}>{pasteNotice}</Text> : null}
    </Box>
  )
}
