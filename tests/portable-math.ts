// Math.pow comes from the system's C library, so its last bit can differ
// between Linux and Windows (every other Math function tested matches
// exactly). Goldens whose hashes depend on pow import this first, so they
// hash the same on every machine: pow becomes exp(y·log x), built from
// V8's own exp and log, which do match everywhere.
const portablePow = (x: number, y: number): number => {
  if (y === 0) return 1;
  if (Number.isNaN(x) || Number.isNaN(y)) return NaN;
  if (x === 0) return y > 0 ? 0 : Infinity;
  if (x < 0) {
    if (!Number.isInteger(y)) return NaN;
    const r = Math.exp(y * Math.log(-x));
    return y % 2 ? -r : r;
  }
  return Math.exp(y * Math.log(x));
};

Math.pow = portablePow;
