export interface ExtractFrameOptions {
  baseName: string;
  canvas: HTMLCanvasElement;
  currentTime: number;
  exportDir: FileSystemDirectoryHandle;
  fps: number;
}

export interface ExtractFrameResult {
  filename: string;
}

function pad(n: number, width: number): string {
  return Math.floor(n).toString().padStart(width, '0');
}

export function formatTimeForFilename(seconds: number, _fps: number): string {
  const safe = Number.isFinite(seconds) && seconds > 0 ? seconds : 0;
  const totalMs = Math.round(safe * 1000);
  const ms = totalMs % 1000;
  const totalSecs = Math.floor(totalMs / 1000);
  const s = totalSecs % 60;
  const totalMins = Math.floor(totalSecs / 60);
  const m = totalMins % 60;
  const h = Math.floor(totalMins / 60);
  const hh = pad(Math.min(h, 99), 2);
  return `${hh}-${pad(m, 2)}-${pad(s, 2)}-${ms.toString().padStart(3, '0')}`;
}

function canvasToPngBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    try {
      canvas.toBlob((blob) => {
        if (!blob) {
          reject(new Error('canvas.toBlob returned null'));
          return;
        }
        resolve(blob);
      }, 'image/png');
    } catch (cause) {
      reject(cause instanceof Error ? cause : new Error(String(cause)));
    }
  });
}

export async function extractFrame(
  opts: ExtractFrameOptions,
): Promise<ExtractFrameResult> {
  const { baseName, canvas, currentTime, fps, exportDir } = opts;
  const blob = await canvasToPngBlob(canvas);
  const stamp = formatTimeForFilename(currentTime, fps);
  const filename = `${baseName}_${stamp}.png`;
  const fileHandle = await exportDir.getFileHandle(filename, { create: true });
  const writable = await fileHandle.createWritable();
  try {
    await writable.write(blob);
  } finally {
    await writable.close();
  }
  return { filename };
}
