import { describe, expect, it } from 'vitest';

import type { IsoGainMapMetadata } from './iso21496';
import {
  buildIsoApp2Segment,
  floatToSignedFraction,
  floatToUnsignedFraction,
  ISO21496_IDENTIFIER,
  serializeGainMapMetadata,
  serializeVersionOnlyPayload,
  spliceSegmentsAfterSoi,
} from './iso21496';

interface ParsedMetadata {
  channelCount: number;
  channels: {
    minLog2: number;
    maxLog2: number;
    gamma: number;
    offsetSdr: number;
    offsetHdr: number;
  }[];
  hdrCapacityMaxLog2: number;
  hdrCapacityMinLog2: number;
  useBaseColorSpace: boolean;
  useCommonDenominator: boolean;
}

function parseMetadata(bytes: Uint8Array): ParsedMetadata {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let pos = 0;
  const u16 = () => {
    const v = view.getUint16(pos);
    pos += 2;
    return v;
  };
  const u32 = () => {
    const v = view.getUint32(pos);
    pos += 4;
    return v;
  };
  const s32 = () => {
    const v = view.getInt32(pos);
    pos += 4;
    return v;
  };
  expect(u16()).toBe(0);
  expect(u16()).toBe(0);
  const flags = view.getUint8(pos);
  pos += 1;
  const channelCount = flags & 0x80 ? 3 : 1;
  const useCommonDenominator = (flags & 8) !== 0;
  const result: ParsedMetadata = {
    channelCount,
    useBaseColorSpace: (flags & 0x40) !== 0,
    useCommonDenominator,
    hdrCapacityMinLog2: 0,
    hdrCapacityMaxLog2: 0,
    channels: [],
  };
  if (useCommonDenominator) {
    const denom = u32();
    result.hdrCapacityMinLog2 = u32() / denom;
    result.hdrCapacityMaxLog2 = u32() / denom;
    for (let c = 0; c < channelCount; c++) {
      result.channels.push({
        minLog2: s32() / denom,
        maxLog2: s32() / denom,
        gamma: u32() / denom,
        offsetSdr: s32() / denom,
        offsetHdr: s32() / denom,
      });
    }
  } else {
    let n = u32();
    result.hdrCapacityMinLog2 = n / u32();
    n = u32();
    result.hdrCapacityMaxLog2 = n / u32();
    for (let c = 0; c < channelCount; c++) {
      const minN = s32();
      const minLog2 = minN / u32();
      const maxN = s32();
      const maxLog2 = maxN / u32();
      const gammaN = u32();
      const gamma = gammaN / u32();
      const sdrN = s32();
      const offsetSdr = sdrN / u32();
      const hdrN = s32();
      const offsetHdr = hdrN / u32();
      result.channels.push({ minLog2, maxLog2, gamma, offsetSdr, offsetHdr });
    }
  }
  expect(pos).toBe(bytes.length);
  return result;
}

describe('floatToUnsignedFraction', () => {
  it('represents simple values exactly', () => {
    expect(floatToUnsignedFraction(0)).toEqual({ n: 0, d: 1 });
    expect(floatToUnsignedFraction(1)).toEqual({ n: 1, d: 1 });
    expect(floatToUnsignedFraction(1 / 64)).toEqual({ n: 1, d: 64 });
    expect(floatToUnsignedFraction(2.5)).toEqual({ n: 5, d: 2 });
  });

  it('approximates irrational values within tolerance', () => {
    const v = 5.622_376_441_955_566;
    const { n, d } = floatToUnsignedFraction(v);
    expect(n / d).toBeCloseTo(v, 9);
  });

  it('rejects negative and NaN input', () => {
    expect(() => floatToUnsignedFraction(-1)).toThrow('unsigned fraction');
    expect(() => floatToUnsignedFraction(Number.NaN)).toThrow(
      'unsigned fraction',
    );
  });
});

describe('floatToSignedFraction', () => {
  it('keeps the sign on the numerator', () => {
    expect(floatToSignedFraction(-1.5)).toEqual({ n: -3, d: 2 });
    expect(floatToSignedFraction(3)).toEqual({ n: 3, d: 1 });
  });
});

const identityChannels = {
  gainMapMinLog2: [0, 0, 0],
  gamma: [1, 1, 1],
} as const;

describe('serializeGainMapMetadata', () => {
  it('emits exact bytes for integral single-channel metadata', () => {
    const meta: IsoGainMapMetadata = {
      ...identityChannels,
      gainMapMaxLog2: [3, 3, 3],
      offsetSdr: [0, 0, 0],
      offsetHdr: [0, 0, 0],
      hdrCapacityMinLog2: 0,
      hdrCapacityMaxLog2: 3,
    };
    const bytes = serializeGainMapMetadata(meta);
    expect([...bytes]).toEqual([
      0, 0, 0, 0,
      0b1000,
      0, 0, 0, 1,
      0, 0, 0, 0,
      0, 0, 0, 3,
      0, 0, 0, 0,
      0, 0, 0, 3,
      0, 0, 0, 1,
      0, 0, 0, 0,
      0, 0, 0, 0,
    ]);
  });

  it('round-trips single-channel metadata with mixed denominators', () => {
    const gainMapMax = 2.482_193_712_393_71;
    const meta: IsoGainMapMetadata = {
      ...identityChannels,
      gainMapMaxLog2: [gainMapMax, gainMapMax, gainMapMax],
      offsetSdr: [1 / 64, 1 / 64, 1 / 64],
      offsetHdr: [1 / 64, 1 / 64, 1 / 64],
      hdrCapacityMinLog2: 0,
      hdrCapacityMaxLog2: gainMapMax,
    };
    const parsed = parseMetadata(serializeGainMapMetadata(meta));
    expect(parsed.channelCount).toBe(1);
    expect(parsed.useBaseColorSpace).toBe(false);
    expect(parsed.useCommonDenominator).toBe(false);
    expect(parsed.hdrCapacityMinLog2).toBe(0);
    expect(parsed.hdrCapacityMaxLog2).toBeCloseTo(gainMapMax, 9);
    const ch = parsed.channels[0]!;
    expect(ch.minLog2).toBe(0);
    expect(ch.maxLog2).toBeCloseTo(gainMapMax, 9);
    expect(ch.gamma).toBe(1);
    expect(ch.offsetSdr).toBe(1 / 64);
    expect(ch.offsetHdr).toBe(1 / 64);
  });

  it('round-trips multi-channel metadata', () => {
    const meta: IsoGainMapMetadata = {
      gainMapMinLog2: [-0.5, 0, 0.25],
      gainMapMaxLog2: [2, 2.5, 3],
      gamma: [1, 1.2, 1],
      offsetSdr: [1 / 64, 1 / 64, 1 / 64],
      offsetHdr: [1 / 64, 1 / 32, 1 / 64],
      hdrCapacityMinLog2: 0.5,
      hdrCapacityMaxLog2: 3,
      useBaseColorSpace: true,
    };
    const bytes = serializeGainMapMetadata(meta);
    expect(bytes[4]).toBe(0xC0);
    const parsed = parseMetadata(bytes);
    expect(parsed.channelCount).toBe(3);
    expect(parsed.useBaseColorSpace).toBe(true);
    expect(parsed.hdrCapacityMinLog2).toBeCloseTo(0.5, 9);
    expect(parsed.hdrCapacityMaxLog2).toBeCloseTo(3, 9);
    for (let c = 0; c < 3; c++) {
      const ch = parsed.channels[c]!;
      expect(ch.minLog2).toBeCloseTo(meta.gainMapMinLog2[c]!, 9);
      expect(ch.maxLog2).toBeCloseTo(meta.gainMapMaxLog2[c]!, 9);
      expect(ch.gamma).toBeCloseTo(meta.gamma[c]!, 9);
      expect(ch.offsetSdr).toBeCloseTo(meta.offsetSdr[c]!, 9);
      expect(ch.offsetHdr).toBeCloseTo(meta.offsetHdr[c]!, 9);
    }
  });
});

describe('buildIsoApp2Segment', () => {
  it('wraps the version-only payload into a 36-byte APP2 segment', () => {
    const segment = buildIsoApp2Segment(serializeVersionOnlyPayload());
    expect(segment.length).toBe(36);
    expect(segment[0]).toBe(0xFF);
    expect(segment[1]).toBe(0xE2);
    expect((segment[2]! << 8) | segment[3]!).toBe(34);
    const identifier = new TextDecoder().decode(segment.subarray(4, 31));
    expect(identifier).toBe(ISO21496_IDENTIFIER);
    expect(segment[31]).toBe(0);
    expect([...segment.subarray(32)]).toEqual([0, 0, 0, 0]);
  });
});

describe('spliceSegmentsAfterSoi', () => {
  it('inserts segments between SOI and the first existing segment', () => {
    const jpeg = new Uint8Array([
      0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x04, 0xAA, 0xBB, 0xFF, 0xD9,
    ]);
    const segA = new Uint8Array([0xFF, 0xE2, 0x00, 0x03, 0x01]);
    const segB = new Uint8Array([0xFF, 0xE2, 0x00, 0x02]);
    const out = spliceSegmentsAfterSoi(jpeg, [segA, segB]);
    expect([...out.subarray(0, 2)]).toEqual([0xFF, 0xD8]);
    expect([...out.subarray(2, 7)]).toEqual([...segA]);
    expect([...out.subarray(7, 11)]).toEqual([...segB]);
    expect([...out.subarray(11)]).toEqual([...jpeg.subarray(2)]);
  });

  it('rejects streams without an SOI', () => {
    expect(() =>
      spliceSegmentsAfterSoi(new Uint8Array([0, 1, 2]), []),
    ).toThrow('SOI');
  });
});
