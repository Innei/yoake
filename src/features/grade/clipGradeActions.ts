import type { StoreApi } from 'zustand';

import type { GradeState, Segment } from '~/lib/fs/clipSidecar';

import type { ClipDataState, ClipEntry } from '~/features/clips/clipDataStore';

interface GradeActionDeps {
  emptyEntry: (readOnly?: boolean) => ClipEntry;
  enqueueWrite: (clipId: string) => void;
  get: StoreApi<ClipDataState>['getState'];
  set: StoreApi<ClipDataState>['setState'];
}

interface GradeActions {
  clearSegmentGradeOverride: (clipId: string, segId: string) => void;
  setBaseGrade: (clipId: string, patch: Partial<GradeState>) => void;
  setSegmentGradeOverride: (
    clipId: string,
    segId: string,
    patch: Partial<GradeState>,
  ) => void;
}

export function createGradeActions(deps: GradeActionDeps): GradeActions {
  const { emptyEntry, enqueueWrite, get, set } = deps;
  return {
    setBaseGrade: (clipId, patch) => {
      let changed = false;
      set((state) => {
        const prev = state.entries[clipId] ?? emptyEntry();
        const baseGrade = { ...prev.baseGrade, ...patch };
        changed = true;
        return {
          entries: {
            ...state.entries,
            [clipId]: { ...prev, baseGrade },
          },
        };
      });
      if (!changed) return;
      const entry = get().entries[clipId];
      if (entry && !entry.readOnly) enqueueWrite(clipId);
    },
    setSegmentGradeOverride: (clipId, segId, patch) => {
      let applied = false;
      set((state) => {
        const prev = state.entries[clipId];
        if (!prev) return {};
        const index = prev.segments.findIndex((s) => s.id === segId);
        if (index === -1) return {};
        const existing = prev.segments[index]!;
        const next: Segment = {
          ...existing,
          gradeOverride: { ...existing.gradeOverride, ...patch },
        };
        applied = true;
        return {
          entries: {
            ...state.entries,
            [clipId]: {
              ...prev,
              segments: [
                ...prev.segments.slice(0, index),
                next,
                ...prev.segments.slice(index + 1),
              ],
            },
          },
        };
      });
      if (!applied) return;
      const entry = get().entries[clipId];
      if (entry && !entry.readOnly) enqueueWrite(clipId);
    },
    clearSegmentGradeOverride: (clipId, segId) => {
      let applied = false;
      set((state) => {
        const prev = state.entries[clipId];
        if (!prev) return {};
        const index = prev.segments.findIndex((s) => s.id === segId);
        if (index === -1) return {};
        const existing = prev.segments[index]!;
        if (existing.gradeOverride === undefined) return {};
        const { gradeOverride: _drop, ...rest } = existing;
        void _drop;
        const next: Segment = rest;
        applied = true;
        return {
          entries: {
            ...state.entries,
            [clipId]: {
              ...prev,
              segments: [
                ...prev.segments.slice(0, index),
                next,
                ...prev.segments.slice(index + 1),
              ],
            },
          },
        };
      });
      if (!applied) return;
      const entry = get().entries[clipId];
      if (entry && !entry.readOnly) enqueueWrite(clipId);
    },
  };
}
