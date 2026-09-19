import type { Direction } from './movement';

/** Initial edge, then one repeat per update at most. No resume-time repeat backlog. */
export class DirectionRepeat {
  private previous: Direction | null = null;
  private remaining = 0;
  reset(): void { this.previous = null; this.remaining = 0; }
  sample(direction: Direction | null, deltaMs: number): Direction | null {
    if (!direction) { this.reset(); return null; }
    if (direction !== this.previous) { this.previous = direction; this.remaining = 320; return direction; }
    this.remaining -= Number.isFinite(deltaMs) ? Math.max(0, Math.min(50, deltaMs)) : 0;
    if (this.remaining > 0) return null;
    this.remaining = 110;
    return direction;
  }
}
