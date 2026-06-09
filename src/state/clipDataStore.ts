import { create } from 'zustand';

import type { Marker, SidecarV1 } from '~/fs/clipSidecar';
import { readSidecar, SIDECAR_VERSION, writeSidecar } from '~/fs/clipSidecar';
import { useClipsStore } from '~/state/clipsStore';
import { usePrefsStore } from '~/state/prefsStore';
import { toast } from '~/state/toastStore';

export type ClipEntryStatus = 'idle' | 'loading' | 'writing' | 'error';

export interface ClipEntry {
  error?: string;
  markers: Marker[];
  readOnly: boolean;
  status: ClipEntryStatus;
}

interface ClipDataState {
  addMarker: (clipId: string, time: number, label?: string) => string;
  entries: Record<string, ClipEntry>;
  hasPendingWrites: () => boolean;
  load: (clipId: string) => Promise<void>;
  removeMarker: (clipId: string, id: string) => void;
  updateMarker: (
    clipId: string,
    id: string,
    patch: Partial<Pick<Marker, 'label' | 'time'>>,
  ) => void;
}

const inflightLoads = new Map<string, Promise<void>>();
const writeChains = new Map<string, Promise<void>>();
let pendingWriteCount = 0;

function sortMarkers(markers: Marker[]): Marker[] {
  return [...markers].sort((a, b) => a.time - b.time);
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
      const payload: SidecarV1 = {
        version: SIDECAR_VERSION,
        markers: entry.markers,
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

export const useClipDataStore = create<ClipDataState>((set, get) => ({
  entries: {},
  load: async (clipId) => {
    const existing = inflightLoads.get(clipId);
    if (existing) return existing;
    const current = get().entries[clipId];
    if (current && current.status !== 'loading') {
      return;
    }
    const lookup = lookupClip(clipId);
    if (!lookup) return;

    set((state) => ({
      entries: {
        ...state.entries,
        [clipId]: {
          markers: current?.markers ?? [],
          status: 'loading',
          readOnly: current?.readOnly ?? false,
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
              [clipId]: { markers: [], status: 'idle', readOnly: false },
            },
          }));
          return;
        }
        set((state) => ({
          entries: {
            ...state.entries,
            [clipId]: {
              markers: sortMarkers(data.markers),
              status: 'idle',
              readOnly: false,
            },
          },
        }));
      } catch (cause) {
        const message = cause instanceof Error ? cause.message : String(cause);
        set((state) => ({
          entries: {
            ...state.entries,
            [clipId]: {
              markers: [],
              status: 'idle',
              readOnly: true,
              error: message,
            },
          },
        }));
        toast.error("Couldn't read marker sidecar", { description: message });
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
      const base: ClipEntry = prev ?? {
        markers: [],
        status: 'idle',
        readOnly: false,
      };
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
  hasPendingWrites: () => pendingWriteCount > 0,
}));
