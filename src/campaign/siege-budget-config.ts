/** Initial native-DPS curve; phase 6 records actual matched-raid calibration. */
export const CURVE_ANCHORS = [
  [100, 10.2],
  [600, 25],
  [1000, 70],
  [1600, 3000],
  [2000, 500000],
  [2720, "ceiling"],
] as const;
