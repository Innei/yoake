import { useCallback } from 'react';

import { toast } from '~/components/ui/toast/toastStore';
import { useClipDataStore } from '~/features/clips/clipDataStore';
import { useClipsStore } from '~/features/clips/clipsStore';
import type { DeliverResolution } from '~/features/deliver/deliverStore';
import { useDeliverStore } from '~/features/deliver/deliverStore';
import type { ExportScope } from '~/features/deliver/exportScope';
import { resolveSelectedSegment } from '~/features/deliver/exportScope';
import { useExportStatusStore } from '~/features/deliver/exportStatusStore';
import { useEditModeStore } from '~/features/edit/editModeStore';
import { useEditStore } from '~/features/edit/editStore';
import { usePrefsStore } from '~/features/preferences/prefsStore';
import { useGpuStore } from '~/features/preview/gpuStore';
import { createExportVideoSource } from '~/lib/export/encoder/exportVideoSource';
import { grabFrame } from '~/lib/export/encoder/grabFrame';
import {
  canUseDirectExport,
  encodeDirect,
} from '~/lib/export/encoder/webcodecs/encodeDirect';
import type { EncodeProgress } from '~/lib/export/encoder/webcodecs/encodeGraded';
import { encodeGraded } from '~/lib/export/encoder/webcodecs/encodeGraded';
import { grabFrameStream } from '~/lib/export/encoder/webcodecs/grabFrameStream';
import type { StreamFrameSource } from '~/lib/export/encoder/webcodecs/streamFrameSource';
import { createStreamFrameSource } from '~/lib/export/encoder/webcodecs/streamFrameSource';
import type { GradeState, Segment } from '~/lib/fs/clipSidecar';

export type ExportHandler = () => Promise<void>;

let exportInFlight = false;

function stripExt(name: string): string {
  return name.replace(/\.[^./]+$/, '');
}

function evenDimension(value: number): number {
  return Math.max(2, Math.floor(value / 2) * 2);
}

function computeTargetSize(
  resolution: DeliverResolution,
  srcWidth: number,
  srcHeight: number,
): { height: number; width: number } {
  if (resolution === 'source') {
    return { width: evenDimension(srcWidth), height: evenDimension(srcHeight) };
  }
  const box =
    resolution === '1080p'
      ? { width: 1920, height: 1080 }
      : { width: 3840, height: 2160 };
  const scale = Math.min(box.width / srcWidth, box.height / srcHeight);
  return {
    width: evenDimension(srcWidth * scale),
    height: evenDimension(srcHeight * scale),
  };
}

interface ExportJob {
  filename: string;
  segments: readonly Segment[];
}

function segmentFilename(basename: string, index: number): string {
  return `${basename}_seg${(index + 1).toString().padStart(2, '0')}.mp4`;
}

function buildExportJobs(
  basename: string,
  segments: readonly Segment[],
  outputMode: 'single' | 'multi',
): ExportJob[] {
  const sorted = [...segments].sort((a, b) => a.in - b.in);
  if (outputMode === 'multi' && sorted.length > 0) {
    return sorted.map((segment, i) => ({
      segments: [segment],
      filename: segmentFilename(basename, i),
    }));
  }
  return [{ segments: sorted, filename: `${basename}_edit.mp4` }];
}

async function createJobWritable(
  dir: FileSystemDirectoryHandle,
  filename: string,
): Promise<FileSystemWritableFileStream> {
  const fileHandle = await dir.getFileHandle(filename, { create: true });
  return fileHandle.createWritable();
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
  if (progress.phase === 'plan') {
    return progress.framesTotal
      ? `Planning ${progress.framesTotal} frames…`
      : 'Planning frames…';
  }
  if (progress.phase === 'grab' && typeof progress.framesTotal === 'number') {
    const currentFrame = progress.frameCurrent ?? progress.framesDone;
    if (typeof currentFrame === 'number') {
      return `Rendering frame ${currentFrame}/${progress.framesTotal} (${pct}%)`;
    }
  }
  if (progress.phase === 'encode') {
    if (
      typeof progress.framesDone === 'number' &&
      typeof progress.framesTotal === 'number'
    ) {
      return `Encoding frame ${progress.framesDone}/${progress.framesTotal} (${pct}%)`;
    }
    return `Encoding (${pct}%)`;
  }
  if (progress.phase === 'finalize') return 'Finalizing…';
  return 'Preparing…';
}

export function useExport(scope: ExportScope = 'edit'): ExportHandler {
  return useCallback(async () => {
    if (exportInFlight) return;
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

    const { duration, fps, grading, hdr } = useEditStore.getState();
    const {
      bakeGrade,
      bakeSpeed,
      bakeTrim,
      container,
      outputMode,
      quality,
      resolution,
    } = useDeliverStore.getState();
    const entry = selectedClipId
      ? useClipDataStore.getState().entries[selectedClipId]
      : undefined;
    const segments = entry?.segments ?? [];
    const baseGrade = entry?.baseGrade ?? {};
    const exposureBase = baseGrade.exposure ?? grading.exposure;
    const codec = container === 'mp4-h265' ? 'hevc' : 'avc';

    const basename = stripExt(clip.name);
    const selected =
      scope === 'selection'
        ? resolveSelectedSegment(
            segments,
            useEditModeStore.getState().outlineSelection,
          )
        : undefined;
    const exportSegments = selected ? [selected.segment] : segments;
    const jobs = selected
      ? [
          {
            segments: exportSegments,
            filename: segmentFilename(basename, selected.index),
          },
        ]
      : buildExportJobs(basename, segments, outputMode);
    const useDirect = canUseDirectExport({
      bakeGrade,
      bakeSpeed,
      bakeTrim,
      resolution,
      segments: exportSegments,
    });

    if (!useDirect && !(fps > 0)) {
      toast.error('Unknown frame rate', {
        description: 'Wait for the clip to finish probing and retry.',
      });
      return;
    }

    const { device, pipelines, lut3dTexture } = useGpuStore.getState();
    if (!useDirect && (!device || !pipelines || !lut3dTexture)) {
      toast.error("Export pipeline isn't ready", {
        description: 'Wait for the preview to finish loading and retry.',
      });
      return;
    }

    const controller = new AbortController();
    useExportStatusStore.getState().setStatus({
      kind: 'running',
      cancel: () => controller.abort(),
      description: 'Preparing…',
      ratio: null,
    });

    exportInFlight = true;
    let exportVideoSource: Awaited<
      ReturnType<typeof createExportVideoSource>
    > | null = null;
    let streamFrameSource: StreamFrameSource | null = null;
    try {
      const writtenFilenames: string[] = [];
      let audioDropReason: string | undefined;

      if (useDirect) {
        for (let i = 0; i < jobs.length; i += 1) {
          controller.signal.throwIfAborted();
          const job = jobs[i]!;
          const prefix =
            jobs.length > 1 ? `Segment ${i + 1}/${jobs.length}: ` : '';
          const setStatus = (status: string) =>
            useExportStatusStore
              .getState()
              .updateRunning({ description: prefix + status, ratio: null });

          setStatus('Preparing encoder…');
          const writable = await createJobWritable(exportDir, job.filename);
          try {
            const result = await encodeDirect({
              bakeSpeed,
              bakeTrim,
              codec,
              quality,
              onProgress: (progress) => {
                useExportStatusStore.getState().updateRunning({
                  description: prefix + formatProgress(progress),
                  ratio: progress.ratio,
                });
              },
              segments: job.segments,
              signal: controller.signal,
              sourceHandle: clip.handle,
              writable,
            });
            if (!result.audioIncluded && result.audioDropReason) {
              audioDropReason = result.audioDropReason;
            }
          } catch (cause) {
            await writable.abort().catch(() => undefined);
            await exportDir.removeEntry(job.filename).catch(() => undefined);
            throw cause;
          }
          writtenFilenames.push(job.filename);
        }
      } else if (device && pipelines && lut3dTexture) {
        useExportStatusStore
          .getState()
          .updateRunning({ description: 'Loading export video…', ratio: null });
        try {
          streamFrameSource = await createStreamFrameSource(clip.handle);
        } catch {
          streamFrameSource = null;
        }
        if (!streamFrameSource) {
          exportVideoSource = await createExportVideoSource(clip.handle, device);
        }
        const stream = streamFrameSource;
        const fallback = exportVideoSource;
        const { height, width } = computeTargetSize(
          resolution,
          stream?.width ?? fallback!.width,
          stream?.height ?? fallback!.height,
        );
        const grabPlannedFrame = (
          sourceTime: number,
          grade: GradeState | undefined,
        ) =>
          stream
            ? grabFrameStream(
                {
                  device,
                  pipelines,
                  lut3d: lut3dTexture,
                  getFrameAt: stream.getFrameAt,
                  width,
                  height,
                  exposureBase,
                  hdrPeakNits: hdr.peakNits,
                  hdrStrength: hdr.strength,
                  bypassGrade: !bakeGrade,
                },
                sourceTime,
                bakeGrade ? grade : undefined,
              )
            : grabFrame(
                {
                  device,
                  pipelines,
                  lut3d: lut3dTexture,
                  video: fallback!.video,
                  width,
                  height,
                  exposureBase,
                  hdrPeakNits: hdr.peakNits,
                  hdrStrength: hdr.strength,
                  bypassGrade: !bakeGrade,
                },
                sourceTime,
                bakeGrade ? grade : undefined,
              );

        for (let i = 0; i < jobs.length; i += 1) {
          controller.signal.throwIfAborted();
          const job = jobs[i]!;
          const prefix =
            jobs.length > 1 ? `Segment ${i + 1}/${jobs.length}: ` : '';
          const setStatus = (status: string) =>
            useExportStatusStore
              .getState()
              .updateRunning({ description: prefix + status, ratio: null });

          setStatus('Preparing encoder…');
          const writable = await createJobWritable(exportDir, job.filename);
          try {
            await encodeGraded({
              bakeSpeed,
              bakeTrim,
              baseGrade,
              codec,
              duration,
              fps,
              grabFrame: grabPlannedFrame,
              height,
              onProgress: (progress) => {
                useExportStatusStore.getState().updateRunning({
                  description: prefix + formatProgress(progress),
                  ratio: progress.ratio,
                });
              },
              quality,
              segments: job.segments,
              signal: controller.signal,
              width,
              writable,
            });
          } catch (cause) {
            await writable.abort().catch(() => undefined);
            await exportDir.removeEntry(job.filename).catch(() => undefined);
            throw cause;
          }
          writtenFilenames.push(job.filename);
        }
      }

      toast.success('Export complete', {
        description: writtenFilenames.join(', '),
        action: {
          label: 'Reveal',
          onClick: () => {
            void revealExportDir(exportDir);
          },
        },
      });
      if (audioDropReason) {
        toast.info('Audio not included', {
          description: `Exported without audio: ${audioDropReason}.`,
        });
      }
    } catch (cause) {
      if (controller.signal.aborted) {
        toast.info('Export canceled');
      } else {
        const message = cause instanceof Error ? cause.message : String(cause);
        toast.error('Export failed', { description: message });
      }
    } finally {
      exportInFlight = false;
      useExportStatusStore.getState().setStatus({ kind: 'idle' });
      exportVideoSource?.dispose();
      await streamFrameSource?.dispose().catch(() => undefined);
    }
  }, [scope]);
}
