export const ISO21496_IDENTIFIER = 'urn:iso:std:iso:ts:21496:-1';

export interface IsoGainMapMetadata {
  gainMapMaxLog2: readonly [number, number, number];
  gainMapMinLog2: readonly [number, number, number];
  gamma: readonly [number, number, number];
  hdrCapacityMaxLog2: number;
  hdrCapacityMinLog2: number;
  offsetHdr: readonly [number, number, number];
  offsetSdr: readonly [number, number, number];
  useBaseColorSpace?: boolean;
}

interface Fraction {
  d: number;
  n: number;
}

const UINT32_MAX = 0xFF_FF_FF_FF;
const INT32_MAX = 0x7F_FF_FF_FF;
const MAX_ITERATIONS = 39;

function floatToUnsignedFractionImpl(v: number, maxNumerator: number): Fraction {
  if (Number.isNaN(v) || v < 0 || v > maxNumerator) {
    throw new Error(`iso21496: cannot represent ${v} as an unsigned fraction`);
  }
  const maxD = v <= 1 ? UINT32_MAX : Math.floor(maxNumerator / v);
  let denominator = 1;
  let previousD = 0;
  let currentV = v - Math.floor(v);
  for (let iter = 0; iter < MAX_ITERATIONS; iter++) {
    const numeratorDouble = denominator * v;
    if (numeratorDouble > maxNumerator) {
      throw new Error(`iso21496: numerator overflow for ${v}`);
    }
    const numerator = Math.round(numeratorDouble);
    if (numeratorDouble === numerator) return { n: numerator, d: denominator };
    currentV = 1 / currentV;
    const newD = previousD + Math.floor(currentV) * denominator;
    if (newD > maxD) return { n: numerator, d: denominator };
    previousD = denominator;
    if (newD > UINT32_MAX) {
      throw new Error(`iso21496: denominator overflow for ${v}`);
    }
    denominator = newD;
    currentV -= Math.floor(currentV);
  }
  return { n: Math.round(denominator * v), d: denominator };
}

export function floatToUnsignedFraction(v: number): Fraction {
  return floatToUnsignedFractionImpl(v, UINT32_MAX);
}

export function floatToSignedFraction(v: number): Fraction {
  const { n, d } = floatToUnsignedFractionImpl(Math.abs(v), INT32_MAX);
  return { n: v < 0 ? -n : n, d };
}

function allChannelsIdentical(meta: IsoGainMapMetadata): boolean {
  const fields = [
    meta.gainMapMinLog2,
    meta.gainMapMaxLog2,
    meta.gamma,
    meta.offsetSdr,
    meta.offsetHdr,
  ];
  return fields.every((f) => f[0] === f[1] && f[0] === f[2]);
}

export function serializeGainMapMetadata(meta: IsoGainMapMetadata): Uint8Array {
  const channelCount = allChannelsIdentical(meta) ? 1 : 3;
  const baseHeadroom = floatToUnsignedFraction(meta.hdrCapacityMinLog2);
  const altHeadroom = floatToUnsignedFraction(meta.hdrCapacityMaxLog2);
  const channels: Fraction[][] = [];
  for (let c = 0; c < channelCount; c++) {
    channels.push([
      floatToSignedFraction(meta.gainMapMinLog2[c]!),
      floatToSignedFraction(meta.gainMapMaxLog2[c]!),
      floatToUnsignedFraction(meta.gamma[c]!),
      floatToSignedFraction(meta.offsetSdr[c]!),
      floatToSignedFraction(meta.offsetHdr[c]!),
    ]);
  }

  const denom = baseHeadroom.d;
  const useCommonDenominator =
    altHeadroom.d === denom &&
    channels.every((fracs) => fracs.every((f) => f.d === denom));

  let flags = 0;
  if (channelCount === 3) flags |= 0x80;
  if (meta.useBaseColorSpace) flags |= 0x40;
  if (useCommonDenominator) flags |= 8;

  const size =
    5 + (useCommonDenominator ? 12 + channelCount * 20 : 16 + channelCount * 40);
  const out = new Uint8Array(size);
  const view = new DataView(out.buffer);
  let pos = 0;
  const writeU16 = (v: number) => {
    view.setUint16(pos, v);
    pos += 2;
  };
  const writeU32 = (v: number) => {
    view.setUint32(pos, v);
    pos += 4;
  };
  const writeS32 = (v: number) => {
    view.setInt32(pos, v);
    pos += 4;
  };

  writeU16(0);
  writeU16(0);
  view.setUint8(pos, flags);
  pos += 1;

  if (useCommonDenominator) {
    writeU32(denom);
    writeU32(baseHeadroom.n);
    writeU32(altHeadroom.n);
    for (const [min, max, gamma, baseOffset, altOffset] of channels) {
      writeS32(min!.n);
      writeS32(max!.n);
      writeU32(gamma!.n);
      writeS32(baseOffset!.n);
      writeS32(altOffset!.n);
    }
  } else {
    writeU32(baseHeadroom.n);
    writeU32(baseHeadroom.d);
    writeU32(altHeadroom.n);
    writeU32(altHeadroom.d);
    for (const [min, max, gamma, baseOffset, altOffset] of channels) {
      writeS32(min!.n);
      writeU32(min!.d);
      writeS32(max!.n);
      writeU32(max!.d);
      writeU32(gamma!.n);
      writeU32(gamma!.d);
      writeS32(baseOffset!.n);
      writeU32(baseOffset!.d);
      writeS32(altOffset!.n);
      writeU32(altOffset!.d);
    }
  }

  return out;
}

export function serializeVersionOnlyPayload(): Uint8Array {
  return new Uint8Array(4);
}

export function buildIsoApp2Segment(payload: Uint8Array): Uint8Array {
  const identifierLength = ISO21496_IDENTIFIER.length + 1;
  const length = 2 + identifierLength + payload.length;
  if (length > 0xFF_FF) {
    throw new Error(`iso21496: APP2 payload too large (${payload.length})`);
  }
  const out = new Uint8Array(2 + length);
  out[0] = 0xFF;
  out[1] = 0xE2;
  out[2] = (length >> 8) & 0xFF;
  out[3] = length & 0xFF;
  for (let i = 0; i < ISO21496_IDENTIFIER.length; i++) {
    out[4 + i] = ISO21496_IDENTIFIER.codePointAt(i)!;
  }
  out.set(payload, 4 + identifierLength);
  return out;
}

export function spliceSegmentsAfterSoi(
  jpeg: Uint8Array,
  segments: readonly Uint8Array[],
): Uint8Array {
  if (jpeg.length < 2 || jpeg[0] !== 0xFF || jpeg[1] !== 0xD8) {
    throw new Error('iso21496: byte stream does not start with a JPEG SOI');
  }
  const insertedLength = segments.reduce((sum, s) => sum + s.length, 0);
  const out = new Uint8Array(jpeg.length + insertedLength);
  out[0] = 0xFF;
  out[1] = 0xD8;
  let pos = 2;
  for (const segment of segments) {
    out.set(segment, pos);
    pos += segment.length;
  }
  out.set(jpeg.subarray(2), pos);
  return out;
}
