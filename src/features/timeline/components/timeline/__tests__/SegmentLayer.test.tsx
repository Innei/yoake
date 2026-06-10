import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Segment } from '~/lib/fs/clipSidecar';
import { useClipDataStore } from '~/features/clips/clipDataStore';
import { useClipsStore } from '~/features/clips/clipsStore';
import { useEditModeStore } from '~/features/edit/editModeStore';
import { useEditStore } from '~/features/edit/editStore';

import { SegmentLayer } from '../SegmentLayer';
import { TimelineTestProvider } from './testHelpers';

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
  useEditStore.setState({ duration, fps });
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
  useEditModeStore.setState({ mode: 'edit', outlineSelection: { kind: 'none' } });
  if (!('PointerEvent' in window)) {
    class PE extends Event {
      clientX: number;
      clientY: number;
      pointerId: number;
      constructor(type: string, init: PointerEventInit = {}) {
        super(type, init);
        this.clientX = init.clientX ?? 0;
        this.clientY = init.clientY ?? 0;
        this.pointerId = init.pointerId ?? 1;
      }
    }
    (window as unknown as { PointerEvent: typeof PE }).PointerEvent = PE;
  }
  Element.prototype.setPointerCapture =
    Element.prototype.setPointerCapture ?? (() => {});
  Element.prototype.releasePointerCapture =
    Element.prototype.releasePointerCapture ?? (() => {});
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('SegmentLayer', () => {
  it('renders one band per segment', () => {
    seedClip([
      makeSegment({ id: 'a', in: 0, out: 2 }),
      makeSegment({ id: 'b', in: 4, out: 6 }),
    ]);
    const { getByTestId } = render(
      <TimelineTestProvider duration={10}>
        <SegmentLayer />
      </TimelineTestProvider>,
    );
    expect(getByTestId('transport-segment-layer')).toBeTruthy();
    expect(getByTestId('transport-segment-band-a')).toBeTruthy();
    expect(getByTestId('transport-segment-band-b')).toBeTruthy();
  });

  it('positions a band by in/out as percentage of duration', () => {
    seedClip([makeSegment({ id: 'a', in: 2, out: 5 })], 10);
    const { getByTestId } = render(
      <TimelineTestProvider duration={10}>
        <SegmentLayer />
      </TimelineTestProvider>,
    );
    const band = getByTestId('transport-segment-band-a') as HTMLDivElement;
    expect(band.style.left).toBe('20%');
    expect(band.style.width).toBe('30%');
  });

  it('drags the right-edge handle and updates segment.out', () => {
    seedClip([makeSegment({ id: 'a', in: 1, out: 3 })], 10, 30);
    const spy = vi.spyOn(useClipDataStore.getState(), 'updateSegment');

    const { getByTestId } = render(
      <TimelineTestProvider duration={10} fps={30}>
        <SegmentLayer />
      </TimelineTestProvider>,
    );
    const track = getByTestId('timeline-test-track');
    mockRect(track, 200, 0);
    const handle = getByTestId('transport-segment-handle-a-out') as HTMLDivElement;

    fireEvent.pointerDown(handle, { pointerId: 1, clientX: 60 });
    fireEvent.pointerMove(handle, { pointerId: 1, clientX: 100 });
    fireEvent.pointerUp(handle, { pointerId: 1, clientX: 100 });

    expect(spy).toHaveBeenCalled();
    const lastCall = spy.mock.calls.at(-1)!;
    expect(lastCall[0]).toBe('clip-1');
    expect(lastCall[1]).toBe('a');
    const patch = lastCall[2] as { out?: number };
    expect(patch.out).toBeCloseTo(5, 5);
  });

  it('clamps drag so it cannot cross the next neighbor', () => {
    seedClip(
      [
        makeSegment({ id: 'a', in: 0, out: 2 }),
        makeSegment({ id: 'b', in: 5, out: 7 }),
      ],
      10,
      30,
    );
    const spy = vi.spyOn(useClipDataStore.getState(), 'updateSegment');

    const { getByTestId } = render(
      <TimelineTestProvider duration={10} fps={30}>
        <SegmentLayer />
      </TimelineTestProvider>,
    );
    const track = getByTestId('timeline-test-track');
    mockRect(track, 200, 0);
    const handle = getByTestId('transport-segment-handle-a-out') as HTMLDivElement;

    fireEvent.pointerDown(handle, { pointerId: 1, clientX: 40 });
    fireEvent.pointerMove(handle, { pointerId: 1, clientX: 180 });
    fireEvent.pointerUp(handle, { pointerId: 1, clientX: 180 });

    expect(spy).toHaveBeenCalled();
    const lastCall = spy.mock.calls.at(-1)!;
    const patch = lastCall[2] as { out?: number };
    expect(patch.out).toBeLessThanOrEqual(5);
    expect(patch.out).toBeGreaterThan(0);
  });

  it('view mode renders no handles and ignores band click', () => {
    seedClip([makeSegment({ id: 'a', in: 1, out: 3 })], 10);
    useEditModeStore.setState({ mode: 'view' });
    const updateSpy = vi.spyOn(useClipDataStore.getState(), 'updateSegment');
    const selectSpy = vi.spyOn(useEditModeStore.getState(), 'selectSegment');

    const { getByTestId, queryByTestId } = render(
      <TimelineTestProvider readOnly duration={10}>
        <SegmentLayer />
      </TimelineTestProvider>,
    );
    expect(queryByTestId('transport-segment-handle-a-in')).toBeNull();
    expect(queryByTestId('transport-segment-handle-a-out')).toBeNull();

    const body = getByTestId('transport-segment-body-a') as HTMLButtonElement;
    fireEvent.click(body);

    expect(updateSpy).not.toHaveBeenCalled();
    expect(selectSpy).not.toHaveBeenCalled();
  });

  it('edit mode click on band body selects the segment', () => {
    seedClip([makeSegment({ id: 'a', in: 1, out: 3 })], 10);
    const selectSpy = vi.spyOn(useEditModeStore.getState(), 'selectSegment');

    const { getByTestId } = render(
      <TimelineTestProvider duration={10}>
        <SegmentLayer />
      </TimelineTestProvider>,
    );
    const body = getByTestId('transport-segment-body-a') as HTMLButtonElement;
    fireEvent.click(body);

    expect(selectSpy).toHaveBeenCalledWith('a');
  });

  it('exposes a hover title with in/out, playMode and speed', () => {
    seedClip(
      [makeSegment({ id: 'a', in: 1, out: 3, playMode: 'reverse', speed: 0.5 })],
      10,
    );
    const { getByTestId } = render(
      <TimelineTestProvider duration={10}>
        <SegmentLayer />
      </TimelineTestProvider>,
    );
    const body = getByTestId('transport-segment-body-a') as HTMLButtonElement;
    const title = body.getAttribute('title') ?? '';
    expect(title).toContain('reverse');
    expect(title).toContain('0.50x');
  });
});
