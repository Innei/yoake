import { useMemo } from 'react';

import { ExportPanel } from '~/app/ExportPanel';
import { useClipsStore } from '~/state/clipsStore';
import { useEditStore } from '~/state/editStore';
import { useGpuStore } from '~/state/gpuStore';

export function ContextExportAction() {
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

  if (!device || !pipelines || !caps || !video) {
    return (
      <div className="p-4 text-xs text-text-tertiary">
        Export panel will appear once the GPU and a clip are ready.
      </div>
    );
  }

  return (
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
  );
}
