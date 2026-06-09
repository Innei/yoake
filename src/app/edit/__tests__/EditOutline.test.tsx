import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useClipDataStore } from '~/state/clipDataStore';
import { useClipsStore } from '~/state/clipsStore';
import { useEditModeStore } from '~/state/editModeStore';
import { useEditStore } from '~/state/editStore';
import type { ClipMeta } from '~/types';

import { EditOutline } from '../EditOutline';

const fileHandle = {} as FileSystemFileHandle;

function makeClip(id: string, name: string): ClipMeta {
  return { id, name, handle: fileHandle, lastModified: 0, size: 0 };
}

function resetStores(): void {
  useClipsStore.setState({
    clips: [],
    selectedClipId: undefined,
    directoryHandle: undefined,
  });
  useClipDataStore.setState({ entries: {} });
  useEditModeStore.setState({ mode: 'view', outlineSelection: { kind: 'none' } });
  useEditStore.setState({ currentTime: 0 });
}

beforeEach(() => {
  resetStores();
});

afterEach(() => {
  cleanup();
});

describe('EditOutline', () => {
  it('renders empty-clip placeholder when no clip selected', () => {
    const { getByTestId } = render(<EditOutline />);
    expect(getByTestId('edit-outline-empty-clip')).toBeTruthy();
  });

  it('renders empty-markers placeholder when clip has no markers', () => {
    useClipsStore.setState({
      clips: [makeClip('clip-1', 'A.MP4')],
      selectedClipId: 'clip-1',
    });
    useClipDataStore.setState({
      entries: {
        'clip-1': { markers: [], status: 'idle', readOnly: false },
      },
    });
    vi.spyOn(useClipDataStore.getState(), 'load').mockResolvedValue(undefined);

    const { getByTestId } = render(<EditOutline />);
    expect(getByTestId('edit-outline-empty-markers').textContent).toContain(
      'No markers yet',
    );
  });

  it('renders MarkerRow for each marker sorted by time', () => {
    useClipsStore.setState({
      clips: [makeClip('clip-1', 'A.MP4')],
      selectedClipId: 'clip-1',
    });
    useClipDataStore.setState({
      entries: {
        'clip-1': {
          markers: [
            { id: 'm-early', time: 1.2, label: 'First' },
            { id: 'm-late', time: 12.4, label: 'Second' },
          ],
          status: 'idle',
          readOnly: false,
        },
      },
    });
    vi.spyOn(useClipDataStore.getState(), 'load').mockResolvedValue(undefined);

    const { getByTestId, queryByTestId } = render(<EditOutline />);
    expect(queryByTestId('edit-outline-empty-markers')).toBeNull();
    expect(getByTestId('marker-row-m-early').textContent).toContain('00:01.200');
    expect(getByTestId('marker-row-m-late').textContent).toContain('00:12.400');
  });

  it('clicking a marker calls editModeStore.selectMarker', () => {
    useClipsStore.setState({
      clips: [makeClip('clip-1', 'A.MP4')],
      selectedClipId: 'clip-1',
    });
    useClipDataStore.setState({
      entries: {
        'clip-1': {
          markers: [{ id: 'm-1', time: 2, label: 'Hello' }],
          status: 'idle',
          readOnly: false,
        },
      },
    });
    vi.spyOn(useClipDataStore.getState(), 'load').mockResolvedValue(undefined);
    const selectSpy = vi.spyOn(useEditModeStore.getState(), 'selectMarker');

    const { getByTestId } = render(<EditOutline />);
    fireEvent.click(getByTestId('marker-row-m-1'));
    expect(selectSpy).toHaveBeenCalledWith('m-1');

    selectSpy.mockRestore();
  });

  it('Add-marker CTA calls addMarker with current time and selects the new id', () => {
    useClipsStore.setState({
      clips: [makeClip('clip-1', 'A.MP4')],
      selectedClipId: 'clip-1',
    });
    useClipDataStore.setState({
      entries: {
        'clip-1': { markers: [], status: 'idle', readOnly: false },
      },
    });
    useEditStore.setState({ currentTime: 6.4 });
    vi.spyOn(useClipDataStore.getState(), 'load').mockResolvedValue(undefined);
    const addSpy = vi
      .spyOn(useClipDataStore.getState(), 'addMarker')
      .mockReturnValue('new-marker-id');
    const selectSpy = vi.spyOn(useEditModeStore.getState(), 'selectMarker');

    const { getByTestId } = render(<EditOutline />);
    fireEvent.click(getByTestId('edit-outline-add-marker'));

    expect(addSpy).toHaveBeenCalledWith('clip-1', 6.4, '');
    expect(selectSpy).toHaveBeenCalledWith('new-marker-id');

    addSpy.mockRestore();
    selectSpy.mockRestore();
  });

  it('calls load when selectedClipId changes', () => {
    useClipsStore.setState({
      clips: [makeClip('clip-1', 'A.MP4'), makeClip('clip-2', 'B.MP4')],
      selectedClipId: 'clip-1',
    });
    useClipDataStore.setState({
      entries: {
        'clip-1': { markers: [], status: 'idle', readOnly: false },
      },
    });
    const loadSpy = vi
      .spyOn(useClipDataStore.getState(), 'load')
      .mockResolvedValue(undefined);

    const { rerender } = render(<EditOutline />);
    expect(loadSpy).toHaveBeenCalledWith('clip-1');

    useClipsStore.setState({ selectedClipId: 'clip-2' });
    rerender(<EditOutline />);
    expect(loadSpy).toHaveBeenCalledWith('clip-2');

    loadSpy.mockRestore();
  });
});
