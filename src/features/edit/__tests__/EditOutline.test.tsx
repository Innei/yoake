import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useClipDataStore } from '~/features/clips/clipDataStore';
import { useClipsStore } from '~/features/clips/clipsStore';
import { useEditModeStore } from '~/features/edit/editModeStore';
import { useEditStore } from '~/features/edit/editStore';
import type { ClipMeta } from '~/types';

import { EditOutline } from '../components/EditOutline';

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
        'clip-1': { markers: [], segments: [], baseGrade: {}, status: 'idle', readOnly: false },
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
          segments: [],
          baseGrade: {},
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
          segments: [],
          baseGrade: {},
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
        'clip-1': { markers: [], segments: [], baseGrade: {}, status: 'idle', readOnly: false },
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
        'clip-1': { markers: [], segments: [], baseGrade: {}, status: 'idle', readOnly: false },
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

  it('renders segments section with count', () => {
    useClipsStore.setState({
      clips: [makeClip('clip-1', 'A.MP4')],
      selectedClipId: 'clip-1',
    });
    useClipDataStore.setState({
      entries: {
        'clip-1': {
          markers: [],
          segments: [
            { id: 's1', in: 1, out: 2, playMode: 'normal', speed: 1 },
            { id: 's2', in: 3, out: 5, playMode: 'reverse', speed: 1 },
          ],
          baseGrade: {},
          status: 'idle',
          readOnly: false,
        },
      },
    });
    vi.spyOn(useClipDataStore.getState(), 'load').mockResolvedValue(undefined);

    const { getByTestId } = render(<EditOutline />);
    const section = getByTestId('outline-segments-section');
    expect(section.textContent).toContain('Segments');
    expect(section.textContent).toContain('2');
    expect(getByTestId('segment-row-s1')).toBeTruthy();
    expect(getByTestId('segment-row-s2')).toBeTruthy();
  });

  it('clicking a segment row calls selectSegment', () => {
    useClipsStore.setState({
      clips: [makeClip('clip-1', 'A.MP4')],
      selectedClipId: 'clip-1',
    });
    useClipDataStore.setState({
      entries: {
        'clip-1': {
          markers: [],
          segments: [
            { id: 's1', in: 1, out: 2, playMode: 'normal', speed: 1 },
          ],
          baseGrade: {},
          status: 'idle',
          readOnly: false,
        },
      },
    });
    vi.spyOn(useClipDataStore.getState(), 'load').mockResolvedValue(undefined);
    const spy = vi.spyOn(useEditModeStore.getState(), 'selectSegment');

    const { getByTestId } = render(<EditOutline />);
    fireEvent.click(getByTestId('segment-row-s1'));
    expect(spy).toHaveBeenCalledWith('s1');

    spy.mockRestore();
  });

  it('renders empty-state message when both segments and markers are empty', () => {
    useClipsStore.setState({
      clips: [makeClip('clip-1', 'A.MP4')],
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
    vi.spyOn(useClipDataStore.getState(), 'load').mockResolvedValue(undefined);

    const { getByTestId } = render(<EditOutline />);
    expect(getByTestId('edit-outline-empty-all').textContent).toContain(
      'No edits yet',
    );
  });

  it('toggles section collapse on header click', () => {
    useClipsStore.setState({
      clips: [makeClip('clip-1', 'A.MP4')],
      selectedClipId: 'clip-1',
    });
    useClipDataStore.setState({
      entries: {
        'clip-1': {
          markers: [{ id: 'm1', time: 1, label: 'x' }],
          segments: [
            { id: 's1', in: 1, out: 2, playMode: 'normal', speed: 1 },
          ],
          baseGrade: {},
          status: 'idle',
          readOnly: false,
        },
      },
    });
    vi.spyOn(useClipDataStore.getState(), 'load').mockResolvedValue(undefined);

    const { getByTestId, queryByTestId } = render(<EditOutline />);
    expect(getByTestId('segment-row-s1')).toBeTruthy();

    fireEvent.click(getByTestId('outline-segments-toggle'));
    expect(queryByTestId('segment-row-s1')).toBeNull();

    expect(getByTestId('marker-row-m1')).toBeTruthy();
    fireEvent.click(getByTestId('outline-markers-toggle'));
    expect(queryByTestId('marker-row-m1')).toBeNull();
  });
});
