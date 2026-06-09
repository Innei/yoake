import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Segment } from '~/fs/clipSidecar';
import { useClipDataStore } from '~/state/clipDataStore';
import { useClipsStore } from '~/state/clipsStore';
import { useEditModeStore } from '~/state/editModeStore';
import { useEditStore } from '~/state/editStore';

import { SegmentInspector } from '../SegmentInspector';

const fileHandle = {} as FileSystemFileHandle;

function makeSegment(overrides: Partial<Segment> = {}): Segment {
  return {
    id: 'seg-1',
    in: 1.5,
    out: 4.25,
    playMode: 'normal',
    speed: 1,
    label: 'A',
    ...overrides,
  };
}

function seed(segment: Segment): void {
  useClipsStore.setState({
    clips: [{ id: 'clip-1', name: 'DJI.MP4', handle: fileHandle, lastModified: 0, size: 0 }],
    selectedClipId: 'clip-1',
    directoryHandle: undefined,
  });
  useClipDataStore.setState({
    entries: {
      'clip-1': {
        markers: [],
        segments: [segment],
        baseGrade: {},
        status: 'idle',
        readOnly: false,
      },
    },
  });
  useEditModeStore.setState({
    mode: 'edit',
    outlineSelection: { kind: 'segment', id: segment.id },
  });
  useEditStore.setState({ currentTime: 2 });
}

beforeEach(() => {
  useClipsStore.setState({ clips: [], selectedClipId: undefined, directoryHandle: undefined });
  useClipDataStore.setState({ entries: {} });
  useEditModeStore.setState({ mode: 'view', outlineSelection: { kind: 'none' } });
  useEditStore.setState({ currentTime: 0 });
});

afterEach(() => {
  cleanup();
});

describe('SegmentInspector', () => {
  it('renders fields populated from the selected segment', () => {
    seed(makeSegment());
    const { getByTestId } = render(<SegmentInspector />);

    expect(getByTestId('segment-inspector')).toBeTruthy();
    expect((getByTestId('segment-in-input') as HTMLInputElement).value).toBe(
      '00:00:01.500',
    );
    expect((getByTestId('segment-out-input') as HTMLInputElement).value).toBe(
      '00:00:04.250',
    );
    expect(getByTestId('segment-duration').textContent).toContain('00:00:02.750');
    expect((getByTestId('segment-label-input') as HTMLInputElement).value).toBe(
      'A',
    );
    const normal = getByTestId('segment-playmode-normal') as HTMLInputElement;
    expect(normal.checked).toBe(true);
  });

  it('commits a new label on blur via updateSegment', () => {
    seed(makeSegment());
    const spy = vi.spyOn(useClipDataStore.getState(), 'updateSegment');
    const { getByTestId } = render(<SegmentInspector />);
    const input = getByTestId('segment-label-input') as HTMLInputElement;

    fireEvent.change(input, { target: { value: 'hero' } });
    fireEvent.blur(input);

    expect(spy).toHaveBeenCalledWith('clip-1', 'seg-1', { label: 'hero' });
    spy.mockRestore();
  });

  it('changing playMode calls setSegmentPlayMode', () => {
    seed(makeSegment());
    const spy = vi.spyOn(useClipDataStore.getState(), 'setSegmentPlayMode');
    const { getByTestId } = render(<SegmentInspector />);

    fireEvent.click(getByTestId('segment-playmode-reverse'));

    expect(spy).toHaveBeenCalledWith('clip-1', 'seg-1', 'reverse');
    spy.mockRestore();
  });

  it('"Delete segment" removes the segment and clears selection', () => {
    seed(makeSegment());
    const removeSpy = vi.spyOn(useClipDataStore.getState(), 'removeSegment');
    const clearSpy = vi.spyOn(useEditModeStore.getState(), 'clearSelection');

    const { getByTestId } = render(<SegmentInspector />);
    fireEvent.click(getByTestId('segment-delete'));

    expect(removeSpy).toHaveBeenCalledWith('clip-1', 'seg-1');
    expect(clearSpy).toHaveBeenCalledTimes(1);

    removeSpy.mockRestore();
    clearSpy.mockRestore();
  });

  it('"Split here" calls splitAtTime with editStore.currentTime', () => {
    seed(makeSegment());
    useEditStore.setState({ currentTime: 2.75 });
    const spy = vi.spyOn(useClipDataStore.getState(), 'splitAtTime');

    const { getByTestId } = render(<SegmentInspector />);
    fireEvent.click(getByTestId('segment-split'));

    expect(spy).toHaveBeenCalledWith('clip-1', 2.75);
    spy.mockRestore();
  });

  it('"Jump to in" / "Jump to out" update currentTime', () => {
    seed(makeSegment());
    const spy = vi.spyOn(useEditStore.getState(), 'setCurrentTime');

    const { getByTestId } = render(<SegmentInspector />);
    fireEvent.click(getByTestId('segment-jump-in'));
    expect(spy).toHaveBeenCalledWith(1.5);
    fireEvent.click(getByTestId('segment-jump-out'));
    expect(spy).toHaveBeenCalledWith(4.25);

    spy.mockRestore();
  });

  it('shows empty state when the selected segment id is not in store', () => {
    useClipsStore.setState({
      clips: [{ id: 'clip-1', name: 'DJI.MP4', handle: fileHandle, lastModified: 0, size: 0 }],
      selectedClipId: 'clip-1',
    });
    useClipDataStore.setState({
      entries: {
        'clip-1': {
          markers: [],
          segments: [],
          baseGrade: {},
          status: 'idle',
          readOnly: false,
        },
      },
    });
    useEditModeStore.setState({
      mode: 'edit',
      outlineSelection: { kind: 'segment', id: 'ghost' },
    });

    const clearSpy = vi.spyOn(useEditModeStore.getState(), 'clearSelection');
    const { getByTestId } = render(<SegmentInspector />);

    expect(getByTestId('segment-inspector-empty').textContent).toContain(
      'Segment not found',
    );
    fireEvent.click(getByTestId('segment-inspector-clear'));
    expect(clearSpy).toHaveBeenCalled();
    clearSpy.mockRestore();
  });

  it('parses HH:MM:SS.mmm input on blur and calls updateSegment', () => {
    seed(makeSegment());
    const spy = vi.spyOn(useClipDataStore.getState(), 'updateSegment');
    const { getByTestId } = render(<SegmentInspector />);
    const inInput = getByTestId('segment-in-input') as HTMLInputElement;

    fireEvent.change(inInput, { target: { value: '00:00:02.000' } });
    fireEvent.blur(inInput);

    expect(spy).toHaveBeenCalledWith('clip-1', 'seg-1', { in: 2 });
    spy.mockRestore();
  });
});
