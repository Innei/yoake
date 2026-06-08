import { useMemo } from 'react';

import { ResizeHandle } from '~/components/ui/resize-handle';
import { cn } from '~/lib/cn';
import { useClipsStore } from '~/state/clipsStore';
import { useEditStore } from '~/state/editStore';
import { useGpuStore } from '~/state/gpuStore';
import {
  CLIPS_WIDTH_MAX,
  CLIPS_WIDTH_MIN,
  INSPECTOR_WIDTH_MAX,
  INSPECTOR_WIDTH_MIN,
  useLayoutStore,
} from '~/state/layoutStore';

import { ClipList } from './ClipList';
import { ExportPanel } from './ExportPanel';
import { Inspector } from './Inspector';
import { Preview } from './Preview';
import { Transport } from './Transport';

export function Layout() {
  const device = useGpuStore((s) => s.device);
  const pipelines = useGpuStore((s) => s.pipelines);
  const caps = useGpuStore((s) => s.caps);
  const video = useGpuStore((s) => s.video);
  const lut3d = useGpuStore((s) => s.lut3dTexture);

  const selectedClip = useClipsStore((s) =>
    s.clips.find((c) => c.id === s.selectedClipId),
  );
  const lutDescriptor = useEditStore((s) => s.lutDescriptor);

  const clipsWidth = useLayoutStore((s) => s.clipsWidth);
  const inspectorWidth = useLayoutStore((s) => s.inspectorWidth);
  const inspectorCollapsed = useLayoutStore((s) => s.inspectorCollapsed);
  const setClipsWidth = useLayoutStore((s) => s.setClipsWidth);
  const setInspectorWidth = useLayoutStore((s) => s.setInspectorWidth);

  const clipBaseName = useMemo(() => {
    if (!selectedClip) return 'frame';
    return selectedClip.name.replaceAll(/\.[^./]+$/g, '');
  }, [selectedClip]);

  const lutLabel = useMemo(() => {
    if (!lutDescriptor) return 'no-lut';
    return lutDescriptor.name.replace(/\.cube$/i, '');
  }, [lutDescriptor]);

  const exportPanel =
    device && pipelines && caps && video ? (
      <ExportPanel
        clipBaseName={clipBaseName}
        device={device}
        gainmapPipeline={pipelines.gainmap}
        getExternalTexture={video.getExternalTexture}
        hdrCaps={{ toneMappingExtended: caps.toneMappingExtended }}
        hdrComposePipeline={pipelines.hdrCompose}
        height={video.el.videoHeight || 0}
        lut3d={lut3d}
        lutLabel={lutLabel}
        lutSdrPipeline={pipelines.lutSdrBase}
        sceneLinearPipeline={pipelines.sceneLinear}
        videoEl={video.el}
        width={video.el.videoWidth || 0}
      />
    ) : (
      <div className="p-4 text-xs text-text-tertiary">
        Export panel will appear once the GPU and a clip are ready.
      </div>
    );

  return (
    <div
      className="grid h-dvh w-dvw overflow-hidden bg-background text-text transition-[grid-template-columns] duration-200 ease-out"
      style={{
        gridTemplateColumns: `${clipsWidth}px minmax(0, 1fr) ${inspectorCollapsed ? 0 : inspectorWidth}px`,
        gridTemplateRows: 'minmax(0, 1fr) 52px',
      }}
    >
      <aside className="col-start-1 row-start-1 relative min-h-0 min-w-0 overflow-hidden bg-background-secondary">
        <ClipList />
        <ResizeHandle
          className="absolute inset-y-0 right-0"
          edge="left"
          getWidth={() => useLayoutStore.getState().clipsWidth}
          max={CLIPS_WIDTH_MAX}
          min={CLIPS_WIDTH_MIN}
          onChange={setClipsWidth}
        />
      </aside>

      <section className="col-start-2 row-start-1 min-h-0 min-w-0 overflow-hidden bg-background">
        <Preview />
      </section>

      <aside
        className={cn(
          'col-start-3 row-start-1 relative grid min-h-0 min-w-0 grid-rows-[minmax(0,1fr)_auto] overflow-hidden bg-background-secondary',
          inspectorCollapsed && 'pointer-events-none opacity-0',
        )}
      >
        <ResizeHandle
          className="absolute inset-y-0 left-0"
          edge="right"
          getWidth={() => useLayoutStore.getState().inspectorWidth}
          max={INSPECTOR_WIDTH_MAX}
          min={INSPECTOR_WIDTH_MIN}
          onChange={setInspectorWidth}
        />
        <div className="min-h-0 overflow-auto">
          <Inspector />
        </div>
        <div className="min-h-0 border-t border-border">{exportPanel}</div>
      </aside>

      <footer className="col-span-3 col-start-1 row-start-2 min-w-0 border-t border-border bg-background-secondary">
        <Transport />
      </footer>
    </div>
  );
}
