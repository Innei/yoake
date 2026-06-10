import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useClipsStore } from '~/features/clips/clipsStore';
import type { ClipMeta } from '~/types';

import { EditClipSwitcher } from '../components/EditClipSwitcher';

const fileHandle = {} as FileSystemFileHandle;

function makeClip(id: string, name: string): ClipMeta {
  return { id, name, handle: fileHandle, lastModified: 0, size: 0 };
}

function resetStore(): void {
  useClipsStore.setState({
    clips: [],
    selectedClipId: undefined,
    directoryHandle: undefined,
  });
}

beforeEach(() => {
  resetStore();
});

afterEach(() => {
  cleanup();
});

describe('EditClipSwitcher', () => {
  it('renders placeholder when no clip selected', () => {
    const { getByTestId, queryByTestId } = render(<EditClipSwitcher />);
    expect(getByTestId('edit-clip-switcher-empty').textContent).toBe(
      'No clip selected',
    );
    expect(queryByTestId('edit-clip-switcher')).toBeNull();
  });

  it('renders placeholder when clips list is empty', () => {
    useClipsStore.setState({ clips: [], selectedClipId: 'missing' });
    const { getByTestId } = render(<EditClipSwitcher />);
    expect(getByTestId('edit-clip-switcher-empty')).toBeTruthy();
  });

  it('changing the select calls clipsStore.select with new id', () => {
    useClipsStore.setState({
      clips: [makeClip('a', 'A.MP4'), makeClip('b', 'B.MP4'), makeClip('c', 'C.MP4')],
      selectedClipId: 'a',
    });
    const selectSpy = vi.spyOn(useClipsStore.getState(), 'select');

    const { getByTestId } = render(<EditClipSwitcher />);
    const sel = getByTestId('edit-clip-switcher-select') as HTMLSelectElement;
    expect(sel.value).toBe('a');
    fireEvent.change(sel, { target: { value: 'c' } });
    expect(selectSpy).toHaveBeenCalledWith('c');

    selectSpy.mockRestore();
  });

  it('prev button is disabled at first clip; next moves to next id', () => {
    useClipsStore.setState({
      clips: [makeClip('a', 'A.MP4'), makeClip('b', 'B.MP4')],
      selectedClipId: 'a',
    });
    const selectSpy = vi.spyOn(useClipsStore.getState(), 'select');

    const { getByTestId } = render(<EditClipSwitcher />);
    const prev = getByTestId('edit-clip-switcher-prev') as HTMLButtonElement;
    const next = getByTestId('edit-clip-switcher-next') as HTMLButtonElement;

    expect(prev.disabled).toBe(true);
    expect(next.disabled).toBe(false);

    fireEvent.click(prev);
    expect(selectSpy).not.toHaveBeenCalled();

    fireEvent.click(next);
    expect(selectSpy).toHaveBeenCalledWith('b');

    selectSpy.mockRestore();
  });

  it('next button is disabled at last clip; prev moves to previous id', () => {
    useClipsStore.setState({
      clips: [makeClip('a', 'A.MP4'), makeClip('b', 'B.MP4')],
      selectedClipId: 'b',
    });
    const selectSpy = vi.spyOn(useClipsStore.getState(), 'select');

    const { getByTestId } = render(<EditClipSwitcher />);
    const prev = getByTestId('edit-clip-switcher-prev') as HTMLButtonElement;
    const next = getByTestId('edit-clip-switcher-next') as HTMLButtonElement;

    expect(next.disabled).toBe(true);
    expect(prev.disabled).toBe(false);

    fireEvent.click(next);
    expect(selectSpy).not.toHaveBeenCalled();

    fireEvent.click(prev);
    expect(selectSpy).toHaveBeenCalledWith('a');

    selectSpy.mockRestore();
  });

  it('with a single clip both prev and next are disabled', () => {
    useClipsStore.setState({
      clips: [makeClip('only', 'Only.MP4')],
      selectedClipId: 'only',
    });
    const { getByTestId } = render(<EditClipSwitcher />);
    const prev = getByTestId('edit-clip-switcher-prev') as HTMLButtonElement;
    const next = getByTestId('edit-clip-switcher-next') as HTMLButtonElement;
    expect(prev.disabled).toBe(true);
    expect(next.disabled).toBe(true);
  });
});
