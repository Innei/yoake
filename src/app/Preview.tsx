/// <reference types="@webgpu/types" />

import { Aperture, Film, ImageOff, Sparkles } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';

import {
  decidePreviewCutTick,
  type PreviewCutCursor,
} from '~/decode/previewCutPlayback';
import { VideoFrameSource } from '~/decode/VideoFrameSource';
import { probeHdrCaps } from '~/gpu/caps';
import { getDevice } from '~/gpu/Device';
import { configureHdrCanvas } from '~/gpu/HdrCanvas';
import { createGainmapPipeline } from '~/gpu/pipelines/gainmap';
import { createHdrComposePipeline } from '~/gpu/pipelines/hdrCompose';
import {
  createLutSdrBasePipeline,
  uploadLut3D,
} from '~/gpu/pipelines/lutSdrBase';
import { createRawDlogPreviewPipeline } from '~/gpu/pipelines/rawDlogPreview';
import { createSceneLinearPipeline } from '~/gpu/pipelines/sceneLinear';
import { cn } from '~/lib/cn';
import { useClipDataStore } from '~/state/clipDataStore';
import { useClipsStore } from '~/state/clipsStore';
import { useEditStore } from '~/state/editStore';
import { useGpuStore } from '~/state/gpuStore';
import { usePreviewCutStore } from '~/state/previewCutStore';

import {
  type GpuResources,
  type IntermediateTextures,
  MAX_PREVIEW_HEIGHT,
  MAX_PREVIEW_WIDTH,
  renderFrame,
} from './previewRenderer';

export function Preview() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const gpuRef = useRef<GpuResources | null>(null);
  const intermediatesRef = useRef<IntermediateTextures | null>(null);
  const frameSourceRef = useRef<VideoFrameSource | null>(null);
  const lutTextureRef = useRef<GPUTexture | null>(null);
  const blobUrlRef = useRef<string | null>(null);
  const previewCutCursorRef = useRef<PreviewCutCursor>({});
  const lastTickTimeRef = useRef<number | undefined>(undefined);
  const lastDrivenSourceTimeRef = useRef<number | undefined>(undefined);
  const freezeHoldingRef = useRef(false);
  const driverPauseSuppressRef = useRef(false);

  const [initError, setInitError] = useState<string | null>(null);
  const [gpuReady, setGpuReady] = useState(false);

  const selectedClip = useClipsStore((s) =>
    s.clips.find((c) => c.id === s.selectedClipId),
  );

  const parsedLut = useEditStore((s) => s.parsedLut);
  const lutDescriptor = useEditStore((s) => s.lutDescriptor);
  const exposure = useEditStore((s) => s.grading.exposure);
  const peakNits = useEditStore((s) => s.hdr.peakNits);
  const hdrStrength = useEditStore((s) => s.hdr.strength);
  const renderMode = useEditStore((s) => s.renderMode);
  const isPlaying = useEditStore((s) => s.isPlaying);
  const volume = useEditStore((s) => s.volume);
  const muted = useEditStore((s) => s.muted);
  const hdrCaps = useGpuStore((s) => s.caps);
  const storeCurrentTime = useEditStore((s) => s.currentTime);
  const setStoreCurrentTime = useEditStore((s) => s.setCurrentTime);
  const setStoreDuration = useEditStore((s) => s.setDuration);
  const setStoreFps = useEditStore((s) => s.setFps);
  const setStorePlaying = useEditStore((s) => s.setPlaying);

  const setGpuDevice = useGpuStore((s) => s.setDevice);
  const setGpuCaps = useGpuStore((s) => s.setCaps);
  const setGpuPipelines = useGpuStore((s) => s.setPipelines);
  const setGpuVideo = useGpuStore((s) => s.setVideo);
  const setGpuLut3d = useGpuStore((s) => s.setLut3dTexture);

  useEffect(() => {
    let cancelled = false;
    const canvas = canvasRef.current;
    const video = videoRef.current;
    if (!canvas || !video) return;

    (async () => {
      try {
        const device = await getDevice();
        if (cancelled) {
          device.destroy();
          return;
        }
        const context = configureHdrCanvas(canvas, device);
        const caps = probeHdrCaps(device, context);

        const sceneLinear = createSceneLinearPipeline(device);
        const lutSdrBase = createLutSdrBasePipeline(device);
        const hdrCompose = createHdrComposePipeline(device);
        const gainmap = createGainmapPipeline(device);
        const rawDlogPreview = createRawDlogPreviewPipeline(device);

        const exposureBuf = device.createBuffer({
          label: 'preview.exposureBuf',
          size: 16,
          usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        });
        const peakHeadroomBuf = device.createBuffer({
          label: 'preview.peakHeadroomBuf',
          size: 16,
          usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        });
        const sdrHeadroomBuf = device.createBuffer({
          label: 'preview.sdrHeadroomBuf',
          size: 16,
          usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        });
        device.queue.writeBuffer(sdrHeadroomBuf, 0, new Float32Array([1, 0, 0, 0]));

        gpuRef.current = {
          device,
          context,
          sceneLinear,
          lutSdrBase,
          hdrCompose,
          gainmap,
          rawDlogPreview,
          exposureBuf,
          peakHeadroomBuf,
          sdrHeadroomBuf,
          hdrReady: caps.hdrReady,
        };
        frameSourceRef.current = new VideoFrameSource();

        setGpuDevice(device);
        setGpuCaps(caps);
        setGpuPipelines({ sceneLinear, lutSdrBase, hdrCompose, gainmap });
        setGpuVideo({
          el: video,
          getExternalTexture: () => {
            if (!video.videoWidth || !video.videoHeight) return null;
            try {
              return device.importExternalTexture({ source: video });
            } catch {
              return null;
            }
          },
        });

        setGpuReady(true);
      } catch (cause) {
        if (cancelled) return;
        setInitError(cause instanceof Error ? cause.message : String(cause));
      }
    })();

    return () => {
      cancelled = true;
      frameSourceRef.current?.detach();
      frameSourceRef.current = null;
      lutTextureRef.current?.destroy();
      lutTextureRef.current = null;
      intermediatesRef.current?.sceneLinear.destroy();
      intermediatesRef.current?.sdrBase.destroy();
      intermediatesRef.current = null;
      const gpu = gpuRef.current;
      if (gpu) {
        gpu.sceneLinear.destroy();
        gpu.lutSdrBase.destroy();
        gpu.hdrCompose.destroy();
        gpu.gainmap.destroy();
        gpu.rawDlogPreview.destroy();
        gpu.exposureBuf.destroy();
        gpu.peakHeadroomBuf.destroy();
        gpu.sdrHeadroomBuf.destroy();
        gpu.device.destroy();
      }
      gpuRef.current = null;
      setGpuDevice(null);
      setGpuPipelines(null);
      setGpuCaps(null);
      setGpuVideo(null);
      setGpuLut3d(null);
      setGpuReady(false);
    };
  }, [setGpuCaps, setGpuDevice, setGpuLut3d, setGpuPipelines, setGpuVideo]);

  const hdrEnabled = useEditStore((s) => s.hdrEnabled);

  const requestRepaint = useCallback(() => {
    const gpu = gpuRef.current;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!gpu || !video || !canvas) return;
    if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return;
    renderFrame({
      gpu,
      video,
      canvas,
      hdrEnabled,
      intermediatesRef,
      lutTexture: lutTextureRef.current,
      parsedLut,
      renderMode,
    });
  }, [hdrEnabled, parsedLut, renderMode]);

  useEffect(() => {
    if (!gpuReady) return;
    const gpu = gpuRef.current;
    if (!gpu) return;
    if (lutTextureRef.current) {
      lutTextureRef.current.destroy();
      lutTextureRef.current = null;
      setGpuLut3d(null);
    }
    if (parsedLut) {
      const tex = uploadLut3D(gpu.device, parsedLut);
      lutTextureRef.current = tex;
      setGpuLut3d(tex);
    }
    requestRepaint();
  }, [gpuReady, parsedLut, requestRepaint, setGpuLut3d]);

  useEffect(() => {
    const gpu = gpuRef.current;
    if (!gpu) return;
    const buf = new Float32Array([exposure, 0, 0, 0]);
    gpu.device.queue.writeBuffer(gpu.exposureBuf, 0, buf);
    requestRepaint();
  }, [exposure, gpuReady, requestRepaint]);

  useEffect(() => {
    const gpu = gpuRef.current;
    if (!gpu) return;
    const headroom = peakNits / 100;
    const buf = new Float32Array([headroom, hdrStrength, 0, 0]);
    gpu.device.queue.writeBuffer(gpu.peakHeadroomBuf, 0, buf);
    requestRepaint();
  }, [hdrStrength, peakNits, gpuReady, requestRepaint]);

  useEffect(() => {
    if (!gpuReady) return;
    const video = videoRef.current;
    const frameSource = frameSourceRef.current;
    if (!video || !frameSource) return;

    if (blobUrlRef.current) {
      URL.revokeObjectURL(blobUrlRef.current);
      blobUrlRef.current = null;
    }

    if (!selectedClip) {
      video.removeAttribute('src');
      video.load();
      frameSource.detach();
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const file = await selectedClip.handle.getFile();
        if (cancelled) return;
        const url = URL.createObjectURL(file);
        blobUrlRef.current = url;
        video.src = url;
        video.load();
        frameSource.attach(video);
      } catch (cause) {
        if (cancelled) return;
        setInitError(cause instanceof Error ? cause.message : String(cause));
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [selectedClip, gpuReady]);

  useEffect(() => {
    if (!gpuReady) return;
    const frameSource = frameSourceRef.current;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!frameSource || !video || !canvas) return;

    const unsubscribe = frameSource.onFrame(() => {
      const gpu = gpuRef.current;
      if (!gpu) return;
      if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return;

      renderFrame({
        gpu,
        video,
        canvas,
        hdrEnabled,
        intermediatesRef,
        lutTexture: lutTextureRef.current,
        parsedLut,
        renderMode,
      });
    });
    return unsubscribe;
  }, [gpuReady, hdrEnabled, parsedLut, renderMode]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const onLoadedMetadata = () => {
      setStoreDuration(Number.isFinite(video.duration) ? video.duration : 0);
    };
    const onLoadedData = () => {
      requestRepaint();
    };
    const onTimeUpdate = () => {
      const previewCut = usePreviewCutStore.getState().previewCut;
      const clipId = useClipsStore.getState().selectedClipId;
      const segments = clipId
        ? (useClipDataStore.getState().entries[clipId]?.segments ?? [])
        : [];
      if (!previewCut || segments.length === 0) {
        previewCutCursorRef.current = {};
        lastTickTimeRef.current = undefined;
        lastDrivenSourceTimeRef.current = undefined;
        if (freezeHoldingRef.current) {
          freezeHoldingRef.current = false;
        }
        setStoreCurrentTime(video.currentTime);
        return;
      }
      const nowMs =
        typeof performance !== 'undefined' && performance.now
          ? performance.now()
          : Date.now();
      const lastTick = lastTickTimeRef.current;
      const dtSec = lastTick !== undefined ? (nowMs - lastTick) / 1000 : 0;
      lastTickTimeRef.current = nowMs;
      if (lastDrivenSourceTimeRef.current === undefined) {
        lastDrivenSourceTimeRef.current = video.currentTime;
      }
      const decision = decidePreviewCutTick({
        currentTime: lastDrivenSourceTimeRef.current,
        dtSec: dtSec > 0 && dtSec < 1 ? dtSec : 1 / 30,
        nowMs,
        segments,
        cursor: previewCutCursorRef.current,
      });
      if (decision.kind === 'pass') {
        lastDrivenSourceTimeRef.current = video.currentTime;
        setStoreCurrentTime(video.currentTime);
        return;
      }
      if (decision.kind === 'pause') {
        previewCutCursorRef.current = decision.cursorUpdate ?? {};
        lastDrivenSourceTimeRef.current = video.currentTime;
        if (freezeHoldingRef.current) {
          freezeHoldingRef.current = false;
        }
        video.pause();
        setStoreCurrentTime(video.currentTime);
        return;
      }
      previewCutCursorRef.current = decision.cursorUpdate ?? {};
      const wasFreezing = freezeHoldingRef.current;
      const isFreezing = decision.isFreezing === true;
      if (isFreezing && !wasFreezing) {
        freezeHoldingRef.current = true;
        if (!video.paused) {
          driverPauseSuppressRef.current = true;
          video.pause();
        }
      } else if (!isFreezing && wasFreezing) {
        freezeHoldingRef.current = false;
        if (useEditStore.getState().isPlaying && video.paused) {
          driverPauseSuppressRef.current = true;
          void video.play().catch(() => undefined);
        }
      }
      lastDrivenSourceTimeRef.current = decision.sourceTime;
      const allowSeek = !isFreezing || !wasFreezing;
      if (
        allowSeek &&
        Math.abs(video.currentTime - decision.sourceTime) > 1e-3
      ) {
        video.currentTime = decision.sourceTime;
      }
      setStoreCurrentTime(decision.sourceTime);
    };
    const onPlay = () => {
      if (driverPauseSuppressRef.current) {
        driverPauseSuppressRef.current = false;
        return;
      }
      setStorePlaying(true);
    };
    const onPause = () => {
      if (driverPauseSuppressRef.current) {
        driverPauseSuppressRef.current = false;
        return;
      }
      setStorePlaying(false);
    };
    video.addEventListener('loadedmetadata', onLoadedMetadata);
    video.addEventListener('loadeddata', onLoadedData);
    video.addEventListener('timeupdate', onTimeUpdate);
    video.addEventListener('play', onPlay);
    video.addEventListener('pause', onPause);
    return () => {
      video.removeEventListener('loadedmetadata', onLoadedMetadata);
      video.removeEventListener('loadeddata', onLoadedData);
      video.removeEventListener('timeupdate', onTimeUpdate);
      video.removeEventListener('play', onPlay);
      video.removeEventListener('pause', onPause);
    };
  }, [requestRepaint, setStoreCurrentTime, setStoreDuration, setStorePlaying]);

  useEffect(() => {
    if (!gpuReady) return;
    const frameSource = frameSourceRef.current;
    if (!frameSource) return;
    const unsubscribe = frameSource.onFrame(({ metadata }) => {
      if (metadata.presentedFrames > 0 && metadata.mediaTime > 0) {
        const fps = metadata.presentedFrames / metadata.mediaTime;
        if (Number.isFinite(fps) && fps > 0) {
          setStoreFps(fps);
        }
      }
    });
    return unsubscribe;
  }, [gpuReady, setStoreFps]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (isPlaying) {
      if (video.paused) {
        void video.play().catch(() => undefined);
      }
    } else if (!video.paused) {
      video.pause();
    }
  }, [isPlaying]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.volume = volume;
    video.muted = muted;
  }, [volume, muted]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (Math.abs(video.currentTime - storeCurrentTime) > 0.005) {
      video.currentTime = storeCurrentTime;
    }
  }, [storeCurrentTime]);

  const hasClip = Boolean(selectedClip);
  const lutLabel = lutDescriptor?.name.replace(/\.cube$/i, '');
  const hdrActive = Boolean(hdrEnabled && hdrCaps?.toneMappingExtended && renderMode === 'graded');

  return (
    <div className="relative size-full overflow-hidden bg-black">
      <canvas
        height={MAX_PREVIEW_HEIGHT}
        ref={canvasRef}
        width={MAX_PREVIEW_WIDTH}
        className={cn(
          'size-full object-contain transition-opacity duration-200',
          hasClip ? 'opacity-100' : 'opacity-0',
        )}
      />
      <video
        playsInline
        className="hidden"
        crossOrigin="anonymous"
        ref={videoRef}
      />

      {!hasClip ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-center">
          <div className="flex size-14 items-center justify-center rounded-full border border-border bg-background-secondary text-text-tertiary">
            <ImageOff aria-hidden className="size-6" />
          </div>
          <div className="space-y-1">
            <p className="text-sm font-medium text-white/90">No clip selected</p>
            <p className="text-xs text-white/50">
              Pick a D-Log clip on the left to preview.
            </p>
          </div>
        </div>
      ) : (
        <div className="pointer-events-none absolute bottom-3 left-3 flex max-w-[80%] flex-col gap-1.5">
          <HudChip icon={<Film aria-hidden className="size-3" />}>
            <span className="truncate">{selectedClip?.name}</span>
          </HudChip>
          <div className="flex flex-wrap gap-1.5">
            <HudChip icon={<Aperture aria-hidden className="size-3" />}>
              {renderMode === 'original'
                ? 'Original flat'
                : lutLabel ?? <span className="opacity-60">no LUT</span>}
            </HudChip>
            <HudChip
              icon={<Sparkles aria-hidden className="size-3" />}
              tone={hdrActive ? 'accent' : 'muted'}
            >
              {hdrActive ? `HDR ${peakNits}` : 'SDR'}
            </HudChip>
            <HudChip>
              EV {exposure >= 0 ? '+' : ''}
              {exposure.toFixed(1)}
            </HudChip>
          </div>
        </div>
      )}

      {initError ? (
        <div className="absolute inset-0 flex items-center justify-center bg-black/80 p-4 text-sm text-red">
          Preview unavailable: {initError}
        </div>
      ) : null}
    </div>
  );
}

function HudChip({
  icon,
  children,
  tone = 'default',
}: {
  children: React.ReactNode;
  icon?: React.ReactNode;
  tone?: 'default' | 'accent' | 'muted';
}) {
  return (
    <span
      className={cn(
        'inline-flex max-w-full items-center gap-1.5 truncate rounded-md px-2 py-1 text-[11px] backdrop-blur',
        tone === 'accent'
          ? 'bg-accent/80 text-white'
          : tone === 'muted'
            ? 'bg-black/50 text-white/60'
            : 'bg-black/55 text-white/85',
      )}
    >
      {icon}
      <span className="truncate font-mono tabular-nums">{children}</span>
    </span>
  );
}
