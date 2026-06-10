import { cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { useClipDataStore } from '~/features/clips/clipDataStore';
import { useClipsStore } from '~/features/clips/clipsStore';
import { useEditStore } from '~/features/edit/editStore';

import { ClipOverview } from '../components/ClipOverview';

const fileHandle = {} as FileSystemFileHandle;

function seed(
  options: {
    duration?: number;
    fps?: number;
    markers?: number;
    segments?: { in: number; out: number }[];
    selected?: boolean;
  } = {},
): void {
  const {
    selected = true,
    fps = 30,
    duration = 12,
    segments = [],
    markers = 0,
  } = options;
  useClipsStore.setState({
    clips: [
      { id: 'clip-1', name: 'DJI_0042.MP4', handle: fileHandle, lastModified: 0, size: 0 },
    ],
    selectedClipId: selected ? 'clip-1' : undefined,
    directoryHandle: undefined,
  });
  useClipDataStore.setState({
    entries: {
      'clip-1': {
        markers: Array.from({ length: markers }, (_, i) => ({
          id: `m-${i}`,
          time: i,
          label: '',
        })),
        segments: segments.map((s, i) => ({
          id: `s-${i}`,
          in: s.in,
          out: s.out,
          playMode: 'normal' as const,
          speed: 1,
        })),
        baseGrade: {},
        status: 'idle',
        readOnly: false,
      },
    },
  });
  useEditStore.setState({ fps, duration });
}

beforeEach(() => {
  useClipsStore.setState({
    clips: [],
    selectedClipId: undefined,
    directoryHandle: undefined,
  });
  useClipDataStore.setState({ entries: {} });
  useEditStore.setState({ fps: 0, duration: 0 });
});

afterEach(() => {
  cleanup();
});

describe('ClipOverview', () => {
  it('renders an empty state when no clip is selected', () => {
    const { getByTestId, queryByTestId } = render(<ClipOverview />);
    expect(getByTestId('clip-overview')).toBeTruthy();
    expect(queryByTestId('clip-overview-filename')).toBeNull();
  });

  it('shows file metadata for the selected clip', () => {
    seed({ fps: 29.97, duration: 8.5 });
    const { getByTestId } = render(<ClipOverview />);
    expect(getByTestId('clip-overview-filename').textContent).toBe(
      'DJI_0042.MP4',
    );
    expect(getByTestId('clip-overview-fps').textContent).toBe('29.97');
    expect(getByTestId('clip-overview-duration').textContent).toBe('8.5s');
  });

  it('uses clip duration for output when no segments exist', () => {
    seed({ duration: 10, markers: 2 });
    const { getByTestId } = render(<ClipOverview />);
    expect(getByTestId('clip-overview-stats').textContent).toBe(
      '0 segments · 2 markers · output duration 10.0s',
    );
  });

  it('sums segment lengths for output duration when segments exist', () => {
    seed({
      duration: 20,
      markers: 1,
      segments: [
        { in: 1, out: 4 },
        { in: 6, out: 9 },
      ],
    });
    const { getByTestId } = render(<ClipOverview />);
    expect(getByTestId('clip-overview-stats').textContent).toBe(
      '2 segments · 1 markers · output duration 6.0s',
    );
  });
});
