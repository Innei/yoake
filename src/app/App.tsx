import { useCallback, useEffect, useRef, useState } from 'react';

import { parseCubeLut } from '~/color/lutCube';
import { Toaster } from '~/components/ui/toaster';
import { scanClips } from '~/fs/clipScanner';
import { ensurePermission } from '~/fs/handleStore';
import { readLut, scanLuts } from '~/fs/lutLoader';
import { WebGpuUnavailableError } from '~/gpu/Device';
import { useClipsStore } from '~/state/clipsStore';
import { useEditStore } from '~/state/editStore';
import { usePrefsStore } from '~/state/prefsStore';
import type { ClipMeta, LastSession } from '~/types';

import { Layout } from './Layout';
import { ShortcutHelp } from './ShortcutHelp';
import { useGlobalShortcuts } from './shortcuts';

type BootStatus =
  | { kind: 'error'; cause: WebGpuUnavailableError | Error }
  | { kind: 'pending' }
  | { kind: 'ready' };

async function probeWebGpu(): Promise<void> {
  if (!navigator.gpu) {
    throw new WebGpuUnavailableError(
      'navigator.gpu is unavailable. This tool requires macOS Chrome with WebGPU enabled.',
    );
  }
  const adapter = await navigator.gpu.requestAdapter();
  if (!adapter) {
    throw new WebGpuUnavailableError(
      'navigator.gpu.requestAdapter() returned null. No compatible GPU adapter was found.',
    );
  }
}

export function App() {
  const [status, setStatus] = useState<BootStatus>({ kind: 'pending' });
  const [helpOpen, setHelpOpen] = useState(false);
  const restoredRef = useRef(false);
  const showHelp = useCallback(() => setHelpOpen(true), []);
  useGlobalShortcuts({ onShowHelp: showHelp });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await probeWebGpu();
        await usePrefsStore.getState().init();
        if (cancelled) return;
        setStatus({ kind: 'ready' });
      } catch (cause) {
        if (cancelled) return;
        if (cause instanceof WebGpuUnavailableError) {
          setStatus({ kind: 'error', cause });
        } else {
          setStatus({
            kind: 'error',
            cause: cause instanceof Error ? cause : new Error(String(cause)),
          });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (status.kind !== 'ready' || restoredRef.current) return;
    restoredRef.current = true;
    void restoreLastSession().then(() => {
      subscribePersistence();
    });
  }, [status.kind]);

  if (status.kind === 'pending') {
    return (
      <main className="flex h-dvh items-center justify-center bg-background text-sm text-text/70">
        Loading…
      </main>
    );
  }

  if (status.kind === 'error') {
    const isWebGpu = status.cause instanceof WebGpuUnavailableError;
    return (
      <main className="flex h-dvh flex-col items-center justify-center gap-3 bg-background px-8 text-center text-text">
        <h1 className="text-lg font-medium">
          {isWebGpu ? 'WebGPU unavailable' : 'Startup failed'}
        </h1>
        <p className="max-w-md text-sm text-text/70">{status.cause.message}</p>
        {isWebGpu ? (
          <p className="max-w-md text-xs text-text/50">
            Open this tool in macOS Chrome with WebGPU enabled. Check chrome://gpu to confirm
            hardware acceleration is on.
          </p>
        ) : null}
      </main>
    );
  }

  return (
    <>
      <Layout />
      <Toaster />
      <ShortcutHelp open={helpOpen} onClose={() => setHelpOpen(false)} />
    </>
  );
}

function subscribePersistence(): void {
  useClipsStore.subscribe((state, prev) => {
    if (state.selectedClipId === prev.selectedClipId) return;
    void usePrefsStore.getState().updateLastSession({ clipId: state.selectedClipId });
  });
  useEditStore.subscribe((state, prev) => {
    const changed =
      state.lutDescriptor !== prev.lutDescriptor ||
      state.grading.exposure !== prev.grading.exposure ||
      state.hdr.peakNits !== prev.hdr.peakNits ||
      state.hdr.strength !== prev.hdr.strength;
    if (!changed) return;
    const patch: Partial<LastSession> = {
      grading: state.grading,
      hdr: state.hdr,
    };
    if (state.lutDescriptor?.id !== undefined) {
      patch.lutId = state.lutDescriptor.id;
    }
    void usePrefsStore.getState().updateLastSession(patch);
  });
}

async function restoreLastSession(): Promise<void> {
  const prefs = usePrefsStore.getState();
  const session = prefs.lastSession;

  if (session?.grading) {
    useEditStore.getState().setExposure(session.grading.exposure);
  }
  if (session?.hdr) {
    useEditStore.getState().setPeakNits(session.hdr.peakNits);
    useEditStore.getState().setHdrStrength(session.hdr.strength);
  }

  const { clipDirHandle, lutDirHandle } = prefs;

  if (clipDirHandle) {
    try {
      const status = await ensurePermission(clipDirHandle, 'read');
      if (status === 'granted') {
        useClipsStore.getState().setDirectory(clipDirHandle);
        const entries = await scanClips(clipDirHandle);
        const mapped: ClipMeta[] = entries.map((entry) => ({
          id: entry.id,
          name: entry.name,
          size: entry.size,
          lastModified: entry.lastModified,
          handle: entry.fileHandle,
        }));
        useClipsStore.getState().setClips(mapped);
        if (session?.clipId && mapped.some((c) => c.id === session.clipId)) {
          useClipsStore.getState().select(session.clipId);
        }
      }
    } catch {
      /* fall through: a degraded boot still lets the user re-grant manually */
    }
  }

  if (lutDirHandle && session?.lutId) {
    try {
      const status = await ensurePermission(lutDirHandle, 'read');
      if (status !== 'granted') return;
      const luts = await scanLuts(lutDirHandle);
      const match = luts.find((l) => l.id === session.lutId);
      if (!match) return;
      const text = await readLut(match.fileHandle);
      const parsed = parseCubeLut(text);
      useEditStore
        .getState()
        .setLut({ id: match.id, name: match.name, handle: match.fileHandle }, parsed);
    } catch {
      /* fall through */
    }
  }
}
