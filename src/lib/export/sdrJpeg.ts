const JPEG_QUALITY = 0.95;

export async function encodeSdrJpeg(
  sdrBaseBytes: Uint8ClampedArray,
  width: number,
  height: number,
): Promise<Uint8Array> {
  if (sdrBaseBytes.length !== width * height * 4) {
    throw new Error(
      `encodeSdrJpeg: expected ${width * height * 4} bytes, got ${sdrBaseBytes.length}`,
    );
  }
  if (typeof OffscreenCanvas === 'undefined') {
    throw new Error('OffscreenCanvas is not available in this environment');
  }
  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('encodeSdrJpeg: failed to acquire 2D context');
  }
  const buffer = new ArrayBuffer(sdrBaseBytes.byteLength);
  const clamped = new Uint8ClampedArray(buffer);
  clamped.set(sdrBaseBytes);
  const imageData = new ImageData(clamped, width, height);
  ctx.putImageData(imageData, 0, 0);
  const blob = await canvas.convertToBlob({
    type: 'image/jpeg',
    quality: JPEG_QUALITY,
  });
  const buf = await blob.arrayBuffer();
  return new Uint8Array(buf);
}
