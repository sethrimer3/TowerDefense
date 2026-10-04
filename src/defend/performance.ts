/** Bounded, presentation-only timing. Never feeds wall-clock measurements into AI. */
export class Timings {
  private bins = new Uint32Array(501);
  count = 0;
  total = 0;
  max = 0;
  add(ms: number) {
    this.count++;
    this.total += ms;
    this.max = Math.max(this.max, ms);
    this.bins[Math.min(500, Math.ceil(ms))]++;
  }
  mean() { return this.count ? this.total / this.count : 0; }
  p95() {
    if (!this.count) return 0;
    let remaining = Math.ceil(this.count * .95);
    for (let i = 0; i < this.bins.length; i++) if ((remaining -= this.bins[i]) <= 0) return i === 500 ? this.max : i;
    return 500;
  }
}

export type FrameTimes = { frameMs: number; updateMs: number; entityMs: number; effectsMs: number; terrainMs: number; uiMs: number };

/** Optional developer overlay. Bounded counters; DOM changes at most twice a second. */
export class FrameTimeOverlay {
  private element: HTMLOutputElement | null = null;
  private elapsed = 0;
  private samples = 0;
  private totals: FrameTimes = { frameMs: 0, updateMs: 0, entityMs: 0, effectsMs: 0, terrainMs: 0, uiMs: 0 };
  private frames = new Timings();
  enabled = false;

  toggle(enabled = !this.enabled) {
    this.enabled = enabled;
    this.element?.remove(); this.element = null;
    this.elapsed = this.samples = 0;
    this.frames = new Timings();
    for (const key of Object.keys(this.totals) as (keyof FrameTimes)[]) this.totals[key] = 0;
  }

  sample(row: FrameTimes) {
    if (!this.enabled || row.frameMs <= 0) return;
    this.samples++; this.elapsed += row.frameMs; this.frames.add(row.frameMs);
    for (const key of Object.keys(this.totals) as (keyof FrameTimes)[]) this.totals[key] += row[key];
    if (this.elapsed < 500) return;
    if (!this.element) {
      this.element = document.createElement('output');
      this.element.className = 'defend-frame-times';
      this.element.setAttribute('aria-label', 'Battle frame timings');
      document.body.append(this.element);
    }
    const mean = (key: keyof FrameTimes) => (this.totals[key] / this.samples).toFixed(1);
    this.element.textContent = `${(1000 * this.samples / this.totals.frameMs).toFixed(0)} FPS · frame ${mean('frameMs')} ms · p95 ${this.frames.p95()} ms\nUpdate ${mean('updateMs')} · Entities ${mean('entityMs')} · Effects ${mean('effectsMs')}\nTerrain ${mean('terrainMs')} · UI ${mean('uiMs')} ms`;
    this.elapsed = this.samples = 0; this.frames = new Timings();
    for (const key of Object.keys(this.totals) as (keyof FrameTimes)[]) this.totals[key] = 0;
  }
}

export type WavePerformance = {
  wave: number; planned: number; peakEnemies: number; samples: number;
  fps: number; frameP95Ms: number; slowFrames: number;
  updateMs: number; drawMs: number; maxFrameMs: number; status: string;
};
const round = (n: number) => Math.round(n * 100) / 100;

/** Logs every five seconds and at wave end. History keeps the latest 100 rows. */
export class BattlePerformance {
  readonly history: WavePerformance[] = [];
  private wave = 0;
  private completed = 0;
  private peak = 0;
  private slow = 0;
  private sinceLog = 0;
  private frames = new Timings();
  private updates = new Timings();
  private draws = new Timings();

  sample(wave: number, enemies: number, frameMs: number, updateMs: number, drawMs: number) {
    if (wave === this.completed) return;
    if (wave !== this.wave) {
      this.finish('cleared');
      this.wave = wave;
      this.peak = this.slow = this.sinceLog = 0;
      this.frames = new Timings(); this.updates = new Timings(); this.draws = new Timings();
    }
    if (!wave || frameMs <= 0) return;
    this.peak = Math.max(this.peak, enemies);
    this.frames.add(frameMs); this.updates.add(updateMs); this.draws.add(drawMs);
    if (frameMs > 1000 / 60 + 1) this.slow++;
    this.sinceLog += frameMs;
    if (this.sinceLog >= 5000) { this.sinceLog %= 5000; this.log('running'); }
  }

  finish(status: string) {
    if (!this.wave) return;
    this.log(status);
    this.completed = this.wave;
    this.wave = 0;
  }

  private log(status: string) {
    const row: WavePerformance = {
      wave: this.wave, planned: this.wave * 500, peakEnemies: this.peak, samples: this.frames.count,
      fps: round(this.frames.count ? 1000 / this.frames.mean() : 0),
      frameP95Ms: this.frames.p95(), slowFrames: this.slow,
      updateMs: round(this.updates.mean()), drawMs: round(this.draws.mean()), maxFrameMs: round(this.frames.max), status,
    };
    this.history.push(row);
    if (this.history.length > 100) this.history.shift();
    console.info('[Defend performance]', row);
  }
}
