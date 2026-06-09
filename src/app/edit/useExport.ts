import { useCallback } from 'react';

import {
  type EncodeProgress,
  encodeSegments,
} from '~/export/encoder/encodeSegments';
import { getFfmpeg } from '~/export/encoder/ffmpegLoader';
import { grabFrame } from '~/export/encoder/grabFrame';
import { useClipDataStore } from '~/state/clipDataStore';
import { useClipsStore } from '~/state/clipsStore';
import { useEditStore } from '~/state/editStore';
import { useGpuStore } from '~/state/gpuStore';
import { usePrefsStore } from '~/state/prefsStore';
import { toast, useToastStore } from '~/state/toastStore';

const PROGRESS_TOAST_DURATION = 0;

export type ExportHandler = () => Promise<void>;

function stripExt(name: string): string {
  return name.replace(/\.[^./]+$/, '');
}

async function writeBlobToDir(
  dir: FileSystemDirectoryHandle,
  filename: string,
  blob: Blob,
): Promise<void> {
  const fileHandle = await dir.getFileHandle(filename, { create: true });
  const writable = await fileHandle.createWritable();
  try {
    await writable.write(blob);
  } finally {
    await writable.close();
  }
}

async function revealExportDir(dir: FileSystemDirectoryHandle): Promise<void> {
  const opener = (dir as unknown as { open?: () => Promise<void> }).open;
  if (typeof opener === 'function') {
    try {
      await opener.call(dir);
      return;
    } catch {
      /* fall through */
    }
  }
  toast.info('Reveal not supported', {
    description: `Open “${dir.name}” in your file manager.`,
  });
}

function formatProgress(progress: EncodeProgress): string {
  const pct = Math.round(progress.ratio * 100);
  if (progress.phase === 'grab' && progress.framesDone && progress.framesTotal) {
    return `Rendering frame ${progress.framesDone}/${progress.framesTotal} (${pct}%)`;
  }
  if (progress.phase === 'encode') return `Encoding (${pct}%)`;
  if (progress.phase === 'finalize') return 'Finalizing…';
  return 'Preparing…';
}

export function useExport(): ExportHandler {
  return useCallback(async () => {
    const { clips, selectedClipId } = useClipsStore.getState();
    const clip = clips.find((c) => c.id === selectedClipId);
    if (!clip) {
      toast.error('No clip selected', {
        description: 'Pick a clip in the sidebar before exporting.',
      });
      return;
    }
    const exportDir = usePrefsStore.getState().exportDirHandle;
    if (!exportDir) {
      toast.error('No export folder set', {
        description: 'Choose an export folder in Deliver before exporting.',
      });
      return;
    }

    const { device, pipelines, lut3dTexture, video } = useGpuStore.getState();
    if (!device || !pipelines || !lut3dTexture || !video) {
      toast.error("Export pipeline isn't ready", {
        description: 'Wait for the preview to finish loading and retry.',
      });
      return;
    }

    const videoEl = video.el;
    const width = videoEl.videoWidth;
    const height = videoEl.videoHeight;
    if (!(width > 0 && height > 0)) {
      toast.error('Clip not loaded', {
        description: 'Video dimensions are unknown.',
      });
      return;
    }

    const { duration, fps, grading, hdr } = useEditStore.getState();
    const effectiveFps = fps > 0 ? fps : 30;
    const entry = selectedClipId
      ? useClipDataStore.getState().entries[selectedClipId]
      : undefined;
    const segments = entry?.segments ?? [];
    const baseGrade = entry?.baseGrade ?? {};

    const basename = stripExt(clip.name);
    const filename = `${basename}_edit.mp4`;

    const toastId = useToastStore.getState().push({
      kind: 'info',
      title: 'Exporting…',
      description: 'Preparing…',
      durationMs: PROGRESS_TOAST_DURATION,
    });

    const wasPlaying = videoEl.paused === false;
    if (!videoEl.paused) videoEl.pause();

    try {
      const result = await encodeSegments({
        baseGrade,
        duration,
        exposureBase: grading.exposure,
        filename,
        fps: effectiveFps,
        getFfmpeg: () => getFfmpeg(),
        grabFrame: (sourceTime, grade) =>
          grabFrame(
            {
              device,
              pipelines,
              lut3d: lut3dTexture,
              video,
              width,
              height,
              exposureBase: grading.exposure,
              hdrPeakNits: hdr.peakNits,
              hdrStrength: hdr.strength,
            },
            sourceTime,
            grade,
          ),
        height,
        segments,
        width,
        onProgress: (progress) => {
          useToastStore.setState((state) => ({
            toasts: state.toasts.map((t) =>
              t.id === toastId
                ? { ...t, description: formatProgress(progress) }
                : t,
            ),
          }));
        },
      });

      await writeBlobToDir(exportDir, result.filename, result.blob);
      useToastStore.getState().dismiss(toastId);
      toast.success('Export complete', {
        description: result.filename,
        action: {
          label: 'Reveal',
          onClick: () => {
            void revealExportDir(exportDir);
          },
        },
      });
    } catch (cause) {
      useToastStore.getState().dismiss(toastId);
      const message = cause instanceof Error ? cause.message : String(cause);
      toast.error('Export failed', { description: message });
    } finally {
      if (wasPlaying) {
        void videoEl.play().catch(() => undefined);
      }
    }
  }, []);
}
