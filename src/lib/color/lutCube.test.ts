import { describe, expect, it } from 'vitest';

import fixtureText from '../../../tests/fixtures/dji-dlog-m.cube?raw';
import { LutParseError, parseCubeLut } from './lutCube';

describe('parseCubeLut', () => {
  it('parses the committed 3x3x3 fixture', () => {
    const lut = parseCubeLut(fixtureText);
    expect(lut.size).toBe(3);
    expect(lut.data.length).toBe(3 * 3 * 3 * 3);
    expect(lut.data[0]).toBe(0);
    expect(lut.data[1]).toBe(0);
    expect(lut.data[2]).toBe(0);
    const lastIdx = (3 * 3 * 3 - 1) * 3;
    expect(lut.data[lastIdx]).toBe(1);
    expect(lut.data[lastIdx + 1]).toBe(1);
    expect(lut.data[lastIdx + 2]).toBe(1);
  });

  it('skips comments and blank lines', () => {
    const text = `# leading comment\nLUT_3D_SIZE 2\n\n0 0 0\n1 0 0\n0 1 0\n1 1 0\n0 0 1\n1 0 1\n0 1 1\n1 1 1\n`;
    const lut = parseCubeLut(text);
    expect(lut.size).toBe(2);
    expect(lut.data.length).toBe(24);
  });

  it('throws LutParseError when LUT_3D_SIZE is missing', () => {
    const text = `0 0 0\n1 1 1\n`;
    expect(() => parseCubeLut(text)).toThrow(LutParseError);
  });

  it('throws LutParseError when triplet count mismatches declared size', () => {
    const text = `LUT_3D_SIZE 2\n0 0 0\n1 0 0\n`;
    expect(() => parseCubeLut(text)).toThrow(LutParseError);
  });

  it('throws LutParseError on non-finite tokens', () => {
    const text = `LUT_3D_SIZE 2\n0 0 0\nNaN 0 0\n1 0 0\n0 1 0\n1 1 0\n0 0 1\n1 0 1\n0 1 1\n1 1 1\n`;
    expect(() => parseCubeLut(text)).toThrow(LutParseError);
  });

  it('throws LutParseError on empty input', () => {
    expect(() => parseCubeLut('')).toThrow(LutParseError);
  });

  it('throws LutParseError on bogus row length', () => {
    const text = `LUT_3D_SIZE 2\n0 0\n1 0 0\n0 1 0\n1 1 0\n0 0 1\n1 0 1\n0 1 1\n1 1 1\n`;
    expect(() => parseCubeLut(text)).toThrow(LutParseError);
  });
});
