import React from 'react'
import { Text, Box } from 'ink'
import { getTheme, resolveTheme } from '../infra/theme.js'
import type { TerminalPanelTranscriptEntry } from '../terminal/terminal-panel.js'

const theme = getTheme(resolveTheme())

interface TranscriptProps {
  entries: TerminalPanelTranscriptEntry[]
  width?: number
  maxLines?: number
  offset?: number
  verbose?: boolean
}

function UserLine({ text }: { text: string }) {
  return (
    <Box>
      <Text color={theme.brand}>{'❯'}</Text>
      <Text> </Text>
      <Text color={theme.userBubble}>{text}</Text>
    </Box>
  )
}

function AssistantLine({ text }: { text: string }) {
  return (
    <Box>
      <Text color={theme.assistantBubble}>●</Text>
      <Text> </Text>
      <Text color={theme.assistantBubble}>{text}</Text>
    </Box>
  )
}

function StepLine({
  text,
  isLast,
  width,
  color,
}: {
  text: string;
  isLast: boolean;
  width?: number;
  color?: string;
}) {
  const prefix = isLast ? '  └─ ' : '  ├─ '
  const maxLen = (width ?? 100) - prefix.length - 1
  const isFailure = text.startsWith('执行失败：') || text.startsWith('执行失败,')
  if (isFailure) {
    const lines = wrapText(text, maxLen)
    return (
      <Box flexDirection="column">
        {lines.map((line, i) => (
          <Box key={i}>
            <Text color={theme.toolStepPrefix}>{i === 0 ? prefix : '    '}</Text>
            <Text color={theme.error}>{line}</Text>
          </Box>
        ))}
      </Box>
    )
  }
  const display = text.length > maxLen ? text.slice(0, maxLen - 1) + '…' : text
  return (
    <Box>
      <Text color={theme.toolStepPrefix}>{prefix}</Text>
      <Text color={color ?? theme.inactive}>{display}</Text>
    </Box>
  )
}

function wrapText(text: string, maxLen: number): string[] {
  const lines: string[] = []
  let remaining = text
  while (remaining.length > 0) {
    if (remaining.length <= maxLen) {
      lines.push(remaining)
      break
    }
    // Find a good break point (space, ·, comma, etc.)
    let breakAt = remaining.lastIndexOf(' ', maxLen)
    if (breakAt < maxLen * 0.5) {
      // No good break point nearby, find next separator
      const separators = [' · ', ', ', ' — ', ' - ']
      let bestBreak = -1
      for (const sep of separators) {
        const idx = remaining.indexOf(sep, Math.floor(maxLen * 0.3))
        if (idx > 0 && idx <= maxLen && (bestBreak === -1 || idx < bestBreak)) {
          bestBreak = idx + sep.length
        }
      }
      breakAt = bestBreak > 0 ? bestBreak : maxLen
    }
    lines.push(remaining.slice(0, breakAt))
    remaining = remaining.slice(breakAt).trimStart()
  }
  return lines
}

type ToolCategory = 'read' | 'search' | 'write' | 'js' | 'http' | 'message' | 'task' | 'other'

function classifyTool(tool: string): ToolCategory {
  if (tool === 'workspace.read' || tool === 'workspace.list') return 'read'
  if (tool === 'workspace.search') return 'search'
  if (tool === 'workspace.write' || tool === 'workspace.apply_patch') return 'write'
  if (tool === 'js.exec') return 'js'
  if (tool === 'http.fetch') return 'http'
  if (tool === 'message.send') return 'message'
  if (tool.startsWith('task.')) return 'task'
  return 'other'
}

function formatToolLabel(entry: TerminalPanelTranscriptEntry): string {
  const td = entry.toolData
  if (!td) return entry.text.trim() || 'Tool call'

  switch (classifyTool(td.tool)) {
    case 'read': {
      const path = typeof td.args.path === 'string' ? td.args.path : '?'
      return `Reading ${path}`
    }
    case 'search': {
      const pattern = typeof td.args.pattern === 'string' ? td.args.pattern : '?'
      return `Searching "${pattern}"`
    }
    case 'write': {
      const path = typeof td.args.path === 'string' ? td.args.path : '?'
      return `Writing ${path}`
    }
    case 'js': {
      const code = typeof td.args.code === 'string' ? td.args.code.trim() : ''
      const preview = code ? code.replace(/\s+/g, ' ').slice(0, 48) : ''
      return `Executing JavaScript(${preview || 'script'})`
    }
    case 'http': {
      const url = typeof td.args.url === 'string' ? td.args.url : '?'
      return `Fetching ${url}`
    }
    case 'message':
      return 'Sending message'
    case 'task':
      return `Running ${td.tool}`
    default:
      return entry.text.trim() || td.tool
  }
}

function formatResultSummary(result: unknown, maxLen: number): string {
  if (result === undefined) return ''
  if (typeof result === 'string') {
    return result.length > maxLen ? result.slice(0, maxLen - 1) + '\u2026' : result
  }
  try {
    const str = JSON.stringify(result)
    return str.length > maxLen ? str.slice(0, maxLen - 1) + '\u2026' : str
  } catch (_err: unknown) {
    return ''
  }
}

function formatToolCallLine(entry: TerminalPanelTranscriptEntry, maxLen: number): string {
  const text = formatToolLabel(entry)
  return text.length > maxLen ? text.slice(0, maxLen - 1) + '\u2026' : text
}

function formatToolResultLine(entry: TerminalPanelTranscriptEntry, maxLen: number): string {
  const td = entry.toolData
  if (!td) return ''

  if (td.status === 'error') {
    const errText =
      typeof td.result === 'object' && td.result !== null && 'error' in (td.result as Record<string, unknown>)
        ? String((td.result as Record<string, unknown>).error)
        : formatResultSummary(td.result, maxLen)
    return `error: ${errText || 'unknown error'}`
  }

  const category = classifyTool(td.tool)
  if (category === 'search' && typeof td.result === 'object' && td.result !== null && 'matches' in (td.result as Record<string, unknown>)) {
    const matches = (td.result as Record<string, unknown>).matches
    if (Array.isArray(matches)) {
      return matches.length === 0 ? 'No matches' : `${matches.length} matches`
    }
  }

  if (category === 'read' && typeof td.result === 'object' && td.result !== null && 'content' in (td.result as Record<string, unknown>)) {
    const content = (td.result as Record<string, unknown>).content
    if (typeof content === 'string') {
      const lineCount = content.length === 0 ? 0 : content.split('\n').length
      return `${lineCount} lines`
    }
  }

  if (category === 'js') {
    const raw = td.result
    const value =
      typeof raw === 'object' && raw !== null && 'value' in (raw as Record<string, unknown>)
        ? (raw as Record<string, unknown>).value
        : raw
    const text = formatResultSummary(value, maxLen)
    return text || 'done'
  }

  const text = formatResultSummary(td.result, maxLen)
  return text || 'done'
}

function formatToolBodyLines(
  entry: TerminalPanelTranscriptEntry,
  maxLen: number,
  detailed: boolean,
): string[] {
  const td = entry.toolData
  if (!td || td.status === 'running') return []

  const lines: string[] = []
  const resultLine = formatToolResultLine(entry, maxLen)
  if (resultLine) lines.push(resultLine)

  if (detailed && typeof td.args.code === 'string') {
    const codeLines = td.args.code.split('\n').filter(Boolean)
    const maxCodeLines = 3
    for (let i = 0; i < Math.min(codeLines.length, maxCodeLines); i++) {
      const line = codeLines[i]!
      lines.push(line.length > maxLen ? line.slice(0, maxLen - 1) + '\u2026' : line)
    }
    const remaining = codeLines.length - maxCodeLines
    if (remaining > 0) lines.push(`\u2026 (+${remaining} more lines)`)
  }

  return lines
}

function ToolLine({
  call,
  bodyLines,
  status,
}: {
  call: string;
  bodyLines: string[];
  status?: 'running' | 'success' | 'error';
}) {
  const headColor = status === 'error' ? theme.error : theme.toolBubble
  return (
    <Box flexDirection="column">
      <Box>
        <Text color={theme.agentCyan}>○</Text>
        <Text> </Text>
        <Text color={headColor}>{call}</Text>
      </Box>
      {bodyLines.map((line, i) => (
        <Box key={i}>
          <Text color={theme.toolStepPrefix}>{i === 0 ? '  ⎿ ' : '    '}</Text>
          <Text color={status === 'error' ? theme.error : theme.textMuted}>{line}</Text>
        </Box>
      ))}
    </Box>
  )
}


function mergeAssistantTurns(entries: TerminalPanelTranscriptEntry[]): TerminalPanelTranscriptEntry[] {
  const merged: TerminalPanelTranscriptEntry[] = []
  for (const entry of entries) {
    const prev = merged[merged.length - 1]
    if (
      entry.role === 'assistant' &&
      prev &&
      prev.role === 'assistant' &&
      entry.turnId &&
      prev.turnId === entry.turnId
    ) {
      prev.text = `${prev.text}\n${entry.text}`
      prev.at = entry.at
      continue
    }
    merged.push({ ...entry })
  }
  return merged
}

function wrapPlainText(text: string, maxLen: number): string[] {
  const rows: string[] = []
  const lines = text.split('\n')
  for (const line of lines) {
    if (line.length === 0) {
      rows.push('')
      continue
    }
    for (let i = 0; i < line.length; i += maxLen) {
      rows.push(line.slice(i, i + maxLen))
    }
  }
  return rows.length > 0 ? rows : ['']
}

export function Transcript({ entries, width, maxLines = 12, offset = 0, verbose = false }: TranscriptProps) {
  if (entries.length === 0) {
    return <Text color={theme.toolStepPrefix}>No transcript yet.</Text>;
  }

  const mergedEntries = mergeAssistantTurns(entries)
  const bubbleMaxLen = Math.max(1, (width ?? 100) - 4)
  const renderedRows: React.ReactNode[] = []
  let pendingSteps: TerminalPanelTranscriptEntry[] = []

  function flushSteps() {
    if (pendingSteps.length === 0) return;

    const toolEntries = pendingSteps
      .filter((e) => e.role === 'tool')
      .sort((a, b) => {
        const leftOrder = a.toolData?.order ?? Number.MAX_SAFE_INTEGER
        const rightOrder = b.toolData?.order ?? Number.MAX_SAFE_INTEGER
        if (leftOrder !== rightOrder) return leftOrder - rightOrder
        return a.at.localeCompare(b.at)
      });
    const systemEntries = pendingSteps.filter((e) => e.role === 'system');

    for (const entry of systemEntries) {
      renderedRows.push(
        <StepLine
          key={`step-${renderedRows.length}`}
          text={entry.text}
          isLast={pendingSteps.indexOf(entry) === pendingSteps.length - 1 && toolEntries.length === 0}
          width={width}
        />,
      );
    }

    if (toolEntries.length > 0) {
      for (const entry of toolEntries) {
        if (renderedRows.length > 0) {
          renderedRows.push(<Box key={`tool-gap-${renderedRows.length}`} height={1} />)
        }
        renderedRows.push(
          <ToolLine
            key={`tool-${renderedRows.length}`}
            call={formatToolCallLine(entry, (width ?? 100) - 4)}
            bodyLines={formatToolBodyLines(entry, (width ?? 100) - 8, verbose)}
            status={entry.toolData?.status}
          />,
        )
      }
    }

    pendingSteps = [];
  }

  for (const entry of mergedEntries) {
    if (entry.role === 'system' || entry.role === 'tool') {
      pendingSteps.push(entry);
    } else {
      flushSteps();
      if (entry.role === 'user') {
        if (renderedRows.length > 0) {
          renderedRows.push(
            <Text key={`sep-${renderedRows.length}`} color={theme.toolStepPrefix}>
              {`  ${'─'.repeat(Math.max(1, (width ?? 100) - 4))}`}
            </Text>,
          )
        }
        for (const row of wrapPlainText(entry.text, bubbleMaxLen)) {
          renderedRows.push(<UserLine key={`user-${renderedRows.length}`} text={row} />)
        }
      } else {
        if (renderedRows.length > 0) {
          renderedRows.push(<Box key={`gap-${renderedRows.length}`} height={1} />)
        }
        for (const row of wrapPlainText(entry.text, bubbleMaxLen)) {
          renderedRows.push(<AssistantLine key={`assistant-${renderedRows.length}`} text={row} />)
        }
      }
    }
  }
  flushSteps();

  const maxOffset = Math.max(0, renderedRows.length - maxLines)
  const safeOffset = Math.min(maxOffset, Math.max(0, offset))
  const visibleEnd = Math.max(0, renderedRows.length - safeOffset)
  const visibleStart = Math.max(0, visibleEnd - maxLines)
  const visibleRows = renderedRows.slice(visibleStart, visibleEnd)

  return (
    <Box flexDirection="column">
      {visibleRows}
    </Box>
  );
}
