import { useCallback } from 'react';

import { ResizeHandle } from '~/components/ui/resize-handle';
import { cn } from '~/lib/cn';
import { useEditModeStore } from '~/state/editModeStore';
import {
  CLIPS_WIDTH_MAX,
  CLIPS_WIDTH_MIN,
  INSPECTOR_WIDTH_MAX,
  INSPECTOR_WIDTH_MIN,
  useLayoutStore,
} from '~/state/layoutStore';

import { LeftSidebar } from './LeftSidebar';
import { Preview } from './Preview';
import { RightSidebar } from './RightSidebar';
import { Transport } from './Transport';

export function Shell() {
  const mode = useEditModeStore((s) => s.mode);

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
