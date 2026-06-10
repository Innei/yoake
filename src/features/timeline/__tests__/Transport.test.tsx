import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { Segment } from '~/lib/fs/clipSidecar';
import { useClipDataStore } from '~/features/clips/clipDataStore';
import { useClipsStore } from '~/features/clips/clipsStore';
import { useEditModeStore } from '~/features/edit/editModeStore';
import { useEditStore } from '~/features/edit/editStore';
import {
  CLIPS_WIDTH_DEFAULT,
  INSPECTOR_WIDTH_DEFAULT,
  useLayoutStore,
} from '~/components/layout/layoutStore';

import { Transport } from '../components/Transport';

const fileHandle = {} as FileSystemFileHandle;

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

function seedClipWithSegment(): void {
  useClipsStore.setState({
    clips: [
      {
        id: 'clip-1',
        name: 'DJI.MP4',
        handle: fileHandle,
        lastModified: 0,
        size: 0,
      },
    ],
    selectedClipId: 'clip-1',
    directoryHandle: undefined,
  });
  useClipDataStore.setState({
    entries: {
      'clip-1': {
        markers: [],
        segments: [makeSegment({ id: 'a', in: 1, out: 3 })],
        baseGrade: {},
        status: 'idle',
        readOnly: false,
      },
    },
  });
  useEditStore.setState({ duration: 10, fps: 30, currentTime: 0 });
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
    mode: 'view',
    outlineSelection: { kind: 'none' },
  });
  useLayoutStore.setState({
    view: {
      clipsWidth: CLIPS_WIDTH_DEFAULT,
      inspectorWidth: INSPECTOR_WIDTH_DEFAULT,
    },
    edit: {
      clipsWidth: CLIPS_WIDTH_DEFAULT,
      inspectorWidth: INSPECTOR_WIDTH_DEFAULT,
    },
    inspectorCollapsed: false,
  });
});

afterEach(() => {
  cleanup();
});

describe('Transport mounts SegmentLayer with mode-aware readOnly', () => {
  it('renders edit handles when mode = edit', () => {
    seedClipWithSegment();
    useEditModeStore.setState({ mode: 'edit' });
    const { getByTestId } = render(<Transport />);
    expect(getByTestId('transport-segment-layer')).toBeTruthy();
    expect(getByTestId('transport-segment-band-a')).toBeTruthy();
    expect(getByTestId('transport-segment-handle-a-in')).toBeTruthy();
    expect(getByTestId('transport-segment-handle-a-out')).toBeTruthy();
  });

  it('hides handles in view mode but keeps the segment layer and band mounted', () => {
    seedClipWithSegment();
    const { getByTestId, queryByTestId } = render(<Transport />);
    expect(getByTestId('transport-segment-layer')).toBeTruthy();
    expect(getByTestId('transport-segment-band-a')).toBeTruthy();
    expect(queryByTestId('transport-segment-handle-a-in')).toBeNull();
    expect(queryByTestId('transport-segment-handle-a-out')).toBeNull();
  });

  it('toggling mode flips readOnly without unmounting the segment layer', () => {
    seedClipWithSegment();
    const { getByTestId, queryByTestId } = render(<Transport />);

    expect(queryByTestId('transport-segment-handle-a-in')).toBeNull();
    expect(queryByTestId('transport-segment-handle-a-out')).toBeNull();

    act(() => {
      useEditModeStore.setState({ mode: 'edit' });
    });

    expect(getByTestId('transport-segment-layer')).toBeTruthy();
    expect(getByTestId('transport-segment-handle-a-in')).toBeTruthy();
    expect(getByTestId('transport-segment-handle-a-out')).toBeTruthy();

    act(() => {
      useEditModeStore.setState({ mode: 'view' });
    });

    expect(getByTestId('transport-segment-layer')).toBeTruthy();
    expect(getByTestId('transport-segment-band-a')).toBeTruthy();
    expect(queryByTestId('transport-segment-handle-a-in')).toBeNull();
    expect(queryByTestId('transport-segment-handle-a-out')).toBeNull();
  });
});

describe('Transport cut mode toggle', () => {
  it('renders the toggle disabled in view mode', () => {
    seedClipWithSegment();
    const { getByTestId } = render(<Transport />);
    const btn = getByTestId('transport-cut-mode-toggle') as HTMLButtonElement;
    expect(btn).toBeTruthy();
    expect(btn.disabled).toBe(true);
  });

  it('renders the toggle enabled in edit mode', () => {
    seedClipWithSegment();
    useEditModeStore.setState({ mode: 'edit' });
    const { getByTestId } = render(<Transport />);
    const btn = getByTestId('transport-cut-mode-toggle') as HTMLButtonElement;
    expect(btn.disabled).toBe(false);
    expect(btn.getAttribute('aria-pressed')).toBe('false');
  });

  it('clicking the toggle enters cut mode for the clip\'s segment in edit mode', () => {
    seedClipWithSegment();
    useEditModeStore.setState({ mode: 'edit' });
    const { getByTestId } = render(<Transport />);
    const btn = getByTestId('transport-cut-mode-toggle');

    fireEvent.click(btn);

    const cut = useEditModeStore.getState().cutMode;
    expect(cut.active).toBe(true);
    expect(btn.getAttribute('aria-pressed')).toBe('true');

    fireEvent.click(btn);
    expect(useEditModeStore.getState().cutMode.active).toBe(false);
    expect(btn.getAttribute('aria-pressed')).toBe('false');
  });
});
