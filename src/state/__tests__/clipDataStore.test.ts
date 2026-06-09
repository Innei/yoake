import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { SidecarV1 } from '~/fs/clipSidecar';
import { readSidecar, SIDECAR_VERSION, writeSidecar } from '~/fs/clipSidecar';
import { useClipsStore } from '~/state/clipsStore';
import { usePrefsStore } from '~/state/prefsStore';
import { toast } from '~/state/toastStore';

import { useClipDataStore } from '../clipDataStore';

vi.mock('~/fs/clipSidecar', async () => {
  const actual = await vi.importActual<typeof import('~/fs/clipSidecar')>(
    '~/fs/clipSidecar',
  );
  return {
    ...actual,
    readSidecar: vi.fn(),
    writeSidecar: vi.fn(),
  };
});

vi.mock('~/state/toastStore', () => ({
  toast: {
    info: vi.fn(),
    success: vi.fn(),
    warning: vi.fn(),
    error: vi.fn(),
  },
}));

const mockedRead = vi.mocked(readSidecar);
const mockedWrite = vi.mocked(writeSidecar);
const mockedToastError = vi.mocked(toast.error);

const dirHandle = {} as FileSystemDirectoryHandle;
const fileHandle = {} as FileSystemFileHandle;

function seedClip(id = 'clip-1', name = 'DJI_0042_D.MP4'): void {
  useClipsStore.setState({
    clips: [{ id, name, handle: fileHandle, lastModified: 0, size: 0 }],
    selectedClipId: id,
    directoryHandle: dirHandle,
  });
  usePrefsStore.setState({ clipDirHandle: dirHandle });
}

function resetStore(): void {
  useClipDataStore.setState({ entries: {} });
}

async function flush(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

describe('clipDataStore.load', () => {
  beforeEach(() => {
    resetStore();
    mockedRead.mockReset();
    mockedWrite.mockReset();
    mockedToastError.mockReset();
    seedClip();
  });

  it('returns an empty entry when sidecar is missing', async () => {
    mockedRead.mockResolvedValueOnce(undefined);
    await useClipDataStore.getState().load('clip-1');
    const entry = useClipDataStore.getState().entries['clip-1'];
    expect(entry).toBeDefined();
    expect(entry!.markers).toEqual([]);
    expect(entry!.status).toBe('idle');
    expect(entry!.readOnly).toBe(false);
    expect(mockedToastError).not.toHaveBeenCalled();
  });

  it('marks entry as readOnly and toasts when sidecar is malformed', async () => {
    mockedRead.mockRejectedValueOnce(new Error('malformed JSON in foo'));
    await useClipDataStore.getState().load('clip-1');
    const entry = useClipDataStore.getState().entries['clip-1'];
    expect(entry!.readOnly).toBe(true);
    expect(entry!.markers).toEqual([]);
    expect(entry!.status).toBe('idle');
    expect(mockedToastError).toHaveBeenCalledTimes(1);
  });

  it('sorts loaded markers by time ascending', async () => {
    const data: SidecarV1 = {
      version: SIDECAR_VERSION,
      markers: [
        { id: 'b', time: 5, label: 'b' },
        { id: 'a', time: 1, label: 'a' },
        { id: 'c', time: 3, label: 'c' },
      ],
    };
    mockedRead.mockResolvedValueOnce(data);
    await useClipDataStore.getState().load('clip-1');
    const entry = useClipDataStore.getState().entries['clip-1']!;
    expect(entry.markers.map((m) => m.id)).toEqual(['a', 'c', 'b']);
  });
});

describe('clipDataStore.addMarker', () => {
  beforeEach(() => {
    resetStore();
    mockedRead.mockReset();
    mockedWrite.mockReset();
    mockedToastError.mockReset();
    seedClip();
  });

  it('inserts a marker, returns its id, and writes the full sidecar', async () => {
    mockedWrite.mockResolvedValue();
    const id = useClipDataStore.getState().addMarker('clip-1', 2.5, 'first');
    expect(typeof id).toBe('string');
    expect(id.length).toBeGreaterThan(0);
    const entry = useClipDataStore.getState().entries['clip-1']!;
    expect(entry.markers).toEqual([{ id, time: 2.5, label: 'first' }]);
    await flush();
    expect(mockedWrite).toHaveBeenCalledTimes(1);
    const [, baseName, payload] = mockedWrite.mock.calls[0]!;
    expect(baseName).toBe('DJI_0042_D');
    expect(payload).toEqual({
      version: SIDECAR_VERSION,
      markers: [{ id, time: 2.5, label: 'first' }],
    });
  });

  it('updates memory but skips writes when entry is readOnly', async () => {
    mockedRead.mockRejectedValueOnce(new Error('boom'));
    await useClipDataStore.getState().load('clip-1');
    mockedWrite.mockResolvedValue();
    const id = useClipDataStore.getState().addMarker('clip-1', 1, 'x');
    await flush();
    const entry = useClipDataStore.getState().entries['clip-1']!;
    expect(entry.markers).toHaveLength(1);
    expect(entry.markers[0]!.id).toBe(id);
    expect(mockedWrite).not.toHaveBeenCalled();
  });

  it('serializes three quick adds into three writes in order', async () => {
    const order: number[] = [];
    let n = 0;
    mockedWrite.mockImplementation(async () => {
      const mine = ++n;
      await new Promise((resolve) => setTimeout(resolve, 1));
      order.push(mine);
    });
    useClipDataStore.getState().addMarker('clip-1', 1);
    useClipDataStore.getState().addMarker('clip-1', 2);
    useClipDataStore.getState().addMarker('clip-1', 3);
    while (useClipDataStore.getState().hasPendingWrites()) {
      await new Promise((resolve) => setTimeout(resolve, 2));
    }
    expect(mockedWrite).toHaveBeenCalledTimes(3);
    expect(order).toEqual([1, 2, 3]);
    const entry = useClipDataStore.getState().entries['clip-1']!;
    expect(entry.markers.map((m) => m.time)).toEqual([1, 2, 3]);
  });
});

describe('clipDataStore.updateMarker', () => {
  beforeEach(() => {
    resetStore();
    mockedRead.mockReset();
    mockedWrite.mockReset();
    mockedToastError.mockReset();
    seedClip();
    mockedWrite.mockResolvedValue();
  });

  it('writes the updated label', async () => {
    const id = useClipDataStore.getState().addMarker('clip-1', 1, 'old');
    await flush();
    mockedWrite.mockClear();
    useClipDataStore.getState().updateMarker('clip-1', id, { label: 'new' });
    await flush();
    expect(mockedWrite).toHaveBeenCalledTimes(1);
    const payload = mockedWrite.mock.calls[0]![2];
    expect(payload.markers[0]!.label).toBe('new');
  });

  it('re-sorts when time changes and writes the new order', async () => {
    const a = useClipDataStore.getState().addMarker('clip-1', 1, 'a');
    useClipDataStore.getState().addMarker('clip-1', 2, 'b');
    useClipDataStore.getState().addMarker('clip-1', 3, 'c');
    await flush();
    mockedWrite.mockClear();
    useClipDataStore.getState().updateMarker('clip-1', a, { time: 10 });
    await flush();
    const entry = useClipDataStore.getState().entries['clip-1']!;
    expect(entry.markers.map((m) => m.label)).toEqual(['b', 'c', 'a']);
    const payload = mockedWrite.mock.calls.at(-1)![2];
    expect(payload.markers.map((m) => m.label)).toEqual(['b', 'c', 'a']);
  });
});

describe('clipDataStore.removeMarker', () => {
  beforeEach(() => {
    resetStore();
    mockedRead.mockReset();
    mockedWrite.mockReset();
    mockedToastError.mockReset();
    seedClip();
    mockedWrite.mockResolvedValue();
  });

  it('removes the marker and writes the remainder', async () => {
    const a = useClipDataStore.getState().addMarker('clip-1', 1, 'a');
    const b = useClipDataStore.getState().addMarker('clip-1', 2, 'b');
    await flush();
    mockedWrite.mockClear();
    useClipDataStore.getState().removeMarker('clip-1', a);
    await flush();
    const entry = useClipDataStore.getState().entries['clip-1']!;
    expect(entry.markers.map((m) => m.id)).toEqual([b]);
    expect(mockedWrite).toHaveBeenCalledTimes(1);
    const payload = mockedWrite.mock.calls[0]![2];
    expect(payload.markers.map((m) => m.id)).toEqual([b]);
  });
});

describe('clipDataStore write failures', () => {
  beforeEach(() => {
    resetStore();
    mockedRead.mockReset();
    mockedWrite.mockReset();
    mockedToastError.mockReset();
    seedClip();
  });

  it('sets status to error and toasts when a write rejects, then recovers on the next successful mutation', async () => {
    mockedWrite.mockRejectedValueOnce(new Error('disk full'));
    useClipDataStore.getState().addMarker('clip-1', 1, 'a');
    while (useClipDataStore.getState().hasPendingWrites()) {
      await new Promise((resolve) => setTimeout(resolve, 2));
    }
    let entry = useClipDataStore.getState().entries['clip-1']!;
    expect(entry.status).toBe('error');
    expect(entry.error).toBe('disk full');
    expect(mockedToastError).toHaveBeenCalledTimes(1);

    mockedWrite.mockResolvedValueOnce();
    useClipDataStore.getState().addMarker('clip-1', 2, 'b');
    while (useClipDataStore.getState().hasPendingWrites()) {
      await new Promise((resolve) => setTimeout(resolve, 2));
    }
    entry = useClipDataStore.getState().entries['clip-1']!;
    expect(entry.status).toBe('idle');
    expect(entry.error).toBeUndefined();
  });
});
