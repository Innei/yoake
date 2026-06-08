export interface ScannedLut {
  fileHandle: FileSystemFileHandle;
  id: string;
  label: string;
  name: string;
}

const LUT_EXTENSION = /\.cube$/i;

const stripExtension = (name: string) => name.replace(LUT_EXTENSION, '');

export async function scanLuts(
  handle: FileSystemDirectoryHandle,
): Promise<ScannedLut[]> {
  const luts: ScannedLut[] = [];
  for await (const entry of handle.values()) {
    if (entry.kind !== 'file') continue;
    if (!LUT_EXTENSION.test(entry.name)) continue;
    const fileHandle = entry as FileSystemFileHandle;
    luts.push({
      id: entry.name,
      name: entry.name,
      label: stripExtension(entry.name),
      fileHandle,
    });
  }
  luts.sort((a, b) => a.name.localeCompare(b.name));
  return luts;
}

export async function readLut(handle: FileSystemFileHandle): Promise<string> {
  const file = await handle.getFile();
  return file.text();
}
