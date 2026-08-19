// requestAnimationFrame loop with a clamped delta so a stall (backgrounded tab,
// GC pause) can never teleport entities across the map. Mirrors blockcraft's
// Engine loop discipline.

export class Loop {
  running = false;
  private raf = 0;
  private last = 0;

  constructor(
    private readonly cb: (dt: number) => void,
    private readonly maxDt = 0.05,
  ) {}

  start(): void {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.frame);
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.raf);
  }

  private frame = (now: number): void => {
    if (!this.running) return;
    let dt = (now - this.last) / 1000;
    this.last = now;
    if (dt > this.maxDt) dt = this.maxDt;
    this.cb(dt);
    this.raf = requestAnimationFrame(this.frame);
  };
}
