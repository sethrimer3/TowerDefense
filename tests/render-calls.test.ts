import "./portable-math.ts";
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash, type Hash } from "node:crypto";
import { existsSync, openSync, readFileSync, readSync, closeSync, writeFileSync } from "node:fs";

// The render golden's scenes (tests/render-scenes.ts) drawn in Node on a fake
// DOM whose canvases record every call and property write, hashed at each
// captured frame against tests/fixtures/render-calls.golden.json. Unlike the
// browser's pixel hashes this needs no browser or dev server and is the same
// on every machine, so it runs in `npm test`: it checks that the renderer
// issues exactly the same drawing, which is what a refactor must keep.
// Images load at once with their real sizes (read from public/assets), and
// pixels read back from a canvas are made up from what was drawn on it.
// Regenerate (only for an intended change to what the board draws) with
// UPDATE_GOLDEN=1.
const GOLDEN = new URL("./fixtures/render-calls.golden.json", import.meta.url);

let hash: Hash = createHash("sha256");
let canvasIds = 0;

type Img = { data: Uint8ClampedArray; width: number; height: number };
type Matrix = { a: number; b: number; c: number; d: number; e: number; f: number };
const IDENTITY: Matrix = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
const multiply = (m: Matrix, n: Matrix): Matrix => ({
  a: m.a * n.a + m.c * n.b, b: m.b * n.a + m.d * n.b,
  c: m.a * n.c + m.c * n.d, d: m.b * n.c + m.d * n.d,
  e: m.a * n.e + m.c * n.f + m.e, f: m.b * n.e + m.d * n.f + m.f,
});
const matrixText = (m: Matrix) => `[${m.a},${m.b},${m.c},${m.d},${m.e},${m.f}]`;

/** A canvas whose context logs every call to `hash`, and whose pixels are
 * made up from what has been drawn on it since it was last sized or written. */
class FakeCanvas {
  readonly id = canvasIds++;
  style: Record<string, string> = {};
  private w = 300;
  private h = 150;
  private log = "";
  private pixels: Uint8ClampedArray | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  get width() { return this.w; }
  set width(v: number) { this.w = v; this.reset(); }
  get height() { return this.h; }
  set height(v: number) { this.h = v; this.reset(); }
  toString() { return `cv${this.id}`; }
  getBoundingClientRect() {
    const width = parseFloat(this.style.width) || this.w, height = parseFloat(this.style.height) || this.h;
    return { left: 0, top: 0, x: 0, y: 0, width, height, right: width, bottom: height };
  }
  private reset() {
    this.log = `${this.w}x${this.h}`;
    this.pixels = null;
    this.note(`size ${this.w}x${this.h}`);
  }
  note(line: string) {
    hash.update(`${this.id}:${line}\n`);
    this.log = createHash("sha256").update(this.log + line).digest("hex");
    this.pixels = null;
  }
  read(): Uint8ClampedArray {
    if (this.pixels) return this.pixels;
    const px = new Uint8ClampedArray(this.w * this.h * 4);
    let s = parseInt(this.log.slice(0, 8), 16) || 1;
    for (let i = 0; i < px.length; i++) {
      s ^= s << 13; s ^= s >>> 17; s ^= s << 5;
      px[i] = s & 255;
    }
    return (this.pixels = px);
  }
  write(img: Img, x: number, y: number) {
    this.note(`put ${x},${y} ${createHash("sha256").update(img.data).digest("hex").slice(0, 12)}`);
    const px = new Uint8ClampedArray(this.w * this.h * 4);
    for (let r = 0; r < img.height; r++)
      for (let c = 0; c < img.width; c++)
        if (x + c < this.w && y + r < this.h) px.set(img.data.subarray((r * img.width + c) * 4, (r * img.width + c) * 4 + 4), ((y + r) * this.w + x + c) * 4);
    this.pixels = px;
  }
  getContext() {
    return (this.ctx ??= context(this));
  }
}

function context(cv: FakeCanvas): CanvasRenderingContext2D {
  const state: Record<string, unknown> = { canvas: cv };
  let transform = IDENTITY, stack: Matrix[] = [], gradients = 0;
  const apply = (m: Matrix) => (transform = multiply(transform, m));
  const gradient = (kind: string, a: number[]) => {
    const name = `g${cv.id}.${gradients++}`;
    cv.note(`${name}=${kind}(${a.join(",")})`);
    return { addColorStop: (o: number, c: string) => cv.note(`${name}.stop(${o},${c})`), toString: () => name };
  };
  // Calls that return something or move the transform; every other call is
  // only logged.
  const special: Record<string, (...a: never[]) => unknown> = {
    save: () => { stack.push(transform); cv.note("save()"); },
    restore: () => { transform = stack.pop() ?? transform; cv.note("restore()"); },
    translate: (x: number, y: number) => { apply({ ...IDENTITY, e: x, f: y }); cv.note(`translate(${x},${y})`); },
    scale: (x: number, y: number) => { apply({ ...IDENTITY, a: x, d: y }); cv.note(`scale(${x},${y})`); },
    rotate: (r: number) => { apply({ a: Math.cos(r), b: Math.sin(r), c: -Math.sin(r), d: Math.cos(r), e: 0, f: 0 }); cv.note(`rotate(${r})`); },
    transform: (a: number, b: number, c: number, d: number, e: number, f: number) => { apply({ a, b, c, d, e, f }); cv.note(`transform(${[a, b, c, d, e, f]})`); },
    setTransform: (...a: (number | Matrix)[]) => {
      transform = typeof a[0] === "object" ? { ...(a[0] as Matrix) } : a.length ? { a: +a[0], b: +a[1], c: +a[2], d: +a[3], e: +a[4], f: +a[5] } : IDENTITY;
      cv.note(`setTransform${matrixText(transform)}`);
    },
    resetTransform: () => { transform = IDENTITY; cv.note("resetTransform()"); },
    getTransform: () => ({ ...transform, toString: () => matrixText(transform) }),
    createRadialGradient: (...a: number[]) => gradient("radial", a),
    createLinearGradient: (...a: number[]) => gradient("linear", a),
    measureText: (text: string) => ({ width: text.length * 7 }),
    createImageData: (w: number, h: number): Img => ({ data: new Uint8ClampedArray(w * h * 4), width: w, height: h }),
    getImageData: (x: number, y: number, w: number, h: number): Img => {
      const src = cv.read(), data = new Uint8ClampedArray(w * h * 4);
      for (let r = 0; r < h; r++)
        for (let c = 0; c < w; c++)
          for (let k = 0; k < 4; k++) data[(r * w + c) * 4 + k] = src[((y + r) * cv.width + x + c) * 4 + k] ?? 0;
      return { data, width: w, height: h };
    },
    putImageData: (img: Img, x: number, y: number) => cv.write(img, x, y),
  };
  return new Proxy(state, {
    get: (_, key: string) => {
      if (key in state) return state[key];
      if (key in special) return special[key];
      return (...args: unknown[]) => void cv.note(`${key}(${args.join(",")})`);
    },
    set: (_, key: string, value) => {
      state[key] = value;
      cv.note(`${key}=${value}`);
      return true;
    },
  }) as unknown as CanvasRenderingContext2D;
}

/** A PNG's size from its header, or 0×0 when there is no such file. */
const sizes = new Map<string, [number, number]>();
function pngSize(url: string): [number, number] {
  let size = sizes.get(url);
  if (!size) {
    size = [0, 0];
    const file = new URL(`../public${url.replace(/^\.?\//, "/")}`, import.meta.url);
    if (existsSync(file)) {
      const header = Buffer.alloc(24), fd = openSync(file, "r");
      readSync(fd, header, 0, 24, 0);
      closeSync(fd);
      size = [header.readUInt32BE(16), header.readUInt32BE(20)];
    }
    sizes.set(url, size);
  }
  return size;
}

/** An image that has loaded (or failed, for a missing file) by the time
 * anything looks at it. */
class FakeImage {
  complete = true;
  naturalWidth = 0;
  naturalHeight = 0;
  onload: (() => void) | null = null;
  private url = "";
  get src() { return this.url; }
  set src(url: string) {
    this.url = url;
    [this.naturalWidth, this.naturalHeight] = pngSize(url);
  }
  get width() { return this.naturalWidth; }
  get height() { return this.naturalHeight; }
  decode() { return Promise.resolve(); }
  toString() { return `img:${this.url.split("/").pop()}`; }
}

const g = globalThis as Record<string, unknown>;
const listen = { addEventListener() {}, removeEventListener() {} };
g.document = { ...listen, createElement: () => new FakeCanvas(), hidden: false };
g.window = { ...listen, devicePixelRatio: 1 };
g.devicePixelRatio = 1;
g.Image = FakeImage;

const { JOBS } = await import("./render-scenes.ts");

function record() {
  const out: Record<string, string> = {};
  for (const job of JOBS) {
    canvasIds = 0;
    hash = createHash("sha256");
    const cv = new FakeCanvas();
    if (job.canvas === "board") Object.assign(cv.style, { width: "408px", height: "408px" });
    job.play(cv as unknown as HTMLCanvasElement, (frame) => {
      out[`${job.name}.${frame}`] = hash.copy().digest("hex").slice(0, 16);
    });
  }
  return out;
}

test("every render scene issues the same drawing calls as the recorded golden", () => {
  const actual = record();
  if (process.env.UPDATE_GOLDEN || !existsSync(GOLDEN)) {
    writeFileSync(GOLDEN, JSON.stringify(actual, null, 1) + "\n");
    return;
  }
  const golden = JSON.parse(readFileSync(GOLDEN, "utf8"));
  const changed = Object.keys({ ...golden, ...actual }).filter((k) => golden[k] !== actual[k]);
  assert.deepEqual(changed, [], `render frames draw differently: ${changed.join(", ")}`);
});
