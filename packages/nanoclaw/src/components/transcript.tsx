import React from 'react'
import { Text, Box } from 'ink'
import { getTheme, resolveTheme } from '../theme.js'
import type { TerminalPanelTranscriptEntry } from '../terminal-panel.js'

const theme = getTheme(resolveTheme())

interface TranscriptProps {
  entries: TerminalPanelTranscriptEntry[]
  width?: number
  maxLines?: number
  verbose?: boolean
}

function UserLine({ text }: { text: string }) {
  return (
    <Box>
      <Text color={theme.brand}>{'❯'}</Text>
      <Text> </Text>
      <Text color={theme.text}>{text}</Text>
    </Box>
  )
}

function AssistantLine({ text }: { text: string }) {
  return (
    <Box>
      <Text color={theme.agentCyan}>⏺</Text>
      <Text> </Text>
      <Text color={theme.text}>{text}</Text>
    </Box>
  )
}

function StepLine({ text, isLast, width }: { text: string; isLast: boolean; width?: number }) {
  const prefix = isLast ? '  └─ ' : '  ├─ '
  const maxLen = (width ?? 100) - prefix.length - 1
  const isFailure = text.startsWith('执行失败：') || text.startsWith('执行失败,')
  if (isFailure) {
    // For failure messages, wrap to show the full text
    const lines = wrapText(text, maxLen)
    return (
      <Box flexDirection="column">
        {lines.map((line, i) => (
          <Box key={i}>
            <Text color={theme.subtle}>{i === 0 ? prefix : '    '}</Text>
            <Text color="red">{line}</Text>
          </Box>
        ))}
      </Box>
    )
  }
  const display = text.length > maxLen ? text.slice(0, maxLen - 1) + '…' : text
  return (
    <Box>
      <Text color={theme.subtle}>{prefix}</Text>
      <Text color={theme.inactive}>{display}</Text>
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

type ToolCategory = 'read' | 'search' | 'write' | 'http' | 'js' | 'message' | 'task' | 'other';

function classifyTool(tool: string): ToolCategory {
  if (tool === 'workspace.read' || tool === 'workspace.list') return 'read';
  if (tool === 'workspace.search') return 'search';
  if (tool === 'workspace.write' || tool === 'workspace.apply_patch') return 'write';
  if (tool === 'http.fetch') return 'http';
  if (tool === 'js.exec') return 'js';
  if (tool === 'message.send') return 'message';
  if (tool.startsWith('task.')) return 'task';
  return 'other';
}

function buildCollapsedSummary(entries: TerminalPanelTranscriptEntry[]): string {
  const counts: Record<ToolCategory, number> = {
    read: 0, search: 0, write: 0, http: 0, js: 0,
    message: 0, task: 0, other: 0,
  };
  let errors = 0;
  let hasRunning = false;
  for (const entry of entries) {
    if (entry.role !== 'tool' || !entry.toolData) continue;
    const cat = classifyTool(entry.toolData.tool);
    counts[cat]++;
    if (entry.toolData.status === 'error') errors++;
    if (entry.toolData.status === 'running') hasRunning = true;
  }
  const parts: string[] = [];
  if (counts.read > 0) parts.push(`Read ${counts.read} file${counts.read > 1 ? 's' : ''}`);
  if (counts.search > 0) parts.push(`searched ${counts.search} pattern${counts.search > 1 ? 's' : ''}`);
  if (counts.write > 0) parts.push(`wrote ${counts.write} file${counts.write > 1 ? 's' : ''}`);
  if (counts.http > 0) parts.push(`fetched ${counts.http} URL${counts.http > 1 ? 's' : ''}`);
  if (counts.js > 0) parts.push(`executed ${counts.js} JS snippet${counts.js > 1 ? 's' : ''}`);
  if (counts.message > 0) parts.push(`sent ${counts.message} message${counts.message > 1 ? 's' : ''}`);
  if (counts.task > 0) parts.push('managed tasks');
  if (counts.other > 0) parts.push(`used ${counts.other} tool${counts.other > 1 ? 's' : ''}`);

  const suffix = hasRunning ? '...' : (errors > 0 ? `, ${errors} failed` : '');
  return parts.join(', ') + suffix;
}

function formatResultSummary(result: unknown, maxLen: number): string {
  if (result === undefined) return '';
  if (typeof result === 'string') {
    return result.length > maxLen ? result.slice(0, maxLen - 1) + '\u2026' : result;
  }
  try {
    const str = JSON.stringify(result);
    return str.length > maxLen ? str.slice(0, maxLen - 1) + '\u2026' : str;
  } catch (_err: unknown) {
    return '';
  }
}

function formatValuePreview(value: unknown, maxLen: number): string {
  if (value === undefined) return 'undefined';
  if (value === null) return 'null';
  if (typeof value === 'string') {
    return value.length > maxLen ? value.slice(0, maxLen - 1) + '\u2026' : value;
  }
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) {
    const str = JSON.stringify(value);
    return str.length > maxLen ? str.slice(0, maxLen - 1) + '\u2026' : str;
  }
  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>);
    if (entries.length > 0 && entries.length <= 8) {
      const formatted = entries.map(([k, v]) => {
        const vs = typeof v === 'string' ? v : JSON.stringify(v);
        return `${k}: ${vs}`;
      }).join(', ');
      if (formatted.length <= maxLen) return formatted;
    }
    try {
      const str = JSON.stringify(value);
      return str.length > maxLen ? str.slice(0, maxLen - 1) + '\u2026' : str;
    } catch {
      return '';
    }
  }
  return String(value);
}

function formatVerboseToolLine(entry: TerminalPanelTranscriptEntry, maxWidth: number): string {
  const td = entry.toolData!;
  const indent = '    ';
  const maxContent = maxWidth - indent.length - 1;

  switch (classifyTool(td.tool)) {
    case 'read': {
      const path = typeof td.args.path === 'string' ? td.args.path : '?';
      if (td.status === 'error') return `${indent}Read ${path} — error`;
      const resultStr = formatResultSummary(td.result, 40);
      return `${indent}Read ${path}${resultStr ? ` (${resultStr})` : ''}`;
    }
    case 'search': {
      const pattern = typeof td.args.pattern === 'string' ? td.args.pattern : '?';
      const path = typeof td.args.path === 'string' ? ` in ${td.args.path}` : '';
      if (td.status === 'error') return `${indent}Search "${pattern}"${path} — error`;
      const resultStr = formatResultSummary(td.result, 40);
      return `${indent}Search "${pattern}"${path}${resultStr ? ` (${resultStr})` : ''}`;
    }
    case 'write': {
      const path = typeof td.args.path === 'string' ? td.args.path : '?';
      if (td.status === 'error') return `${indent}Write ${path} — error`;
      return `${indent}Write ${path}`;
    }
    case 'http': {
      const url = typeof td.args.url === 'string' ? td.args.url : '?';
      if (td.status === 'error') return `${indent}Fetch ${url} — error`;
      const resultStr = formatResultSummary(td.result, 40);
      return `${indent}Fetch ${url}${resultStr ? ` (${resultStr})` : ''}`;
    }
    case 'js': {
      let resultStr: string;
      if (td.status === 'error') {
        const errPayload =
          typeof td.result === 'object' && td.result !== null && 'error' in (td.result as Record<string, unknown>)
            ? String((td.result as Record<string, unknown>).error)
            : formatResultSummary(td.result, maxContent);
        resultStr = ` — error: ${errPayload}`;
      } else if (td.status === 'success') {
        const raw = td.result;
        const value =
          typeof raw === 'object' && raw !== null && 'value' in (raw as Record<string, unknown>)
            ? (raw as Record<string, unknown>).value
            : raw;
        resultStr = ` \u2192 ${formatValuePreview(value, maxContent - 12)}`;
      } else {
        resultStr = '...';
      }
      let line = `${indent}js.exec${resultStr}`;
      const code = typeof td.args.code === 'string' ? td.args.code : '';
      if (code) {
        const codeLines = code.split('\n').filter(Boolean);
        const maxCodeLines = 3;
        for (let i = 0; i < Math.min(codeLines.length, maxCodeLines); i++) {
          const cl = codeLines[i];
          const truncated = cl.length > maxContent
            ? cl.slice(0, maxContent - 1) + '\u2026'
            : cl;
          line += '\n' + indent + truncated;
        }
        const remaining = codeLines.length - maxCodeLines;
        if (remaining > 0) {
          line += `\n${indent}\u2026 (+${remaining} more lines)`;
        }
      }
      return line;
    }
    case 'message': {
      const text = typeof td.args.text === 'string'
        ? (td.args.text.length > 40 ? td.args.text.slice(0, 39) + '\u2026' : td.args.text)
        : '?';
      return `${indent}Send "${text}"`;
    }
    case 'task':
      return `${indent}${td.tool}(${formatResultSummary(td.result, 30)})`;
    default:
      return `${indent}${td.tool}(${entry.text})`;
  }
}

export function Transcript({ entries, width, maxLines = 12, verbose = false }: TranscriptProps) {
  if (entries.length === 0) {
    return <Text color={theme.subtle}>No transcript yet.</Text>;
  }

  const visible = entries.slice(-maxLines);
  const lines: React.ReactNode[] = [];
  let pendingSteps: TerminalPanelTranscriptEntry[] = [];
  let lastRole: 'user' | 'assistant' | 'system' | 'tool' | null = null;

  function flushSteps() {
    if (pendingSteps.length === 0) return;

    const toolEntries = pendingSteps.filter((e) => e.role === 'tool');
    const systemEntries = pendingSteps.filter((e) => e.role === 'system');

    // Render system entries as before
    for (const entry of systemEntries) {
      lines.push(
        <StepLine
          key={`step-${lines.length}`}
          text={entry.text}
          isLast={pendingSteps.indexOf(entry) === pendingSteps.length - 1 && toolEntries.length === 0}
          width={width}
        />,
      );
    }

    // Render tool entries
    if (toolEntries.length > 0) {
      if (verbose) {
        for (let i = 0; i < toolEntries.length; i++) {
          const entry = toolEntries[i];
          const isLast = i === toolEntries.length - 1;
          const verboseText = formatVerboseToolLine(entry, width ?? 100);
          const verboseLines = verboseText.split('\n');
          for (let j = 0; j < verboseLines.length; j++) {
            const prefix = j === 0
              ? (isLast ? '  └─ ' : '  ├─ ')
              : '  │   ';
            const color = entry.toolData?.status === 'error' ? 'red' : theme.inactive;
            lines.push(
              <Box key={`tool-${lines.length}`}>
                <Text color={theme.subtle}>{prefix}</Text>
                <Text color={color}>{verboseLines[j]}</Text>
              </Box>,
            );
          }
        }
      } else {
        // Collapsed: aggregate tool entries into one summary line
        const summary = buildCollapsedSummary(toolEntries);
        const hint = ' (ctrl+o to expand)';
        lines.push(
          <StepLine
            key={`tool-agg-${lines.length}`}
            text={summary + hint}
            isLast={true}
            width={width}
          />,
        );
      }
    }

    pendingSteps = [];
  }

  for (const entry of visible) {
    if (entry.role === 'system' || entry.role === 'tool') {
      pendingSteps.push(entry);
    } else {
      flushSteps();
      if (entry.role === 'user') {
        if (lines.length > 0) {
          lines.push(
            <Box key={`sep-${lines.length}`} height={1} />,
          );
        }
        lines.push(<UserLine key={lines.length} text={entry.text} />);
        lastRole = 'user';
      } else {
        if (lastRole === 'user') {
          lines.push(<Box key={`gap-${lines.length}`} height={1} />);
        }
        lines.push(<AssistantLine key={lines.length} text={entry.text} />);
        lastRole = 'assistant';
      }
    }
  }
  flushSteps();

  return (
    <Box flexDirection="column">
      {lines}
    </Box>
  );
}
