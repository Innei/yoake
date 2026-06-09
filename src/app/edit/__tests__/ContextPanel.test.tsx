import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useClipDataStore } from '~/state/clipDataStore';
import { useClipsStore } from '~/state/clipsStore';
import { useEditModeStore } from '~/state/editModeStore';
import { useEditStore } from '~/state/editStore';

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
  markers: { id: string; time: number }[],
): void {
  useClipsStore.setState({
    clips: [{ id: clipId, name: 'DJI.MP4', handle: fileHandle, lastModified: 0, size: 0 }],
    selectedClipId: clipId,
  });
  useClipDataStore.setState({
    entries: {
      [clipId]: {
        markers: markers.map((m) => ({ id: m.id, time: m.time, label: '' })),
        status: 'idle',
        readOnly: false,
      },
    },
  });
}

beforeEach(() => {
  resetStores();
  useEditStore.setState({ currentTime: 0 });
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
    seedClipWithMarkers('clip-1', [
      { id: 'marker-a', time: 0 },
      { id: 'marker-b', time: 1 },
    ]);
    useEditModeStore.setState({
      outlineSelection: { kind: 'marker', id: 'marker-b' },
    });

    const { getByTestId, queryByTestId } = render(<ContextPanel />);
    const panel = getByTestId('marker-context-panel-mock');
    expect(panel.getAttribute('data-id')).toBe('marker-b');
    expect(queryByTestId('clip-context-panel-mock')).toBeNull();
  });

  it('falls back to ClipContextPanel and clears selection when marker id is stale', () => {
    seedClipWithMarkers('clip-1', [{ id: 'marker-a', time: 0 }]);
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

  it('jumps the playhead to the marker time when selection changes', () => {
    seedClipWithMarkers('clip-1', [
      { id: 'marker-a', time: 2.5 },
      { id: 'marker-b', time: 7.25 },
    ]);
    useEditStore.setState({ currentTime: 0 });

    render(<ContextPanel />);
    expect(useEditStore.getState().currentTime).toBe(0);

    act(() => {
      useEditModeStore
        .getState()
        .selectMarker('marker-a');
    });
    expect(useEditStore.getState().currentTime).toBe(2.5);

    act(() => {
      useEditStore.setState({ currentTime: 4 });
    });
    expect(useEditStore.getState().currentTime).toBe(4);

    act(() => {
      useEditModeStore
        .getState()
        .selectMarker('marker-b');
    });
    expect(useEditStore.getState().currentTime).toBe(7.25);
  });

  it('does not re-jump when re-rendering with the same marker selected', () => {
    seedClipWithMarkers('clip-1', [{ id: 'marker-a', time: 5 }]);
    useEditModeStore.setState({
      outlineSelection: { kind: 'marker', id: 'marker-a' },
    });

    const { rerender } = render(<ContextPanel />);
    expect(useEditStore.getState().currentTime).toBe(5);

    act(() => {
      useEditStore.setState({ currentTime: 9 });
    });
    rerender(<ContextPanel />);
    expect(useEditStore.getState().currentTime).toBe(9);
  });
});
