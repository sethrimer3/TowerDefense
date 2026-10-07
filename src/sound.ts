import { stream } from "./random.ts";

/** The keep's sounds, all made here with Web Audio: no sound files. Each cue
 * is built from a few voices (a wooden knock is a burst of filtered noise on
 * a low thump; a bell is a handful of inharmonic sine partials; a horn is a
 * sawtooth through a closing low-pass) and everything rings into a short
 * generated stone-hall echo. Nothing plays until the player's first press,
 * which is when browsers let a page make sound. */
export type Cue =
  /** Pressing an oak button. */
  | "knock"
  /** Choosing a page on the stone tab row. */
  | "stone"
  /** Spending at the Armory or on Training: coins on a counter. */
  | "coin"
  /** A skill-tree rank: a glass phial chiming. */
  | "chime"
  /** A skill-tree node's first rank: the chime, and a rising shimmer. */
  | "unlock"
  /** A wave held: a short brass call. */
  | "wave"
  /** A wave held past the best: a fanfare and a bell. */
  | "record"
  /** An upgrade point earned: bells climbing a chord. */
  | "levelUp"
  /** A Smithy upgrade completed: one bright hand bell. */
  | "trained"
  /** A boss wave: a low war horn. */
  | "horn"
  /** The keep falls: a tolling bell. */
  | "fallen"
  // ── The battle, heard from the walls ──
  /** A bow loosed: a string's thrum and the arrow's hiss. */
  | "arrow"
  /** A cannon or siege engine fires: a deep boom with a crack on top. */
  | "cannon"
  /** Something explodes: a roar of noise over a falling thump. */
  | "blast"
  /** A fire mage's fireball, or a wizard tower's flame: a rushing whoosh. */
  | "fireball"
  /** A wizard tower's ice: glassy shards tinkling over a cold hiss. */
  | "frost"
  /** Black lightning: crackles over a low electric buzz. */
  | "zap"
  /** A valkyrie's charge: a quick rising swish. */
  | "swish"
  /** A wall ballista's bolt: a heavy wooden thunk and a twang. */
  | "thunk"
  /** A building falls: stones tumbling over a thud. */
  | "crumble"
  /** The city's people rebuilding: a mallet's light taps. */
  | "hammer"
  /** Boat water on fire, a blaze put out: a hiss of steam. */
  | "hiss"
  /** A rocket bursts: a scatter of crackling pops. */
  | "firework"
  /** Setting a piece of the city down while building: a solid thump. */
  | "place"
  /** The war banner planted: cloth snapping in the wind. */
  | "banner";

const rand = stream("effects");
let enabled: () => boolean = () => true;
/** Whether the player has pressed anything yet: until then browsers keep a
 * page silent, and an audio context made sooner only starts suspended. */
let pressed = false;
if (typeof document !== "undefined")
  for (const type of ["pointerdown", "keydown"]) document.addEventListener(type, () => (pressed = true), { capture: true, once: true });
/** How loud the cue being built plays (its `play` level). */
let level = 1;
let ctx: AudioContext | null = null;
let out: GainNode, hall: GainNode, noiseBuf: AudioBuffer;
/** When each cue last played, so a burst of the same event stays one sound. */
const lastAt = new Map<Cue, number>();

/** Which setting turns sound off; checked at every cue. */
export function soundEnabledBy(isOn: () => boolean) {
  enabled = isOn;
}

/** Whether sound is on now. */
export const soundOn = () => enabled();

/** The audio graph for other voices (the ambience), once the player has
 * pressed something and sound is on; null until then. */
export function audioGraph(): { ctx: AudioContext; out: GainNode; hall: GainNode } | null {
  if (!pressed || !enabled()) return null;
  const ac = audio();
  return ac ? { ctx: ac, out, hall } : null;
}

/** The audio graph, built on first use: voices → dry out and a hall send →
 * a gentle compressor → the speakers. */
function audio(): AudioContext | null {
  if (!ctx) {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -18;
    comp.ratio.value = 4;
    comp.connect(ctx.destination);
    out = ctx.createGain();
    out.gain.value = 0.55;
    out.connect(comp);
    const verb = ctx.createConvolver();
    verb.buffer = hallImpulse(ctx);
    hall = ctx.createGain();
    hall.gain.value = 0.28;
    hall.connect(verb);
    verb.connect(out);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = rand() * 2 - 1;
  }
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

/** A stone hall's echo: two channels of noise dying away over a second and
 * a half, darker as it fades. */
function hallImpulse(ac: AudioContext): AudioBuffer {
  const len = Math.floor(ac.sampleRate * 1.6), buf = ac.createBuffer(2, len, ac.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    let lp = 0;
    for (let i = 0; i < len; i++) {
      const t = i / len, k = 0.6 - 0.5 * t;
      lp += k * (rand() * 2 - 1 - lp);
      d[i] = lp * Math.pow(1 - t, 3.2);
    }
  }
  return buf;
}

/** Sends a voice's output to the dry mix and, by `wet`, into the hall. */
function route(node: AudioNode, wet = 1) {
  node.connect(out);
  if (wet > 0) {
    const send = ctx!.createGain();
    send.gain.value = wet;
    node.connect(send);
    send.connect(hall);
  }
}

/** A gain that rises over `attack` to `peak` and decays to silence by `end`. */
function envelope(at: number, peak: number, attack: number, end: number) {
  const g = ctx!.createGain();
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak * level), at + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, at + end);
  return g;
}

type Tone = { type?: OscillatorType; freq: number; to?: number; at: number; peak: number; attack?: number; end: number; wet?: number; lowpass?: number; lowpassTo?: number; vibrato?: number };
/** One oscillator voice, optionally gliding to `to` and through a low-pass. */
function tone({ type = "sine", freq, to, at, peak, attack = 0.005, end, wet = 1, lowpass, lowpassTo, vibrato }: Tone) {
  const osc = ctx!.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, at);
  if (to) osc.frequency.exponentialRampToValueAtTime(to, at + end);
  if (vibrato) {
    const lfo = ctx!.createOscillator(), depth = ctx!.createGain();
    lfo.frequency.value = 5.5;
    depth.gain.value = vibrato;
    lfo.connect(depth).connect(osc.frequency);
    lfo.start(at);
    lfo.stop(at + end + 0.05);
  }
  let node: AudioNode = osc;
  if (lowpass) {
    const f = ctx!.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.setValueAtTime(lowpass, at);
    if (lowpassTo) f.frequency.exponentialRampToValueAtTime(lowpassTo, at + end);
    node = node.connect(f);
  }
  route(node.connect(envelope(at, peak, attack, end)), wet);
  osc.start(at);
  osc.stop(at + end + 0.05);
}

/** A burst of noise through a band-pass: the grain of wood or stone. It may
 * swell in over `attack` and sweep its band to `to`. */
function noise(at: number, end: number, peak: number, freq: number, q: number, wet = 1, attack = 0.002, to?: number) {
  const src = ctx!.createBufferSource();
  src.buffer = noiseBuf;
  const f = ctx!.createBiquadFilter();
  f.type = "bandpass";
  f.frequency.setValueAtTime(freq, at);
  if (to) f.frequency.exponentialRampToValueAtTime(to, at + end);
  f.Q.value = q;
  route(src.connect(f).connect(envelope(at, peak, attack, end)), wet);
  src.start(at, rand() * 0.8);
  src.stop(at + end + 0.05);
}

/** A struck bell: inharmonic partials, the higher ones dying first. */
function bell(freq: number, at: number, peak: number, length: number, wet = 1) {
  const partials: [number, number, number][] = [[0.5, 0.5, 1.3], [1, 1, 1], [2, 0.55, 0.6], [2.76, 0.35, 0.45], [5.4, 0.18, 0.25], [8.9, 0.08, 0.15]];
  for (const [ratio, amp, life] of partials) tone({ freq: freq * ratio, at, peak: peak * amp, attack: 0.003, end: length * life, wet });
}

/** Up to ±`cents` of pitch, so repeats never sound stamped from one mould. */
const vary = (cents: number) => Math.pow(2, ((rand() * 2 - 1) * cents) / 1200);

const CUES: Record<Cue, (t: number) => void> = {
  knock(t) {
    const v = vary(60);
    noise(t, 0.05, 0.5, 1400 * v, 4, 0.4);
    tone({ type: "triangle", freq: 220 * v, to: 120 * v, at: t, peak: 0.35, end: 0.09, wet: 0.4 });
  },
  stone(t) {
    const v = vary(50);
    noise(t, 0.09, 0.45, 520 * v, 1.6, 0.7);
    noise(t + 0.012, 0.05, 0.2, 2600 * v, 3, 0.5);
    tone({ freq: 95 * v, to: 70 * v, at: t, peak: 0.4, end: 0.14, wet: 0.5 });
  },
  coin(t) {
    for (const [dt, f] of [[0, 2350], [0.07, 2960], [0.13, 2620]] as const) {
      const v = vary(40);
      tone({ freq: f * v, at: t + dt, peak: 0.16, end: 0.35, wet: 0.6 });
      tone({ freq: f * 2.71 * v, at: t + dt, peak: 0.07, end: 0.12, wet: 0.6 });
      noise(t + dt, 0.025, 0.12, 6000, 2, 0.3);
    }
  },
  chime(t) {
    const v = vary(20);
    bell(1318 * v, t, 0.12, 1.1);
    bell(1975 * v, t + 0.06, 0.07, 0.9);
  },
  unlock(t) {
    CUES.chime(t);
    [784, 988, 1175, 1568, 1976].forEach((f, i) => tone({ freq: f, at: t + 0.08 + i * 0.05, peak: 0.06, attack: 0.02, end: 0.8, wet: 1.4 }));
    tone({ type: "triangle", freq: 196, at: t, peak: 0.08, attack: 0.2, end: 1.4, wet: 1 });
  },
  wave(t) {
    // A fourth and a fifth on a brass horn: G, C, then D over G.
    const horn = (f: number, at: number, len: number, peak = 0.13) =>
      tone({ type: "sawtooth", freq: f, at, peak, attack: 0.03, end: len, lowpass: 2400, lowpassTo: 700, wet: 0.8, vibrato: 3 });
    horn(392, t, 0.18);
    horn(523, t + 0.16, 0.18);
    horn(392, t + 0.34, 0.6, 0.09);
    horn(587, t + 0.34, 0.6, 0.11);
  },
  record(t) {
    const horn = (f: number, at: number, len: number, peak = 0.12) =>
      tone({ type: "sawtooth", freq: f, at, peak, attack: 0.03, end: len, lowpass: 2800, lowpassTo: 800, wet: 0.9, vibrato: 3 });
    horn(392, t, 0.14);
    horn(392, t + 0.13, 0.14);
    horn(523, t + 0.26, 0.2);
    for (const f of [523, 659, 784]) horn(f, t + 0.46, 1, 0.08);
    bell(1046, t + 0.46, 0.1, 2);
  },
  levelUp(t) {
    [659, 784, 988, 1318].forEach((f, i) => bell(f, t + i * 0.09, 0.08, 1.2 + i * 0.2));
  },
  trained(t) {
    bell(1568 * vary(10), t, 0.09, 1.4);
  },
  horn(t) {
    const horn = (f: number, at: number, len: number) =>
      tone({ type: "sawtooth", freq: f, to: f * 0.97, at, peak: 0.16, attack: 0.12, end: len, lowpass: 900, lowpassTo: 300, wet: 1.2, vibrato: 2 });
    horn(147, t, 0.9);
    horn(110, t + 0.75, 1.5);
    tone({ type: "sawtooth", freq: 73.5, at: t + 0.75, peak: 0.08, attack: 0.2, end: 1.5, lowpass: 500, wet: 1 });
  },
  fallen(t) {
    bell(165, t, 0.2, 3.2, 1.4);
    bell(147, t + 1.1, 0.16, 3.6, 1.4);
  },
  arrow(t) {
    const v = vary(120);
    tone({ type: "triangle", freq: 330 * v, to: 250 * v, at: t, peak: 0.12, end: 0.07, wet: 0.2 });
    noise(t + 0.01, 0.13, 0.16, 3200 * v, 3, 0.25, 0.01, 1200 * v);
  },
  cannon(t) {
    const v = vary(80);
    tone({ freq: 95 * v, to: 38 * v, at: t, peak: 0.45, attack: 0.004, end: 0.45, wet: 0.6 });
    noise(t, 0.4, 0.35, 260 * v, 0.7, 0.8, 0.003, 120);
    noise(t, 0.035, 0.25, 2200 * v, 1.5, 0.4);
  },
  blast(t) {
    const v = vary(100);
    tone({ freq: 70 * v, to: 28 * v, at: t, peak: 0.42, attack: 0.006, end: 0.7, wet: 0.8 });
    noise(t, 0.9, 0.4, 420 * v, 0.6, 1, 0.008, 90);
    noise(t, 0.08, 0.22, 1800 * v, 1, 0.5);
    for (let i = 0; i < 5; i++) noise(t + 0.1 + rand() * 0.45, 0.05, 0.06, 900 + rand() * 2500, 4, 0.6);
  },
  fireball(t) {
    const v = vary(150);
    noise(t, 0.42, 0.22, 500 * v, 1.1, 0.5, 0.09, 1400 * v);
    noise(t + 0.05, 0.3, 0.07, 2600 * v, 2, 0.4, 0.05);
  },
  frost(t) {
    for (let i = 0; i < 4; i++) {
      const f = 2400 + rand() * 2600;
      tone({ freq: f, at: t + i * 0.035 + rand() * 0.02, peak: 0.035, end: 0.22 + rand() * 0.2, wet: 1.2 });
    }
    noise(t, 0.35, 0.06, 6500, 1.2, 0.8, 0.03);
  },
  zap(t) {
    const v = vary(60);
    tone({ type: "square", freq: 110 * v, to: 70 * v, at: t, peak: 0.07, end: 0.2, lowpass: 1600, wet: 0.5 });
    for (let i = 0; i < 6; i++) noise(t + rand() * 0.16, 0.025, 0.14, 3000 + rand() * 4000, 2, 0.5);
  },
  swish(t) {
    const v = vary(100);
    noise(t, 0.16, 0.18, 900 * v, 2.5, 0.4, 0.04, 4200 * v);
    tone({ freq: 2100 * v, at: t + 0.12, peak: 0.02, end: 0.3, wet: 1 });
  },
  thunk(t) {
    const v = vary(60);
    tone({ type: "triangle", freq: 150 * v, to: 75 * v, at: t, peak: 0.3, end: 0.14, wet: 0.5 });
    noise(t, 0.06, 0.25, 800 * v, 2, 0.4);
    tone({ type: "triangle", freq: 196 * v, to: 185 * v, at: t + 0.01, peak: 0.06, end: 0.35, wet: 0.6 });
  },
  crumble(t) {
    const v = vary(80);
    tone({ freq: 80 * v, to: 40 * v, at: t, peak: 0.35, attack: 0.01, end: 0.5, wet: 0.7 });
    noise(t, 0.7, 0.2, 350 * v, 0.8, 0.8, 0.02, 160);
    for (let i = 0; i < 9; i++) noise(t + 0.04 + rand() * 0.7, 0.05 + rand() * 0.05, 0.08 + rand() * 0.08, 500 + rand() * 1500, 3, 0.6);
  },
  hammer(t) {
    for (const dt of [0, 0.16 + rand() * 0.05]) {
      const v = vary(90);
      tone({ type: "triangle", freq: 620 * v, to: 480 * v, at: t + dt, peak: 0.07, end: 0.06, wet: 0.5 });
      noise(t + dt, 0.03, 0.08, 2000 * v, 3, 0.4);
    }
  },
  hiss(t) {
    noise(t, 0.6, 0.1, 5200 * vary(100), 0.9, 0.5, 0.04, 3000);
  },
  firework(t) {
    noise(t, 0.12, 0.25, 900, 0.8, 0.8);
    for (let i = 0; i < 12; i++) noise(t + 0.08 + rand() * 0.6, 0.02, 0.1 + rand() * 0.1, 2500 + rand() * 5000, 3, 0.8);
  },
  place(t) {
    const v = vary(70);
    tone({ type: "triangle", freq: 130 * v, to: 70 * v, at: t, peak: 0.35, end: 0.16, wet: 0.5 });
    noise(t, 0.1, 0.3, 700 * v, 1.4, 0.5);
    noise(t + 0.05, 0.12, 0.08, 2400 * v, 2, 0.4);
  },
  banner(t) {
    for (const dt of [0, 0.09, 0.2]) noise(t + dt, 0.08, 0.16, 1100 * vary(150), 0.9, 0.4, 0.01);
    tone({ type: "triangle", freq: 160, to: 90, at: t + 0.22, peak: 0.25, end: 0.12, wet: 0.5 });
  },
};

/** How long after a cue the same cue may sound again, in ms: the battle's
 * sounds come in crowds, so each is heard as a steady patter, not a roar. */
const GAP: Partial<Record<Cue, number>> = {
  arrow: 70, cannon: 140, blast: 150, fireball: 110, frost: 160, zap: 120, swish: 120, thunk: 130,
  crumble: 220, hammer: 380, hiss: 300, firework: 200,
};

/** Plays a cue now, at `loudness` (1 as made), unless sound is off, the
 * browser has none, or the same cue just played. */
export function play(cue: Cue, loudness = 1) {
  if (!enabled()) return;
  const now = performance.now();
  if (now - (lastAt.get(cue) ?? -Infinity) < (GAP[cue] ?? 60)) return;
  lastAt.set(cue, now);
  const ac = audio();
  if (!ac) return;
  level = loudness;
  try {
    CUES[cue](ac.currentTime + 0.01);
  } finally {
    level = 1;
  }
}
