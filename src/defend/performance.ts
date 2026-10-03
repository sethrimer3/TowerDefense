/** Bounded, presentation-only timing. Never feeds wall-clock measurements into AI. */
class Timings {
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
    let remaining = Math.ceil(this.count * .95);
    for (let i = 0; i < this.bins.length; i++) if ((remaining -= this.bins[i]) <= 0) return i;
    return 500;
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
  private peak = 0;
  private slow = 0;
  private sinceLog = 0;
  private frames = new Timings();
  private updates = new Timings();
  private draws = new Timings();

  sample(wave: number, enemies: number, frameMs: number, updateMs: number, drawMs: number) {
    if (wave !== this.wave) {
      this.finish('cleared');
      this.wave = wave;
      this.peak = this.slow = this.sinceLog = 0;
      this.frames = new Timings(); this.updates = new Timings(); this.draws = new Timings();
    }
    // Ignore tab suspension, which is not a rendered frame. CPU stalls remain visible.
    if (!wave || document.hidden || frameMs <= 0 || frameMs > 1000) return;
    this.peak = Math.max(this.peak, enemies);
    this.frames.add(frameMs); this.updates.add(updateMs); this.draws.add(drawMs);
    if (frameMs > 1000 / 60 + 1) this.slow++;
    this.sinceLog += frameMs;
    if (this.sinceLog >= 5000) { this.sinceLog %= 5000; this.log('running'); }
  }

  finish(status: string) {
    if (!this.wave) return;
    this.log(status);
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
