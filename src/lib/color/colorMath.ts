export const REC709_LUMA = [0.2126, 0.7152, 0.0722] as const;
export const REC2020_LUMA = [0.2627, 0.678, 0.0593] as const;

export function clamp01(value: number): number {
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

const SRGB_LINEAR_BREAK = 0.003_130_8;
const SRGB_CODED_BREAK = 0.040_45;
const SRGB_LINEAR_SLOPE = 12.92;
const SRGB_ALPHA = 0.055;
const SRGB_GAMMA = 2.4;
const SRGB_INV_GAMMA = 1 / SRGB_GAMMA;

const BT709_LINEAR_BREAK = 0.018;
const BT709_CODED_BREAK = 0.081;
const BT709_LINEAR_SLOPE = 4.5;
const BT709_ALPHA = 1.099;
const BT709_BETA = 0.099;
const BT709_GAMMA = 0.45;

export function linearToSrgb(linear: number): number {
  if (linear <= SRGB_LINEAR_BREAK) {
    return SRGB_LINEAR_SLOPE * linear;
  }
  return (1 + SRGB_ALPHA) * linear ** SRGB_INV_GAMMA - SRGB_ALPHA;
}

export function srgbToLinear(coded: number): number {
  if (coded <= SRGB_CODED_BREAK) {
    return coded / SRGB_LINEAR_SLOPE;
  }
  return ((coded + SRGB_ALPHA) / (1 + SRGB_ALPHA)) ** SRGB_GAMMA;
}

export function linearToBt709(linear: number): number {
  if (linear < BT709_LINEAR_BREAK) {
    return BT709_LINEAR_SLOPE * linear;
  }
  return BT709_ALPHA * linear ** BT709_GAMMA - BT709_BETA;
}

export function bt709ToLinear(coded: number): number {
  if (coded < BT709_CODED_BREAK) {
    return coded / BT709_LINEAR_SLOPE;
  }
  return ((coded + BT709_BETA) / BT709_ALPHA) ** (1 / BT709_GAMMA);
}

export function srgbDisplayToBt709Coded(coded: number): number {
  return linearToBt709(srgbToLinear(coded));
}
