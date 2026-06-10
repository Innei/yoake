export interface ExtractFrameOptions {
  baseName: string;
  blob: Blob;
  currentTime: number;
  exportDir: FileSystemDirectoryHandle;
}

export interface ExtractFrameResult {
  filename: string;
}

function pad(n: number, width: number): string {
  return Math.floor(n).toString().padStart(width, '0');
}

export function formatTimeForFilename(seconds: number): string {
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

export async function extractFrame(
  opts: ExtractFrameOptions,
): Promise<ExtractFrameResult> {
  const { baseName, blob, currentTime, exportDir } = opts;
  const stamp = formatTimeForFilename(currentTime);
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
