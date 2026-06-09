import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Segment } from '~/fs/clipSidecar';
import { useClipDataStore } from '~/state/clipDataStore';
import { useClipsStore } from '~/state/clipsStore';
import { useEditModeStore } from '~/state/editModeStore';
import { useEditStore } from '~/state/editStore';

import { useGlobalShortcuts } from '../shortcuts';

vi.mock('~/fs/clipSidecar', async () => {
  const actual =
    await vi.importActual<typeof import('~/fs/clipSidecar')>(
      '~/fs/clipSidecar',
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
        readOnly: true,
      },
    },
  });
  useEditStore.setState({ duration, fps: 30, currentTime: 0 });
}

beforeEach(() => {
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
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('shortcuts — Cut interactivity', () => {
  it('S key splits at currentTime when inside a segment', () => {
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
    const splitSpy = vi.spyOn(useClipDataStore.getState(), 'splitAtTime');

    render(<Harness />);
    fireEvent.keyDown(window, { key: 's' });

    expect(splitSpy).toHaveBeenCalledWith('clip-1', 2);
  });

  it('S key adds a segment around currentTime when no segments exist', () => {
    seedClip([], 10);
    useEditStore.setState({ currentTime: 4 });
    const addSpy = vi.spyOn(useClipDataStore.getState(), 'addSegment');

    render(<Harness />);
    fireEvent.keyDown(window, { key: 's' });

    expect(addSpy).toHaveBeenCalledTimes(1);
    const [clipId, inSec, outSec] = addSpy.mock.calls[0]!;
    expect(clipId).toBe('clip-1');
    expect(inSec).toBeCloseTo(3, 5);
    expect(outSec).toBeCloseTo(5, 5);
  });

  it('S key is a no-op when segments exist but playhead is outside all of them', () => {
    seedClip(
      [
        { id: 'a', in: 6, out: 8, playMode: 'normal', speed: 1 },
      ],
      10,
    );
    useEditStore.setState({ currentTime: 2 });
    const splitSpy = vi.spyOn(useClipDataStore.getState(), 'splitAtTime');
    const addSpy = vi.spyOn(useClipDataStore.getState(), 'addSegment');

    render(<Harness />);
    fireEvent.keyDown(window, { key: 's' });

    expect(splitSpy).toHaveBeenCalledWith('clip-1', 2);
    expect(splitSpy.mock.results[0]!.value).toBeUndefined();
    expect(addSpy).not.toHaveBeenCalled();
  });

  it('S key is a no-op when no clip is selected', () => {
    useClipsStore.setState({ selectedClipId: undefined });
    const splitSpy = vi.spyOn(useClipDataStore.getState(), 'splitAtTime');

    render(<Harness />);
    fireEvent.keyDown(window, { key: 's' });

    expect(splitSpy).not.toHaveBeenCalled();
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
