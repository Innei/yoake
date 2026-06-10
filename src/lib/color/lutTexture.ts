import type { ParsedLut } from '~/types';

export interface Lut3DUpload {
  depth: number;
  height: number;
  pixels: Float32Array;
  width: number;
}

export function buildLut3DUploadData(parsedLut: ParsedLut): Lut3DUpload {
  const { size, data } = parsedLut;
  const expectedTriplets = size * size * size;
  if (data.length !== expectedTriplets * 3) {
    throw new Error(
      `LUT data length ${data.length} does not match size ${size}`,
    );
  }
  const pixels = new Float32Array(expectedTriplets * 4);
  for (let i = 0; i < expectedTriplets; i++) {
    pixels[i * 4 + 0] = data[i * 3 + 0]!;
    pixels[i * 4 + 1] = data[i * 3 + 1]!;
    pixels[i * 4 + 2] = data[i * 3 + 2]!;
    pixels[i * 4 + 3] = 1;
  }
  return { width: size, height: size, depth: size, pixels };
}
