/** Global events may come from injected scripts. Only explicit app boundaries are fatal. */
export class PageErrorLog {
  private total = 0;
  private last: { kind: string; message: string; source: string } | null = null;

  record(kind: string, reason: unknown, source = ''): void {
    let message = 'Uninspectable error';
    let stack = '';
    try {
      if (reason instanceof Error) { message = reason.message; stack = reason.stack ?? ''; }
      else message = String(reason);
    } catch { /* A foreign rejection object must not crash the error observer. */ }
    this.total = Math.min(this.total + 1, Number.MAX_SAFE_INTEGER);
    this.last = { kind: kind.slice(0, 40), message: message.slice(0, 800), source: (source || stack).slice(0, 2000) };
  }

  snapshot(): { count: number; last: { kind: string; message: string; source: string } | null } {
    return { count: this.total, last: this.last ? { ...this.last } : null };
  }
}
