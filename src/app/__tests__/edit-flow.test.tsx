import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { readSidecar, writeSidecar } from '~/fs/clipSidecar';
import {
  __resetClipDataStoreCachesForTests,
  useClipDataStore,
} from '~/state/clipDataStore';
import { useClipsStore } from '~/state/clipsStore';
import { useEditModeStore } from '~/state/editModeStore';
import { useEditStore } from '~/state/editStore';
import {
  CLIPS_WIDTH_DEFAULT,
  INSPECTOR_WIDTH_DEFAULT,
  useLayoutStore,
} from '~/state/layoutStore';
import { usePrefsStore } from '~/state/prefsStore';
import type { ClipMeta } from '~/types';

import { Shell } from '../Shell';
import { useGlobalShortcuts } from '../shortcuts';

vi.mock('~/fs/clipSidecar', () => ({
  SIDECAR_VERSION: 1,
  readSidecar: vi.fn(),
  writeSidecar: vi.fn(),
}));

vi.mock('../Preview', () => ({
  Preview: () => <div data-testid="preview-mock" />,
}));

vi.mock('../Transport', () => ({
  Transport: () => <div data-testid="transport-mock" />,
}));

vi.mock('../ClipList', async () => {
  const { EditToggleButton } = await import('../edit/EditToggleButton');
  return {
    ClipList: () => (
      <div data-testid="clip-list-mock">
        <EditToggleButton variant="edit" />
      </div>
    ),
  };
});

vi.mock('../Inspector', () => ({
  Inspector: () => <div data-testid="inspector-mock" />,
}));

vi.mock('../ExportPanel', () => ({
  ExportPanel: () => <div data-testid="export-panel-mock" />,
}));

vi.mock('../sections/LutSection', () => ({
  LutSection: () => <div data-testid="lut-section-mock" />,
}));

vi.mock('../sections/ExposureSection', () => ({
  ExposureSection: () => <div data-testid="exposure-section-mock" />,
}));

vi.mock('../RenderModeSection', () => ({
  RenderModeSection: () => <div data-testid="render-mode-section-mock" />,
}));

vi.mock('../HdrSection', () => ({
  HdrSection: () => <div data-testid="hdr-section-mock" />,
}));

const mockedRead = vi.mocked(readSidecar);
const mockedWrite = vi.mocked(writeSidecar);

const fileHandle = {} as FileSystemFileHandle;

function makeClip(id: string, name: string): ClipMeta {
  return { id, name, handle: fileHandle, lastModified: 0, size: 0 };
}

interface MockDirHandle {
  name: string;
  queryPermission: ReturnType<typeof vi.fn>;
  requestPermission: ReturnType<typeof vi.fn>;
}

function makeDirHandle(): MockDirHandle {
  return {
    name: 'clips',
    queryPermission: vi.fn(async () => 'granted'),
    requestPermission: vi.fn(async () => 'granted'),
  };
}

function resetAll(): void {
  useEditModeStore.setState({
    mode: 'view',
    outlineSelection: { kind: 'none' },
  });
  useClipsStore.setState({
    clips: [],
    selectedClipId: undefined,
    directoryHandle: undefined,
  });
  useClipDataStore.setState({ entries: {} });
  __resetClipDataStoreCachesForTests();
  useEditStore.setState({ currentTime: 0 });
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
  usePrefsStore.setState({
    clipDirHandle: undefined,
    lutDirHandle: undefined,
    exportDirHandle: undefined,
    lastSession: undefined,
  });
}

function Harness() {
  useGlobalShortcuts({ onShowHelp: () => {} });
  return <Shell />;
}

async function flushAsync(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
}

beforeEach(() => {
  resetAll();
  mockedRead.mockReset();
  mockedWrite.mockReset();
  mockedRead.mockResolvedValue(undefined);
  mockedWrite.mockResolvedValue(undefined);
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('edit-flow integration', () => {
  it('disables Edit button when no clip is selected', () => {
    const { getByTestId } = render(<Harness />);
    const btn = getByTestId('edit-toggle-edit') as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
  });

  it('walks through enter → add marker → edit label → escape → exit', async () => {
    const dir = makeDirHandle();
    usePrefsStore.setState({
      clipDirHandle: dir as unknown as FileSystemDirectoryHandle,
    });
    useClipsStore.setState({
      clips: [makeClip('clip-1', 'DJI_0042_D.MP4')],
      directoryHandle: dir as unknown as FileSystemDirectoryHandle,
    });

    const { getByTestId, queryByTestId } = render(<Harness />);

    act(() => {
      useClipsStore.getState().select('clip-1');
    });
    const editBtn = getByTestId('edit-toggle-edit') as HTMLButtonElement;
    expect(editBtn.disabled).toBe(false);

    fireEvent.click(editBtn);
    await flushAsync();
    expect(useEditModeStore.getState().mode).toBe('edit');
    expect(getByTestId('edit-left-panel')).toBeTruthy();
    expect(getByTestId('edit-right-panel')).toBeTruthy();
    expect(getByTestId('clip-overview')).toBeTruthy();
    expect(dir.requestPermission).toHaveBeenCalledWith({ mode: 'readwrite' });

    useEditStore.setState({ currentTime: 3.25 });

    fireEvent.keyDown(window, { key: 'm' });
    await flushAsync();

    const markerId =
      useClipDataStore.getState().entries['clip-1']!.markers[0]!.id;
    expect(markerId).toBeTruthy();
    expect(useEditModeStore.getState().outlineSelection).toEqual({
      kind: 'marker',
      id: markerId,
    });
    expect(getByTestId('marker-context-panel')).toBeTruthy();
    expect(getByTestId(`marker-row-${markerId}`)).toBeTruthy();

    vi.useFakeTimers();
    const labelInput = getByTestId('marker-label-input') as HTMLInputElement;
    fireEvent.change(labelInput, { target: { value: 'hero' } });
    act(() => {
      vi.advanceTimersByTime(260);
    });
    vi.useRealTimers();
    await flushAsync();

    const lastWrite = mockedWrite.mock.calls.at(-1);
    expect(lastWrite).toBeTruthy();
    expect(lastWrite![2].markers[0]!.label).toBe('hero');

    act(() => {
      labelInput.blur();
    });
    fireEvent.keyDown(window, { key: 'Escape' });
    await flushAsync();
    expect(useEditModeStore.getState().outlineSelection.kind).toBe('none');
    expect(useEditModeStore.getState().mode).toBe('edit');
    expect(getByTestId('clip-overview')).toBeTruthy();
    expect(queryByTestId('marker-context-panel')).toBeNull();

    fireEvent.keyDown(window, { key: 'Escape' });
    await flushAsync();
    expect(useEditModeStore.getState().mode).toBe('view');
    expect(getByTestId('clip-list-mock')).toBeTruthy();
    expect(queryByTestId('edit-left-panel')).toBeNull();
  });

  it('Delete key removes the selected marker and clears outline selection', async () => {
    const dir = makeDirHandle();
    usePrefsStore.setState({
      clipDirHandle: dir as unknown as FileSystemDirectoryHandle,
    });
    useClipsStore.setState({
      clips: [makeClip('clip-1', 'DJI_0042_D.MP4')],
      directoryHandle: dir as unknown as FileSystemDirectoryHandle,
    });

    render(<Harness />);

    act(() => {
      useClipsStore.getState().select('clip-1');
      useEditModeStore.setState({ mode: 'edit' });
    });
    await flushAsync();

    act(() => {
      const id = useClipDataStore
        .getState()
        .addMarker('clip-1', 1.5, 'doomed');
      useEditModeStore.getState().selectMarker(id);
    });
    await flushAsync();

    expect(
      useClipDataStore.getState().entries['clip-1']!.markers,
    ).toHaveLength(1);
    expect(useEditModeStore.getState().outlineSelection.kind).toBe('marker');

    fireEvent.keyDown(window, { key: 'Delete' });
    await flushAsync();

    expect(
      useClipDataStore.getState().entries['clip-1']!.markers,
    ).toHaveLength(0);
    expect(useEditModeStore.getState().outlineSelection).toEqual({
      kind: 'none',
    });
  });
});
