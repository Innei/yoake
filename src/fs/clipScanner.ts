export interface ScannedClip {
  fileHandle: FileSystemFileHandle;
  id: string;
  lastModified: number;
  name: string;
  size: number;
}

const DJI_CLIP_PATTERN = /_d\.mp4$/i;

export async function scanClips(
  handle: FileSystemDirectoryHandle,
): Promise<ScannedClip[]> {
  const clips: ScannedClip[] = [];
  for await (const entry of handle.values()) {
    if (entry.kind !== 'file') continue;
    if (entry.name.startsWith('.')) continue;
    if (!DJI_CLIP_PATTERN.test(entry.name)) continue;
    const fileHandle = entry as FileSystemFileHandle;
    const file = await fileHandle.getFile();
    clips.push({
      id: entry.name,
      name: entry.name,
      size: file.size,
      lastModified: file.lastModified,
      fileHandle,
    });
  }
  clips.sort((a, b) => (a.name < b.name ? 1 : a.name > b.name ? -1 : 0));
  return clips;
}
