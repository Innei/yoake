import { beforeEach, describe, expect, it, vi } from 'vitest';

import { toast } from '~/components/ui/toast/toastStore';
import {
  __resetClipDataStoreCachesForTests,
  useClipDataStore,
} from '~/features/clips/clipDataStore';
import { useClipsStore } from '~/features/clips/clipsStore';
import { useEditModeStore } from '~/features/edit/editModeStore';
import { useEditStore } from '~/features/edit/editStore';
import type { Segment } from '~/lib/fs/clipSidecar';

import { addPresetSegment, applyPresetRange } from '../addPresetSegment';

vi.mock('~/components/ui/toast/toastStore', () => ({
  toast: {
    warning: vi.fn(),
    info: vi.fn(),
    success: vi.fn(),
    error: vi.fn(),
  },
}));

const mockedWarning = vi.mocked(toast.warning);

function setupClip(segments: Segment[] = []): void {
  useClipsStore.setState({ selectedClipId: 'clip-1' });
  useClipDataStore.setState({
    entries: {
      'clip-1': {
        baseGrade: {},
        markers: [],
        readOnly: true,
        segments,
        status: 'idle',
      },
    },
  });
}

function segments(): Segment[] {
  return useClipDataStore.getState().entries['clip-1']!.segments;
}

beforeEach(() => {
  mockedWarning.mockReset();
  __resetClipDataStoreCachesForTests();
  useClipDataStore.setState({ entries: {} });
  useClipsStore.setState({ selectedClipId: undefined });
  useEditModeStore.setState({
    mode: 'edit',
    outlineSelection: { kind: 'none' },
    cutMode: { active: false },
  });
  useEditStore.setState({ currentTime: 30, duration: 60 });
});

describe('addPresetSegment', () => {
  it('creates a segment ending at the playhead for the before anchor', () => {
    setupClip();
    addPresetSegment('before', 10);
    expect(segments()).toHaveLength(1);
    expect(segments()[0]).toMatchObject({ in: 20, out: 30 });
  });

  it('creates a segment starting at the playhead for the after anchor', () => {
    setupClip();
    addPresetSegment('after', 10);
    expect(segments()[0]).toMatchObject({ in: 30, out: 40 });
  });

  it('creates a centered segment for the center anchor', () => {
    setupClip();
    addPresetSegment('center', 10);
    expect(segments()[0]).toMatchObject({ in: 25, out: 35 });
  });

  it('selects the new segment without entering cut mode', () => {
    setupClip();
    addPresetSegment('center', 10);
    const id = segments()[0]!.id;
    expect(useEditModeStore.getState().outlineSelection).toEqual({
      kind: 'segment',
      id,
    });
    expect(useEditModeStore.getState().cutMode).toEqual({ active: false });
  });

  it('clamps against clip bounds', () => {
    setupClip();
    useEditStore.setState({ currentTime: 3 });
    addPresetSegment('before', 10);
    expect(segments()[0]).toMatchObject({ in: 0, out: 3 });
  });

  it('shrinks against existing segments', () => {
    setupClip([
      { id: 's1', in: 35, out: 50, playMode: 'normal', speed: 1 },
    ]);
    addPresetSegment('after', 10);
    expect(segments()).toHaveLength(2);
    expect(segments()[0]).toMatchObject({ in: 30, out: 35 });
  });

  it('warns and creates nothing when there is no room', () => {
    setupClip([
      { id: 's1', in: 20, out: 40, playMode: 'normal', speed: 1 },
    ]);
    addPresetSegment('center', 10);
    expect(segments()).toHaveLength(1);
    expect(mockedWarning).toHaveBeenCalledWith('No room for a segment here');
    expect(useEditModeStore.getState().outlineSelection).toEqual({
      kind: 'none',
    });
  });

  it('does nothing outside edit mode', () => {
    setupClip();
    useEditModeStore.setState({ mode: 'view' });
    addPresetSegment('center', 10);
    expect(segments()).toHaveLength(0);
  });

  it('does nothing when no clip is selected', () => {
    useClipsStore.setState({ selectedClipId: undefined });
    addPresetSegment('center', 10);
    expect(mockedWarning).not.toHaveBeenCalled();
  });
});

describe('applyPresetRange', () => {
  it('re-anchors the segment range around the playhead', () => {
    setupClip([{ id: 's1', in: 2, out: 6, playMode: 'normal', speed: 1 }]);
    applyPresetRange('clip-1', 's1', 'center', 10);
    expect(segments()[0]).toMatchObject({ id: 's1', in: 25, out: 35 });
  });

  it('clamps against other segments but not itself', () => {
    setupClip([
      { id: 's1', in: 28, out: 32, playMode: 'normal', speed: 1 },
      { id: 's2', in: 34, out: 50, playMode: 'normal', speed: 1 },
    ]);
    applyPresetRange('clip-1', 's1', 'center', 10);
    expect(segments().find((s) => s.id === 's1')).toMatchObject({
      in: 25,
      out: 34,
    });
  });

  it('warns and leaves the segment unchanged when there is no room', () => {
    setupClip([
      { id: 's1', in: 2, out: 6, playMode: 'normal', speed: 1 },
      { id: 's2', in: 20, out: 40, playMode: 'normal', speed: 1 },
    ]);
    applyPresetRange('clip-1', 's1', 'center', 10);
    expect(segments().find((s) => s.id === 's1')).toMatchObject({
      in: 2,
      out: 6,
    });
    expect(mockedWarning).toHaveBeenCalledWith('No room for a segment here');
  });

  it('does nothing for an unknown segment id', () => {
    setupClip([{ id: 's1', in: 2, out: 6, playMode: 'normal', speed: 1 }]);
    applyPresetRange('clip-1', 'missing', 'center', 10);
    expect(segments()[0]).toMatchObject({ in: 2, out: 6 });
    expect(mockedWarning).not.toHaveBeenCalled();
  });
});
