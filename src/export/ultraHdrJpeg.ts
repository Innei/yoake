import type { ExportFrameMeta } from './render';
import { encodeSdrJpeg } from './sdrJpeg';

export interface UltraHdrEncodeInput {
  hdrLinearF32: Float32Array;
  height: number;
  meta: ExportFrameMeta;
  sdrBaseBytes: Uint8ClampedArray;
  width: number;
}

type OpenUltraHdrModule = typeof import('open-ultrahdr');

let encoderModulePromise: Promise<OpenUltraHdrModule> | null = null;

async function loadEncoder(): Promise<OpenUltraHdrModule> {
  if (encoderModulePromise) return encoderModulePromise;
  encoderModulePromise = import('open-ultrahdr').catch((cause: unknown) => {
    encoderModulePromise = null;
    const reason = cause instanceof Error ? cause.message : String(cause);
    throw new Error(
      `Ultra HDR encoder unavailable: ${reason}. See docs/superpowers/spikes/spike-b-ultra-hdr-compat.md for the chosen package (open-ultrahdr + open-ultrahdr-wasm).`,
    );
  });
  return encoderModulePromise;
}

function peakNitsToTargetHdrCapacity(peakNits: number): number {
  if (peakNits <= 400) return 2;
  if (peakNits >= 1000) return 3.322;
  if (peakNits === 600) return 2.585;
  return Math.log2(Math.max(1, peakNits / 100));
}

export async function encodeUltraHdrJpeg(
  input: UltraHdrEncodeInput,
): Promise<Uint8Array> {
  const encoderModule = await loadEncoder();

  if (input.hdrLinearF32.length !== input.width * input.height * 3) {
    throw new Error(
      `Ultra HDR encode: hdrLinearF32 length ${input.hdrLinearF32.length} != ${input.width * input.height * 3}`,
    );
  }

  const sdrJpeg = await encodeSdrJpeg(
    input.sdrBaseBytes,
    input.width,
    input.height,
  );

  const targetHdrCapacity = peakNitsToTargetHdrCapacity(input.meta.peakNits);

  const sdrJpegBuf = new ArrayBuffer(sdrJpeg.byteLength);
  new Uint8Array(sdrJpegBuf).set(sdrJpeg);
  const hdrBuf = new ArrayBuffer(input.hdrLinearF32.byteLength);
  new Float32Array(hdrBuf).set(input.hdrLinearF32);

  const result = await encoderModule.encodeUltraHdr(
    `dji-lut-${Date.now()}`,
    sdrJpegBuf,
    hdrBuf,
    {
      baseQuality: 95,
      gainMapQuality: 90,
      targetHdrCapacity,
    },
  );

  return new Uint8Array(result);
}
