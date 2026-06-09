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

export type LayoutMode = 'view' | 'edit';

export interface LayoutWidths {
  clipsWidth: number;
  inspectorWidth: number;
}

interface LayoutState {
  edit: LayoutWidths;
  inspectorCollapsed: boolean;
  setClipsWidth: (mode: LayoutMode, px: number) => void;
  setInspectorCollapsed: (next: boolean) => void;
  setInspectorWidth: (mode: LayoutMode, px: number) => void;
  toggleInspector: () => void;
  view: LayoutWidths;
  widthsFor: (mode: LayoutMode) => LayoutWidths;
}

const defaultWidths = (): LayoutWidths => ({
  clipsWidth: CLIPS_WIDTH_DEFAULT,
  inspectorWidth: INSPECTOR_WIDTH_DEFAULT,
});

export const useLayoutStore = create<LayoutState>()(
  persist(
    (set, get) => ({
      view: defaultWidths(),
      edit: defaultWidths(),
      inspectorCollapsed: false,
      widthsFor: (mode) => get()[mode],
      setClipsWidth: (mode, px) =>
        set((state) => ({
          [mode]: {
            ...state[mode],
            clipsWidth: clamp(px, CLIPS_WIDTH_MIN, CLIPS_WIDTH_MAX),
          },
        })),
      setInspectorWidth: (mode, px) =>
        set((state) => ({
          [mode]: {
            ...state[mode],
            inspectorWidth: clamp(px, INSPECTOR_WIDTH_MIN, INSPECTOR_WIDTH_MAX),
          },
        })),
      setInspectorCollapsed: (next) => set({ inspectorCollapsed: next }),
      toggleInspector: () =>
        set((s) => ({ inspectorCollapsed: !s.inspectorCollapsed })),
    }),
    {
      name: 'dji-lut.layout',
      version: 1,
      migrate: (persisted, fromVersion) => {
        if (fromVersion >= 1) return persisted as LayoutState;
        const legacy = (persisted ?? {}) as {
          clipsWidth?: number;
          inspectorCollapsed?: boolean;
          inspectorWidth?: number;
        };
        const view: LayoutWidths = {
          clipsWidth: legacy.clipsWidth ?? CLIPS_WIDTH_DEFAULT,
          inspectorWidth: legacy.inspectorWidth ?? INSPECTOR_WIDTH_DEFAULT,
        };
        return {
          view,
          edit: { ...view },
          inspectorCollapsed: legacy.inspectorCollapsed ?? false,
        } as LayoutState;
      },
      partialize: (s) => ({
        view: s.view,
        edit: s.edit,
        inspectorCollapsed: s.inspectorCollapsed,
      }),
    },
  ),
);
