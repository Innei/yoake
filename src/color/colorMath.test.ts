import { describe, expect, it } from 'vitest';

import {
  bt709ToLinear,
  clamp01,
  linearToBt709,
  linearToSrgb,
  REC709_LUMA,
  REC2020_LUMA,
  srgbDisplayToBt709Coded,
  srgbToLinear,
} from './colorMath';

describe('sRGB OETF', () => {
  it('round-trips linear → coded → linear within 1e-5', () => {
    let maxErr = 0;
    const steps = 1025;
    for (let i = 0; i < steps; i++) {
      const linear = i / (steps - 1);
      const coded = linearToSrgb(linear);
      const back = srgbToLinear(coded);
      const err = Math.abs(back - linear);
      if (err > maxErr) maxErr = err;
    }
    expect(maxErr).toBeLessThan(1e-5);
  });

  it('maps exact reference points', () => {
    expect(linearToSrgb(0)).toBeCloseTo(0, 6);
    expect(linearToSrgb(1)).toBeCloseTo(1, 6);
    expect(srgbToLinear(0)).toBeCloseTo(0, 6);
    expect(srgbToLinear(1)).toBeCloseTo(1, 6);
  });
});

describe('luma weights', () => {
  it('Rec.709 weights sum to 1', () => {
    const sum = REC709_LUMA[0] + REC709_LUMA[1] + REC709_LUMA[2];
    expect(sum).toBeCloseTo(1, 6);
  });

  it('Rec.2020 weights sum to 1', () => {
    const sum = REC2020_LUMA[0] + REC2020_LUMA[1] + REC2020_LUMA[2];
    expect(sum).toBeCloseTo(1, 6);
  });
});

describe('Rec.709 OETF', () => {
  it('round-trips linear → coded → linear within 1e-5', () => {
    let maxErr = 0;
    const steps = 1025;
    for (let i = 0; i < steps; i++) {
      const linear = i / (steps - 1);
      const coded = linearToBt709(linear);
      const back = bt709ToLinear(coded);
      const err = Math.abs(back - linear);
      if (err > maxErr) maxErr = err;
    }
    expect(maxErr).toBeLessThan(1e-5);
  });

  it('recovers bt709-coded values from Chrome-style sRGB display samples', () => {
    const samples = [0, 0.02, 0.05, 0.1, 0.18, 0.3, 0.5, 0.75, 0.9, 1];
    for (const bt709Coded of samples) {
      const externalTextureSample = linearToSrgb(bt709ToLinear(bt709Coded));
      expect(srgbDisplayToBt709Coded(externalTextureSample)).toBeCloseTo(bt709Coded, 5);
    }
  });
});

describe('clamp01', () => {
  it('clamps below 0 to 0', () => {
    expect(clamp01(-0.5)).toBe(0);
  });
  it('clamps above 1 to 1', () => {
    expect(clamp01(1.5)).toBe(1);
  });
  it('passes interior values through', () => {
    expect(clamp01(0.42)).toBe(0.42);
  });
});
