import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export const CLIPS_WIDTH_MIN = 200;
export const CLIPS_WIDTH_MAX = 400;
export const CLIPS_WIDTH_DEFAULT = 240;

export const INSPECTOR_WIDTH_MIN = 280;
export const INSPECTOR_WIDTH_MAX = 480;
export const INSPECTOR_WIDTH_DEFAULT = 320;

function clamp(v: number, lo: number, hi: number): number {
  if (!Number.isFinite(v)) return lo;
  return Math.min(hi, Math.max(lo, v));
}

interface LayoutState {
  clipsWidth: number;
  inspectorCollapsed: boolean;
  inspectorWidth: number;
  setClipsWidth: (px: number) => void;
  setInspectorCollapsed: (next: boolean) => void;
  setInspectorWidth: (px: number) => void;
  toggleInspector: () => void;
}

export const useLayoutStore = create<LayoutState>()(
  persist(
    (set) => ({
      clipsWidth: CLIPS_WIDTH_DEFAULT,
      inspectorWidth: INSPECTOR_WIDTH_DEFAULT,
      inspectorCollapsed: false,
      setClipsWidth: (px) =>
        set({ clipsWidth: clamp(px, CLIPS_WIDTH_MIN, CLIPS_WIDTH_MAX) }),
      setInspectorWidth: (px) =>
        set({
          inspectorWidth: clamp(px, INSPECTOR_WIDTH_MIN, INSPECTOR_WIDTH_MAX),
        }),
      setInspectorCollapsed: (next) => set({ inspectorCollapsed: next }),
      toggleInspector: () =>
        set((s) => ({ inspectorCollapsed: !s.inspectorCollapsed })),
    }),
    {
      name: 'dji-lut.layout',
      partialize: (s) => ({
        clipsWidth: s.clipsWidth,
        inspectorWidth: s.inspectorWidth,
        inspectorCollapsed: s.inspectorCollapsed,
      }),
    },
  ),
);
