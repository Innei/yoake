import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { SidecarV2 } from '~/fs/clipSidecar';
import { readSidecar, SIDECAR_VERSION, writeSidecar } from '~/fs/clipSidecar';
import { useClipsStore } from '~/state/clipsStore';
import { usePrefsStore } from '~/state/prefsStore';
import { toast } from '~/state/toastStore';

import {
  __resetClipDataStoreCachesForTests,
  useClipDataStore,
} from '../clipDataStore';

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
  __resetClipDataStoreCachesForTests();
}

async function flush(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

async function flushWrites(): Promise<void> {
  while (useClipDataStore.getState().hasPendingWrites()) {
    await new Promise((resolve) => setTimeout(resolve, 2));
  }
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
    const data: SidecarV2 = {
      version: SIDECAR_VERSION,
      markers: [
        { id: 'b', time: 5, label: 'b' },
        { id: 'a', time: 1, label: 'a' },
        { id: 'c', time: 3, label: 'c' },
      ],
      segments: [],
      baseGrade: {},
    };
    mockedRead.mockResolvedValueOnce(data);
    await useClipDataStore.getState().load('clip-1');
    const entry = useClipDataStore.getState().entries['clip-1']!;
    expect(entry.markers.map((m) => m.id)).toEqual(['a', 'c', 'b']);
  });

  it('coalesces concurrent loads into a single sidecar read', async () => {
    let resolveRead: ((value: undefined) => void) | undefined;
    mockedRead.mockImplementationOnce(
      () =>
        new Promise<undefined>((resolve) => {
          resolveRead = resolve;
        }),
    );
    const first = useClipDataStore.getState().load('clip-1');
    const second = useClipDataStore.getState().load('clip-1');
    expect(mockedRead).toHaveBeenCalledTimes(1);
    resolveRead!(undefined);
    const [a, b] = await Promise.all([first, second]);
    expect(a).toBe(b);
    expect(mockedRead).toHaveBeenCalledTimes(1);
  });
});

describe('clipDataStore.markReadOnly', () => {
  beforeEach(() => {
    resetStore();
    mockedRead.mockReset();
    mockedWrite.mockReset();
    mockedToastError.mockReset();
    seedClip();
  });

  it('creates a stub readOnly entry when none exists', () => {
    useClipDataStore.getState().markReadOnly('clip-1', true);
    const entry = useClipDataStore.getState().entries['clip-1']!;
    expect(entry.readOnly).toBe(true);
    expect(entry.markers).toEqual([]);
    expect(entry.status).toBe('idle');
  });

  it('preserves existing markers when flipping readOnly true', async () => {
    mockedWrite.mockResolvedValue();
    const id = useClipDataStore.getState().addMarker('clip-1', 1, 'a');
    await flush();
    useClipDataStore.getState().markReadOnly('clip-1', true);
    const entry = useClipDataStore.getState().entries['clip-1']!;
    expect(entry.readOnly).toBe(true);
    expect(entry.markers.map((m) => m.id)).toEqual([id]);
  });

  it('does not write when readOnly and resumes writing after re-grant', async () => {
    mockedWrite.mockResolvedValue();
    useClipDataStore.getState().markReadOnly('clip-1', true);
    useClipDataStore.getState().addMarker('clip-1', 1, 'a');
    await flush();
    expect(mockedWrite).not.toHaveBeenCalled();

    useClipDataStore.getState().markReadOnly('clip-1', false);
    useClipDataStore.getState().addMarker('clip-1', 2, 'b');
    await flush();
    expect(mockedWrite).toHaveBeenCalledTimes(1);
  });

  it('does not create an entry when marking readOnly false on an unknown clip', () => {
    useClipDataStore.getState().markReadOnly('ghost', false);
    expect(useClipDataStore.getState().entries['ghost']).toBeUndefined();
  });

  it('allows load to re-run after marking readOnly false', async () => {
    mockedRead.mockResolvedValueOnce(undefined);
    await useClipDataStore.getState().load('clip-1');
    expect(mockedRead).toHaveBeenCalledTimes(1);

    useClipDataStore.getState().markReadOnly('clip-1', false);
    mockedRead.mockResolvedValueOnce(undefined);
    await useClipDataStore.getState().load('clip-1');
    expect(mockedRead).toHaveBeenCalledTimes(2);
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
      segments: [],
      baseGrade: {},
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

describe('clipDataStore.load segments and baseGrade', () => {
  beforeEach(() => {
    resetStore();
    mockedRead.mockReset();
    mockedWrite.mockReset();
    mockedToastError.mockReset();
    seedClip();
  });

  it('hydrates segments and baseGrade from sidecar', async () => {
    const data: SidecarV2 = {
      version: SIDECAR_VERSION,
      markers: [],
      segments: [
        { id: 's1', in: 0, out: 5, playMode: 'normal', speed: 1 },
        { id: 's2', in: 10, out: 15, playMode: 'reverse', speed: 1.5 },
      ],
      baseGrade: { exposure: 0.25, lutId: 'rec709' },
    };
    mockedRead.mockResolvedValueOnce(data);
    await useClipDataStore.getState().load('clip-1');
    const entry = useClipDataStore.getState().entries['clip-1']!;
    expect(entry.segments).toEqual(data.segments);
    expect(entry.baseGrade).toEqual(data.baseGrade);
  });

  it('defaults to empty segments and baseGrade when no sidecar exists', async () => {
    mockedRead.mockResolvedValueOnce(undefined);
    await useClipDataStore.getState().load('clip-1');
    const entry = useClipDataStore.getState().entries['clip-1']!;
    expect(entry.segments).toEqual([]);
    expect(entry.baseGrade).toEqual({});
  });
});

describe('clipDataStore.addSegment', () => {
  beforeEach(() => {
    resetStore();
    mockedRead.mockReset();
    mockedWrite.mockReset();
    mockedToastError.mockReset();
    seedClip();
    mockedWrite.mockResolvedValue();
  });

  it('inserts a segment with default playMode/speed, returns its id, writes sidecar', async () => {
    const id = useClipDataStore.getState().addSegment('clip-1', 1, 3);
    expect(typeof id).toBe('string');
    expect((id as string).length).toBeGreaterThan(0);
    const entry = useClipDataStore.getState().entries['clip-1']!;
    expect(entry.segments).toEqual([
      { id, in: 1, out: 3, playMode: 'normal', speed: 1 },
    ]);
    await flush();
    expect(mockedWrite).toHaveBeenCalledTimes(1);
    const payload = mockedWrite.mock.calls[0]![2];
    expect(payload.segments).toEqual([
      { id, in: 1, out: 3, playMode: 'normal', speed: 1 },
    ]);
  });

  it('honors options for playMode/speed/label', async () => {
    const id = useClipDataStore.getState().addSegment('clip-1', 5, 7, {
      playMode: 'reverse',
      speed: 2,
      label: 'whip',
    });
    const entry = useClipDataStore.getState().entries['clip-1']!;
    expect(entry.segments[0]).toEqual({
      id,
      in: 5,
      out: 7,
      playMode: 'reverse',
      speed: 2,
      label: 'whip',
    });
    await flush();
    expect(mockedWrite).toHaveBeenCalledTimes(1);
  });

  it('rejects an overlapping range without mutating state or writing', async () => {
    useClipDataStore.getState().addSegment('clip-1', 0, 5);
    await flush();
    mockedWrite.mockClear();
    const result = useClipDataStore.getState().addSegment('clip-1', 3, 7);
    expect(result).toBeUndefined();
    const entry = useClipDataStore.getState().entries['clip-1']!;
    expect(entry.segments).toHaveLength(1);
    await flush();
    expect(mockedWrite).not.toHaveBeenCalled();
  });

  it('rejects an invalid range (in >= out) without writing', async () => {
    const result = useClipDataStore.getState().addSegment('clip-1', 5, 5);
    expect(result).toBeUndefined();
    const entry = useClipDataStore.getState().entries['clip-1'];
    expect(entry?.segments ?? []).toEqual([]);
    await flush();
    expect(mockedWrite).not.toHaveBeenCalled();
  });
});

describe('clipDataStore.updateSegment', () => {
  beforeEach(() => {
    resetStore();
    mockedRead.mockReset();
    mockedWrite.mockReset();
    mockedToastError.mockReset();
    seedClip();
    mockedWrite.mockResolvedValue();
  });

  it('applies a patch and writes sidecar', async () => {
    const id = useClipDataStore.getState().addSegment('clip-1', 0, 4)!;
    await flush();
    mockedWrite.mockClear();
    useClipDataStore
      .getState()
      .updateSegment('clip-1', id, { speed: 0.5, label: 'slowmo' });
    await flush();
    const entry = useClipDataStore.getState().entries['clip-1']!;
    expect(entry.segments[0]!.speed).toBe(0.5);
    expect(entry.segments[0]!.label).toBe('slowmo');
    expect(mockedWrite).toHaveBeenCalledTimes(1);
  });

  it('rejects a patch that would overlap a neighbor; no state or write change', async () => {
    const a = useClipDataStore.getState().addSegment('clip-1', 0, 4)!;
    useClipDataStore.getState().addSegment('clip-1', 5, 10);
    await flushWrites();
    mockedWrite.mockClear();
    const before = useClipDataStore.getState().entries['clip-1']!.segments;
    useClipDataStore.getState().updateSegment('clip-1', a, { out: 7 });
    const after = useClipDataStore.getState().entries['clip-1']!.segments;
    expect(after).toEqual(before);
    await flushWrites();
    expect(mockedWrite).not.toHaveBeenCalled();
  });
});

describe('clipDataStore.removeSegment', () => {
  beforeEach(() => {
    resetStore();
    mockedRead.mockReset();
    mockedWrite.mockReset();
    mockedToastError.mockReset();
    seedClip();
    mockedWrite.mockResolvedValue();
  });

  it('removes the segment and writes the remainder', async () => {
    const a = useClipDataStore.getState().addSegment('clip-1', 0, 4)!;
    const b = useClipDataStore.getState().addSegment('clip-1', 5, 10)!;
    await flush();
    mockedWrite.mockClear();
    useClipDataStore.getState().removeSegment('clip-1', a);
    await flush();
    const entry = useClipDataStore.getState().entries['clip-1']!;
    expect(entry.segments.map((s) => s.id)).toEqual([b]);
    expect(mockedWrite).toHaveBeenCalledTimes(1);
    const payload = mockedWrite.mock.calls[0]![2];
    expect(payload.segments.map((s) => s.id)).toEqual([b]);
  });
});

describe('clipDataStore.splitAtTime', () => {
  beforeEach(() => {
    resetStore();
    mockedRead.mockReset();
    mockedWrite.mockReset();
    mockedToastError.mockReset();
    seedClip();
    mockedWrite.mockResolvedValue();
  });

  it('splits a segment into two contiguous halves at the given time', async () => {
    const id = useClipDataStore.getState().addSegment('clip-1', 0, 10, {
      label: 'whole',
      speed: 1.5,
    })!;
    await flush();
    mockedWrite.mockClear();
    const result = useClipDataStore.getState().splitAtTime('clip-1', 4);
    expect(result).toBeDefined();
    const [leftId, rightId] = result!;
    expect(typeof leftId).toBe('string');
    expect(typeof rightId).toBe('string');
    const entry = useClipDataStore.getState().entries['clip-1']!;
    expect(entry.segments).toHaveLength(2);
    const left = entry.segments.find((s) => s.id === leftId)!;
    const right = entry.segments.find((s) => s.id === rightId)!;
    expect(left.in).toBe(0);
    expect(left.out).toBe(4);
    expect(right.in).toBe(4);
    expect(right.out).toBe(10);
    expect(left.speed).toBe(1.5);
    expect(right.speed).toBe(1.5);
    expect(left.id).not.toBe(id);
    expect(right.id).not.toBe(id);
    await flush();
    expect(mockedWrite).toHaveBeenCalledTimes(1);
  });

  it('returns undefined when time falls in a discard region', async () => {
    useClipDataStore.getState().addSegment('clip-1', 0, 2);
    useClipDataStore.getState().addSegment('clip-1', 5, 8);
    await flushWrites();
    mockedWrite.mockClear();
    const result = useClipDataStore.getState().splitAtTime('clip-1', 3);
    expect(result).toBeUndefined();
    const entry = useClipDataStore.getState().entries['clip-1']!;
    expect(entry.segments).toHaveLength(2);
    await flushWrites();
    expect(mockedWrite).not.toHaveBeenCalled();
  });

  it('returns undefined when segments[] is empty', async () => {
    const result = useClipDataStore.getState().splitAtTime('clip-1', 3);
    expect(result).toBeUndefined();
    await flush();
    expect(mockedWrite).not.toHaveBeenCalled();
  });

  it('returns undefined when time is exactly on a segment boundary', async () => {
    useClipDataStore.getState().addSegment('clip-1', 0, 5);
    await flush();
    mockedWrite.mockClear();
    expect(useClipDataStore.getState().splitAtTime('clip-1', 0)).toBeUndefined();
    expect(useClipDataStore.getState().splitAtTime('clip-1', 5)).toBeUndefined();
    await flush();
    expect(mockedWrite).not.toHaveBeenCalled();
  });
});

describe('clipDataStore segment convenience setters', () => {
  beforeEach(() => {
    resetStore();
    mockedRead.mockReset();
    mockedWrite.mockReset();
    mockedToastError.mockReset();
    seedClip();
    mockedWrite.mockResolvedValue();
  });

  it('setSegmentPlayMode updates playMode and writes', async () => {
    const id = useClipDataStore.getState().addSegment('clip-1', 0, 4)!;
    await flush();
    mockedWrite.mockClear();
    useClipDataStore.getState().setSegmentPlayMode('clip-1', id, 'freeze');
    await flush();
    const entry = useClipDataStore.getState().entries['clip-1']!;
    expect(entry.segments[0]!.playMode).toBe('freeze');
    expect(mockedWrite).toHaveBeenCalledTimes(1);
  });

  it('setSegmentSpeed updates speed and writes', async () => {
    const id = useClipDataStore.getState().addSegment('clip-1', 0, 4)!;
    await flush();
    mockedWrite.mockClear();
    useClipDataStore.getState().setSegmentSpeed('clip-1', id, 2);
    await flush();
    const entry = useClipDataStore.getState().entries['clip-1']!;
    expect(entry.segments[0]!.speed).toBe(2);
    expect(mockedWrite).toHaveBeenCalledTimes(1);
  });

  it('setSegmentFreezeDuration updates freezeDurationSec and writes', async () => {
    const id = useClipDataStore.getState().addSegment('clip-1', 0, 4)!;
    await flush();
    mockedWrite.mockClear();
    useClipDataStore.getState().setSegmentFreezeDuration('clip-1', id, 1.5);
    await flush();
    const entry = useClipDataStore.getState().entries['clip-1']!;
    expect(entry.segments[0]!.freezeDurationSec).toBe(1.5);
    expect(mockedWrite).toHaveBeenCalledTimes(1);
  });
});
