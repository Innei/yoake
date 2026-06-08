import { del, get, set } from 'idb-keyval';

export type HandleKey = 'clipDir' | 'lutDir' | 'exportDir';

export type PermissionMode = 'read' | 'readwrite';

export type PermissionState = 'granted' | 'prompt' | 'denied';

const STORAGE_PREFIX = 'fsHandle:';

const storageKey = (key: HandleKey) => `${STORAGE_PREFIX}${key}`;

export async function getHandle(
  key: HandleKey,
): Promise<FileSystemDirectoryHandle | undefined> {
  return get<FileSystemDirectoryHandle>(storageKey(key));
}

export async function setHandle(
  key: HandleKey,
  handle: FileSystemDirectoryHandle,
): Promise<void> {
  await set(storageKey(key), handle);
}

export async function clearHandle(key: HandleKey): Promise<void> {
  await del(storageKey(key));
}

export async function ensurePermission(
  handle: FileSystemDirectoryHandle,
  mode: PermissionMode,
): Promise<PermissionState> {
  const status = await handle.queryPermission({ mode });
  if (status === 'granted') return 'granted';
  if (status === 'denied') return 'denied';
  return 'prompt';
}

export async function requestPermission(
  handle: FileSystemDirectoryHandle,
  mode: PermissionMode,
): Promise<'granted' | 'denied'> {
  const status = await handle.requestPermission({ mode });
  return status === 'granted' ? 'granted' : 'denied';
}
