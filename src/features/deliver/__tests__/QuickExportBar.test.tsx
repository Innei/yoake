import { cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useClipDataStore } from '~/features/clips/clipDataStore';
import { useClipsStore } from '~/features/clips/clipsStore';
import { useDeliverStore } from '~/features/deliver/deliverStore';
import { useExportStatusStore } from '~/features/deliver/exportStatusStore';
import { useEditModeStore } from '~/features/edit/editModeStore';
import { usePrefsStore } from '~/features/preferences/prefsStore';

import { QuickExportBar } from '../components/QuickExportBar';
import { pickExportDir } from '../pickExportDir';

const runExportMock = vi.fn(async () => {});

vi.mock('../useExport', () => ({
  useExport: () => runExportMock,
}));

vi.mock('../pickExportDir', () => ({
  pickExportDir: vi.fn(async () => {}),
}));

const mockedPick = vi.mocked(pickExportDir);

const fileHandle = {} as FileSystemFileHandle;
const dirHandle = { name: 'exports' } as FileSystemDirectoryHandle;

beforeEach(() => {
  runExportMock.mockClear();
  mockedPick.mockReset();
  mockedPick.mockResolvedValue(undefined);
  useClipsStore.setState({
    clips: [
      { id: 'clip-1', name: 'DJI.MP4', handle: fileHandle, lastModified: 0, size: 0 },
    ],
    selectedClipId: 'clip-1',
    directoryHandle: undefined,
  });
  usePrefsStore.setState({ exportDirHandle: dirHandle });
  useExportStatusStore.setState({ status: { kind: 'idle' } });
  useDeliverStore.setState({
    container: 'mp4-h264',
    resolution: 'source',
    quality: 'high',
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
    outlineSelection: { kind: 'none' },
    cutMode: { active: false },
  });
});

function setSegments() {
  useClipDataStore.setState({
    entries: {
      'clip-1': {
        markers: [],
        segments: [
          { id: 'b', in: 63, out: 69.8, playMode: 'normal', speed: 1 },
          { id: 'a', in: 4.2, out: 9.8, playMode: 'normal', speed: 1 },
        ],
        baseGrade: {},
        status: 'idle',
        readOnly: false,
      },
    },
  });
}

afterEach(() => {
  cleanup();
});

describe('QuickExportBar', () => {
  it('shows a settings summary with the export folder', () => {
    const { getByTestId } = render(<QuickExportBar />);
    expect(getByTestId('quick-export-summary').textContent).toBe(
      'H.264 · Source · High → exports',
    );
  });

  it('shows a full-clip scope when the clip has no segments', () => {
    const { getByTestId } = render(<QuickExportBar />);
    expect(getByTestId('quick-export-scope').textContent).toBe('Full clip');
  });

  it('shows the edit scope with the segment count when nothing is selected', () => {
    setSegments();
    const { getByTestId } = render(<QuickExportBar />);
    expect(getByTestId('quick-export-scope').textContent).toBe(
      'Edit · 2 segments',
    );
  });

  it('shows the selected segment scope with its time range', () => {
    setSegments();
    useEditModeStore.setState({
      outlineSelection: { kind: 'segment', id: 'b' },
    });
    const { getByTestId } = render(<QuickExportBar />);
    expect(getByTestId('quick-export-scope').textContent).toBe(
      'Segment 2 · 01:03.0–01:09.8',
    );
  });

  it('falls back to the edit scope when the selected segment is gone', () => {
    setSegments();
    useEditModeStore.setState({
      outlineSelection: { kind: 'segment', id: 'missing' },
    });
    const { getByTestId } = render(<QuickExportBar />);
    expect(getByTestId('quick-export-scope').textContent).toBe(
      'Edit · 2 segments',
    );
  });

  it('runs the export directly when a folder is set', async () => {
    const { getByTestId } = render(<QuickExportBar />);
    fireEvent.click(getByTestId('quick-export-button'));
    await waitFor(() => expect(runExportMock).toHaveBeenCalledTimes(1));
    expect(mockedPick).not.toHaveBeenCalled();
  });

  it('prompts for a folder first when none is set, then exports', async () => {
    usePrefsStore.setState({ exportDirHandle: undefined });
    mockedPick.mockImplementation(async () => {
      usePrefsStore.setState({ exportDirHandle: dirHandle });
    });

    const { getByTestId } = render(<QuickExportBar />);
    fireEvent.click(getByTestId('quick-export-button'));

    await waitFor(() => expect(runExportMock).toHaveBeenCalledTimes(1));
    expect(mockedPick).toHaveBeenCalledTimes(1);
  });

  it('does not export when the folder prompt is dismissed', async () => {
    usePrefsStore.setState({ exportDirHandle: undefined });

    const { getByTestId } = render(<QuickExportBar />);
    fireEvent.click(getByTestId('quick-export-button'));

    await waitFor(() => expect(mockedPick).toHaveBeenCalledTimes(1));
    expect(runExportMock).not.toHaveBeenCalled();
  });

  it('disables the button and shows progress while exporting', () => {
    useExportStatusStore.setState({
      status: {
        kind: 'running',
        cancel: () => {},
        description: 'Encoding…',
        ratio: 0.5,
      },
    });

    const { getByTestId, queryByTestId } = render(<QuickExportBar />);
    expect(
      (getByTestId('quick-export-button') as HTMLButtonElement).disabled,
    ).toBe(true);
    expect(getByTestId('deliver-export-progress')).toBeTruthy();
    expect(queryByTestId('quick-export-summary')).toBeNull();
  });

  it('disables the button when no clip is selected', () => {
    useClipsStore.setState({ selectedClipId: undefined });
    const { getByTestId } = render(<QuickExportBar />);
    expect(
      (getByTestId('quick-export-button') as HTMLButtonElement).disabled,
    ).toBe(true);
  });
});
