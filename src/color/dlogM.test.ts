import { describe, expect, it } from 'vitest';

import { dlogMtoLinear, dlogMtoLinear3, linearToDlogM, linearToDlogM3 } from './dlogM';

describe('dlogM OETF', () => {
  it('round-trips coded → linear → coded within 1e-4 across a uniform ramp', () => {
    const steps = 1025;
    let maxErr = 0;
    for (let i = 0; i < steps; i++) {
      const coded = i / (steps - 1);
      const linear = dlogMtoLinear(coded);
      const back = linearToDlogM(linear);
      const err = Math.abs(back - coded);
      if (err > maxErr) maxErr = err;
    }
    expect(maxErr).toBeLessThan(1e-4);
  });

  it('round-trips linear → coded → linear within 1e-4 across a positive ramp', () => {
    let maxErr = 0;
    const samples = 1024;
    for (let i = 1; i <= samples; i++) {
      const linear = (i / samples) * 8;
      const coded = linearToDlogM(linear);
      const back = dlogMtoLinear(coded);
      const err = Math.abs(back - linear) / Math.max(linear, 1e-6);
      if (err > maxErr) maxErr = err;
    }
    expect(maxErr).toBeLessThan(1e-4);
  });

  it('matches the published reflection table (18% → ~0.398, 90% → ~0.572)', () => {
    expect(linearToDlogM(0.18)).toBeCloseTo(408 / 1023, 2);
    expect(linearToDlogM(0.9)).toBeCloseTo(586 / 1023, 2);
  });

  it('vector helpers apply per-channel', () => {
    const linear: [number, number, number] = [0.1, 0.5, 1];
    const coded = linearToDlogM3(linear);
    const back = dlogMtoLinear3(coded);
    for (let i = 0; i < 3; i++) {
      expect(back[i]).toBeCloseTo(linear[i]!, 4);
    }
  });
});
