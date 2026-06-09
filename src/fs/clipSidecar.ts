export const SIDECAR_VERSION = 1;

export interface Marker {
  id: string;
  label: string;
  time: number;
}

export interface SidecarV1 {
  markers: Marker[];
  version: 1;
}

const sidecarFileName = (baseName: string) => `${baseName}.djilut.json`;

const isNotFound = (cause: unknown): boolean => {
  if (cause instanceof DOMException && cause.name === 'NotFoundError') {
    return true;
  }
  return (
    typeof cause === 'object' &&
    cause !== null &&
    'name' in cause &&
    (cause as { name?: unknown }).name === 'NotFoundError'
  );
};

export async function readSidecar(
  dirHandle: FileSystemDirectoryHandle,
  baseName: string,
): Promise<SidecarV1 | undefined> {
  const fileName = sidecarFileName(baseName);
  let fileHandle: FileSystemFileHandle;
  try {
    fileHandle = await dirHandle.getFileHandle(fileName);
  } catch (cause) {
    if (isNotFound(cause)) return undefined;
    throw cause;
  }
  const file = await fileHandle.getFile();
  const text = await file.text();
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (cause) {
    throw new Error(`clipSidecar: malformed JSON in ${fileName}`, {
      cause,
    });
  }
  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    (parsed as { version?: unknown }).version !== SIDECAR_VERSION
  ) {
    throw new Error(
      `clipSidecar: unsupported sidecar version in ${fileName} (expected ${SIDECAR_VERSION})`,
    );
  }
  const markers = (parsed as { markers?: unknown }).markers;
  if (!Array.isArray(markers)) {
    throw new Error(`clipSidecar: missing markers array in ${fileName}`);
  }
  return { version: SIDECAR_VERSION, markers: markers as Marker[] };
}

export async function writeSidecar(
  dirHandle: FileSystemDirectoryHandle,
  baseName: string,
  data: SidecarV1,
): Promise<void> {
  const fileName = sidecarFileName(baseName);
  const fileHandle = await dirHandle.getFileHandle(fileName, { create: true });
  const writable = await fileHandle.createWritable();
  try {
    await writable.write(JSON.stringify(data, null, 2));
  } finally {
    await writable.close();
  }
}
