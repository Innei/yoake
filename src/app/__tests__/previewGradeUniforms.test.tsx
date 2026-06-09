import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useEffectiveGradePush } from '~/app/previewGradeUniforms';
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

interface HarnessProps {
  enabled: boolean;
  onPush: (exposure: number) => void;
}

function Harness({ enabled, onPush }: HarnessProps) {
  useEffectiveGradePush({ enabled, pushExposure: onPush });
  return null;
}

function seed(segments: import('~/fs/clipSidecar').Segment[] = []) {
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
        segments,
        baseGrade: { exposure: 0 },
        status: 'idle',
        readOnly: false,
      },
    },
  });
}

beforeEach(() => {
  useClipsStore.setState({
    clips: [],
    selectedClipId: undefined,
    directoryHandle: undefined,
  });
  useClipDataStore.setState({ entries: {} });
  __resetClipDataStoreCachesForTests();
  useEditStore.setState({ currentTime: 0 });
  useEditStore.getState().setExposure(0);
});

afterEach(() => {
  cleanup();
});

describe('useEffectiveGradePush', () => {
  it('pushes baseGrade exposure on mount', () => {
    seed();
    useClipDataStore.getState().setBaseGrade('clip-1', { exposure: 0.25 });
    const push = vi.fn();
    render(<Harness enabled={true} onPush={push} />);
    expect(push).toHaveBeenCalled();
    expect(push.mock.calls.at(-1)![0]).toBeCloseTo(0.25);
  });

  it('falls back to editStore exposure when no clip is selected', () => {
    useClipsStore.setState({
      clips: [],
      selectedClipId: undefined,
      directoryHandle: undefined,
    });
    useEditStore.getState().setExposure(0.4);
    const push = vi.fn();
    render(<Harness enabled={true} onPush={push} />);
    expect(push.mock.calls.at(-1)![0]).toBeCloseTo(0.4);
  });

  it('pushes override exposure when playhead enters override segment', () => {
    seed([
      { id: 'seg-a', in: 0, out: 5, playMode: 'normal', speed: 1 },
      {
        id: 'seg-b',
        in: 5,
        out: 10,
        playMode: 'normal',
        speed: 1,
        gradeOverride: { exposure: 0.5 },
      },
    ]);
    useClipDataStore.getState().setBaseGrade('clip-1', { exposure: 0 });
    const push = vi.fn();
    render(<Harness enabled={true} onPush={push} />);

    act(() => {
      useEditStore.setState({ currentTime: 1 });
    });
    const beforeBoundary = push.mock.calls.at(-1)![0];
    expect(beforeBoundary).toBeCloseTo(0);

    act(() => {
      useEditStore.setState({ currentTime: 6 });
    });
    const insideOverride = push.mock.calls.at(-1)![0];
    expect(insideOverride).toBeCloseTo(0.5);
  });

  it('reverts to baseGrade exposure when playhead exits override segment', () => {
    seed([
      {
        id: 'seg-b',
        in: 5,
        out: 10,
        playMode: 'normal',
        speed: 1,
        gradeOverride: { exposure: 0.5 },
      },
    ]);
    useClipDataStore.getState().setBaseGrade('clip-1', { exposure: 0.1 });
    const push = vi.fn();
    render(<Harness enabled={true} onPush={push} />);

    act(() => {
      useEditStore.setState({ currentTime: 6 });
    });
    expect(push.mock.calls.at(-1)![0]).toBeCloseTo(0.5);

    act(() => {
      useEditStore.setState({ currentTime: 11 });
    });
    expect(push.mock.calls.at(-1)![0]).toBeCloseTo(0.1);
  });

  it('updates when baseGrade.exposure changes outside any override', () => {
    seed();
    const push = vi.fn();
    render(<Harness enabled={true} onPush={push} />);

    act(() => {
      useClipDataStore.getState().setBaseGrade('clip-1', { exposure: 1.2 });
    });
    expect(push.mock.calls.at(-1)![0]).toBeCloseTo(1.2);
  });

  it('updates when gradeOverride.exposure changes while inside override segment', () => {
    seed([
      {
        id: 'seg-b',
        in: 0,
        out: 10,
        playMode: 'normal',
        speed: 1,
        gradeOverride: { exposure: 0.5 },
      },
    ]);
    useClipDataStore.getState().setBaseGrade('clip-1', { exposure: 0 });
    const push = vi.fn();
    render(<Harness enabled={true} onPush={push} />);

    act(() => {
      useEditStore.setState({ currentTime: 5 });
    });
    expect(push.mock.calls.at(-1)![0]).toBeCloseTo(0.5);

    act(() => {
      useClipDataStore
        .getState()
        .setSegmentGradeOverride('clip-1', 'seg-b', { exposure: 0.9 });
    });
    expect(push.mock.calls.at(-1)![0]).toBeCloseTo(0.9);
  });

  it('does not push when enabled is false', () => {
    seed();
    useClipDataStore.getState().setBaseGrade('clip-1', { exposure: 0.25 });
    const push = vi.fn();
    render(<Harness enabled={false} onPush={push} />);
    expect(push).not.toHaveBeenCalled();
  });
});
