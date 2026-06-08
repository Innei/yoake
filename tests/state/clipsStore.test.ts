import { beforeEach, describe, expect, it } from 'vitest';

import { useClipsStore } from '~/state/clipsStore';
import type { ClipMeta } from '~/types';

const makeClip = (id: string): ClipMeta => ({
  id,
  name: `${id}.MP4`,
  size: 100,
  lastModified: 0,
  handle: {} as FileSystemFileHandle,
});

describe('clipsStore', () => {
  beforeEach(() => {
    useClipsStore.getState().clear();
  });

  it('has the expected initial state', () => {
    const state = useClipsStore.getState();
    expect(state.directoryHandle).toBeUndefined();
    expect(state.clips).toEqual([]);
    expect(state.selectedClipId).toBeUndefined();
  });

  it('setDirectory stores the directory handle', () => {
    const handle = {} as FileSystemDirectoryHandle;
    useClipsStore.getState().setDirectory(handle);
    expect(useClipsStore.getState().directoryHandle).toBe(handle);
  });

  it('setClips replaces the clips list', () => {
    const clips = [makeClip('a'), makeClip('b')];
    useClipsStore.getState().setClips(clips);
    expect(useClipsStore.getState().clips).toEqual(clips);
  });

  it('select sets selectedClipId', () => {
    useClipsStore.getState().select('clip-1');
    expect(useClipsStore.getState().selectedClipId).toBe('clip-1');
  });

  it('clear resets directory, clips, and selection', () => {
    const store = useClipsStore.getState();
    store.setDirectory({} as FileSystemDirectoryHandle);
    store.setClips([makeClip('a')]);
    store.select('a');
    store.clear();
    const state = useClipsStore.getState();
    expect(state.directoryHandle).toBeUndefined();
    expect(state.clips).toEqual([]);
    expect(state.selectedClipId).toBeUndefined();
  });
});
