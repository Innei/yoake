const JPEG_EXT = '.jpg';

function splitName(baseName: string): { ext: string; stem: string } {
  const trimmed = baseName.endsWith(JPEG_EXT)
    ? baseName.slice(0, -JPEG_EXT.length)
    : baseName;
  return { stem: trimmed, ext: JPEG_EXT };
}

async function nameTaken(
  handle: FileSystemDirectoryHandle,
  name: string,
): Promise<boolean> {
  try {
    await handle.getFileHandle(name);
    return true;
  } catch (cause) {
    if (cause instanceof DOMException && cause.name === 'NotFoundError') {
      return false;
    }
    if (
      typeof cause === 'object' &&
      cause !== null &&
      'name' in cause &&
      (cause as { name?: unknown }).name === 'NotFoundError'
    ) {
      return false;
    }
    throw cause;
  }
}

export async function resolveAvailableName(
  handle: FileSystemDirectoryHandle,
  baseName: string,
): Promise<string> {
  const { stem, ext } = splitName(baseName);
  const primary = `${stem}${ext}`;
  if (!(await nameTaken(handle, primary))) return primary;

  for (let suffix = 2; suffix < 10_000; suffix += 1) {
    const candidate = `${stem}_${suffix}${ext}`;
    if (!(await nameTaken(handle, candidate))) return candidate;
  }
  throw new Error(`resolveAvailableName: exhausted suffixes for ${baseName}`);
}

export async function writeJpegToDir(
  handle: FileSystemDirectoryHandle,
  baseName: string,
  bytes: Uint8Array,
): Promise<string> {
  const finalName = await resolveAvailableName(handle, baseName);
  const fileHandle = await handle.getFileHandle(finalName, { create: true });
  const writable = await fileHandle.createWritable();
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  try {
    await writable.write(buffer);
  } finally {
    await writable.close();
  }
  return finalName;
}
