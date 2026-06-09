import { useCallback, useEffect } from 'react';

import { ResizeHandle } from '~/components/ui/resize-handle';
import { requestPermission } from '~/fs/handleStore';
import { cn } from '~/lib/cn';
import { useClipDataStore } from '~/state/clipDataStore';
import { useClipsStore } from '~/state/clipsStore';
import { useEditModeStore } from '~/state/editModeStore';
import {
  CLIPS_WIDTH_MAX,
  CLIPS_WIDTH_MIN,
  INSPECTOR_WIDTH_MAX,
  INSPECTOR_WIDTH_MIN,
  useLayoutStore,
} from '~/state/layoutStore';
import { usePrefsStore } from '~/state/prefsStore';
import { toast } from '~/state/toastStore';

import { LeftSidebar } from './LeftSidebar';
import { Preview } from './Preview';
import { RightSidebar } from './RightSidebar';
import { Transport } from './Transport';

export function Shell() {
  const mode = useEditModeStore((s) => s.mode);
  const selectedClipId = useClipsStore((s) => s.selectedClipId);
  const clipDirHandle = usePrefsStore((s) => s.clipDirHandle);

  useEffect(() => {
    if (mode !== 'edit') return;
    if (!selectedClipId) return;
    let cancelled = false;
    (async () => {
      if (clipDirHandle) {
        try {
          const status = await requestPermission(clipDirHandle, 'readwrite');
          if (cancelled) return;
          if (status === 'denied') {
            useClipDataStore.getState().markReadOnly(selectedClipId, true);
            toast.warning(
              "Markers won't persist — clip folder write permission was denied",
            );
          } else {
            useClipDataStore.getState().markReadOnly(selectedClipId, false);
          }
        } catch {
          /* fall through to load; clipDataStore handles per-entry readOnly. */
        }
      }
      if (cancelled) return;
      await useClipDataStore.getState().load(selectedClipId);
    })();
    return () => {
      cancelled = true;
    };
  }, [mode, selectedClipId, clipDirHandle]);

  useEffect(() => {
    if (mode !== 'edit') return;
    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [mode]);

  useEffect(() => {
    if (mode !== 'edit') return;
    useEditModeStore.getState().clearSelection();
    if (selectedClipId) {
      void useClipDataStore.getState().load(selectedClipId);
    }
  }, [selectedClipId, mode]);

  const clipsWidth = useLayoutStore((s) =>
    mode === 'edit' ? s.edit.clipsWidth : s.view.clipsWidth,
  );
  const inspectorWidth = useLayoutStore((s) =>
    mode === 'edit' ? s.edit.inspectorWidth : s.view.inspectorWidth,
  );
  const inspectorCollapsed = useLayoutStore((s) => s.inspectorCollapsed);
  const setClipsWidth = useLayoutStore((s) => s.setClipsWidth);
  const setInspectorWidth = useLayoutStore((s) => s.setInspectorWidth);

  const onClipsResize = useCallback(
    (px: number) => setClipsWidth(mode, px),
    [mode, setClipsWidth],
  );
  const onInspectorResize = useCallback(
    (px: number) => setInspectorWidth(mode, px),
    [mode, setInspectorWidth],
  );

  const getClipsWidth = useCallback(() => {
    const s = useLayoutStore.getState();
    return mode === 'edit' ? s.edit.clipsWidth : s.view.clipsWidth;
  }, [mode]);
  const getInspectorWidth = useCallback(() => {
    const s = useLayoutStore.getState();
    return mode === 'edit' ? s.edit.inspectorWidth : s.view.inspectorWidth;
  }, [mode]);

  return (
    <div
      className="grid h-dvh w-dvw overflow-hidden bg-background text-text transition-[grid-template-columns] duration-200 ease-out"
      style={{
        gridTemplateColumns: `${clipsWidth}px minmax(0, 1fr) ${inspectorCollapsed ? 0 : inspectorWidth}px`,
        gridTemplateRows: 'minmax(0, 1fr) 52px',
      }}
    >
      <aside className="col-start-1 row-start-1 relative min-h-0 min-w-0 overflow-hidden bg-background-secondary">
        <LeftSidebar />
        <ResizeHandle
          className="absolute inset-y-0 right-0"
          edge="left"
          getWidth={getClipsWidth}
          max={CLIPS_WIDTH_MAX}
          min={CLIPS_WIDTH_MIN}
          onChange={onClipsResize}
        />
      </aside>

      <section className="col-start-2 row-start-1 min-h-0 min-w-0 overflow-hidden bg-background">
        <Preview />
      </section>

      <aside
        className={cn(
          'col-start-3 row-start-1 relative min-h-0 min-w-0 overflow-hidden bg-background-secondary',
          inspectorCollapsed && 'pointer-events-none opacity-0',
        )}
      >
        <ResizeHandle
          className="absolute inset-y-0 left-0"
          edge="right"
          getWidth={getInspectorWidth}
          max={INSPECTOR_WIDTH_MAX}
          min={INSPECTOR_WIDTH_MIN}
          onChange={onInspectorResize}
        />
        <RightSidebar />
      </aside>

      <footer className="col-span-3 col-start-1 row-start-2 min-w-0 border-t border-border bg-background-secondary">
        <Transport />
      </footer>
    </div>
  );
}
