import { get as idbGet, set as idbSet } from 'idb-keyval';
import { create } from 'zustand';

import type { LastSession } from '~/types';

export type PrefsHandleKey = 'clipDirHandle' | 'lutDirHandle' | 'exportDirHandle';

const IDB_KEYS: Record<PrefsHandleKey, string> = {
  clipDirHandle: 'prefs.clipDirHandle',
  lutDirHandle: 'prefs.lutDirHandle',
  exportDirHandle: 'prefs.exportDirHandle',
};

const LAST_SESSION_KEY = 'prefs.lastSession';
const DEFAULT_SESSION: LastSession = {
  grading: { exposure: 0 },
  hdr: { peakNits: 1000, strength: 0.2 },
};

function normalizeLastSession(session: LastSession | undefined): LastSession | undefined {
  if (!session) return undefined;
  return {
    ...session,
    hdr: {
      peakNits: session.hdr.peakNits,
      strength: session.hdr.strength ?? DEFAULT_SESSION.hdr.strength,
    },
  };
}

interface PrefsState {
  clipDirHandle: FileSystemDirectoryHandle | undefined;
  exportDirHandle: FileSystemDirectoryHandle | undefined;
  init: () => Promise<void>;
  lastSession: LastSession | undefined;
  lutDirHandle: FileSystemDirectoryHandle | undefined;
  setHandle: (
    key: PrefsHandleKey,
    handle: FileSystemDirectoryHandle,
  ) => Promise<void>;
  updateLastSession: (partial: Partial<LastSession>) => Promise<void>;
}

export const usePrefsStore = create<PrefsState>((set, get) => ({
  clipDirHandle: undefined,
  lutDirHandle: undefined,
  exportDirHandle: undefined,
  lastSession: undefined,
  setHandle: async (key, handle) => {
    set({ [key]: handle } as Pick<PrefsState, PrefsHandleKey>);
    await idbSet(IDB_KEYS[key], handle);
  },
  updateLastSession: async (partial) => {
    const prev = normalizeLastSession(get().lastSession);
    const base: LastSession = prev ?? DEFAULT_SESSION;
    const next: LastSession = normalizeLastSession({ ...base, ...partial }) ?? DEFAULT_SESSION;
    set({ lastSession: next });
    await idbSet(LAST_SESSION_KEY, next);
  },
  init: async () => {
    const [clipDirHandle, lutDirHandle, exportDirHandle, lastSession] =
      await Promise.all([
        idbGet<FileSystemDirectoryHandle>(IDB_KEYS.clipDirHandle),
        idbGet<FileSystemDirectoryHandle>(IDB_KEYS.lutDirHandle),
        idbGet<FileSystemDirectoryHandle>(IDB_KEYS.exportDirHandle),
        idbGet<LastSession>(LAST_SESSION_KEY),
      ]);
    set({
      clipDirHandle,
      lutDirHandle,
      exportDirHandle,
      lastSession: normalizeLastSession(lastSession),
    });
  },
}));
