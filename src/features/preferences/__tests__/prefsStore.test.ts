import { clear as idbClear, get as idbGet, set as idbSet } from 'idb-keyval';
import { beforeEach, describe, expect, it } from 'vitest';

import { usePrefsStore } from '~/features/preferences/prefsStore';
import type { LastSession } from '~/types';

const resetStore = () => {
  usePrefsStore.setState({
    clipDirHandle: undefined,
    lutDirHandle: undefined,
    exportDirHandle: undefined,
    lastSession: undefined,
  });
};

describe('prefsStore', () => {
  beforeEach(async () => {
    await idbClear();
    resetStore();
  });

  it('has the expected initial state', () => {
    const state = usePrefsStore.getState();
    expect(state.clipDirHandle).toBeUndefined();
    expect(state.lutDirHandle).toBeUndefined();
    expect(state.exportDirHandle).toBeUndefined();
    expect(state.lastSession).toBeUndefined();
  });

  it('setHandle stores the handle in state and persists to idb', async () => {
    const handle = { name: 'clips' } as unknown as FileSystemDirectoryHandle;
    await usePrefsStore.getState().setHandle('clipDirHandle', handle);
    expect(usePrefsStore.getState().clipDirHandle).toBe(handle);
    const persisted = await idbGet<FileSystemDirectoryHandle>(
      'prefs.clipDirHandle',
    );
    expect(persisted).toEqual(handle);
  });

  it('updateLastSession merges partial updates and persists', async () => {
    await usePrefsStore.getState().updateLastSession({ clipId: 'clip-1' });
    expect(usePrefsStore.getState().lastSession).toEqual({
      clipId: 'clip-1',
      grading: { exposure: 0 },
      hdr: { peakNits: 1000, strength: 0.2 },
    });
    await usePrefsStore.getState().updateLastSession({ lutId: 'lut-1' });
    const merged = usePrefsStore.getState().lastSession;
    expect(merged).toEqual({
      clipId: 'clip-1',
      lutId: 'lut-1',
      grading: { exposure: 0 },
      hdr: { peakNits: 1000, strength: 0.2 },
    });
    const persisted = await idbGet<LastSession>('prefs.lastSession');
    expect(persisted).toEqual(merged);
  });

  it('init hydrates handles and lastSession from idb', async () => {
    const clipHandle = { name: 'clips' } as unknown as FileSystemDirectoryHandle;
    const lutHandle = { name: 'luts' } as unknown as FileSystemDirectoryHandle;
    const exportHandle = {
      name: 'exports',
    } as unknown as FileSystemDirectoryHandle;
    const session: LastSession = {
      clipId: 'c',
      lutId: 'l',
      grading: { exposure: 0.5 },
      hdr: { peakNits: 600, strength: 0.45 },
    };
    await idbSet('prefs.clipDirHandle', clipHandle);
    await idbSet('prefs.lutDirHandle', lutHandle);
    await idbSet('prefs.exportDirHandle', exportHandle);
    await idbSet('prefs.lastSession', session);

    await usePrefsStore.getState().init();

    const state = usePrefsStore.getState();
    expect(state.clipDirHandle).toEqual(clipHandle);
    expect(state.lutDirHandle).toEqual(lutHandle);
    expect(state.exportDirHandle).toEqual(exportHandle);
    expect(state.lastSession).toEqual(session);
  });

  it('normalizes older lastSession values without hdr strength', async () => {
    const session = {
      grading: { exposure: 0.5 },
      hdr: { peakNits: 600 },
    } as LastSession;
    await idbSet('prefs.lastSession', session);

    await usePrefsStore.getState().init();

    expect(usePrefsStore.getState().lastSession).toEqual({
      grading: { exposure: 0.5 },
      hdr: { peakNits: 600, strength: 0.2 },
    });
  });

  it('init leaves state as undefined when idb is empty', async () => {
    await usePrefsStore.getState().init();
    const state = usePrefsStore.getState();
    expect(state.clipDirHandle).toBeUndefined();
    expect(state.lutDirHandle).toBeUndefined();
    expect(state.exportDirHandle).toBeUndefined();
    expect(state.lastSession).toBeUndefined();
  });
});
