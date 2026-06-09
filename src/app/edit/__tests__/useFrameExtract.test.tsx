import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useClipsStore } from '~/state/clipsStore';
import { useEditStore } from '~/state/editStore';
import { useGpuStore } from '~/state/gpuStore';
import { usePrefsStore } from '~/state/prefsStore';
import { useToastStore } from '~/state/toastStore';

import { useFrameExtract } from '../useFrameExtract';

const extractFrameMock = vi.fn();
const exportCurrentFrameMock = vi.fn();

vi.mock('~/export/extractFrame', () => ({
  extractFrame: (...args: unknown[]) => extractFrameMock(...args),
}));

vi.mock('~/export/render', () => ({
  exportCurrentFrame: (...args: unknown[]) => exportCurrentFrameMock(...args),
}));

const fileHandle = {} as FileSystemFileHandle;

function Probe({ onReady }: { onReady: (cb: () => Promise<void>) => void }) {
  const cb = useFrameExtract();
  onReady(cb);
  return null;
}

function makeDirHandle(name = 'Exports'): FileSystemDirectoryHandle {
  return { name } as unknown as FileSystemDirectoryHandle;
}

function installGpuReady() {
  const video = {
    el: {
      videoWidth: 1920,
      videoHeight: 1080,
      readyState: 4,
    } as unknown as HTMLVideoElement,
    getExternalTexture: () => null,
  };
  useGpuStore.setState({
    device: {} as unknown as GPUDevice,
    caps: null,
    pipelines: {
      sceneLinear: {} as never,
      lutSdrBase: {} as never,
      hdrCompose: {} as never,
      gainmap: {} as never,
    },
    lut3dTexture: {} as unknown as GPUTexture,
    video,
  });
}

function installOffscreenCanvasMock() {
  const ctx = {
    putImageData: vi.fn(),
  };
  const convertToBlob = vi.fn(async () => new Blob(['png'], { type: 'image/png' }));
  vi.stubGlobal(
    'OffscreenCanvas',
    vi.fn().mockImplementation(() => ({
      getContext: () => ctx,
      convertToBlob,
    })),
  );
  vi.stubGlobal(
    'ImageData',
    vi.fn().mockImplementation((data: unknown, width: number, height: number) => ({
      data,
      width,
      height,
    })),
  );
}

function resetAll() {
  extractFrameMock.mockReset();
  exportCurrentFrameMock.mockReset();
  exportCurrentFrameMock.mockResolvedValue({
    sdrBaseBytes: new Uint8ClampedArray(1920 * 1080 * 4),
    hdrLinearF32: null,
    width: 1920,
    height: 1080,
    meta: { peakNits: 1000 },
  });
  useClipsStore.setState({
    clips: [
      {
        id: 'clip-1',
        name: 'DJI_0001.MP4',
        handle: fileHandle,
        lastModified: 0,
        size: 0,
      },
    ],
    selectedClipId: 'clip-1',
    directoryHandle: undefined,
  });
  useEditStore.setState({
    currentTime: 83.456,
    fps: 30,
  });
  usePrefsStore.setState({
    clipDirHandle: undefined,
    lutDirHandle: undefined,
    exportDirHandle: undefined,
    lastSession: undefined,
  });
  useGpuStore.setState({
    device: null,
    caps: null,
    pipelines: null,
    lut3dTexture: null,
    video: null,
  });
  useToastStore.setState({ toasts: [] });
  installOffscreenCanvasMock();
}

beforeEach(() => {
  resetAll();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('useFrameExtract', () => {
  it('shows an error toast when no clip is selected', async () => {
    useClipsStore.setState({ selectedClipId: undefined });
    installGpuReady();
    usePrefsStore.setState({ exportDirHandle: makeDirHandle() });

    let cb: (() => Promise<void>) | undefined;
    render(<Probe onReady={(c) => { cb = c; }} />);

    await act(async () => {
      await cb!();
    });

    const toasts = useToastStore.getState().toasts;
    expect(toasts.some((t) => t.kind === 'error')).toBe(true);
    expect(extractFrameMock).not.toHaveBeenCalled();
  });

  it('shows an error toast when no exportDirHandle is set', async () => {
    installGpuReady();

    let cb: (() => Promise<void>) | undefined;
    render(<Probe onReady={(c) => { cb = c; }} />);

    await act(async () => {
      await cb!();
    });

    const toasts = useToastStore.getState().toasts;
    const err = toasts.find((t) => t.kind === 'error');
    expect(err).toBeDefined();
    expect(err!.title).toMatch(/export folder|folder/i);
    expect(extractFrameMock).not.toHaveBeenCalled();
  });

  it("shows an error toast when the preview pipeline isn't ready", async () => {
    usePrefsStore.setState({ exportDirHandle: makeDirHandle() });

    let cb: (() => Promise<void>) | undefined;
    render(<Probe onReady={(c) => { cb = c; }} />);

    await act(async () => {
      await cb!();
    });

    const toasts = useToastStore.getState().toasts;
    expect(toasts.some((t) => t.kind === 'error')).toBe(true);
    expect(extractFrameMock).not.toHaveBeenCalled();
  });

  it('calls extractFrame and surfaces a success toast with a Reveal action', async () => {
    installGpuReady();
    usePrefsStore.setState({ exportDirHandle: makeDirHandle() });
    extractFrameMock.mockResolvedValue({ filename: 'DJI_0001_00-01-23-456.png' });

    let cb: (() => Promise<void>) | undefined;
    render(<Probe onReady={(c) => { cb = c; }} />);

    await act(async () => {
      await cb!();
    });

    expect(exportCurrentFrameMock).toHaveBeenCalledTimes(1);
    expect(extractFrameMock).toHaveBeenCalledTimes(1);
    const callArg = extractFrameMock.mock.calls[0]![0] as {
      baseName: string;
      blob: Blob;
      currentTime: number;
    };
    expect(callArg.baseName).toBe('DJI_0001');
    expect(callArg.currentTime).toBe(83.456);
    expect(callArg.blob).toBeInstanceOf(Blob);

    const toasts = useToastStore.getState().toasts;
    const success = toasts.find((t) => t.kind === 'success');
    expect(success).toBeDefined();
    expect(success!.title).toMatch(/frame saved/i);
    expect(success!.description).toContain('DJI_0001_00-01-23-456.png');
    expect(success!.action).toBeDefined();
    expect(success!.action!.label).toBe('Reveal');
    expect(typeof success!.action!.onClick).toBe('function');
  });

  it('surfaces an error toast when extractFrame rejects', async () => {
    installGpuReady();
    usePrefsStore.setState({ exportDirHandle: makeDirHandle() });
    extractFrameMock.mockRejectedValue(new Error('disk full'));

    let cb: (() => Promise<void>) | undefined;
    render(<Probe onReady={(c) => { cb = c; }} />);

    await act(async () => {
      await cb!();
    });

    const toasts = useToastStore.getState().toasts;
    const err = toasts.find((t) => t.kind === 'error');
    expect(err).toBeDefined();
    expect(err!.description).toContain('disk full');
  });
});
