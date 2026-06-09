import { create } from 'zustand';

import type {
  GradeState,
  Marker,
  Segment,
  SegmentPlayMode,
  SidecarV2,
} from '~/fs/clipSidecar';
import {
  readSidecar,
  SIDECAR_VERSION,
  validateSegments,
  writeSidecar,
} from '~/fs/clipSidecar';
import { useClipsStore } from '~/state/clipsStore';
import { usePrefsStore } from '~/state/prefsStore';
import { toast } from '~/state/toastStore';

export type ClipEntryStatus = 'idle' | 'loading' | 'writing' | 'error';

export interface ClipEntry {
  baseGrade: GradeState;
  error?: string;
  markers: Marker[];
  readOnly: boolean;
  segments: Segment[];
  status: ClipEntryStatus;
}

export interface AddSegmentOptions {
  freezeDurationSec?: number;
  gradeOverride?: Partial<GradeState>;
  label?: string;
  playMode?: SegmentPlayMode;
  speed?: number;
}

interface ClipDataState {
  addMarker: (clipId: string, time: number, label?: string) => string;
  addSegment: (
    clipId: string,
    inSec: number,
    outSec: number,
    opts?: AddSegmentOptions,
  ) => string | undefined;
  clearSegmentGradeOverride: (clipId: string, segId: string) => void;
  entries: Record<string, ClipEntry>;
  hasPendingWrites: () => boolean;
  load: (clipId: string) => Promise<void>;
  markReadOnly: (clipId: string, readOnly: boolean) => void;
  removeMarker: (clipId: string, id: string) => void;
  removeSegment: (clipId: string, segId: string) => void;
  setBaseGrade: (clipId: string, patch: Partial<GradeState>) => void;
  setSegmentFreezeDuration: (
    clipId: string,
    segId: string,
    secs: number,
  ) => void;
  setSegmentGradeOverride: (
    clipId: string,
    segId: string,
    patch: Partial<GradeState>,
  ) => void;
  setSegmentPlayMode: (
    clipId: string,
    segId: string,
    mode: SegmentPlayMode,
  ) => void;
  setSegmentSpeed: (clipId: string, segId: string, speed: number) => void;
  splitAtTime: (
    clipId: string,
    time: number,
  ) => [leftId: string, rightId: string] | undefined;
  updateMarker: (
    clipId: string,
    id: string,
    patch: Partial<Pick<Marker, 'label' | 'time'>>,
  ) => void;
  updateSegment: (
    clipId: string,
    segId: string,
    patch: Partial<Segment>,
  ) => void;
}

const inflightLoads = new Map<string, Promise<void>>();
const loadedClipIds = new Set<string>();
const writeChains = new Map<string, Promise<void>>();
let pendingWriteCount = 0;

export function __resetClipDataStoreCachesForTests(): void {
  inflightLoads.clear();
  loadedClipIds.clear();
  writeChains.clear();
  pendingWriteCount = 0;
}

function sortMarkers(markers: Marker[]): Marker[] {
  return [...markers].sort((a, b) => a.time - b.time);
}

function sortSegments(segments: Segment[]): Segment[] {
  return [...segments].sort((a, b) => a.in - b.in);
}

function stripExt(name: string): string {
  return name.replace(/\.[^./]+$/, '');
}

interface ClipLookup {
  baseName: string;
  dirHandle: FileSystemDirectoryHandle;
}

function lookupClip(clipId: string): ClipLookup | undefined {
  const clip = useClipsStore.getState().clips.find((c) => c.id === clipId);
  if (!clip) return undefined;
  const dirHandle = usePrefsStore.getState().clipDirHandle;
  if (!dirHandle) return undefined;
  return { baseName: stripExt(clip.name), dirHandle };
}

function updateEntry(
  clipId: string,
  patch: Partial<ClipEntry> | ((prev: ClipEntry) => Partial<ClipEntry>),
): void {
  useClipDataStore.setState((state) => {
    const prev = state.entries[clipId];
    if (!prev) return {};
    const next = typeof patch === 'function' ? patch(prev) : patch;
    return { entries: { ...state.entries, [clipId]: { ...prev, ...next } } };
  });
}

function emptyEntry(readOnly = false): ClipEntry {
  return {
    markers: [],
    segments: [],
    baseGrade: {},
    status: 'idle',
    readOnly,
  };
}

function enqueueWrite(clipId: string): void {
  const lookup = lookupClip(clipId);
  if (!lookup) return;
  const prevChain = writeChains.get(clipId) ?? Promise.resolve();
  pendingWriteCount += 1;
  const nextChain = prevChain
    .catch(() => undefined)
    .then(async () => {
      const entry = useClipDataStore.getState().entries[clipId];
      if (!entry) return;
      updateEntry(clipId, { status: 'writing' });
      const payload: SidecarV2 = {
        version: SIDECAR_VERSION,
        markers: entry.markers,
        segments: entry.segments,
        baseGrade: entry.baseGrade,
      };
      try {
        await writeSidecar(lookup.dirHandle, lookup.baseName, payload);
        useClipDataStore.setState((state) => {
          const prev = state.entries[clipId];
          if (!prev) return {};
          const { error: _drop, ...rest } = prev;
          void _drop;
          return {
            entries: {
              ...state.entries,
              [clipId]: { ...rest, status: 'idle' },
            },
          };
        });
      } catch (cause) {
        const message =
          cause instanceof Error ? cause.message : String(cause);
        updateEntry(clipId, { status: 'error', error: message });
        toast.error("Couldn't save markers", { description: message });
        throw cause;
      }
    })
    .finally(() => {
      pendingWriteCount -= 1;
      if (writeChains.get(clipId) === nextChain) {
        writeChains.delete(clipId);
      }
    });
  writeChains.set(clipId, nextChain);
}

function findContainingSegment(
  segments: readonly Segment[],
  time: number,
): Segment | undefined {
  return segments.find((s) => time > s.in && time < s.out);
}

export const useClipDataStore = create<ClipDataState>((set, get) => ({
  entries: {},
  load: async (clipId) => {
    const existing = inflightLoads.get(clipId);
    if (existing) return existing;
    if (loadedClipIds.has(clipId)) return;
    const lookup = lookupClip(clipId);
    if (!lookup) return;

    const current = get().entries[clipId];
    const preservedReadOnly = current?.readOnly ?? false;

    set((state) => ({
      entries: {
        ...state.entries,
        [clipId]: {
          markers: current?.markers ?? [],
          segments: current?.segments ?? [],
          baseGrade: current?.baseGrade ?? {},
          status: 'loading',
          readOnly: preservedReadOnly,
        },
      },
    }));

    const promise = (async () => {
      try {
        const data = await readSidecar(lookup.dirHandle, lookup.baseName);
        if (data === undefined) {
          set((state) => ({
            entries: {
              ...state.entries,
              [clipId]: {
                markers: [],
                segments: [],
                baseGrade: {},
                status: 'idle',
                readOnly: preservedReadOnly,
              },
            },
          }));
        } else {
          set((state) => ({
            entries: {
              ...state.entries,
              [clipId]: {
                markers: sortMarkers(data.markers),
                segments: sortSegments(data.segments),
                baseGrade: data.baseGrade,
                status: 'idle',
                readOnly: preservedReadOnly,
              },
            },
          }));
        }
        loadedClipIds.add(clipId);
      } catch (cause) {
        const message = cause instanceof Error ? cause.message : String(cause);
        set((state) => ({
          entries: {
            ...state.entries,
            [clipId]: {
              markers: [],
              segments: [],
              baseGrade: {},
              status: 'idle',
              readOnly: true,
              error: message,
            },
          },
        }));
        toast.error("Couldn't read marker sidecar", { description: message });
        loadedClipIds.add(clipId);
      } finally {
        inflightLoads.delete(clipId);
      }
    })();
    inflightLoads.set(clipId, promise);
    return promise;
  },
  addMarker: (clipId, time, label = '') => {
    const id = crypto.randomUUID();
    const marker: Marker = { id, time, label };
    set((state) => {
      const prev = state.entries[clipId];
      const base: ClipEntry = prev ?? emptyEntry();
      return {
        entries: {
          ...state.entries,
          [clipId]: { ...base, markers: sortMarkers([...base.markers, marker]) },
        },
      };
    });
    const entry = get().entries[clipId];
    if (entry && !entry.readOnly) enqueueWrite(clipId);
    return id;
  },
  updateMarker: (clipId, id, patch) => {
    set((state) => {
      const prev = state.entries[clipId];
      if (!prev) return {};
      const index = prev.markers.findIndex((m) => m.id === id);
      if (index === -1) return {};
      const existing = prev.markers[index]!;
      const next: Marker = {
        id: existing.id,
        time: patch.time ?? existing.time,
        label: patch.label ?? existing.label,
      };
      const markers =
        patch.time !== undefined && patch.time !== existing.time
          ? sortMarkers([
              ...prev.markers.slice(0, index),
              next,
              ...prev.markers.slice(index + 1),
            ])
          : [
              ...prev.markers.slice(0, index),
              next,
              ...prev.markers.slice(index + 1),
            ];
      return {
        entries: { ...state.entries, [clipId]: { ...prev, markers } },
      };
    });
    const entry = get().entries[clipId];
    if (entry && !entry.readOnly) enqueueWrite(clipId);
  },
  markReadOnly: (clipId, readOnly) => {
    if (!readOnly) loadedClipIds.delete(clipId);
    set((state) => {
      const prev = state.entries[clipId];
      if (prev) {
        if (prev.readOnly === readOnly) return {};
        return {
          entries: { ...state.entries, [clipId]: { ...prev, readOnly } },
        };
      }
      if (!readOnly) return {};
      return {
        entries: {
          ...state.entries,
          [clipId]: emptyEntry(true),
        },
      };
    });
  },
  removeMarker: (clipId, id) => {
    set((state) => {
      const prev = state.entries[clipId];
      if (!prev) return {};
      const markers = prev.markers.filter((m) => m.id !== id);
      if (markers.length === prev.markers.length) return {};
      return {
        entries: { ...state.entries, [clipId]: { ...prev, markers } },
      };
    });
    const entry = get().entries[clipId];
    if (entry && !entry.readOnly) enqueueWrite(clipId);
  },
  addSegment: (clipId, inSec, outSec, opts) => {
    const id = crypto.randomUUID();
    const segment: Segment = {
      id,
      in: inSec,
      out: outSec,
      playMode: opts?.playMode ?? 'normal',
      speed: opts?.speed ?? 1,
    };
    if (opts?.freezeDurationSec !== undefined) {
      segment.freezeDurationSec = opts.freezeDurationSec;
    }
    if (opts?.label !== undefined) segment.label = opts.label;
    if (opts?.gradeOverride !== undefined) {
      segment.gradeOverride = opts.gradeOverride;
    }

    let inserted = false;
    set((state) => {
      const prev = state.entries[clipId] ?? emptyEntry();
      const candidate = sortSegments([...prev.segments, segment]);
      if (!validateSegments(candidate)) return {};
      inserted = true;
      return {
        entries: {
          ...state.entries,
          [clipId]: { ...prev, segments: candidate },
        },
      };
    });
    if (!inserted) return undefined;
    const entry = get().entries[clipId];
    if (entry && !entry.readOnly) enqueueWrite(clipId);
    return id;
  },
  updateSegment: (clipId, segId, patch) => {
    let applied = false;
    set((state) => {
      const prev = state.entries[clipId];
      if (!prev) return {};
      const index = prev.segments.findIndex((s) => s.id === segId);
      if (index === -1) return {};
      const existing = prev.segments[index]!;
      const next: Segment = { ...existing, ...patch, id: existing.id };
      const candidate = sortSegments([
        ...prev.segments.slice(0, index),
        next,
        ...prev.segments.slice(index + 1),
      ]);
      if (!validateSegments(candidate)) return {};
      applied = true;
      return {
        entries: {
          ...state.entries,
          [clipId]: { ...prev, segments: candidate },
        },
      };
    });
    if (!applied) return;
    const entry = get().entries[clipId];
    if (entry && !entry.readOnly) enqueueWrite(clipId);
  },
  removeSegment: (clipId, segId) => {
    let changed = false;
    set((state) => {
      const prev = state.entries[clipId];
      if (!prev) return {};
      const segments = prev.segments.filter((s) => s.id !== segId);
      if (segments.length === prev.segments.length) return {};
      changed = true;
      return {
        entries: { ...state.entries, [clipId]: { ...prev, segments } },
      };
    });
    if (!changed) return;
    const entry = get().entries[clipId];
    if (entry && !entry.readOnly) enqueueWrite(clipId);
  },
  splitAtTime: (clipId, time) => {
    const entry = get().entries[clipId];
    if (!entry || entry.segments.length === 0) return undefined;
    const target = findContainingSegment(entry.segments, time);
    if (!target) return undefined;
    const leftId = crypto.randomUUID();
    const rightId = crypto.randomUUID();
    const left: Segment = { ...target, id: leftId, out: time };
    const right: Segment = { ...target, id: rightId, in: time };
    let applied = false;
    set((state) => {
      const prev = state.entries[clipId];
      if (!prev) return {};
      const without = prev.segments.filter((s) => s.id !== target.id);
      const candidate = sortSegments([...without, left, right]);
      if (!validateSegments(candidate)) return {};
      applied = true;
      return {
        entries: {
          ...state.entries,
          [clipId]: { ...prev, segments: candidate },
        },
      };
    });
    if (!applied) return undefined;
    const after = get().entries[clipId];
    if (after && !after.readOnly) enqueueWrite(clipId);
    return [leftId, rightId];
  },
  setSegmentPlayMode: (clipId, segId, mode) => {
    get().updateSegment(clipId, segId, { playMode: mode });
  },
  setSegmentSpeed: (clipId, segId, speed) => {
    get().updateSegment(clipId, segId, { speed });
  },
  setSegmentFreezeDuration: (clipId, segId, secs) => {
    get().updateSegment(clipId, segId, { freezeDurationSec: secs });
  },
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
  hasPendingWrites: () => pendingWriteCount > 0,
}));

export function findSegmentAtTime(
  clipId: string,
  time: number,
): Segment | undefined {
  const entry = useClipDataStore.getState().entries[clipId];
  if (!entry) return undefined;
  return entry.segments.find((s) => time >= s.in && time < s.out);
}

export function effectiveGrade(clipId: string, time: number): GradeState {
  const entry = useClipDataStore.getState().entries[clipId];
  if (!entry) return {};
  const base = entry.baseGrade;
  const segment = entry.segments.find((s) => time >= s.in && time < s.out);
  if (!segment || segment.gradeOverride === undefined) return base;
  return { ...base, ...segment.gradeOverride };
}
