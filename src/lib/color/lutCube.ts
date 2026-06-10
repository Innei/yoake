import type { ParsedLut } from '~/types';

export class LutParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LutParseError';
  }
}

const MIN_SIZE = 2;
const MAX_SIZE = 256;

export function parseCubeLut(text: string): ParsedLut {
  if (typeof text !== 'string' || text.length === 0) {
    throw new LutParseError('empty LUT input');
  }

  let size = 0;
  const triplets: number[] = [];

  const lines = text.split(/\r?\n/);
  for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
    const rawLine = lines[lineIndex]!;
    const commentStripped = rawLine.split('#')[0]!;
    const line = commentStripped.trim();
    if (line.length === 0) continue;

    const tokens = line.split(/\s+/);
    const head = tokens[0]!;

    if (head === 'LUT_3D_SIZE') {
      if (tokens.length < 2) {
        throw new LutParseError(`LUT_3D_SIZE missing value on line ${lineIndex + 1}`);
      }
      const parsed = Number(tokens[1]);
      if (!Number.isInteger(parsed) || parsed < MIN_SIZE || parsed > MAX_SIZE) {
        throw new LutParseError(
          `LUT_3D_SIZE out of range on line ${lineIndex + 1}: ${tokens[1]}`,
        );
      }
      size = parsed;
      continue;
    }

    if (head === 'LUT_1D_SIZE') {
      throw new LutParseError('1D LUTs are not supported');
    }

    if (
      head === 'TITLE' ||
      head === 'DOMAIN_MIN' ||
      head === 'DOMAIN_MAX' ||
      head === 'LUT_3D_INPUT_RANGE'
    ) {
      continue;
    }

    if (tokens.length !== 3) {
      throw new LutParseError(
        `expected 3 floats on line ${lineIndex + 1}, got ${tokens.length}`,
      );
    }
    const r = Number(tokens[0]);
    const g = Number(tokens[1]);
    const b = Number(tokens[2]);
    if (!Number.isFinite(r) || !Number.isFinite(g) || !Number.isFinite(b)) {
      throw new LutParseError(`non-finite triplet on line ${lineIndex + 1}`);
    }
    triplets.push(r, g, b);
  }

  if (size === 0) {
    throw new LutParseError('LUT_3D_SIZE not declared');
  }
  const expectedFloats = size * size * size * 3;
  if (triplets.length !== expectedFloats) {
    throw new LutParseError(
      `expected ${expectedFloats} floats for size ${size}, got ${triplets.length}`,
    );
  }

  return { size, data: new Float32Array(triplets) };
}
