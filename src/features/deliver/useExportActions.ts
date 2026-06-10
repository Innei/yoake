import { useCallback, useState } from 'react';

import { exportCurrentFrame } from '~/lib/export/render';
import { encodeSdrJpeg } from '~/lib/export/sdrJpeg';
import { encodeUltraHdrJpeg } from '~/lib/export/ultraHdrJpeg';
import { writeJpegToDir } from '~/lib/export/writeFile';
import { useEditStore } from '~/features/edit/editStore';
import { toast } from '~/components/ui/toast/toastStore';

import type { ExportFormat, ExportPanelProps, ExportStatus } from './exportPanelTypes';
import { buildFilename, errorMessage, frameMsFromVideo } from './exportPanelUtils';

interface UseExportActionsInput extends ExportPanelProps {
  exportDirHandle: FileSystemDirectoryHandle | undefined;
}

export function useExportActions(input: UseExportActionsInput) {
  const {
    clipBaseName,
    device,
    exportDirHandle,
    getExternalTexture,
    hdrComposePipeline,
    height,
    lut3d,
    lutLabel,
    lutSdrPipeline,
    sceneLinearPipeline,
    videoEl,
    width,
  } = input;

  const exposure = useEditStore((s) => s.grading.exposure);
  const peakNits = useEditStore((s) => s.hdr.peakNits);
  const hdrStrength = useEditStore((s) => s.hdr.strength);
  const hdrEnabled = useEditStore((s) => s.hdrEnabled);
  const [status, setStatus] = useState<ExportStatus>({ kind: 'idle' });

  const runExport = useCallback(
    async (format: ExportFormat) => {
      if (!exportDirHandle) {
        toast.error('Pick an export folder first.');
        return;
      }
      if (!lut3d) {
        toast.error('LUT not loaded.');
        return;
      }
      if (videoEl && !videoEl.paused) videoEl.pause();

      const liveWidth = videoEl?.videoWidth ?? width;
      const liveHeight = videoEl?.videoHeight ?? height;
      if (liveWidth <= 0 || liveHeight <= 0) {
        toast.error('Clip not loaded — open a clip first.');
        return;
      }

      if (videoEl && videoEl.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
        toast.error('No frame available — wait for the clip to load.');
        return;
      }

      setStatus({ kind: 'running', format });

      let frame: Awaited<ReturnType<typeof exportCurrentFrame>>;
      try {
        frame = await exportCurrentFrame({
          device,
          sceneLinearPipeline,
          lutSdrPipeline,
          hdrComposePipeline,
          getExternalTexture,
          hdrEnabled: hdrEnabled && format === 'ultraHdr',
          hdrStrength,
          lut3d,
          exposure,
          peakNits,
          width: liveWidth,
          height: liveHeight,
        });
      } catch (cause) {
        setStatus({ kind: 'idle' });
        toast.error('Render failed', { description: errorMessage(cause) });
        return;
      }

      const frameMs = frameMsFromVideo(videoEl);
      const baseName = buildFilename(clipBaseName, frameMs, lutLabel);

      const writeAsSdr = async (note?: string) => {
        const bytes = await encodeSdrJpeg(
          frame.sdrBaseBytes,
          frame.width,
          frame.height,
        );
        const filename = await writeJpegToDir(exportDirHandle, baseName, bytes);
        setStatus({ kind: 'success', format: 'sdr', filename });
        toast.success('Exported SDR JPEG', {
          description: note ? `${filename} · ${note}` : filename,
        });
      };

      try {
        if (format === 'ultraHdr') {
          if (!frame.hdrLinearF32) {
            await writeAsSdr('HDR rendering disabled');
            return;
          }
          try {
            const bytes = await encodeUltraHdrJpeg({
              sdrBaseBytes: frame.sdrBaseBytes,
              hdrLinearF32: frame.hdrLinearF32,
              width: frame.width,
              height: frame.height,
              meta: frame.meta,
            });
            const filename = await writeJpegToDir(
              exportDirHandle,
              baseName,
              bytes,
            );
            setStatus({ kind: 'success', format: 'ultraHdr', filename });
            toast.success('Exported Ultra HDR', { description: filename });
          } catch (cause) {
            await writeAsSdr(`Ultra HDR failed: ${errorMessage(cause)}`);
          }
          return;
        }

        await writeAsSdr();
      } catch (cause) {
        setStatus({ kind: 'idle' });
        toast.error('Export failed', { description: errorMessage(cause) });
      }
    },
    [
      clipBaseName,
      device,
      exportDirHandle,
      exposure,
      getExternalTexture,
      hdrComposePipeline,
      hdrEnabled,
      hdrStrength,
      height,
      lut3d,
      lutLabel,
      lutSdrPipeline,
      peakNits,
      sceneLinearPipeline,
      videoEl,
      width,
    ],
  );

  const runCopy = useCallback(async () => {
    if (!lut3d) {
      toast.error('LUT not loaded.');
      return;
    }
    const liveWidth = videoEl?.videoWidth ?? width;
    const liveHeight = videoEl?.videoHeight ?? height;
    if (liveWidth <= 0 || liveHeight <= 0) {
      toast.error('Clip not loaded — open a clip first.');
      return;
    }
    if (videoEl && videoEl.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
      toast.error('No frame available — wait for the clip to load.');
      return;
    }
    try {
      const frame = await exportCurrentFrame({
        device,
        sceneLinearPipeline,
        lutSdrPipeline,
        hdrComposePipeline,
        getExternalTexture,
        hdrEnabled: false,
        hdrStrength,
        lut3d,
        exposure,
        peakNits,
        width: liveWidth,
        height: liveHeight,
      });
      const offscreen = new OffscreenCanvas(frame.width, frame.height);
      const ctx = offscreen.getContext('2d');
      if (!ctx) throw new Error('OffscreenCanvas 2d context unavailable');
      const buffer = new ArrayBuffer(frame.sdrBaseBytes.byteLength);
      const bytes = new Uint8ClampedArray(buffer);
      bytes.set(frame.sdrBaseBytes);
      ctx.putImageData(new ImageData(bytes, frame.width, frame.height), 0, 0);
      const blob = await offscreen.convertToBlob({ type: 'image/png' });
      await navigator.clipboard.write([
        new ClipboardItem({ 'image/png': blob }),
      ]);
      toast.success('Frame copied to clipboard');
    } catch (cause) {
      toast.error('Copy failed', { description: errorMessage(cause) });
    }
  }, [
    device,
    exposure,
    getExternalTexture,
    hdrComposePipeline,
    hdrStrength,
    height,
    lut3d,
    lutSdrPipeline,
    peakNits,
    sceneLinearPipeline,
    videoEl,
    width,
  ]);

  return { runCopy, runExport, status };
}
