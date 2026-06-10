import type { ExportFrameMeta } from './render';
import { encodeSdrJpeg } from './sdrJpeg';
import { assembleUltraHdrContainer } from './ultraHdrContainer';

export interface UltraHdrEncodeInput {
  hdrLinearF32: Float32Array;
  height: number;
  meta: ExportFrameMeta;
  sdrBaseBytes: Uint8ClampedArray;
  width: number;
}

export interface GainMapComputation {
  gainMapMax: number;
  rgba: Uint8ClampedArray;
}

const GAIN_OFFSET = 1 / 64;
const GAIN_MAP_MAX_EPSILON = 0.01;

const srgbToLinearTable = new Float32Array(256);
for (let i = 0; i < 256; i++) {
  const c = i / 255;
  srgbToLinearTable[i] =
    c <= 0.040_45 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

export function peakNitsToCapacityLog2(peakNits: number): number {
  return Math.log2(Math.max(1, peakNits / 100));
}

export function computeGainMap(
  sdrBaseBytes: Uint8ClampedArray,
  hdrLinearF32: Float32Array,
  width: number,
  height: number,
  peakNits: number,
): GainMapComputation {
  const pixelCount = width * height;
  const capacityLog2 = peakNitsToCapacityLog2(peakNits);
  const logGain = new Float32Array(pixelCount);
  let maxLog2 = 0;

  for (let p = 0; p < pixelCount; p++) {
    const s = p * 4;
    const h = p * 3;
    let gain = 0;
    for (let c = 0; c < 3; c++) {
      const sdrLin = srgbToLinearTable[sdrBaseBytes[s + c]!]!;
      const channelGain =
        (hdrLinearF32[h + c]! + GAIN_OFFSET) / (sdrLin + GAIN_OFFSET);
      if (channelGain > gain) gain = channelGain;
    }
    let log2Gain = Math.log2(gain);
    if (log2Gain < 0) log2Gain = 0;
    else if (log2Gain > capacityLog2) log2Gain = capacityLog2;
    logGain[p] = log2Gain;
    if (log2Gain > maxLog2) maxLog2 = log2Gain;
  }

  const gainMapMax = Math.max(maxLog2, GAIN_MAP_MAX_EPSILON);
  const rgba = new Uint8ClampedArray(pixelCount * 4);
  for (let p = 0; p < pixelCount; p++) {
    const stored = Math.round((logGain[p]! / gainMapMax) * 255);
    const o = p * 4;
    rgba[o] = stored;
    rgba[o + 1] = stored;
    rgba[o + 2] = stored;
    rgba[o + 3] = 255;
  }

  return { gainMapMax, rgba };
}

export async function encodeUltraHdrJpeg(
  input: UltraHdrEncodeInput,
): Promise<Uint8Array> {
  const { height, hdrLinearF32, meta, sdrBaseBytes, width } = input;

  if (hdrLinearF32.length !== width * height * 3) {
    throw new Error(
      `Ultra HDR encode: hdrLinearF32 length ${hdrLinearF32.length} != ${width * height * 3}`,
    );
  }
  if (sdrBaseBytes.length !== width * height * 4) {
    throw new Error(
      `Ultra HDR encode: sdrBaseBytes length ${sdrBaseBytes.length} != ${width * height * 4}`,
    );
  }

  const { gainMapMax, rgba } = computeGainMap(
    sdrBaseBytes,
    hdrLinearF32,
    width,
    height,
    meta.peakNits,
  );

  const [sdrJpeg, gainMapJpeg] = await Promise.all([
    encodeSdrJpeg(sdrBaseBytes, width, height),
    encodeSdrJpeg(rgba, width, height),
  ]);

  return assembleUltraHdrContainer(sdrJpeg, gainMapJpeg, {
    gainMapMinLog2: [0, 0, 0],
    gainMapMaxLog2: [gainMapMax, gainMapMax, gainMapMax],
    gamma: [1, 1, 1],
    offsetSdr: [GAIN_OFFSET, GAIN_OFFSET, GAIN_OFFSET],
    offsetHdr: [GAIN_OFFSET, GAIN_OFFSET, GAIN_OFFSET],
    hdrCapacityMinLog2: 0,
    hdrCapacityMaxLog2: gainMapMax,
  });
}
