import { create } from 'zustand';

import { useClipsStore } from '~/state/clipsStore';

export type EditMode = 'view' | 'edit';

export type OutlineSelection =
  | { kind: 'none' }
  | { kind: 'marker'; id: string }
  | { kind: 'segment'; id: string };

interface EditModeState {
  clearSelection: () => void;
  enter: () => void;
  exit: () => void;
  mode: EditMode;
  outlineSelection: OutlineSelection;
  selectMarker: (id: string) => void;
  selectSegment: (id: string) => void;
  toggle: () => void;
}

export const useEditModeStore = create<EditModeState>((set, get) => ({
  mode: 'view',
  outlineSelection: { kind: 'none' },
  enter: () => {
    if (useClipsStore.getState().selectedClipId === undefined) return;
    set({ mode: 'edit', outlineSelection: { kind: 'none' } });
  },
  exit: () => set({ mode: 'view' }),
  toggle: () => {
    if (get().mode === 'view') {
      get().enter();
    } else {
      get().exit();
    }
  },
  selectMarker: (id) => set({ outlineSelection: { kind: 'marker', id } }),
  selectSegment: (id) => set({ outlineSelection: { kind: 'segment', id } }),
  clearSelection: () => set({ outlineSelection: { kind: 'none' } }),
}));
