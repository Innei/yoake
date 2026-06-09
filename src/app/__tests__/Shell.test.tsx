import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  __resetClipDataStoreCachesForTests,
  useClipDataStore,
} from '~/state/clipDataStore';
import { useClipsStore } from '~/state/clipsStore';
import { useEditModeStore } from '~/state/editModeStore';
import {
  CLIPS_WIDTH_DEFAULT,
  INSPECTOR_WIDTH_DEFAULT,
  useLayoutStore,
} from '~/state/layoutStore';
import { usePrefsStore } from '~/state/prefsStore';
import type { ClipMeta } from '~/types';

import { Shell } from '../Shell';

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

function resetEditMode(): void {
  useEditModeStore.setState({ mode: 'view', outlineSelection: { kind: 'none' } });
}

function resetLayout(): void {
  useLayoutStore.setState({
    view: { clipsWidth: CLIPS_WIDTH_DEFAULT, inspectorWidth: INSPECTOR_WIDTH_DEFAULT },
    edit: { clipsWidth: CLIPS_WIDTH_DEFAULT, inspectorWidth: INSPECTOR_WIDTH_DEFAULT },
    inspectorCollapsed: false,
  });
}

function resetExtra(): void {
  useClipsStore.setState({
    clips: [],
    selectedClipId: undefined,
    directoryHandle: undefined,
  });
  useClipDataStore.setState({ entries: {} });
  __resetClipDataStoreCachesForTests();
  usePrefsStore.setState({
    clipDirHandle: undefined,
    lutDirHandle: undefined,
    exportDirHandle: undefined,
    lastSession: undefined,
  });
}

const fileHandle = {} as FileSystemFileHandle;

function makeClip(id: string, name = 'DJI.MP4'): ClipMeta {
  return { id, name, handle: fileHandle, lastModified: 0, size: 0 };
}

beforeEach(() => {
  resetEditMode();
  resetLayout();
  resetExtra();
});

afterEach(() => {
  cleanup();
});

describe('Shell', () => {
  it('renders the ViewLeftPanel content in view mode', () => {
    const { getByTestId, queryByTestId } = render(<Shell />);
    expect(getByTestId('clip-list-mock')).toBeTruthy();
    expect(getByTestId('edit-toggle-edit')).toBeTruthy();
    expect(queryByTestId('edit-left-panel')).toBeNull();
  });

  it('renders the ViewRightPanel content in view mode', () => {
    const { getByTestId, queryByTestId } = render(<Shell />);
    expect(getByTestId('inspector-mock')).toBeTruthy();
    expect(queryByTestId('edit-right-panel')).toBeNull();
  });

  it('renders the edit panels in edit mode', () => {
    useEditModeStore.setState({ mode: 'edit' });
    const { getByTestId, queryByTestId } = render(<Shell />);
    expect(getByTestId('edit-left-panel')).toBeTruthy();
    expect(getByTestId('edit-right-panel')).toBeTruthy();
    expect(queryByTestId('clip-list-mock')).toBeNull();
    expect(queryByTestId('inspector-mock')).toBeNull();
  });

  it('resizing clips in edit mode updates edit widths only', () => {
    useEditModeStore.setState({ mode: 'edit' });
    const { container } = render(<Shell />);
    const handles = container.querySelectorAll('[role="separator"]');
    expect(handles.length).toBeGreaterThanOrEqual(1);
    const clipsHandle = handles[0]!;
    clipsHandle.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));

    const state = useLayoutStore.getState();
    expect(state.edit.clipsWidth).not.toBe(CLIPS_WIDTH_DEFAULT);
    expect(state.view.clipsWidth).toBe(CLIPS_WIDTH_DEFAULT);
  });

  it('resizing inspector in view mode updates view widths only', () => {
    const { container } = render(<Shell />);
    const handles = container.querySelectorAll('[role="separator"]');
    expect(handles.length).toBe(2);
    const inspectorHandle = handles[1]!;
    inspectorHandle.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));

    const state = useLayoutStore.getState();
    expect(state.view.inspectorWidth).not.toBe(INSPECTOR_WIDTH_DEFAULT);
    expect(state.edit.inspectorWidth).toBe(INSPECTOR_WIDTH_DEFAULT);
  });

  it('mounts and removes the beforeunload listener around edit-mode transitions', () => {
    const addSpy = vi.spyOn(window, 'addEventListener');
    const removeSpy = vi.spyOn(window, 'removeEventListener');

    render(<Shell />);
    const addCountBefore = addSpy.mock.calls.filter(
      ([event]) => event === 'beforeunload',
    ).length;
    expect(addCountBefore).toBe(0);

    act(() => {
      useEditModeStore.setState({ mode: 'edit' });
    });
    const addedAfterEnter = addSpy.mock.calls.filter(
      ([event]) => event === 'beforeunload',
    );
    expect(addedAfterEnter.length).toBe(1);

    act(() => {
      useEditModeStore.setState({ mode: 'view' });
    });
    const removedAfterExit = removeSpy.mock.calls.filter(
      ([event]) => event === 'beforeunload',
    );
    expect(removedAfterExit.length).toBeGreaterThanOrEqual(1);

    addSpy.mockRestore();
    removeSpy.mockRestore();
  });

  it('clears outlineSelection when selectedClipId changes during edit mode', () => {
    useClipsStore.setState({
      clips: [makeClip('clip-1'), makeClip('clip-2', 'B.MP4')],
      selectedClipId: 'clip-1',
    });
    useClipDataStore.setState({
      entries: {
        'clip-1': {
          markers: [{ id: 'm-1', time: 0, label: '' }],
          status: 'idle',
          readOnly: false,
        },
      },
    });
    useEditModeStore.setState({ mode: 'edit' });

    render(<Shell />);

    act(() => {
      useEditModeStore.setState({
        outlineSelection: { kind: 'marker', id: 'm-1' },
      });
    });
    expect(useEditModeStore.getState().outlineSelection).toEqual({
      kind: 'marker',
      id: 'm-1',
    });

    act(() => {
      useClipsStore.getState().select('clip-2');
    });

    expect(useEditModeStore.getState().outlineSelection).toEqual({
      kind: 'none',
    });
  });
});
