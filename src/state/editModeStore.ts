import { create } from 'zustand';

import { useClipsStore } from '~/state/clipsStore';

export type EditMode = 'view' | 'edit';

export type OutlineSelection =
  | { kind: 'none' }
  | { kind: 'marker'; id: string }
  | { kind: 'segment'; id: string };

export type CutMode =
  | { active: false }
  | { active: true; segmentId: string };

interface EditModeState {
  clearSelection: () => void;
  cutMode: CutMode;
  enter: () => void;
  enterCutMode: (segmentId: string) => void;
  exit: () => void;
  exitCutMode: () => void;
  mode: EditMode;
  outlineSelection: OutlineSelection;
  selectMarker: (id: string) => void;
  selectSegment: (id: string) => void;
  toggle: () => void;
}

export const useEditModeStore = create<EditModeState>((set, get) => ({
  mode: 'view',
  outlineSelection: { kind: 'none' },
  cutMode: { active: false },
  enter: () => {
    if (useClipsStore.getState().selectedClipId === undefined) return;
    set({ mode: 'edit', outlineSelection: { kind: 'none' } });
  },
  exit: () =>
    set({ mode: 'view', cutMode: { active: false } }),
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
  enterCutMode: (segmentId) =>
    set({
      cutMode: { active: true, segmentId },
      outlineSelection: { kind: 'segment', id: segmentId },
    }),
  exitCutMode: () => set({ cutMode: { active: false } }),
}));
