import { create } from 'zustand';

import type { ClipMeta } from '~/types';

interface ClipsState {
  clear: () => void;
  clips: ClipMeta[];
  directoryHandle: FileSystemDirectoryHandle | undefined;
  removeClip: (id: string) => void;
  select: (id: string | undefined) => void;
  selectedClipId: string | undefined;
  setClips: (clips: ClipMeta[]) => void;
  setDirectory: (handle: FileSystemDirectoryHandle) => void;
}

export const useClipsStore = create<ClipsState>((set) => ({
  directoryHandle: undefined,
  clips: [],
  selectedClipId: undefined,
  setDirectory: (handle) => set({ directoryHandle: handle }),
  setClips: (clips) => set({ clips }),
  select: (id) => set({ selectedClipId: id }),
  removeClip: (id) =>
    set((state) => {
      const index = state.clips.findIndex((clip) => clip.id === id);
      if (index === -1) return {};

      const clips = state.clips.filter((clip) => clip.id !== id);
      const selectedClipId =
        state.selectedClipId === id
          ? (clips[index]?.id ?? clips[index - 1]?.id)
          : state.selectedClipId;

      return { clips, selectedClipId };
    }),
  clear: () =>
    set({
      directoryHandle: undefined,
      clips: [],
      selectedClipId: undefined,
    }),
}));
