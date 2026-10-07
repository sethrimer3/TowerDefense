import { stream } from "./random.ts";
import { audioGraph, soundOn } from "./sound.ts";

/** The world's background sound, made in code like every cue (no sound
 * files): looping beds of rain, wind, blowing sand and crickets, and
 * scattered voices over them (birdsong by day, an owl by night, thunder in
 * storms, drips in caves, a fire's crackle). Each page that shows the
 * outdoors says what it hears every frame (`hear`), as levels from 0 to 1,
 * and each layer eases toward its level, so the sound follows the weather
 * and the hour without a seam. Everything waits for the player's first
 * press, stays silent with sound off and fades out while the game is
 * hidden. */
export type Scene = {
  /** Falling rain: 0 none, 0.5 steady, 1 a downpour. */
  rain: number;
  /** Wind in the open. */
  wind: number;
  /** A blizzard's howl, whistling over the wind. */
  howl: number;
  /** Blowing sand's hiss. */
  sand: number;
  /** Thunder: about this many rolls a minute (from afar; the Mine's strikes
   * call `thunder` themselves). */
  thunder: number;
  /** Spring birdsong. */
  birds: number;
  /** The night: crickets, and now and then an owl. */
  night: number;
  /** Water dripping in a cave. */
  drips: number;
  /** A fire burning: a low roar and crackles. */
  fire: number;
  /** Heard from indoors, through walls: 0 out in it, 1 muffled. */
  muffle: number;
};

/** Silence: what a page with no outdoors hears. */
export const QUIET: Scene = { rain: 0, wind: 0, howl: 0, sand: 0, thunder: 0, birds: 0, night: 0, drips: 0, fire: 0, muffle: 0 };

const rand = stream("effects");
/** How loud each bed is at level 1. */
const BED = { rain: 0.82, roar: 1, wind: 1.1, howl: 0.25, sand: 0.12, crickets: 0.16, fire: 0.14 };
/** Seconds a layer takes to ease most of the way to a new level. */
const EASE = 1.2;

type Graph = {
  ctx: AudioContext;
  /** The outdoors, through the indoor muffle, to the shared mix. */
  bus: GainNode;
  /** What is in the room with the listener (a fire, a cave's drips), never
   * muffled. */
  room: GainNode;
  muffle: BiquadFilterNode;
  /** The beds' gains. */
  rain: GainNode; roar: GainNode; wind: GainNode; howl: GainNode; sand: GainNode; crickets: GainNode; fire: GainNode;
  /** The wind's and the howl's band-passes, wandering with the gusts. */
  windBand: BiquadFilterNode; howlBand: BiquadFilterNode;
  /** A small send into the stone-hall echo, for the cave's drips. */
  hall: GainNode;
};

let graph: Graph | null = null;
let scene: Scene = QUIET;
/** When each scattered voice is next due, in audio-clock seconds. */
const due = { gust: 0, bird: 0, owl: 0, thunder: 0, drip: 0, crackle: 0 };

/** How the gusts swell the wind, the howl and the sand just now. */
const gust = { wind: 1, howl: 1, sand: 1 };

/** Sets what can be heard now; called every frame by whichever page shows. */
export function hear(next: Scene) {
  scene = next;
  const g = graph ?? build();
  if (!g) return;
  const quiet = document.hidden || !soundOn(), t = g.ctx.currentTime, s = quiet ? QUIET : next;
  ease(g.rain.gain, s.rain * BED.rain, t);
  ease(g.roar.gain, Math.max(0, s.rain - 0.5) * 2 * BED.roar, t);
  ease(g.wind.gain, s.wind * BED.wind * gust.wind, t);
  ease(g.howl.gain, s.howl * BED.howl * gust.howl, t);
  ease(g.sand.gain, s.sand * BED.sand * gust.sand, t);
  ease(g.crickets.gain, s.night * (1 - Math.min(1, s.rain * 1.6)) * BED.crickets, t);
  ease(g.fire.gain, s.fire * BED.fire, t);
  ease(g.muffle.frequency, 18000 - s.muffle * 16800, t);
  if (!quiet) scatter(g, s, t);
}
// Hidden, the frames stop: fade out at once, and back in on return.
if (typeof document !== "undefined") document.addEventListener("visibilitychange", () => hear(scene));

let lastThunder = -Infinity;
/** A rumble of thunder, `near` (0 far off to 1 overhead): a crack, then
 * the long roll. */
export function thunder(near = 0.5) {
  const g = graph ?? build();
  if (!g || document.hidden || !soundOn()) return;
  const t = g.ctx.currentTime;
  // A run of strikes (the Mine catching up) rolls as one long peal.
  if (t < lastThunder + 2) return;
  lastThunder = t;
  roll(g, t + 0.05 + (1 - near) * 1.5, near);
}

/** The level each param was last sent toward, so a steady scene schedules
 * nothing new frame after frame. */
const sent = new WeakMap<AudioParam, number>();
function ease(p: AudioParam, v: number, t: number) {
  const was = sent.get(p);
  if (was !== undefined && Math.abs(was - v) <= Math.max(1e-4, Math.abs(v) * 0.01)) return;
  sent.set(p, v);
  p.setTargetAtTime(v, t, EASE / 3);
}

/** The ambience's graph and its looping beds, once there's sound to make. */
function build(): Graph | null {
  const shared = audioGraph();
  if (!shared) return null;
  const { ctx, out } = shared;
  const muffle = ctx.createBiquadFilter();
  muffle.type = "lowpass";
  muffle.frequency.value = 18000;
  const bus = ctx.createGain();
  bus.gain.value = 1;
  bus.connect(muffle).connect(out);
  const room = ctx.createGain();
  room.connect(out);
  const hall = ctx.createGain();
  hall.gain.value = 0.6;
  hall.connect(shared.hall);
  const layer = (to: AudioNode = bus) => {
    const g = ctx.createGain();
    g.gain.value = 0;
    g.connect(to);
    return g;
  };
  const loop = (buf: AudioBuffer, ...chain: AudioNode[]) => {
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    let node: AudioNode = src;
    for (const n of chain) node = node.connect(n);
    src.start(ctx.currentTime, rand() * buf.duration);
    return src;
  };
  const filter = (type: BiquadFilterType, freq: number, q = 0.7) => {
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    return f;
  };
  const rainBuf = rainBed(ctx), windBuf = brownLoop(ctx), hissBuf = whiteLoop(ctx);
  const g: Graph = {
    ctx, bus, room, muffle, hall,
    rain: layer(), roar: layer(), wind: layer(), howl: layer(), sand: layer(), crickets: layer(), fire: layer(room),
    windBand: filter("bandpass", 420, 0.9), howlBand: filter("bandpass", 900, 9),
  };
  loop(rainBuf, filter("highpass", 380), g.rain);
  const slow = loop(rainBuf, filter("lowpass", 700), g.roar);
  slow.playbackRate.value = 0.5;
  loop(windBuf, g.windBand, g.wind);
  loop(hissBuf, g.howlBand, g.howl);
  loop(hissBuf, filter("highpass", 2600), filter("lowpass", 9000), g.sand);
  loop(cricketBed(ctx), g.crickets);
  loop(windBuf, filter("lowpass", 380), g.fire);
  graph = g;
  return g;
}

/** Schedules the scattered voices that are due. */
function scatter(g: Graph, s: Scene, t: number) {
  // Gusts: the wind's band and strength wander, the howl rises and falls.
  if (t >= due.gust) {
    due.gust = t + 0.8 + rand() * 1.6;
    gust.wind = 0.55 + rand() * 0.9;
    gust.howl = 0.3 + rand() * 1.1;
    gust.sand = 0.5 + rand() * 0.8;
    g.windBand.frequency.setTargetAtTime(260 + rand() * 520 + s.howl * 200, t, 0.9);
    g.windBand.Q.setTargetAtTime(0.6 + rand() * 1.4, t, 0.9);
    g.howlBand.frequency.setTargetAtTime(650 + rand() * 700, t, 1.1);
  }
  if (s.birds > 0.05 && t >= due.bird) {
    due.bird = t + (0.5 + rand() * 3) / s.birds;
    sing(g, t + rand() * 0.2, s.birds);
  } else if (s.birds <= 0.05) due.bird = t + rand() * 2;
  if (s.night > 0.3 && t >= due.owl) {
    if (due.owl) hoot(g, t, s.night);
    due.owl = t + 14 + rand() * 30;
  } else if (s.night <= 0.3) due.owl = t + 6 + rand() * 20;
  if (s.thunder > 0 && t >= due.thunder) {
    if (due.thunder) roll(g, t, rand() * 0.45);
    due.thunder = t + (30 + rand() * 60) / s.thunder;
  } else if (s.thunder <= 0) due.thunder = 0;
  if (s.drips > 0.05 && t >= due.drip) {
    due.drip = t + (0.6 + rand() * 4) / s.drips;
    drip(g, t, s.drips);
  }
  if (s.fire > 0.05 && t >= due.crackle) {
    due.crackle = t + (0.03 + rand() * 0.25) / s.fire;
    crackle(g, t, s.fire);
  }
}

// ── Voices ─────────────────────────────────────────────────────────────────

/** A voice's chain end: an envelope, panned, into the bus (and a little of
 * it into the hall). */
function voice(g: Graph, at: number, pan: number, wet = 0, to: AudioNode = g.bus) {
  const env = g.ctx.createGain();
  env.gain.setValueAtTime(0, at);
  const p = g.ctx.createStereoPanner();
  p.pan.value = pan;
  env.connect(p).connect(to);
  if (wet > 0) {
    const send = g.ctx.createGain();
    send.gain.value = wet;
    p.connect(send).connect(g.hall);
  }
  return env;
}

/** A sine whose pitch follows `pitch` (pairs of time and frequency) under
 * `env` (pairs of time and gain), both from `at`. */
function sweep(g: Graph, at: number, pitch: [number, number][], env: [number, number][], pan: number, wet = 0, type: OscillatorType = "sine", to: AudioNode = g.bus) {
  const osc = g.ctx.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(pitch[0][1], at);
  for (const [dt, f] of pitch.slice(1)) osc.frequency.exponentialRampToValueAtTime(f, at + dt);
  const v = voice(g, at, pan, wet, to);
  for (const [dt, a] of env) v.gain.linearRampToValueAtTime(a, at + dt);
  osc.connect(v);
  osc.start(at);
  osc.stop(at + env[env.length - 1][0] + 0.05);
}

/** One bird's phrase: a whistled call, a trill, a warble, or far off, a
 * cuckoo. */
function sing(g: Graph, at: number, loud: number) {
  const pan = rand() * 1.6 - 0.8, a = (0.05 + rand() * 0.06) * Math.min(1, loud + 0.3), base = 2600 + rand() * 1600;
  const kind = rand();
  if (kind < 0.35) {
    // Two or three falling whistles: "tee-oo, tee-oo".
    const n = 2 + Math.floor(rand() * 2);
    for (let i = 0; i < n; i++) {
      const t = at + i * (0.22 + rand() * 0.05);
      sweep(g, t, [[0, base * 1.15], [0.12, base * 0.85]], [[0.015, a], [0.1, a * 0.7], [0.14, 0]], pan);
    }
  } else if (kind < 0.65) {
    // A trill of quick chirps, speeding up.
    const n = 6 + Math.floor(rand() * 8);
    let t = at;
    for (let i = 0; i < n; i++) {
      sweep(g, t, [[0, base], [0.035, base * 1.35]], [[0.005, a * 0.8], [0.03, 0]], pan);
      t += 0.075 - i * 0.003;
    }
  } else if (kind < 0.93) {
    // A warble: a wandering whistle with a fast flutter.
    const len = 0.35 + rand() * 0.4, osc = g.ctx.createOscillator(), lfo = g.ctx.createOscillator(), depth = g.ctx.createGain();
    osc.frequency.setValueAtTime(base, at);
    osc.frequency.linearRampToValueAtTime(base * (0.8 + rand() * 0.5), at + len);
    lfo.frequency.value = 18 + rand() * 14;
    depth.gain.value = base * 0.08;
    lfo.connect(depth).connect(osc.frequency);
    const v = voice(g, at, pan);
    v.gain.linearRampToValueAtTime(a * 0.8, at + 0.04);
    v.gain.linearRampToValueAtTime(a * 0.6, at + len - 0.05);
    v.gain.linearRampToValueAtTime(0, at + len);
    osc.connect(v);
    for (const o of [osc, lfo]) { o.start(at); o.stop(at + len + 0.05); }
  } else {
    // A cuckoo across the fields.
    const c = 0.07 * Math.min(1, loud + 0.3);
    for (const [dt, f] of [[0, 698], [0.32, 587]] as const)
      sweep(g, at + dt, [[0, f], [0.25, f * 0.98]], [[0.04, c], [0.18, c * 0.7], [0.26, 0]], pan * 0.5, 0, "triangle");
  }
}

/** An owl, a soft hollow "hoo… hoo-hoo-hooo" in the dark. */
function hoot(g: Graph, at: number, loud: number) {
  const a = 0.1 * loud, pan = rand() * 1.4 - 0.7, f = 330 + rand() * 60;
  const notes: [number, number][] = [[0, 0.4], [0.75, 0.16], [0.95, 0.16], [1.15, 0.6]];
  for (const [dt, len] of notes)
    sweep(g, at + dt, [[0, f * 1.04], [0.06, f], [len, f * 0.93]], [[0.05, a], [len - 0.08, a * 0.8], [len, 0]], pan, 0.3);
}

/** Thunder: a crack when near, then a long low roll of noise swelling and
 * dying. */
function roll(g: Graph, at: number, near: number) {
  const { ctx } = g, len = 3 + rand() * 3 + (1 - near) * 1.5, pan = rand() * 1.2 - 0.6;
  const src = ctx.createBufferSource();
  src.buffer = brownLoop(ctx);
  src.playbackRate.value = 0.6;
  const lp = ctx.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.setValueAtTime(180 + near * 900, at);
  lp.frequency.exponentialRampToValueAtTime(90 + near * 80, at + len);
  const v = voice(g, at, pan, 0.4), peak = 0.06 + near * 0.12;
  let t = 0.05;
  v.gain.linearRampToValueAtTime(peak * (0.6 + near * 0.4), at + t);
  // The roll: a few swells, each weaker.
  for (let i = 0; t < len - 0.6; i++) {
    t += 0.3 + rand() * 0.7;
    v.gain.linearRampToValueAtTime(peak * (0.3 + rand() * 0.7) * Math.pow(0.82, i), at + t);
  }
  v.gain.linearRampToValueAtTime(0, at + len);
  src.connect(lp).connect(v);
  src.start(at, rand() * 2);
  src.stop(at + len + 0.1);
  if (near > 0.5) {
    // The crack overhead: a bright burst tearing down into the roll.
    const c = ctx.createBufferSource(), hp = ctx.createBiquadFilter();
    c.buffer = whiteLoop(ctx);
    hp.type = "bandpass";
    hp.frequency.setValueAtTime(3500, at);
    hp.frequency.exponentialRampToValueAtTime(400, at + 0.5);
    hp.Q.value = 0.6;
    const cv = voice(g, at, pan, 0.6);
    cv.gain.linearRampToValueAtTime(0.18 * near, at + 0.01);
    cv.gain.linearRampToValueAtTime(0.06 * near, at + 0.12);
    cv.gain.linearRampToValueAtTime(0, at + 0.6);
    c.connect(hp).connect(cv);
    c.start(at, rand());
    c.stop(at + 0.7);
  }
}

/** A drop falling into a still pool, echoing round the cave. */
function drip(g: Graph, at: number, loud: number) {
  const f = 900 + rand() * 900, a = 0.1 * loud;
  sweep(g, at, [[0, f], [0.06, f * 1.9]], [[0.003, a], [0.07, 0]], rand() * 1.4 - 0.7, 1.2, "sine", g.room);
}

/** One pop of burning wood. */
function crackle(g: Graph, at: number, loud: number) {
  const { ctx } = g, src = ctx.createBufferSource(), bp = ctx.createBiquadFilter();
  src.buffer = whiteLoop(ctx);
  bp.type = "bandpass";
  bp.frequency.value = 1500 + rand() * 4000;
  bp.Q.value = 1.5;
  const len = 0.008 + rand() * 0.03, v = voice(g, at, rand() * 0.8 - 0.4, 0, g.room);
  v.gain.linearRampToValueAtTime((0.04 + rand() * 0.12) * loud, at + 0.002);
  v.gain.linearRampToValueAtTime(0, at + len);
  src.connect(bp).connect(v);
  src.start(at, rand() * 2);
  src.stop(at + len + 0.02);
}

// ── Looping beds, generated once ───────────────────────────────────────────

const beds = new Map<string, AudioBuffer>();

/** A stereo loop of `seconds`, each channel filled by `fill`, its end
 * cross-faded into its start so it repeats without a seam. */
function loopBuffer(ctx: AudioContext, key: string, seconds: number, fill: (d: Float32Array, rate: number, ch: number) => void) {
  const had = beds.get(key);
  if (had) return had;
  const rate = ctx.sampleRate, len = Math.floor(seconds * rate), fade = Math.floor(rate * 0.25);
  const buf = ctx.createBuffer(2, len, rate);
  for (let ch = 0; ch < 2; ch++) {
    const d = new Float32Array(len + fade);
    fill(d, rate, ch);
    for (let i = 0; i < fade; i++) {
      const k = i / fade;
      d[i] = d[i] * k + d[len + i] * (1 - k);
    }
    buf.getChannelData(ch).set(d.subarray(0, len));
  }
  beds.set(key, buf);
  return buf;
}

/** White noise. */
const whiteLoop = (ctx: AudioContext) => loopBuffer(ctx, "white", 3, (d) => {
  for (let i = 0; i < d.length; i++) d[i] = rand() * 2 - 1;
});

/** Brown noise: deep, for wind, thunder and a fire's roar. */
const brownLoop = (ctx: AudioContext) => loopBuffer(ctx, "brown", 5, (d) => {
  let b = 0;
  for (let i = 0; i < d.length; i++) {
    b = (b + 0.02 * (rand() * 2 - 1)) * 0.998;
    d[i] = b * 3.5;
  }
});

/** Rain: a hush of soft noise sprinkled with thousands of drops, each a tiny
 * ping on a leaf, a stone or a puddle. */
const rainBed = (ctx: AudioContext) => loopBuffer(ctx, "rain", 6, (d, rate) => {
  let lp = 0;
  for (let i = 0; i < d.length; i++) {
    lp += 0.35 * (rand() * 2 - 1 - lp);
    d[i] = lp * 0.35;
  }
  const drops = Math.floor((d.length / rate) * 260);
  for (let n = 0; n < drops; n++) {
    const at = Math.floor(rand() * d.length), f = 1200 + rand() * 4800, len = Math.floor(rate * (0.004 + rand() * 0.012));
    const amp = 0.05 + rand() * rand() * 0.5, w = (2 * Math.PI * f) / rate;
    for (let i = 0; i < len && at + i < d.length; i++) d[at + i] += Math.sin(i * w) * amp * Math.exp(-i / (len * 0.3));
  }
});

/** Crickets: several, each chirping its own pulses at its own pitch and
 * pace, every pace dividing the loop so it repeats seamlessly. */
const cricketBed = (ctx: AudioContext) => loopBuffer(ctx, "crickets", 4, (d, rate, ch) => {
  const len = d.length - Math.floor(rate * 0.25), count = 3;
  for (let c = 0; c < count; c++) {
    const f = 3900 + rand() * 900, w = (2 * Math.PI * f) / rate, amp = (0.3 + rand() * 0.5) * (ch === c % 2 ? 1 : 0.45);
    const period = len / (5 + Math.floor(rand() * 4)), pulses = 2 + Math.floor(rand() * 3), offset = rand() * period;
    const pulse = rate * 0.016;
    for (let start = offset; start < d.length; start += period)
      for (let p = 0; p < pulses; p++) {
        const s0 = Math.floor(start + p * pulse * 2);
        for (let i = 0; i < pulse && s0 + i < d.length; i++) d[s0 + i] += Math.sin(i * w) * amp * Math.sin((Math.PI * i) / pulse);
      }
  }
});
