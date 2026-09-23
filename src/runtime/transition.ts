export type TransitionResult = { kind: 'committed' | 'cancelled' | 'busy' | 'denied' } | { kind: 'failed'; error: Error };

/** A bounded async owner. Cancellation invalidates old results even if a loader ignores abort. */
export class TransitionTask<T> {
  private current: AbortController | null = null;
  private disposed = false;
  get pending(): boolean { return this.current !== null; }

  async run(load: (signal: AbortSignal) => Promise<T>, commit: (value: T) => void,
    canCommit?: () => boolean): Promise<TransitionResult> {
    if (this.disposed) return { kind: 'cancelled' };
    if (this.current) return { kind: 'busy' };
    if (canCommit && !canCommit()) return { kind: 'denied' };
    const request = new AbortController();
    this.current = request;
    try {
      const value = await load(request.signal);
      if (this.disposed || request.signal.aborted || this.current !== request) return { kind: 'cancelled' };
      if (canCommit && !canCommit()) return { kind: 'denied' };
      commit(value);
      return { kind: 'committed' };
    } catch (cause) {
      if (request.signal.aborted || this.disposed || this.current !== request) return { kind: 'cancelled' };
      return { kind: 'failed', error: cause instanceof Error ? cause : new Error(String(cause)) };
    } finally {
      if (this.current === request) this.current = null;
    }
  }

  cancel(): void {
    const old = this.current;
    this.current = null;
    old?.abort(new Error('Room transition cancelled.'));
  }
  dispose(): void { this.disposed = true; this.cancel(); }
}
