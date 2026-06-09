import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useClipDataStore } from '~/state/clipDataStore';
import { useClipsStore } from '~/state/clipsStore';
import { useEditModeStore } from '~/state/editModeStore';
import { useEditStore } from '~/state/editStore';

import { MarkerContextPanel } from '../MarkerContextPanel';

vi.mock('~/state/clipDataStore', async () => {
  const actual =
    await vi.importActual<typeof import('~/state/clipDataStore')>(
      '~/state/clipDataStore',
    );
  return actual;
});

const fileHandle = {} as FileSystemFileHandle;

function resetStores(): void {
  useEditModeStore.setState({ mode: 'view', outlineSelection: { kind: 'none' } });
  useClipsStore.setState({
    clips: [{ id: 'clip-1', name: 'DJI.MP4', handle: fileHandle, lastModified: 0, size: 0 }],
    selectedClipId: 'clip-1',
    directoryHandle: undefined,
  });
  useClipDataStore.setState({
    entries: {
      'clip-1': {
        markers: [{ id: 'm1', time: 12.345, label: 'before' }],
        status: 'idle',
        readOnly: true,
      },
    },
  });
  useEditStore.setState({ currentTime: 0 });
}

beforeEach(() => {
  vi.useFakeTimers();
  resetStores();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('MarkerContextPanel', () => {
  it('renders the marker time and label', () => {
    const { getByTestId } = render(<MarkerContextPanel id="m1" />);
    expect(getByTestId('marker-time').textContent).toBe('00:12.345');
    const input = getByTestId('marker-label-input') as HTMLInputElement;
    expect(input.value).toBe('before');
  });

  it('renders nothing when the marker is missing', () => {
    useClipDataStore.setState({
      entries: {
        'clip-1': { markers: [], status: 'idle', readOnly: true },
      },
    });
    const { container } = render(<MarkerContextPanel id="ghost" />);
    expect(container.firstChild).toBeNull();
  });

  it('debounces label edits and commits via updateMarker', () => {
    const spy = vi.spyOn(useClipDataStore.getState(), 'updateMarker');
    const { getByTestId } = render(<MarkerContextPanel id="m1" />);
    const input = getByTestId('marker-label-input') as HTMLInputElement;

    fireEvent.change(input, { target: { value: 'b' } });
    fireEvent.change(input, { target: { value: 'br' } });
    expect(spy).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(250);
    });

    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith('clip-1', 'm1', { label: 'br' });

    spy.mockRestore();
  });

  it('flushes the pending label on Enter', () => {
    const spy = vi.spyOn(useClipDataStore.getState(), 'updateMarker');
    const { getByTestId } = render(<MarkerContextPanel id="m1" />);
    const input = getByTestId('marker-label-input') as HTMLInputElement;

    fireEvent.change(input, { target: { value: 'final' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(spy).toHaveBeenCalledWith('clip-1', 'm1', { label: 'final' });
    spy.mockRestore();
  });

  it('deletes the marker and clears selection', () => {
    const removeSpy = vi.spyOn(useClipDataStore.getState(), 'removeMarker');
    const clearSpy = vi.spyOn(useEditModeStore.getState(), 'clearSelection');

    const { getByTestId } = render(<MarkerContextPanel id="m1" />);
    fireEvent.click(getByTestId('marker-delete'));

    expect(removeSpy).toHaveBeenCalledWith('clip-1', 'm1');
    expect(clearSpy).toHaveBeenCalledTimes(1);

    removeSpy.mockRestore();
    clearSpy.mockRestore();
  });

  it('jumps to the marker time via editStore.setCurrentTime', () => {
    const setSpy = vi.spyOn(useEditStore.getState(), 'setCurrentTime');
    const { getByTestId } = render(<MarkerContextPanel id="m1" />);
    fireEvent.click(getByTestId('marker-jump'));
    expect(setSpy).toHaveBeenCalledWith(12.345);
    setSpy.mockRestore();
  });
});
