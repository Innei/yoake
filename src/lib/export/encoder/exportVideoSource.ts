/// <reference types="@webgpu/types" />

import type { GpuVideo } from '~/lib/gpu/types';

export interface ExportVideoSource {
  dispose: () => void;
  height: number;
  video: GpuVideo;
  width: number;
}

const METADATA_TIMEOUT_MS = 8000;

function waitForMetadata(
  video: HTMLVideoElement,
  timeoutMs = METADATA_TIMEOUT_MS,
): Promise<void> {
  if (
    video.readyState >= HTMLMediaElement.HAVE_METADATA &&
    video.videoWidth > 0 &&
    video.videoHeight > 0
  ) {
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    const timeoutId = window.setTimeout(() => {
      cleanup();
      reject(
        new Error(
          `createExportVideoSource: timed out loading clip metadata after ${timeoutMs}ms`,
        ),
      );
    }, timeoutMs);
    const cleanup = () => {
      window.clearTimeout(timeoutId);
      video.removeEventListener('loadedmetadata', onLoadedMetadata);
      video.removeEventListener('error', onError);
    };
    const onLoadedMetadata = () => {
      cleanup();
      resolve();
    };
    const onError = () => {
      cleanup();
      reject(new Error('createExportVideoSource: failed to load clip metadata'));
    };

    video.addEventListener('loadedmetadata', onLoadedMetadata);
    video.addEventListener('error', onError);
  });
}

export async function createExportVideoSource(
  handle: FileSystemFileHandle,
  device: GPUDevice,
): Promise<ExportVideoSource> {
  const file = await handle.getFile();
  const url = URL.createObjectURL(file);
  const el = document.createElement('video');

  el.muted = true;
  el.playsInline = true;
  el.preload = 'auto';
  el.src = url;
  el.load();

  try {
    await waitForMetadata(el);
    const width = el.videoWidth;
    const height = el.videoHeight;
    if (!(width > 0 && height > 0)) {
      throw new Error(`createExportVideoSource: invalid size ${width}x${height}`);
    }

    return {
      width,
      height,
      video: {
        el,
        getExternalTexture: () => {
          if (!el.videoWidth || !el.videoHeight) return null;
          try {
            return device.importExternalTexture({ source: el });
          } catch {
            return null;
          }
        },
      },
      dispose: () => {
        el.pause();
        el.removeAttribute('src');
        el.load();
        URL.revokeObjectURL(url);
      },
    };
  } catch (cause) {
    URL.revokeObjectURL(url);
    throw cause;
  }
}
