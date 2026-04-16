export function summarizeRuntimeError(
  error: string | null | undefined,
): string {
  const normalized = typeof error === 'string' ? error.trim() : '';
  if (!normalized) return 'Unknown error';
  const singleLine = normalized.replace(/\s+/g, ' ');
  return singleLine.length <= 200
    ? singleLine
    : `${singleLine.slice(0, 200)}...`;
}
