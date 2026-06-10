import 'fake-indexeddb/auto';

import { afterEach, describe, expect, it } from 'vitest';

import {
  clearHandle,
  ensurePermission,
  getHandle,
  requestPermission,
  setHandle,
} from '~/lib/fs/handleStore';

type PermissionState = 'granted' | 'prompt' | 'denied';

interface StorableHandle {
  kind: 'directory';
  name: string;
}

interface PermissionedHandle extends StorableHandle {
  queryPermission: (descriptor: {
    mode: 'read' | 'readwrite';
  }) => Promise<PermissionState>;
  requestPermission: (descriptor: {
    mode: 'read' | 'readwrite';
  }) => Promise<PermissionState>;
}

const makeStorableHandle = (name: string): StorableHandle => ({
  name,
  kind: 'directory',
});

const makePermissionedHandle = (
  query: PermissionState,
  request: PermissionState = 'granted',
): PermissionedHandle => ({
  name: 'h',
  kind: 'directory',
  queryPermission: async () => query,
  requestPermission: async () => request,
});

afterEach(async () => {
  await clearHandle('clipDir');
  await clearHandle('lutDir');
  await clearHandle('exportDir');
});

describe('handleStore', () => {
  it('round-trips a stored handle', async () => {
    const handle = makeStorableHandle('clips');
    await setHandle('clipDir', handle as unknown as FileSystemDirectoryHandle);
    const restored = await getHandle('clipDir');
    expect(restored).toBeDefined();
    expect((restored as unknown as StorableHandle).name).toBe('clips');
  });

  it('returns undefined when no handle is set', async () => {
    expect(await getHandle('lutDir')).toBeUndefined();
  });

  it('clears a stored handle', async () => {
    const handle = makeStorableHandle('exports');
    await setHandle(
      'exportDir',
      handle as unknown as FileSystemDirectoryHandle,
    );
    await clearHandle('exportDir');
    expect(await getHandle('exportDir')).toBeUndefined();
  });

  it('isolates handles per key', async () => {
    await setHandle(
      'clipDir',
      makeStorableHandle('a') as unknown as FileSystemDirectoryHandle,
    );
    await setHandle(
      'lutDir',
      makeStorableHandle('b') as unknown as FileSystemDirectoryHandle,
    );
    const a = (await getHandle('clipDir')) as unknown as StorableHandle;
    const b = (await getHandle('lutDir')) as unknown as StorableHandle;
    expect(a.name).toBe('a');
    expect(b.name).toBe('b');
  });

  describe('ensurePermission', () => {
    it("returns 'granted' when query resolves granted", async () => {
      const handle = makePermissionedHandle('granted');
      expect(
        await ensurePermission(
          handle as unknown as FileSystemDirectoryHandle,
          'readwrite',
        ),
      ).toBe('granted');
    });

    it("returns 'prompt' when query resolves prompt", async () => {
      const handle = makePermissionedHandle('prompt');
      expect(
        await ensurePermission(
          handle as unknown as FileSystemDirectoryHandle,
          'read',
        ),
      ).toBe('prompt');
    });

    it("returns 'denied' when query resolves denied", async () => {
      const handle = makePermissionedHandle('denied');
      expect(
        await ensurePermission(
          handle as unknown as FileSystemDirectoryHandle,
          'read',
        ),
      ).toBe('denied');
    });
  });

  describe('requestPermission', () => {
    it("returns 'granted' when user grants", async () => {
      const handle = makePermissionedHandle('prompt', 'granted');
      expect(
        await requestPermission(
          handle as unknown as FileSystemDirectoryHandle,
          'readwrite',
        ),
      ).toBe('granted');
    });

    it("returns 'denied' when user declines", async () => {
      const handle = makePermissionedHandle('prompt', 'denied');
      expect(
        await requestPermission(
          handle as unknown as FileSystemDirectoryHandle,
          'read',
        ),
      ).toBe('denied');
    });

    it("treats 'prompt' as denied", async () => {
      const handle = makePermissionedHandle('prompt', 'prompt');
      expect(
        await requestPermission(
          handle as unknown as FileSystemDirectoryHandle,
          'read',
        ),
      ).toBe('denied');
    });
  });
});
