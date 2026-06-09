import { useCallback } from 'react';

import { extractFrame } from '~/export/extractFrame';
import { exportCurrentFrame } from '~/export/render';
import { useClipsStore } from '~/state/clipsStore';
import { useEditStore } from '~/state/editStore';
import { useGpuStore } from '~/state/gpuStore';
import { usePrefsStore } from '~/state/prefsStore';
import { toast } from '~/state/toastStore';

export type FrameExtractHandler = () => Promise<void>;

function stripExt(name: string): string {
  return name.replace(/\.[^./]+$/, '');
}

async function renderSdrBlob(): Promise<Blob> {
  const { device, pipelines, lut3dTexture, video } = useGpuStore.getState();
  if (!device || !pipelines || !lut3dTexture || !video) {
    throw new Error('Preview pipeline not ready');
  }
  const { el: videoEl, getExternalTexture } = video;
  const width = videoEl.videoWidth;
  const height = videoEl.videoHeight;
  if (width <= 0 || height <= 0) {
    throw new Error('Clip not loaded');
  }
  if (videoEl.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
    throw new Error('No frame available yet');
  }

  const { grading, hdr } = useEditStore.getState();
  const frame = await exportCurrentFrame({
    device,
    sceneLinearPipeline: pipelines.sceneLinear,
    lutSdrPipeline: pipelines.lutSdrBase,
    hdrComposePipeline: pipelines.hdrCompose,
    getExternalTexture,
    hdrEnabled: false,
    hdrStrength: hdr.strength,
    lut3d: lut3dTexture,
    exposure: grading.exposure,
    peakNits: hdr.peakNits,
    width,
    height,
  });

  const offscreen = new OffscreenCanvas(frame.width, frame.height);
  const ctx = offscreen.getContext('2d');
  if (!ctx) throw new Error('OffscreenCanvas 2d context unavailable');
  const buffer = new ArrayBuffer(frame.sdrBaseBytes.byteLength);
  const bytes = new Uint8ClampedArray(buffer);
  bytes.set(frame.sdrBaseBytes);
  ctx.putImageData(new ImageData(bytes, frame.width, frame.height), 0, 0);
  return offscreen.convertToBlob({ type: 'image/png' });
}

async function revealExportDir(dir: FileSystemDirectoryHandle): Promise<void> {
  const opener = (dir as unknown as { open?: () => Promise<void> }).open;
  if (typeof opener === 'function') {
    try {
      await opener.call(dir);
      return;
    } catch {
      /* fall through to toast */
    }
  }
  toast.info('Reveal not supported', {
    description: `Open “${dir.name}” in your file manager.`,
  });
}

export function useFrameExtract(): FrameExtractHandler {
  return useCallback(async () => {
    const { clips, selectedClipId } = useClipsStore.getState();
    const clip = clips.find((c) => c.id === selectedClipId);
    if (!clip) {
      toast.error('No clip selected', {
        description: 'Pick a clip in the sidebar before extracting a frame.',
      });
      return;
    }

    const exportDir = usePrefsStore.getState().exportDirHandle;
    if (!exportDir) {
      toast.error('No export folder set', {
        description: 'Choose an export folder in Deliver before extracting.',
      });
      return;
    }

    const { currentTime } = useEditStore.getState();
    const baseName = stripExt(clip.name);

    try {
      const blob = await renderSdrBlob();
      const { filename } = await extractFrame({
        blob,
        baseName,
        currentTime,
        exportDir,
      });
      toast.success('Frame saved', {
        description: filename,
        action: {
          label: 'Reveal',
          onClick: () => {
            void revealExportDir(exportDir);
          },
        },
      });
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);
      toast.error("Couldn't save frame", { description: message });
    }
  }, []);
}
