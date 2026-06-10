import { describe, expect, it } from 'vitest';

import { buildLut3DUploadData } from './lutTexture';

describe('buildLut3DUploadData', () => {
  it('produces a rgba16-shaped buffer matching the LUT size', () => {
    const size = 4;
    const triplets = size * size * size;
    const data = new Float32Array(triplets * 3);
    for (let i = 0; i < triplets; i++) {
      data[i * 3 + 0] = i / triplets;
      data[i * 3 + 1] = 1 - i / triplets;
      data[i * 3 + 2] = 0.5;
    }
    const upload = buildLut3DUploadData({ size, data });
    expect(upload.width).toBe(size);
    expect(upload.height).toBe(size);
    expect(upload.depth).toBe(size);
    expect(upload.pixels.length).toBe(triplets * 4);
    for (let i = 0; i < triplets; i++) {
      expect(upload.pixels[i * 4 + 0]).toBeCloseTo(i / triplets, 6);
      expect(upload.pixels[i * 4 + 1]).toBeCloseTo(1 - i / triplets, 6);
      expect(upload.pixels[i * 4 + 2]).toBeCloseTo(0.5, 6);
      expect(upload.pixels[i * 4 + 3]).toBe(1);
    }
  });

  it('throws when input length mismatches declared size', () => {
    expect(() =>
      buildLut3DUploadData({ size: 3, data: new Float32Array(8) }),
    ).toThrow();
  });
});
