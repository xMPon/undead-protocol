// Procedural WebAudio SFX — no asset files, mirroring blockcraft's approach.
// The AudioContext is created lazily on the first user gesture (menu click) to
// satisfy autoplay policies. Every method no-ops until resume() has run.

export class Sound {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  muted = false;

  /** Create/resume the context. Call from a user gesture. */
  resume(): void {
    if (!this.ctx) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new Ctor();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.5;
      this.master.connect(this.ctx.destination);
      this.noise = this.makeNoise(this.ctx);
    }
    void this.ctx.resume();
  }

  private makeNoise(ctx: AudioContext): AudioBuffer {
    const len = ctx.sampleRate;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    return buf;
  }

  private get t(): number {
    return this.ctx!.currentTime;
  }

  /** Filtered noise burst — the body of most impact/gun sounds. */
  private blast(vol: number, dur: number, cutoff: number, type: BiquadFilterType = "lowpass"): void {
    if (!this.ctx || !this.master || !this.noise || this.muted) return;
    const t = this.t;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    const filter = this.ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = cutoff;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    src.connect(filter);
    filter.connect(g);
    g.connect(this.master);
    src.start(t);
    src.stop(t + dur);
  }

  private tone(freq: number, dur: number, vol: number, type: OscillatorType = "sine", slideTo?: number): void {
    if (!this.ctx || !this.master || this.muted) return;
    const t = this.t;
    const osc = this.ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slideTo !== undefined) osc.frequency.exponentialRampToValueAtTime(Math.max(1, slideTo), t + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    osc.connect(g);
    g.connect(this.master);
    osc.start(t);
    osc.stop(t + dur);
  }

  // ---- game sounds ----

  shot(weaponId: string): void {
    switch (weaponId) {
      case "breacher":
        this.blast(0.9, 0.28, 1800);
        this.tone(90, 0.18, 0.5, "square", 40);
        break;
      case "kr12":
        this.blast(0.6, 0.12, 3200);
        this.tone(140, 0.08, 0.35, "square", 70);
        break;
      case "pdw":
        this.blast(0.42, 0.08, 4200);
        this.tone(190, 0.05, 0.25, "square", 90);
        break;
      default: // m9
        this.blast(0.5, 0.1, 2600);
        this.tone(160, 0.07, 0.3, "square", 80);
    }
  }
  dryFire(): void {
    this.tone(1400, 0.03, 0.12, "square");
  }
  reload(): void {
    this.tone(500, 0.05, 0.14, "square");
    window.setTimeout(() => this.tone(360, 0.06, 0.14, "square"), 140);
  }
  hit(): void {
    this.blast(0.28, 0.06, 2400, "bandpass");
  }
  kill(): void {
    this.tone(260, 0.16, 0.28, "sawtooth", 90);
  }
  hurt(): void {
    this.blast(0.4, 0.18, 900);
    this.tone(220, 0.2, 0.3, "sawtooth", 80);
  }
  groan(): void {
    this.tone(70 + Math.random() * 30, 0.5, 0.12, "sawtooth", 55);
  }
  roundStart(): void {
    this.tone(180, 0.4, 0.3, "sawtooth", 120);
    window.setTimeout(() => this.tone(240, 0.5, 0.3, "sawtooth", 160), 220);
  }
  buy(): void {
    this.tone(520, 0.09, 0.22, "square");
    window.setTimeout(() => this.tone(780, 0.12, 0.22, "square"), 90);
  }
  denied(): void {
    this.tone(140, 0.16, 0.22, "square", 90);
  }
  door(): void {
    this.blast(0.6, 0.2, 700);
    window.setTimeout(() => this.blast(0.4, 0.12, 500), 120);
  }
  death(): void {
    this.blast(0.7, 0.7, 600);
    this.tone(140, 0.8, 0.35, "sawtooth", 40);
  }

  // ---- phase 2 ----

  /** A perk going down: three rising notes, the jingle without the jingle. */
  perk(): void {
    this.tone(392, 0.12, 0.22, "triangle");
    window.setTimeout(() => this.tone(523, 0.12, 0.22, "triangle"), 110);
    window.setTimeout(() => this.tone(659, 0.24, 0.24, "triangle"), 230);
  }
  /** The Cache lid coming up. */
  cacheOpen(): void {
    this.blast(0.4, 0.35, 900);
    this.tone(180, 0.4, 0.2, "triangle", 420);
  }
  /** It has settled on something. */
  cacheReveal(): void {
    this.tone(660, 0.18, 0.22, "square");
    window.setTimeout(() => this.tone(880, 0.3, 0.22, "square"), 130);
  }
  /** It has packed up and gone somewhere else. */
  cacheMove(): void {
    this.tone(520, 0.3, 0.2, "sawtooth", 180);
    window.setTimeout(() => this.blast(0.35, 0.3, 700), 160);
  }
  throwGrenade(): void {
    this.blast(0.22, 0.09, 3000, "highpass");
  }
  explosion(): void {
    this.blast(1.0, 0.7, 700);
    this.tone(70, 0.5, 0.5, "square", 30);
  }
  /** A plank being ripped off a barrier. */
  board(): void {
    this.blast(0.32, 0.14, 1600, "bandpass");
    this.tone(220, 0.1, 0.16, "square", 120);
  }
  /** A plank going back on: two hammer blows. */
  repair(): void {
    this.blast(0.28, 0.06, 2600, "bandpass");
    window.setTimeout(() => this.blast(0.22, 0.05, 2400, "bandpass"), 90);
  }
  /** Back on your feet. */
  revive(): void {
    this.tone(220, 0.5, 0.28, "triangle", 660);
  }
}
