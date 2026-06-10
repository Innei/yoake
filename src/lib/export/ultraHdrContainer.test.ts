import { describe, expect, it } from 'vitest';

import type { IsoGainMapMetadata } from './iso21496';
import { ISO21496_IDENTIFIER } from './iso21496';
import { assembleUltraHdrContainer, buildMpfSegment } from './ultraHdrContainer';

interface Segment {
  length: number;
  marker: number;
  payload: Uint8Array;
  pos: number;
}

function parseSegments(bytes: Uint8Array, start: number): Segment[] {
  expect(bytes[start]).toBe(0xFF);
  expect(bytes[start + 1]).toBe(0xD8);
  const segments: Segment[] = [];
  let pos = start + 2;
  while (pos < bytes.length) {
    if (bytes[pos] !== 0xFF) break;
    const marker = bytes[pos + 1]!;
    if (marker === 0xD9) break;
    const length = (bytes[pos + 2]! << 8) | bytes[pos + 3]!;
    segments.push({
      marker,
      pos,
      length,
      payload: bytes.subarray(pos + 4, pos + 2 + length),
    });
    pos += 2 + length;
  }
  return segments;
}

interface MpfInfo {
  primarySize: number;
  secondaryOffset: number;
  secondarySize: number;
}

function parseMpf(segment: Segment): MpfInfo {
  const p = segment.payload;
  const view = new DataView(p.buffer, p.byteOffset, p.byteLength);
  expect(new TextDecoder().decode(p.subarray(0, 4))).toBe('MPF\0');
  expect(new TextDecoder().decode(p.subarray(4, 6))).toBe('MM');
  expect(view.getUint16(6)).toBe(0x00_2A);
  expect(view.getUint32(8)).toBe(8);
  const tagCount = view.getUint16(12);
  expect(tagCount).toBe(3);
  expect(view.getUint16(14)).toBe(0xB0_00);
  expect(new TextDecoder().decode(p.subarray(22, 26))).toBe('0100');
  expect(view.getUint16(26)).toBe(0xB0_01);
  expect(view.getUint32(34)).toBe(2);
  expect(view.getUint16(38)).toBe(0xB0_02);
  expect(view.getUint32(42)).toBe(32);
  const entryOffset = view.getUint32(46);
  expect(entryOffset).toBe(50);
  expect(view.getUint32(50)).toBe(0);
  const entriesStart = 4 + entryOffset;
  expect(view.getUint32(entriesStart)).toBe(0x03_00_00);
  const primarySize = view.getUint32(entriesStart + 4);
  expect(view.getUint32(entriesStart + 8)).toBe(0);
  expect(view.getUint32(entriesStart + 16)).toBe(0);
  const secondarySize = view.getUint32(entriesStart + 20);
  const secondaryOffset = view.getUint32(entriesStart + 24);
  return { primarySize, secondarySize, secondaryOffset };
}

function fakeJpeg(fill: number, bodyLength: number): Uint8Array {
  const out = new Uint8Array(2 + 6 + bodyLength + 2);
  out.set([0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x04, 0x4A, 0x46]);
  out.fill(fill, 8, 8 + bodyLength);
  out.set([0xFF, 0xD9], out.length - 2);
  return out;
}

const metadata: IsoGainMapMetadata = {
  gainMapMinLog2: [0, 0, 0],
  gainMapMaxLog2: [3, 3, 3],
  gamma: [1, 1, 1],
  offsetSdr: [1 / 64, 1 / 64, 1 / 64],
  offsetHdr: [1 / 64, 1 / 64, 1 / 64],
  hdrCapacityMinLog2: 0,
  hdrCapacityMaxLog2: 3,
};

describe('buildMpfSegment', () => {
  it('builds a 90-byte big-endian APP2 segment with two MP entries', () => {
    const segment = buildMpfSegment(1000, 500, 900);
    expect(segment.length).toBe(90);
    expect(segment[0]).toBe(0xFF);
    expect(segment[1]).toBe(0xE2);
    expect((segment[2]! << 8) | segment[3]!).toBe(88);
    const info = parseMpf({
      marker: 0xE2,
      pos: 0,
      length: 88,
      payload: segment.subarray(4),
    });
    expect(info).toEqual({
      primarySize: 1000,
      secondarySize: 500,
      secondaryOffset: 900,
    });
  });
});

describe('assembleUltraHdrContainer', () => {
  it('places ISO and MPF segments and emits self-consistent offsets', () => {
    const primaryJpeg = fakeJpeg(0x11, 300);
    const gainMapJpeg = fakeJpeg(0x22, 120);
    const out = assembleUltraHdrContainer(primaryJpeg, gainMapJpeg, metadata);

    const primarySegments = parseSegments(out, 0);
    const iso = primarySegments[0]!;
    expect(iso.marker).toBe(0xE2);
    expect(iso.pos).toBe(2);
    expect(iso.length).toBe(34);
    expect(new TextDecoder().decode(iso.payload.subarray(0, 27))).toBe(
      ISO21496_IDENTIFIER,
    );
    expect([...iso.payload.subarray(28)]).toEqual([0, 0, 0, 0]);

    const mpf = primarySegments[1]!;
    expect(mpf.marker).toBe(0xE2);
    expect(mpf.pos).toBe(38);
    const info = parseMpf(mpf);

    const secondarySoi = info.primarySize;
    expect(out[secondarySoi]).toBe(0xFF);
    expect(out[secondarySoi + 1]).toBe(0xD8);
    expect(mpf.pos + 8 + info.secondaryOffset).toBe(secondarySoi);
    expect(info.secondarySize).toBe(out.length - secondarySoi);
    expect(info.primarySize).toBe(
      primaryJpeg.length + 36 + 90,
    );

    const secondarySegments = parseSegments(out, secondarySoi);
    const secondaryIso = secondarySegments[0]!;
    expect(secondaryIso.marker).toBe(0xE2);
    expect(secondaryIso.pos).toBe(secondarySoi + 2);
    expect(
      new TextDecoder().decode(secondaryIso.payload.subarray(0, 27)),
    ).toBe(ISO21496_IDENTIFIER);
    expect(secondaryIso.payload.length).toBeGreaterThan(32);

    expect([...out.subarray(secondarySoi - 2, secondarySoi)]).toEqual([
      0xFF, 0xD9,
    ]);
    expect([...out.subarray(out.length - 2)]).toEqual([0xFF, 0xD9]);
  });

  it('keeps the original primary and gain map entropy data intact', () => {
    const primaryJpeg = fakeJpeg(0x11, 16);
    const gainMapJpeg = fakeJpeg(0x22, 16);
    const out = assembleUltraHdrContainer(primaryJpeg, gainMapJpeg, metadata);
    const primaryRest = out.subarray(2 + 36 + 90, primaryJpeg.length + 36 + 90);
    expect([...primaryRest]).toEqual([...primaryJpeg.subarray(2)]);
    const secondarySoi = primaryJpeg.length + 36 + 90;
    const isoLength = (out[secondarySoi + 4]! << 8) | out[secondarySoi + 5]!;
    const gainMapRest = out.subarray(secondarySoi + 2 + 2 + isoLength);
    expect([...gainMapRest]).toEqual([...gainMapJpeg.subarray(2)]);
  });
});
