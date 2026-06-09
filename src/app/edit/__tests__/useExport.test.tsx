import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useClipDataStore } from '~/state/clipDataStore';
import { useClipsStore } from '~/state/clipsStore';
import { useEditStore } from '~/state/editStore';
import { useGpuStore } from '~/state/gpuStore';
import { usePrefsStore } from '~/state/prefsStore';
import { useToastStore } from '~/state/toastStore';

import { useExport } from '../useExport';

const encodeSegmentsMock = vi.fn();
const grabFrameMock = vi.fn();
const getFfmpegMock = vi.fn();

vi.mock('~/export/encoder/encodeSegments', () => ({
  encodeSegments: (...args: unknown[]) => encodeSegmentsMock(...args),
}));

vi.mock('~/export/encoder/grabFrame', () => ({
  grabFrame: (...args: unknown[]) => grabFrameMock(...args),
}));

vi.mock('~/export/encoder/ffmpegLoader', () => ({
  getFfmpeg: (...args: unknown[]) => getFfmpegMock(...args),
}));

const fileHandle = {} as FileSystemFileHandle;

function Probe({ onReady }: { onReady: (cb: () => Promise<void>) => void }) {
  const cb = useExport();
  onReady(cb);
  return null;
}

interface WritableMock {
  close: ReturnType<typeof vi.fn>;
  write: ReturnType<typeof vi.fn>;
}

interface DirHandleMock {
  getFileHandle: ReturnType<typeof vi.fn>;
  name: string;
  writable: WritableMock;
}

function makeDirHandle(name = 'Exports'): DirHandleMock {
  const writable: WritableMock = {
    write: vi.fn(async () => undefined),
    close: vi.fn(async () => undefined),
  };
  const fakeFileHandle = {
    createWritable: vi.fn(async () => writable),
  };
  return {
    name,
    getFileHandle: vi.fn(async () => fakeFileHandle),
    writable,
  };
}

function installGpuReady() {
  const video = {
    el: {
      videoWidth: 1920,
      videoHeight: 1080,
      readyState: 4,
      paused: true,
      pause: vi.fn(),
      play: vi.fn(async () => undefined),
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

function resetAll() {
  encodeSegmentsMock.mockReset();
  grabFrameMock.mockReset();
  getFfmpegMock.mockReset();
  encodeSegmentsMock.mockResolvedValue({
    blob: new Blob(['hi'], { type: 'video/mp4' }),
    filename: 'DJI_0001_edit.mp4',
    frameCount: 0,
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
  useClipDataStore.setState({
    entries: {
      'clip-1': {
        markers: [],
        segments: [],
        baseGrade: {},
        status: 'idle',
        readOnly: false,
      },
    },
  });
  useEditStore.setState({
    currentTime: 0,
    duration: 5,
    fps: 30,
    grading: { exposure: 0 },
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
}

beforeEach(() => {
  resetAll();
});

afterEach(() => {
  cleanup();
});

describe('useExport', () => {
  it('errors when no clip is selected', async () => {
    useClipsStore.setState({ selectedClipId: undefined });
    installGpuReady();
    usePrefsStore.setState({
      exportDirHandle: makeDirHandle() as unknown as FileSystemDirectoryHandle,
    });
    let cb: (() => Promise<void>) | undefined;
    render(<Probe onReady={(c) => { cb = c; }} />);
    await act(async () => { await cb!(); });
    const toasts = useToastStore.getState().toasts;
    expect(toasts.some((t) => t.kind === 'error')).toBe(true);
    expect(encodeSegmentsMock).not.toHaveBeenCalled();
  });

  it('errors when no export folder is set', async () => {
    installGpuReady();
    let cb: (() => Promise<void>) | undefined;
    render(<Probe onReady={(c) => { cb = c; }} />);
    await act(async () => { await cb!(); });
    const toasts = useToastStore.getState().toasts;
    expect(toasts.some((t) => t.kind === 'error')).toBe(true);
    expect(encodeSegmentsMock).not.toHaveBeenCalled();
  });

  it('errors when the GPU pipeline is not ready', async () => {
    usePrefsStore.setState({
      exportDirHandle: makeDirHandle() as unknown as FileSystemDirectoryHandle,
    });
    let cb: (() => Promise<void>) | undefined;
    render(<Probe onReady={(c) => { cb = c; }} />);
    await act(async () => { await cb!(); });
    const toasts = useToastStore.getState().toasts;
    expect(toasts.some((t) => t.kind === 'error')).toBe(true);
    expect(encodeSegmentsMock).not.toHaveBeenCalled();
  });

  it('runs the encode and writes the blob to the export folder', async () => {
    installGpuReady();
    const dir = makeDirHandle('Exports');
    usePrefsStore.setState({
      exportDirHandle: dir as unknown as FileSystemDirectoryHandle,
    });

    let cb: (() => Promise<void>) | undefined;
    render(<Probe onReady={(c) => { cb = c; }} />);
    await act(async () => { await cb!(); });

    expect(encodeSegmentsMock).toHaveBeenCalledTimes(1);
    const args = encodeSegmentsMock.mock.calls[0]![0] as {
      filename: string;
      height: number;
      width: number;
    };
    expect(args.filename).toBe('DJI_0001_edit.mp4');
    expect(args.width).toBe(1920);
    expect(args.height).toBe(1080);

    expect(dir.getFileHandle).toHaveBeenCalledWith('DJI_0001_edit.mp4', { create: true });
    expect(dir.writable.write).toHaveBeenCalledTimes(1);
    expect(dir.writable.close).toHaveBeenCalledTimes(1);

    const toasts = useToastStore.getState().toasts;
    const success = toasts.find((t) => t.kind === 'success');
    expect(success).toBeDefined();
    expect(success!.title).toMatch(/export complete/i);
    expect(success!.action?.label).toBe('Reveal');
  });

  it('surfaces an error toast when encodeSegments rejects', async () => {
    installGpuReady();
    usePrefsStore.setState({
      exportDirHandle: makeDirHandle() as unknown as FileSystemDirectoryHandle,
    });
    encodeSegmentsMock.mockRejectedValue(new Error('boom'));

    let cb: (() => Promise<void>) | undefined;
    render(<Probe onReady={(c) => { cb = c; }} />);
    await act(async () => { await cb!(); });

    const toasts = useToastStore.getState().toasts;
    const err = toasts.find((t) => t.kind === 'error');
    expect(err).toBeDefined();
    expect(err!.description).toContain('boom');
  });
});
