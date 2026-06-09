import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Segment } from '~/fs/clipSidecar';
import { useClipDataStore } from '~/state/clipDataStore';
import { useClipsStore } from '~/state/clipsStore';
import { useEditModeStore } from '~/state/editModeStore';
import { useEditStore } from '~/state/editStore';

import { SegmentLayer } from '../SegmentLayer';

const fileHandle = {} as FileSystemFileHandle;

function seedClip(segments: Segment[], duration = 10, fps = 30): void {
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
  useEditStore.setState({ duration, fps, currentTime: 0 });
}

function makeSegment(overrides: Partial<Segment> = {}): Segment {
  return {
    id: 'seg-a',
    in: 1,
    out: 3,
    playMode: 'normal',
    speed: 1,
    ...overrides,
  };
}

function mockRect(el: HTMLElement, width = 200, left = 0): void {
  vi.spyOn(el, 'getBoundingClientRect').mockReturnValue({
    bottom: 20,
    height: 20,
    left,
    right: left + width,
    top: 0,
    width,
    x: left,
    y: 0,
    toJSON: () => ({}),
  });
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

describe('SegmentLayer context menu', () => {
  it('right-click on a band opens the 4-item menu', async () => {
    seedClip([makeSegment({ id: 'a', in: 1, out: 3 })], 10);
    const { getByTestId } = render(<SegmentLayer />);
    const band = getByTestId('transport-segment-band-a');

    fireEvent.contextMenu(band, { clientX: 50 });

    expect(await screen.findByText('Split here')).toBeTruthy();
    expect(screen.getByText('Jump to in')).toBeTruthy();
    expect(screen.getByText('Jump to out')).toBeTruthy();
    expect(screen.getByText('Delete segment')).toBeTruthy();
  });

  it('right-click "Split here" splits at the click position', async () => {
    seedClip([makeSegment({ id: 'a', in: 0, out: 6 })], 10, 30);
    const splitSpy = vi.spyOn(useClipDataStore.getState(), 'splitAtTime');

    const { getByTestId } = render(<SegmentLayer />);
    const layer = getByTestId('transport-segment-layer') as HTMLDivElement;
    mockRect(layer, 200, 0);
    const band = getByTestId('transport-segment-band-a');
    mockRect(band as HTMLElement, 120, 0);

    fireEvent.contextMenu(band, { clientX: 80 });

    const splitItem = await screen.findByText('Split here');
    fireEvent.click(splitItem);

    expect(splitSpy).toHaveBeenCalledTimes(1);
    const args = splitSpy.mock.calls[0]!;
    expect(args[0]).toBe('clip-1');
    expect(args[1]).toBeCloseTo(4, 1);
  });

  it('right-click "Delete segment" calls removeSegment', async () => {
    seedClip([makeSegment({ id: 'a', in: 1, out: 3 })], 10);
    const removeSpy = vi.spyOn(useClipDataStore.getState(), 'removeSegment');

    const { getByTestId } = render(<SegmentLayer />);
    const band = getByTestId('transport-segment-band-a');
    fireEvent.contextMenu(band, { clientX: 50 });

    const item = await screen.findByText('Delete segment');
    fireEvent.click(item);

    expect(removeSpy).toHaveBeenCalledWith('clip-1', 'a');
  });

  it('right-click on empty area opens "Add marker here"', async () => {
    seedClip([], 10);
    const { getByTestId } = render(<SegmentLayer />);
    const trigger = getByTestId('transport-segment-empty-trigger');

    fireEvent.contextMenu(trigger, { clientX: 50 });

    expect(await screen.findByText('Add marker here')).toBeTruthy();
  });

  it('"Add marker here" calls addMarker at the click time', async () => {
    seedClip([], 10);
    const addSpy = vi.spyOn(useClipDataStore.getState(), 'addMarker');

    const { getByTestId } = render(<SegmentLayer />);
    const layer = getByTestId('transport-segment-layer') as HTMLDivElement;
    mockRect(layer, 200, 0);
    const trigger = getByTestId('transport-segment-empty-trigger');
    mockRect(trigger as HTMLElement, 200, 0);
    fireEvent.contextMenu(trigger, { clientX: 100 });

    const item = await screen.findByText('Add marker here');
    fireEvent.click(item);

    expect(addSpy).toHaveBeenCalled();
    const [clipId, time] = addSpy.mock.calls[0]!;
    expect(clipId).toBe('clip-1');
    expect(time).toBeCloseTo(5, 1);
  });

  it('view mode does not open a context menu on the band', () => {
    seedClip([makeSegment({ id: 'a', in: 1, out: 3 })], 10);
    useEditModeStore.setState({ mode: 'view' });

    const { getByTestId } = render(<SegmentLayer readOnly />);
    const band = getByTestId('transport-segment-band-a');
    fireEvent.contextMenu(band, { clientX: 50 });

    expect(screen.queryByText('Split here')).toBeNull();
    expect(screen.queryByText('Add marker here')).toBeNull();
  });
});
