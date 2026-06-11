import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useClipDataStore } from '~/features/clips/clipDataStore';
import { useClipsStore } from '~/features/clips/clipsStore';
import { useEditModeStore } from '~/features/edit/editModeStore';
import { useEditStore } from '~/features/edit/editStore';
import type { Segment } from '~/lib/fs/clipSidecar';

import { useGlobalShortcuts } from '../shortcuts';

vi.mock('~/lib/fs/clipSidecar', async () => {
  const actual =
    await vi.importActual<typeof import('~/lib/fs/clipSidecar')>(
      '~/lib/fs/clipSidecar',
    );
  return {
    ...actual,
    readSidecar: vi.fn(),
    writeSidecar: vi.fn().mockResolvedValue(undefined),
  };
});

const fileHandle = {} as FileSystemFileHandle;

function Harness() {
  useGlobalShortcuts({ onShowHelp: () => {} });
  return null;
}

function seedClip(segments: Segment[] = [], duration = 10): void {
  useClipsStore.setState({
    clips: [
      { id: 'clip-1', name: 'DJI.MP4', handle: fileHandle, lastModified: 0, size: 0 },
    ],
    selectedClipId: 'clip-1',
    directoryHandle: undefined,
  });
  useClipDataStore.setState({
    entries: {
      'clip-1': {
        markers: [],
        segments,
        baseGrade: {},
        status: 'idle',
        readOnly: false,
      },
    },
  });
  useEditStore.setState({ duration, fps: 30, currentTime: 0 });
}

beforeEach(() => {
  // zustand setState copies spied actions onto a fresh state object, so
  // restoreAllMocks cannot reach them — clear call history explicitly
  vi.clearAllMocks();
  useClipsStore.setState({
    clips: [],
    selectedClipId: undefined,
    directoryHandle: undefined,
  });
  useClipDataStore.setState({ entries: {} });
  useEditStore.setState({ duration: 0, fps: 0, currentTime: 0 });
  useEditModeStore.setState({
    mode: 'edit',
    outlineSelection: { kind: 'none' },
    cutMode: { active: false },
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('shortcuts — Cut interactivity', () => {
  it('S key enters cut mode for the segment containing the playhead', () => {
    seedClip(
      [
        {
          id: 'a',
          in: 0,
          out: 5,
          playMode: 'normal',
          speed: 1,
        },
      ],
      10,
    );
    useEditStore.setState({ currentTime: 2 });

    render(<Harness />);
    fireEvent.keyDown(window, { key: 's' });

    const cut = useEditModeStore.getState().cutMode;
    expect(cut.active).toBe(true);
    expect(cut.active && cut.segmentId).toBe('a');
  });

  it('S key creates a segment around currentTime when none exist and enters cut mode', () => {
    seedClip([], 10);
    useEditStore.setState({ currentTime: 4 });
    const addSpy = vi.spyOn(useClipDataStore.getState(), 'addSegment');

    render(<Harness />);
    fireEvent.keyDown(window, { key: 's' });

    expect(addSpy).toHaveBeenCalledTimes(1);
    const [clipId, inSec, outSec] = addSpy.mock.calls[0]!;
    expect(clipId).toBe('clip-1');
    expect(inSec).toBeCloseTo(1.5, 5);
    expect(outSec).toBeCloseTo(6.5, 5);
    expect(useEditModeStore.getState().cutMode.active).toBe(true);
  });

  it('S key creates a segment between neighbours when playhead is outside any segment', () => {
    seedClip(
      [
        { id: 'a', in: 6, out: 8, playMode: 'normal', speed: 1 },
      ],
      10,
    );
    useEditStore.setState({ currentTime: 2 });
    const addSpy = vi.spyOn(useClipDataStore.getState(), 'addSegment');

    render(<Harness />);
    fireEvent.keyDown(window, { key: 's' });

    expect(addSpy).toHaveBeenCalledTimes(1);
    expect(useEditModeStore.getState().cutMode.active).toBe(true);
  });

  it('S key in cut mode exits cut mode', () => {
    seedClip(
      [
        { id: 'a', in: 0, out: 5, playMode: 'normal', speed: 1 },
      ],
      10,
    );
    useEditModeStore.setState({
      cutMode: { active: true, segmentId: 'a' },
    });

    render(<Harness />);
    fireEvent.keyDown(window, { key: 's' });

    expect(useEditModeStore.getState().cutMode.active).toBe(false);
  });

  it('S key is a no-op when no clip is selected', () => {
    useClipsStore.setState({ selectedClipId: undefined });

    render(<Harness />);
    fireEvent.keyDown(window, { key: 's' });

    expect(useEditModeStore.getState().cutMode.active).toBe(false);
  });

  it('S key is a no-op when an INPUT is focused', () => {
    seedClip([], 10);
    useEditStore.setState({ currentTime: 4 });
    const addSpy = vi.spyOn(useClipDataStore.getState(), 'addSegment');

    const input = document.createElement('input');
    document.body.append(input);
    input.focus();

    render(<Harness />);
    fireEvent.keyDown(input, { key: 's' });

    expect(addSpy).not.toHaveBeenCalled();
    input.remove();
  });

  it('Delete key removes a selected segment and clears selection', () => {
    seedClip(
      [{ id: 'a', in: 1, out: 3, playMode: 'normal', speed: 1 }],
      10,
    );
    useEditModeStore.setState({
      outlineSelection: { kind: 'segment', id: 'a' },
    });
    const removeSpy = vi.spyOn(useClipDataStore.getState(), 'removeSegment');

    render(<Harness />);
    fireEvent.keyDown(window, { key: 'Delete' });

    expect(removeSpy).toHaveBeenCalledWith('clip-1', 'a');
    expect(useEditModeStore.getState().outlineSelection.kind).toBe('none');
  });

  it('Delete key with no outline selection is a no-op', () => {
    seedClip(
      [{ id: 'a', in: 1, out: 3, playMode: 'normal', speed: 1 }],
      10,
    );
    const removeSegSpy = vi.spyOn(useClipDataStore.getState(), 'removeSegment');
    const removeMarkSpy = vi.spyOn(useClipDataStore.getState(), 'removeMarker');

    render(<Harness />);
    fireEvent.keyDown(window, { key: 'Delete' });

    expect(removeSegSpy).not.toHaveBeenCalled();
    expect(removeMarkSpy).not.toHaveBeenCalled();
  });
});
