import { useMemo } from 'react';

import { useClipsStore } from '~/features/clips/clipsStore';
import { useEditStore } from '~/features/edit/editStore';
import { useGpuStore } from '~/features/preview/gpuStore';

import { ExportPanel } from '~/features/deliver/components/ExportPanel';
import { Inspector } from '~/features/grade/components/Inspector';

export function ViewRightPanel() {
  const device = useGpuStore((s) => s.device);
  const pipelines = useGpuStore((s) => s.pipelines);
  const caps = useGpuStore((s) => s.caps);
  const video = useGpuStore((s) => s.video);
  const lut3d = useGpuStore((s) => s.lut3dTexture);

  const selectedClip = useClipsStore((s) =>
    s.clips.find((c) => c.id === s.selectedClipId),
  );
  const lutDescriptor = useEditStore((s) => s.lutDescriptor);

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
    <div className="grid h-full min-h-0 grid-rows-[minmax(0,1fr)_auto]">
      <div className="min-h-0 overflow-auto">
        <Inspector />
      </div>
      <div className="min-h-0 border-t border-border">{exportPanel}</div>
    </div>
  );
}
