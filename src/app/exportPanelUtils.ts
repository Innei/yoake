export function frameMsFromVideo(videoEl: HTMLVideoElement | null): number {
  if (!videoEl) return 0;
  const seconds = Number.isFinite(videoEl.currentTime) ? videoEl.currentTime : 0;
  return Math.max(0, Math.round(seconds * 1000));
}

export function buildFilename(
  clipBaseName: string,
  frameMs: number,
  lutLabel: string,
): string {
  const stamp = frameMs.toString().padStart(7, '0');
  const safeBase = clipBaseName.replaceAll(/\.[^./]+$/g, '');
  const safeLut = lutLabel.replaceAll(/[^\w-]+/g, '_');
  return `${safeBase}_${stamp}_${safeLut}.jpg`;
}

export async function pickDirectory(): Promise<FileSystemDirectoryHandle | null> {
  if (typeof window === 'undefined' || !window.showDirectoryPicker) {
    throw new Error('File System Access API unavailable');
  }
  try {
    return await window.showDirectoryPicker({ mode: 'readwrite' });
  } catch (cause) {
    if (cause instanceof DOMException && cause.name === 'AbortError') {
      return null;
    }
    throw cause;
  }
}

export function errorMessage(cause: unknown): string {
  if (cause instanceof Error) return cause.message;
  return String(cause);
}
