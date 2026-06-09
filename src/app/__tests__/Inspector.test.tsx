import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { Inspector } from '~/app/Inspector';
import {
  __resetClipDataStoreCachesForTests,
  useClipDataStore,
} from '~/state/clipDataStore';
import { useClipsStore } from '~/state/clipsStore';
import { useEditStore } from '~/state/editStore';

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

const fileHandle = {} as FileSystemFileHandle;

beforeEach(() => {
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
        segments: [],
        baseGrade: {},
        status: 'idle',
        readOnly: false,
      },
    },
  });
  __resetClipDataStoreCachesForTests();
});

afterEach(() => {
  cleanup();
  useEditStore.getState().reset();
});

describe('Inspector view-mode panel', () => {
  it('renders LUT and Exposure sections', () => {
    render(<Inspector />);
    expect(screen.getByText(/inspect/i)).toBeTruthy();
    expect(screen.getByLabelText('Exposure')).toBeTruthy();
  });

  it('does not render the render-mode section (moved to Transport view-settings popover)', () => {
    render(<Inspector />);
    expect(screen.queryByLabelText('Render mode')).toBeNull();
  });

  it('renders the HDR section inline alongside grade controls', () => {
    render(<Inspector />);
    expect(screen.getByLabelText('HDR peak nits')).toBeTruthy();
    expect(screen.getByLabelText('HDR strength')).toBeTruthy();
  });

  it('writes exposure to baseGrade for the selected clip', () => {
    render(<Inspector />);
    const slider = screen.getByLabelText('Exposure') as HTMLInputElement;
    fireEvent.change(slider, { target: { value: '0.8' } });
    const entry = useClipDataStore.getState().entries['clip-1']!;
    expect(entry.baseGrade.exposure).toBeCloseTo(0.8);
  });
});
