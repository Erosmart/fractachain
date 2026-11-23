import type { AuditEntry } from '@/core/api/types';

const HEADER = ['at', 'actor', 'action', 'target', 'ip', 'requestId', 'outcome', 'details'] as const;

/**
 * One CSV cell: quoted, inner quotes doubled, and formula-looking values
 * (=, +, -, @, tab, CR) prefixed with an apostrophe so a spreadsheet never
 * executes them (CSV injection).
 */
export function csvCell(value: unknown): string {
  let text =
    value === null || value === undefined ? '' : typeof value === 'string' ? value : JSON.stringify(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

/** The loaded audit rows as CSV (RFC 4180, CRLF line ends). */
export function auditToCsv(entries: readonly AuditEntry[]): string {
  const rows = entries.map((e) =>
    [
      e.at,
      e.actorEmail || e.actorId || 'system',
      e.action,
      e.target,
      e.ip,
      e.requestId,
      e.outcome,
      e.details && Object.keys(e.details).length ? e.details : '',
    ]
      .map(csvCell)
      .join(','),
  );
  return [HEADER.map(csvCell).join(','), ...rows].join('\r\n');
}

/** Triggers a download of `text` in the browser. */
export function downloadText(filename: string, text: string, type = 'text/csv;charset=utf-8'): void {
  // BOM so spreadsheet apps read accents as UTF-8.
  const blob = new Blob(['﻿', text], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
