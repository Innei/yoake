import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Segment } from '~/lib/fs/clipSidecar';
import { useClipDataStore } from '~/features/clips/clipDataStore';
import { useClipsStore } from '~/features/clips/clipsStore';
import { useEditModeStore } from '~/features/edit/editModeStore';
import { useEditStore } from '~/features/edit/editStore';

import { SegmentInspector } from '../components/SegmentInspector';

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

  it('normal playMode: shows speed chips, no freeze input', () => {
    seed(makeSegment({ playMode: 'normal' }));
    const { getByTestId, queryByTestId } = render(<SegmentInspector />);
    expect(getByTestId('segment-speed-chips')).toBeTruthy();
    expect(getByTestId('segment-speed-input')).toBeTruthy();
    expect(queryByTestId('segment-freeze-input')).toBeNull();
    expect(queryByTestId('segment-reverse-hint')).toBeNull();
  });

  it('freeze playMode: shows freeze input, no speed chips', () => {
    seed(makeSegment({ playMode: 'freeze', freezeDurationSec: 2 }));
    const { getByTestId, queryByTestId } = render(<SegmentInspector />);
    expect(getByTestId('segment-freeze-input')).toBeTruthy();
    expect(queryByTestId('segment-speed-chips')).toBeNull();
  });

  it('reverse playMode: shows speed chips and reverse hint', () => {
    seed(makeSegment({ playMode: 'reverse' }));
    const { getByTestId } = render(<SegmentInspector />);
    expect(getByTestId('segment-speed-chips')).toBeTruthy();
    expect(getByTestId('segment-reverse-hint').textContent).toContain(
      'Preview plays normal direction',
    );
  });

  it('clicking a speed preset chip calls setSegmentSpeed', () => {
    seed(makeSegment({ playMode: 'normal', speed: 1 }));
    const spy = vi.spyOn(useClipDataStore.getState(), 'setSegmentSpeed');
    const { getByTestId } = render(<SegmentInspector />);

    fireEvent.click(getByTestId('segment-speed-2'));

    expect(spy).toHaveBeenCalledWith('clip-1', 'seg-1', 2);
    spy.mockRestore();
  });

  it('numeric speed input commits on blur', () => {
    seed(makeSegment({ playMode: 'normal', speed: 1 }));
    const spy = vi.spyOn(useClipDataStore.getState(), 'setSegmentSpeed');
    const { getByTestId } = render(<SegmentInspector />);
    const input = getByTestId('segment-speed-input') as HTMLInputElement;

    fireEvent.change(input, { target: { value: '1.75' } });
    fireEvent.blur(input);

    expect(spy).toHaveBeenCalledWith('clip-1', 'seg-1', 1.75);
    spy.mockRestore();
  });

  it('freeze duration input commits on blur', () => {
    seed(makeSegment({ playMode: 'freeze', freezeDurationSec: 2 }));
    const spy = vi.spyOn(useClipDataStore.getState(), 'setSegmentFreezeDuration');
    const { getByTestId } = render(<SegmentInspector />);
    const input = getByTestId('segment-freeze-input') as HTMLInputElement;

    fireEvent.change(input, { target: { value: '3.5' } });
    fireEvent.blur(input);

    expect(spy).toHaveBeenCalledWith('clip-1', 'seg-1', 3.5);
    spy.mockRestore();
  });

  it('switching to freeze playMode sets default freezeDurationSec when undefined', () => {
    seed(makeSegment({ playMode: 'normal' }));
    const freezeSpy = vi.spyOn(
      useClipDataStore.getState(),
      'setSegmentFreezeDuration',
    );
    const modeSpy = vi.spyOn(useClipDataStore.getState(), 'setSegmentPlayMode');
    const { getByTestId } = render(<SegmentInspector />);

    fireEvent.click(getByTestId('segment-playmode-freeze'));

    expect(modeSpy).toHaveBeenCalledWith('clip-1', 'seg-1', 'freeze');
    expect(freezeSpy).toHaveBeenCalledWith('clip-1', 'seg-1', 2);
    modeSpy.mockRestore();
    freezeSpy.mockRestore();
  });
});

describe('SegmentInspector grade override toggle', () => {
  it('toggle reflects gradeOverride === undefined (off)', () => {
    seed(makeSegment());
    const { getByTestId } = render(<SegmentInspector />);
    const toggle = getByTestId('segment-grade-override-toggle');
    expect(toggle.getAttribute('aria-checked')).toBe('false');
  });

  it('toggle reflects gradeOverride defined (on)', () => {
    seed(makeSegment({ gradeOverride: {} }));
    const { getByTestId } = render(<SegmentInspector />);
    const toggle = getByTestId('segment-grade-override-toggle');
    expect(toggle.getAttribute('aria-checked')).toBe('true');
  });

  it('turning on calls setSegmentGradeOverride with empty object', () => {
    seed(makeSegment());
    const spy = vi.spyOn(
      useClipDataStore.getState(),
      'setSegmentGradeOverride',
    );
    const { getByTestId } = render(<SegmentInspector />);
    fireEvent.click(getByTestId('segment-grade-override-toggle'));
    expect(spy).toHaveBeenCalledWith('clip-1', 'seg-1', {});
    spy.mockRestore();
  });

  it('turning off calls clearSegmentGradeOverride', () => {
    seed(makeSegment({ gradeOverride: { exposure: 0.5 } }));
    const spy = vi.spyOn(
      useClipDataStore.getState(),
      'clearSegmentGradeOverride',
    );
    const { getByTestId } = render(<SegmentInspector />);
    fireEvent.click(getByTestId('segment-grade-override-toggle'));
    expect(spy).toHaveBeenCalledWith('clip-1', 'seg-1');
    spy.mockRestore();
  });
});
