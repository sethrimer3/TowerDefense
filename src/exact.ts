// Arithmetic that gives the same bits in every JavaScript engine.
//
// Only + - * / and Math.sqrt are correctly rounded by the spec. Math.pow
// (and **), exp, log, the trig functions and hypot may differ in the last bit
// between engines and platforms, and a last-bit difference can tip a
// comparison, a rounding or a weighted pick. Anything that is saved or
// decides play (terrain, enemy stats, prices) uses these instead; drawing
// may use Math freely.

/** `base` to the power `n` (a whole number ≥ 0), multiplied out in order. */
export function intPow(base: number, n: number) {
  let result = 1;
  for (let i = 0; i < n; i++) result *= base;
  return result;
}

/** `n` on a grid of millionths. Gold, HP and the hero's and enemies' stats
 * keep their fractions (a 2% bonus on 1 ATK strikes for 1.02), and each sum
 * or difference of them is snapped back onto the grid, so 0.1 + 0.2 is 0.3
 * and a fight's forecast and the fight played out agree to the last strike. */
export const snap = (n: number) => Math.round(n * 1e6) / 1e6;

/** `x` squared, as one exact multiplication (`x ** 2` goes through pow). */
export const sq = (x: number) => x * x;

/** The length of (dx, dy): `Math.hypot`'s answer from exact operations. */
export const dist = (dx: number, dy: number) => Math.sqrt(dx * dx + dy * dy);

/** Positive base to an integer ratio, using deterministic square roots for
 * fractional binary digits. Used by saved ratings and scenario budgets. */
export function ratioPow(base:number,numerator:number,denominator:number){
 if(!Number.isFinite(base)||base<=0||!Number.isSafeInteger(numerator)||!Number.isSafeInteger(denominator)||denominator<=0)return NaN;
 const negative=numerator<0,n=Math.abs(numerator),whole=Math.floor(n/denominator);
 let result=1;
 if(whole<=1024)result=intPow(base,whole);
 else {let factor=base,power=whole;while(power){if(power%2)result*=factor;power=Math.floor(power/2);if(power)factor*=factor;}}
 let remainder=n-whole*denominator,root=base;
 for(let bit=0;bit<52&&remainder;bit++){root=Math.sqrt(root);remainder*=2;if(remainder>=denominator){result*=root;remainder-=denominator;}}
 return negative?1/result:result;
}
/** Binary logarithm from normalization and repeated squaring, avoiding a
 * platform-dependent transcendental in saved castle difficulty. */
export function binaryLog(value:number){
 if(!Number.isFinite(value)||value<=0)return value===Infinity?Infinity:NaN;
 let whole=0;
 while(value<1){value*=2;whole--;}
 while(value>=2){value/=2;whole++;}
 let fraction=0,weight=.5;
 for(let bit=0;bit<52;bit++){value*=value;if(value>=2){value/=2;fraction+=weight;}weight/=2;}
 return whole+fraction;
}
