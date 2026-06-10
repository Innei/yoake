import { describe, expect, it, vi } from 'vitest';

import {
  computeGainMap,
  encodeUltraHdrJpeg,
  peakNitsToCapacityLog2,
} from './ultraHdrJpeg';

vi.mock('./sdrJpeg', () => ({
  encodeSdrJpeg: vi.fn(
    async () =>
      new Uint8Array([
        0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x04, 0x4A, 0x46, 0xFF, 0xD9,
      ]),
  ),
}));

function srgbToLinear(v: number): number {
  const c = v / 255;
  return c <= 0.040_45 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

function makeGray(value: number, pixelCount: number) {
  const sdr = new Uint8ClampedArray(pixelCount * 4);
  const hdr = new Float32Array(pixelCount * 3);
  const lin = srgbToLinear(value);
  for (let p = 0; p < pixelCount; p++) {
    sdr[p * 4] = value;
    sdr[p * 4 + 1] = value;
    sdr[p * 4 + 2] = value;
    sdr[p * 4 + 3] = 255;
    hdr[p * 3] = lin;
    hdr[p * 3 + 1] = lin;
    hdr[p * 3 + 2] = lin;
  }
  return { sdr, hdr };
}

describe('peakNitsToCapacityLog2', () => {
  it('maps peakNits to log2 headroom over 100 nit SDR white', () => {
    expect(peakNitsToCapacityLog2(100)).toBe(0);
    expect(peakNitsToCapacityLog2(400)).toBe(2);
    expect(peakNitsToCapacityLog2(1000)).toBeCloseTo(3.3219, 3);
    expect(peakNitsToCapacityLog2(50)).toBe(0);
  });
});

describe('computeGainMap', () => {
  it('produces an all-zero map with epsilon gainMapMax for identity input', () => {
    const { sdr, hdr } = makeGray(128, 4);
    const result = computeGainMap(sdr, hdr, 2, 2, 1000);
    expect(result.gainMapMax).toBe(0.01);
    for (let p = 0; p < 4; p++) {
      expect(result.rgba[p * 4]).toBe(0);
      expect(result.rgba[p * 4 + 1]).toBe(0);
      expect(result.rgba[p * 4 + 2]).toBe(0);
      expect(result.rgba[p * 4 + 3]).toBe(255);
    }
  });

  it('normalizes a 4x boosted pixel to full scale with gainMapMax near 2', () => {
    const { sdr, hdr } = makeGray(200, 4);
    const lin = srgbToLinear(200);
    hdr[0] = lin * 4;
    hdr[1] = lin * 4;
    hdr[2] = lin * 4;
    const result = computeGainMap(sdr, hdr, 2, 2, 400);
    const expected = Math.log2((lin * 4 + 1 / 64) / (lin + 1 / 64));
    expect(result.gainMapMax).toBeCloseTo(expected, 5);
    expect(result.gainMapMax).toBeCloseTo(2, 1);
    expect(result.rgba[0]).toBe(255);
    expect(result.rgba[4]).toBe(0);
    expect(result.rgba[8]).toBe(0);
    expect(result.rgba[12]).toBe(0);
  });

  it('clamps gainMapMax to the peakNits capacity', () => {
    const { sdr, hdr } = makeGray(200, 4);
    for (let i = 0; i < 3; i++) hdr[i] = hdr[i]! * 8;
    const result = computeGainMap(sdr, hdr, 2, 2, 400);
    expect(result.gainMapMax).toBe(2);
  });
});

describe('encodeUltraHdrJpeg', () => {
  it('rejects mismatched hdrLinearF32 length', async () => {
    const { sdr } = makeGray(128, 4);
    await expect(
      encodeUltraHdrJpeg({
        sdrBaseBytes: sdr,
        hdrLinearF32: new Float32Array(5),
        width: 2,
        height: 2,
        meta: { peakNits: 1000 },
      }),
    ).rejects.toThrow('hdrLinearF32 length 5 != 12');
  });

  it('rejects mismatched sdrBaseBytes length', async () => {
    const { hdr } = makeGray(128, 4);
    await expect(
      encodeUltraHdrJpeg({
        sdrBaseBytes: new Uint8ClampedArray(3),
        hdrLinearF32: hdr,
        width: 2,
        height: 2,
        meta: { peakNits: 1000 },
      }),
    ).rejects.toThrow('sdrBaseBytes length 3 != 16');
  });

  it('assembles an MPF container with ISO 21496-1 metadata', async () => {
    const { sdr, hdr } = makeGray(200, 4);
    const lin = srgbToLinear(200);
    hdr[0] = lin * 4;
    hdr[1] = lin * 4;
    hdr[2] = lin * 4;

    const bytes = await encodeUltraHdrJpeg({
      sdrBaseBytes: sdr,
      hdrLinearF32: hdr,
      width: 2,
      height: 2,
      meta: { peakNits: 400 },
    });

    const identifier = 'urn:iso:std:iso:ts:21496:-1';
    expect([...bytes.subarray(0, 2)]).toEqual([0xFF, 0xD8]);
    expect(bytes[2]).toBe(0xFF);
    expect(bytes[3]).toBe(0xE2);
    expect((bytes[4]! << 8) | bytes[5]!).toBe(34);
    expect(new TextDecoder().decode(bytes.subarray(6, 33))).toBe(identifier);
    expect([...bytes.subarray(34, 38)]).toEqual([0, 0, 0, 0]);

    expect(bytes[38]).toBe(0xFF);
    expect(bytes[39]).toBe(0xE2);
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    expect(new TextDecoder().decode(bytes.subarray(42, 46))).toBe('MPF\0');
    expect(view.getUint32(96)).toBe(0x03_00_00);
    const primarySize = view.getUint32(100);
    const secondarySize = view.getUint32(116);
    const secondaryOffset = view.getUint32(120);
    expect(38 + 8 + secondaryOffset).toBe(primarySize);
    expect(primarySize + secondarySize).toBe(bytes.length);
    expect([...bytes.subarray(primarySize, primarySize + 2)]).toEqual([
      0xFF, 0xD8,
    ]);

    expect(bytes[primarySize + 2]).toBe(0xFF);
    expect(bytes[primarySize + 3]).toBe(0xE2);
    expect(
      new TextDecoder().decode(
        bytes.subarray(primarySize + 6, primarySize + 33),
      ),
    ).toBe(identifier);

    const metaStart = primarySize + 6 + identifier.length + 1;
    expect(view.getUint16(metaStart)).toBe(0);
    expect(view.getUint16(metaStart + 2)).toBe(0);
    const flags = view.getUint8(metaStart + 4);
    expect(flags & 0x80).toBe(0);
    expect(flags & 8).toBe(0);
    const altHeadroomN = view.getUint32(metaStart + 13);
    const altHeadroomD = view.getUint32(metaStart + 17);
    const expectedMax = Math.log2(
      (srgbToLinear(200) * 4 + 1 / 64) / (srgbToLinear(200) + 1 / 64),
    );
    expect(altHeadroomN / altHeadroomD).toBeCloseTo(expectedMax, 6);
  });
});
