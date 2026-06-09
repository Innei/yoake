import { cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useClipDataStore } from '~/state/clipDataStore';
import { useClipsStore } from '~/state/clipsStore';
import { useEditModeStore } from '~/state/editModeStore';

import { ContextPanel } from '../ContextPanel';

vi.mock('../ClipContextPanel', () => ({
  ClipContextPanel: () => <div data-testid="clip-context-panel-mock" />,
}));

vi.mock('../MarkerContextPanel', () => ({
  MarkerContextPanel: ({ id }: { id: string }) => (
    <div data-id={id} data-testid="marker-context-panel-mock" />
  ),
}));

const fileHandle = {} as FileSystemFileHandle;

function resetStores(): void {
  useEditModeStore.setState({ mode: 'view', outlineSelection: { kind: 'none' } });
  useClipsStore.setState({
    clips: [],
    selectedClipId: undefined,
    directoryHandle: undefined,
  });
  useClipDataStore.setState({ entries: {} });
}

function seedClipWithMarkers(
  clipId: string,
  markerIds: string[],
): void {
  useClipsStore.setState({
    clips: [{ id: clipId, name: 'DJI.MP4', handle: fileHandle, lastModified: 0, size: 0 }],
    selectedClipId: clipId,
  });
  useClipDataStore.setState({
    entries: {
      [clipId]: {
        markers: markerIds.map((id, i) => ({ id, time: i, label: '' })),
        status: 'idle',
        readOnly: false,
      },
    },
  });
}

beforeEach(() => {
  resetStores();
});

afterEach(() => {
  cleanup();
});

describe('ContextPanel', () => {
  it('renders ClipContextPanel when outlineSelection is none', () => {
    const { getByTestId, queryByTestId } = render(<ContextPanel />);
    expect(getByTestId('clip-context-panel-mock')).toBeTruthy();
    expect(queryByTestId('marker-context-panel-mock')).toBeNull();
  });

  it('renders MarkerContextPanel when outlineSelection targets an existing marker', () => {
    seedClipWithMarkers('clip-1', ['marker-a', 'marker-b']);
    useEditModeStore.setState({
      outlineSelection: { kind: 'marker', id: 'marker-b' },
    });

    const { getByTestId, queryByTestId } = render(<ContextPanel />);
    const panel = getByTestId('marker-context-panel-mock');
    expect(panel.getAttribute('data-id')).toBe('marker-b');
    expect(queryByTestId('clip-context-panel-mock')).toBeNull();
  });

  it('falls back to ClipContextPanel and clears selection when marker id is stale', () => {
    seedClipWithMarkers('clip-1', ['marker-a']);
    useEditModeStore.setState({
      outlineSelection: { kind: 'marker', id: 'ghost' },
    });
    const clearSpy = vi.spyOn(useEditModeStore.getState(), 'clearSelection');

    const { getByTestId, queryByTestId } = render(<ContextPanel />);

    expect(getByTestId('clip-context-panel-mock')).toBeTruthy();
    expect(queryByTestId('marker-context-panel-mock')).toBeNull();
    expect(clearSpy).toHaveBeenCalledTimes(1);

    clearSpy.mockRestore();
  });
});
