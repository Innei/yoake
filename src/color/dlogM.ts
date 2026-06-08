// DJI D-Log forward/inverse OETF. Source: "White Paper on D-Log and D-Gamut of
// DJI Cinema Color System", Revision 1.0, 2017-09-29 (Zenmuse X7 publication).
// The community treats D-Log M as numerically identical to D-Log for restoration
// purposes; DJI has not published a separate M-variant function. Replace these
// constants if a future DJI document supersedes them.

const LINEAR_BREAK = 0.0078;
const LINEAR_SLOPE = 6.025;
const LINEAR_OFFSET = 0.0929;

const LOG_SCALE_IN = 0.9892;
const LOG_BIAS_IN = 0.0108;
const LOG_SCALE_OUT = 0.256_663;
const LOG_OFFSET_OUT = 0.584_555;

const CODED_BREAK = 0.14;
const INV_LOG_SLOPE = 3.896_16;
const INV_LOG_OFFSET = 2.277_52;

export function linearToDlogM(linear: number): number {
  if (linear <= LINEAR_BREAK) {
    return LINEAR_SLOPE * linear + LINEAR_OFFSET;
  }
  return Math.log10(linear * LOG_SCALE_IN + LOG_BIAS_IN) * LOG_SCALE_OUT + LOG_OFFSET_OUT;
}

export function dlogMtoLinear(coded: number): number {
  if (coded <= CODED_BREAK) {
    return (coded - LINEAR_OFFSET) / LINEAR_SLOPE;
  }
  return (10 ** (INV_LOG_SLOPE * coded - INV_LOG_OFFSET) - LOG_BIAS_IN) / LOG_SCALE_IN;
}

export type Rgb = readonly [number, number, number];

export function linearToDlogM3(rgb: Rgb): [number, number, number] {
  return [linearToDlogM(rgb[0]), linearToDlogM(rgb[1]), linearToDlogM(rgb[2])];
}

export function dlogMtoLinear3(rgb: Rgb): [number, number, number] {
  return [dlogMtoLinear(rgb[0]), dlogMtoLinear(rgb[1]), dlogMtoLinear(rgb[2])];
}
