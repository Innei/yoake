import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  __resetClipDataStoreCachesForTests,
  useClipDataStore,
} from '~/features/clips/clipDataStore';
import { useClipsStore } from '~/features/clips/clipsStore';
import { useEditModeStore } from '~/features/edit/editModeStore';
import { useEditStore } from '~/features/edit/editStore';
import { usePrefsStore } from '~/features/preferences/prefsStore';

import { GradeTab } from '../components/GradeTab';

vi.mock('~/lib/fs/clipSidecar', async () => {
  const actual = await vi.importActual<typeof import('~/lib/fs/clipSidecar')>(
    '~/lib/fs/clipSidecar',
  );
  return {
    ...actual,
    readSidecar: vi.fn(),
    writeSidecar: vi.fn(),
  };
});

vi.mock('~/features/grade/components/LutPicker', () => ({
  LutPicker: () => <div data-testid="lut-picker-mock" />,
}));

const fileHandle = {} as FileSystemFileHandle;

function resetAll(): void {
  useEditModeStore.setState({
    mode: 'edit',
    outlineSelection: { kind: 'none' },
  });
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
        segments: [
          { id: 'seg-a', in: 1, out: 4, playMode: 'normal', speed: 1 },
        ],
        baseGrade: {},
        status: 'idle',
        readOnly: false,
      },
    },
  });
  __resetClipDataStoreCachesForTests();
  useEditStore.setState({ currentTime: 0, duration: 10, fps: 30 });
  usePrefsStore.setState({ clipDirHandle: undefined });
}

beforeEach(() => {
  resetAll();
});

afterEach(() => {
  cleanup();
});

describe('GradeTab scope header', () => {
  it('shows "Base grade" header when no segment is selected', () => {
    const { getByTestId, queryByTestId } = render(<GradeTab />);
    expect(getByTestId('grade-scope-base')).toBeTruthy();
    expect(queryByTestId('grade-scope-override')).toBeNull();
    expect(queryByTestId('grade-override-segment')).toBeNull();
  });

  it('shows "Override this segment" button when segment is selected but no override', () => {
    useEditModeStore.setState({
      outlineSelection: { kind: 'segment', id: 'seg-a' },
    });
    const { getByTestId, queryByTestId } = render(<GradeTab />);
    expect(getByTestId('grade-scope-base')).toBeTruthy();
    expect(getByTestId('grade-override-segment')).toBeTruthy();
    expect(queryByTestId('grade-scope-override')).toBeNull();
  });

  it('shows "Override · segment ..." header and "Reset to base" when override is active', () => {
    useClipDataStore.setState({
      entries: {
        'clip-1': {
          markers: [],
          segments: [
            {
              id: 'seg-a',
              in: 1,
              out: 4,
              playMode: 'normal',
              speed: 1,
              gradeOverride: { exposure: 0.5 },
            },
          ],
          baseGrade: {},
          status: 'idle',
          readOnly: false,
        },
      },
    });
    useEditModeStore.setState({
      outlineSelection: { kind: 'segment', id: 'seg-a' },
    });
    const { getByTestId, queryByTestId } = render(<GradeTab />);
    expect(getByTestId('grade-scope-override')).toBeTruthy();
    expect(getByTestId('grade-reset-to-base')).toBeTruthy();
    expect(queryByTestId('grade-scope-base')).toBeNull();
  });
});

describe('GradeTab override actions', () => {
  it('"Override this segment" creates an empty override', () => {
    useEditModeStore.setState({
      outlineSelection: { kind: 'segment', id: 'seg-a' },
    });
    const { getByTestId } = render(<GradeTab />);
    fireEvent.click(getByTestId('grade-override-segment'));
    const entry = useClipDataStore.getState().entries['clip-1']!;
    expect(entry.segments[0]!.gradeOverride).toEqual({});
  });

  it('"Reset to base" clears the override', () => {
    useClipDataStore.setState({
      entries: {
        'clip-1': {
          markers: [],
          segments: [
            {
              id: 'seg-a',
              in: 1,
              out: 4,
              playMode: 'normal',
              speed: 1,
              gradeOverride: { exposure: 0.7 },
            },
          ],
          baseGrade: {},
          status: 'idle',
          readOnly: false,
        },
      },
    });
    useEditModeStore.setState({
      outlineSelection: { kind: 'segment', id: 'seg-a' },
    });
    const { getByTestId } = render(<GradeTab />);
    fireEvent.click(getByTestId('grade-reset-to-base'));
    const entry = useClipDataStore.getState().entries['clip-1']!;
    expect(entry.segments[0]!.gradeOverride).toBeUndefined();
  });
});

describe('GradeTab exposure wiring', () => {
  it('writes to baseGrade.exposure when no segment is selected', () => {
    const { getByLabelText } = render(<GradeTab />);
    const slider = getByLabelText('Exposure') as HTMLInputElement;
    fireEvent.change(slider, { target: { value: '1.5' } });
    const entry = useClipDataStore.getState().entries['clip-1']!;
    expect(entry.baseGrade.exposure).toBeCloseTo(1.5);
    expect(entry.segments[0]!.gradeOverride).toBeUndefined();
  });

  it('writes to segment.gradeOverride.exposure when override is active', () => {
    useClipDataStore.setState({
      entries: {
        'clip-1': {
          markers: [],
          segments: [
            {
              id: 'seg-a',
              in: 1,
              out: 4,
              playMode: 'normal',
              speed: 1,
              gradeOverride: {},
            },
          ],
          baseGrade: { exposure: 0.2 },
          status: 'idle',
          readOnly: false,
        },
      },
    });
    useEditModeStore.setState({
      outlineSelection: { kind: 'segment', id: 'seg-a' },
    });
    const { getByLabelText } = render(<GradeTab />);
    const slider = getByLabelText('Exposure') as HTMLInputElement;
    fireEvent.change(slider, { target: { value: '0.9' } });
    const entry = useClipDataStore.getState().entries['clip-1']!;
    expect(entry.baseGrade.exposure).toBeCloseTo(0.2);
    expect(entry.segments[0]!.gradeOverride!.exposure).toBeCloseTo(0.9);
  });
});
