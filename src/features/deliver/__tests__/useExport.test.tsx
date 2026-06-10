import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useClipDataStore } from '~/features/clips/clipDataStore';
import { useClipsStore } from '~/features/clips/clipsStore';
import { useDeliverStore } from '~/features/deliver/deliverStore';
import { useEditStore } from '~/features/edit/editStore';
import { useExportStatusStore } from '~/features/deliver/exportStatusStore';
import { useGpuStore } from '~/features/preview/gpuStore';
import { usePrefsStore } from '~/features/preferences/prefsStore';
import { useToastStore } from '~/components/ui/toast/toastStore';

import { useExport } from '../useExport';

const encodeGradedMock = vi.fn();
const encodeDirectMock = vi.fn();
const createExportVideoSourceMock = vi.fn();
const grabFrameMock = vi.fn();
const createStreamFrameSourceMock = vi.fn();
const grabFrameStreamMock = vi.fn();

vi.mock('~/lib/export/encoder/webcodecs/encodeGraded', () => ({
  encodeGraded: (...args: unknown[]) => encodeGradedMock(...args),
}));

vi.mock('~/lib/export/encoder/webcodecs/encodeDirect', async () => {
  const actual = await vi.importActual<
    typeof import('~/lib/export/encoder/webcodecs/encodeDirect')
  >('~/lib/export/encoder/webcodecs/encodeDirect');
  return {
    ...actual,
    encodeDirect: (...args: unknown[]) => encodeDirectMock(...args),
  };
});

vi.mock('~/lib/export/encoder/exportVideoSource', () => ({
  createExportVideoSource: (...args: unknown[]) =>
    createExportVideoSourceMock(...args),
}));

vi.mock('~/lib/export/encoder/grabFrame', () => ({
  grabFrame: (...args: unknown[]) => grabFrameMock(...args),
}));

vi.mock('~/lib/export/encoder/webcodecs/streamFrameSource', () => ({
  createStreamFrameSource: (...args: unknown[]) =>
    createStreamFrameSourceMock(...args),
}));

vi.mock('~/lib/export/encoder/webcodecs/grabFrameStream', () => ({
  grabFrameStream: (...args: unknown[]) => grabFrameStreamMock(...args),
}));

const fileHandle = {} as FileSystemFileHandle;

interface ExportVideoSourceMock {
  dispose: ReturnType<typeof vi.fn>;
  height: number;
  video: {
    el: HTMLVideoElement;
    getExternalTexture: ReturnType<typeof vi.fn>;
  };
  width: number;
}

let exportVideoSource: ExportVideoSourceMock;

interface StreamFrameSourceMock {
  dispose: ReturnType<typeof vi.fn>;
  getFrameAt: ReturnType<typeof vi.fn>;
  height: number;
  width: number;
}

function makeStreamFrameSource(): StreamFrameSourceMock {
  return {
    width: 1920,
    height: 1080,
    getFrameAt: vi.fn(async () => ({ close: vi.fn() })),
    dispose: vi.fn(async () => undefined),
  };
}

function Probe({ onReady }: { onReady: (cb: () => Promise<void>) => void }) {
  const cb = useExport();
  onReady(cb);
  return null;
}

interface WritableMock {
  abort: ReturnType<typeof vi.fn>;
  close: ReturnType<typeof vi.fn>;
  write: ReturnType<typeof vi.fn>;
}

interface DirHandleMock {
  getFileHandle: ReturnType<typeof vi.fn>;
  name: string;
  removeEntry: ReturnType<typeof vi.fn>;
  writable: WritableMock;
}

function makeDirHandle(name = 'Exports'): DirHandleMock {
  const writable: WritableMock = {
    write: vi.fn(async () => undefined),
    close: vi.fn(async () => undefined),
    abort: vi.fn(async () => undefined),
  };
  const fakeFileHandle = {
    createWritable: vi.fn(async () => writable),
  };
  return {
    name,
    getFileHandle: vi.fn(async () => fakeFileHandle),
    removeEntry: vi.fn(async () => undefined),
    writable,
  };
}

function makeExportVideoSource(): ExportVideoSourceMock {
  return {
    width: 1280,
    height: 720,
    video: {
      el: {
        videoWidth: 1280,
        videoHeight: 720,
        readyState: 4,
      } as unknown as HTMLVideoElement,
      getExternalTexture: vi.fn(() => null),
    },
    dispose: vi.fn(),
  };
}

function installGpuReady({ paused = true }: { paused?: boolean } = {}) {
  const device = {} as unknown as GPUDevice;
  const video = {
    el: {
      videoWidth: 1920,
      videoHeight: 1080,
      readyState: 4,
      paused,
      pause: vi.fn(),
      play: vi.fn(async () => undefined),
    } as unknown as HTMLVideoElement,
    getExternalTexture: () => null,
  };
  useGpuStore.setState({
    device,
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
  return { device, video };
}

function resetAll() {
  encodeGradedMock.mockReset();
  encodeDirectMock.mockReset();
  createExportVideoSourceMock.mockReset();
  grabFrameMock.mockReset();
  createStreamFrameSourceMock.mockReset();
  grabFrameStreamMock.mockReset();
  exportVideoSource = makeExportVideoSource();
  createExportVideoSourceMock.mockResolvedValue(exportVideoSource);
  createStreamFrameSourceMock.mockRejectedValue(
    new Error('streaming decode unavailable'),
  );
  grabFrameStreamMock.mockResolvedValue({
    width: 2,
    height: 2,
    rgba: new Uint8Array(16),
  });
  encodeGradedMock.mockResolvedValue({ frameCount: 0 });
  encodeDirectMock.mockResolvedValue({ audioIncluded: true, frameCount: 0 });
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
  useDeliverStore.setState({
    container: 'mp4-h264',
    resolution: 'source',
    quality: 'high',
    colorspace: 'rec709',
    bakeTrim: true,
    bakeSpeed: true,
    bakeGrade: true,
    outputMode: 'single',
  });
  useToastStore.setState({ toasts: [] });
  useExportStatusStore.setState({ status: { kind: 'idle' } });
}

function runningStatus() {
  const status = useExportStatusStore.getState().status;
  return status.kind === 'running' ? status : undefined;
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
    expect(encodeGradedMock).not.toHaveBeenCalled();
  });

  it('errors when no export folder is set', async () => {
    installGpuReady();
    let cb: (() => Promise<void>) | undefined;
    render(<Probe onReady={(c) => { cb = c; }} />);
    await act(async () => { await cb!(); });
    const toasts = useToastStore.getState().toasts;
    expect(toasts.some((t) => t.kind === 'error')).toBe(true);
    expect(encodeGradedMock).not.toHaveBeenCalled();
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
    expect(encodeGradedMock).not.toHaveBeenCalled();
  });

  it('runs the graded encode against a writable from the export folder', async () => {
    const { device, video: previewVideo } = installGpuReady({ paused: false });
    const dir = makeDirHandle('Exports');
    usePrefsStore.setState({
      exportDirHandle: dir as unknown as FileSystemDirectoryHandle,
    });

    let statusDuringEncode: ReturnType<typeof runningStatus>;
    encodeGradedMock.mockImplementation(async () => {
      statusDuringEncode = runningStatus();
      return { frameCount: 0 };
    });

    let cb: (() => Promise<void>) | undefined;
    render(<Probe onReady={(c) => { cb = c; }} />);
    await act(async () => { await cb!(); });

    expect(encodeGradedMock).toHaveBeenCalledTimes(1);
    expect(createExportVideoSourceMock).toHaveBeenCalledWith(fileHandle, device);
    const args = encodeGradedMock.mock.calls[0]![0] as {
      codec: string;
      grabFrame: (sourceTime: number, grade: unknown) => unknown;
      height: number;
      width: number;
      writable: unknown;
    };
    expect(args.codec).toBe('avc');
    expect(args.width).toBe(1280);
    expect(args.height).toBe(720);
    expect(args.writable).toBe(dir.writable);
    await args.grabFrame(1.25, { exposure: 1 });
    expect(grabFrameMock).toHaveBeenCalledWith(
      expect.objectContaining({
        height: 720,
        video: exportVideoSource.video,
        width: 1280,
      }),
      1.25,
      { exposure: 1 },
    );
    expect(previewVideo.el.pause).not.toHaveBeenCalled();
    expect(previewVideo.el.play).not.toHaveBeenCalled();
    expect(exportVideoSource.dispose).toHaveBeenCalledTimes(1);

    expect(dir.getFileHandle).toHaveBeenCalledWith('DJI_0001_edit.mp4', { create: true });
    expect(dir.writable.close).not.toHaveBeenCalled();
    expect(dir.writable.abort).not.toHaveBeenCalled();
    expect(dir.removeEntry).not.toHaveBeenCalled();

    expect(statusDuringEncode).toBeDefined();
    expect(typeof statusDuringEncode!.cancel).toBe('function');
    expect(useExportStatusStore.getState().status.kind).toBe('idle');

    const toasts = useToastStore.getState().toasts;
    const success = toasts.find((t) => t.kind === 'success');
    expect(success).toBeDefined();
    expect(success!.title).toMatch(/export complete/i);
    expect(success!.description).toContain('DJI_0001_edit.mp4');
    expect(success!.action?.label).toBe('Reveal');
  });

  it('uses the streaming frame source for graded encodes when it can be created', async () => {
    installGpuReady();
    usePrefsStore.setState({
      exportDirHandle: makeDirHandle() as unknown as FileSystemDirectoryHandle,
    });
    const streamSource = makeStreamFrameSource();
    createStreamFrameSourceMock.mockResolvedValue(streamSource);

    let cb: (() => Promise<void>) | undefined;
    render(<Probe onReady={(c) => { cb = c; }} />);
    await act(async () => { await cb!(); });

    expect(createStreamFrameSourceMock).toHaveBeenCalledWith(fileHandle);
    expect(createExportVideoSourceMock).not.toHaveBeenCalled();
    expect(encodeGradedMock).toHaveBeenCalledTimes(1);
    const args = encodeGradedMock.mock.calls[0]![0] as {
      grabFrame: (sourceTime: number, grade: unknown) => unknown;
      height: number;
      width: number;
    };
    expect(args.width).toBe(1920);
    expect(args.height).toBe(1080);

    await args.grabFrame(1.25, { exposure: 1 });
    expect(grabFrameMock).not.toHaveBeenCalled();
    expect(grabFrameStreamMock).toHaveBeenCalledWith(
      expect.objectContaining({
        getFrameAt: streamSource.getFrameAt,
        height: 1080,
        width: 1920,
      }),
      1.25,
      { exposure: 1 },
    );
    expect(streamSource.dispose).toHaveBeenCalledTimes(1);

    const toasts = useToastStore.getState().toasts;
    expect(toasts.some((t) => t.kind === 'success')).toBe(true);
  });

  it('disposes the streaming source when encodeGraded rejects', async () => {
    installGpuReady();
    usePrefsStore.setState({
      exportDirHandle: makeDirHandle() as unknown as FileSystemDirectoryHandle,
    });
    const streamSource = makeStreamFrameSource();
    createStreamFrameSourceMock.mockResolvedValue(streamSource);
    encodeGradedMock.mockRejectedValue(new Error('boom'));

    let cb: (() => Promise<void>) | undefined;
    render(<Probe onReady={(c) => { cb = c; }} />);
    await act(async () => { await cb!(); });

    expect(streamSource.dispose).toHaveBeenCalledTimes(1);
    const err = useToastStore.getState().toasts.find((t) => t.kind === 'error');
    expect(err).toBeDefined();
    expect(err!.description).toContain('boom');
  });

  it('falls back to the video-element source when the streaming source fails to create', async () => {
    const { device } = installGpuReady();
    usePrefsStore.setState({
      exportDirHandle: makeDirHandle() as unknown as FileSystemDirectoryHandle,
    });

    let cb: (() => Promise<void>) | undefined;
    render(<Probe onReady={(c) => { cb = c; }} />);
    await act(async () => { await cb!(); });

    expect(createStreamFrameSourceMock).toHaveBeenCalledWith(fileHandle);
    expect(createExportVideoSourceMock).toHaveBeenCalledWith(fileHandle, device);
    expect(encodeGradedMock).toHaveBeenCalledTimes(1);
    const args = encodeGradedMock.mock.calls[0]![0] as {
      grabFrame: (sourceTime: number, grade: unknown) => unknown;
    };
    await args.grabFrame(0.5, { exposure: 1 });
    expect(grabFrameStreamMock).not.toHaveBeenCalled();
    expect(grabFrameMock).toHaveBeenCalledTimes(1);

    const toasts = useToastStore.getState().toasts;
    expect(toasts.some((t) => t.kind === 'error')).toBe(false);
    expect(toasts.some((t) => t.kind === 'success')).toBe(true);
  });

  it('selects the hevc codec for the mp4-h265 container', async () => {
    installGpuReady();
    usePrefsStore.setState({
      exportDirHandle: makeDirHandle() as unknown as FileSystemDirectoryHandle,
    });
    useDeliverStore.setState({ container: 'mp4-h265' });

    let cb: (() => Promise<void>) | undefined;
    render(<Probe onReady={(c) => { cb = c; }} />);
    await act(async () => { await cb!(); });

    const args = encodeGradedMock.mock.calls[0]![0] as { codec: string };
    expect(args.codec).toBe('hevc');
  });

  it('passes the deliver quality to the graded encoder', async () => {
    installGpuReady();
    usePrefsStore.setState({
      exportDirHandle: makeDirHandle() as unknown as FileSystemDirectoryHandle,
    });
    useDeliverStore.setState({ quality: 'very-high' });

    let cb: (() => Promise<void>) | undefined;
    render(<Probe onReady={(c) => { cb = c; }} />);
    await act(async () => { await cb!(); });

    const args = encodeGradedMock.mock.calls[0]![0] as { quality: string };
    expect(args.quality).toBe('very-high');
  });

  it('passes the deliver quality to the direct encoder', async () => {
    usePrefsStore.setState({
      exportDirHandle: makeDirHandle() as unknown as FileSystemDirectoryHandle,
    });
    useDeliverStore.setState({ bakeGrade: false, quality: 'low' });

    let cb: (() => Promise<void>) | undefined;
    render(<Probe onReady={(c) => { cb = c; }} />);
    await act(async () => { await cb!(); });

    const args = encodeDirectMock.mock.calls[0]![0] as { quality: string };
    expect(args.quality).toBe('low');
  });

  it('uses direct export for ungraded source-resolution output', async () => {
    const dir = makeDirHandle('Exports');
    usePrefsStore.setState({
      exportDirHandle: dir as unknown as FileSystemDirectoryHandle,
    });
    useDeliverStore.setState({ bakeGrade: false });

    let cb: (() => Promise<void>) | undefined;
    render(<Probe onReady={(c) => { cb = c; }} />);
    await act(async () => { await cb!(); });

    expect(encodeDirectMock).toHaveBeenCalledTimes(1);
    expect(encodeGradedMock).not.toHaveBeenCalled();
    expect(createExportVideoSourceMock).not.toHaveBeenCalled();
    const args = encodeDirectMock.mock.calls[0]![0] as {
      bakeSpeed: boolean;
      bakeTrim: boolean;
      codec: string;
      sourceHandle: FileSystemFileHandle;
      writable: unknown;
    };
    expect(args.bakeSpeed).toBe(true);
    expect(args.bakeTrim).toBe(true);
    expect(args.codec).toBe('avc');
    expect(args.sourceHandle).toBe(fileHandle);
    expect(args.writable).toBe(dir.writable);
    expect(dir.getFileHandle).toHaveBeenCalledWith('DJI_0001_edit.mp4', { create: true });
    expect(dir.writable.close).not.toHaveBeenCalled();
    expect(dir.removeEntry).not.toHaveBeenCalled();
  });

  it('shows an audio-drop notice when direct export omits audio', async () => {
    const dir = makeDirHandle('Exports');
    usePrefsStore.setState({
      exportDirHandle: dir as unknown as FileSystemDirectoryHandle,
    });
    useDeliverStore.setState({ bakeGrade: false });
    encodeDirectMock.mockResolvedValue({
      audioDropReason: 'audio codec opus cannot be muxed into mp4',
      audioIncluded: false,
      frameCount: 10,
    });

    let cb: (() => Promise<void>) | undefined;
    render(<Probe onReady={(c) => { cb = c; }} />);
    await act(async () => { await cb!(); });

    const toasts = useToastStore.getState().toasts;
    expect(toasts.some((t) => t.kind === 'success')).toBe(true);
    const drop = toasts.find((t) => t.title === 'Audio not included');
    expect(drop).toBeDefined();
    expect(drop!.kind).toBe('info');
    expect(drop!.description).toContain(
      'audio codec opus cannot be muxed into mp4',
    );
  });

  it('does not show an audio notice when direct export keeps audio', async () => {
    const dir = makeDirHandle('Exports');
    usePrefsStore.setState({
      exportDirHandle: dir as unknown as FileSystemDirectoryHandle,
    });
    useDeliverStore.setState({ bakeGrade: false });

    let cb: (() => Promise<void>) | undefined;
    render(<Probe onReady={(c) => { cb = c; }} />);
    await act(async () => { await cb!(); });

    const toasts = useToastStore.getState().toasts;
    expect(toasts.some((t) => t.title === 'Audio not included')).toBe(false);
  });

  it('aborts the writable and removes the stub file when direct export rejects', async () => {
    const dir = makeDirHandle('Exports');
    usePrefsStore.setState({
      exportDirHandle: dir as unknown as FileSystemDirectoryHandle,
    });
    useDeliverStore.setState({ bakeGrade: false });
    encodeDirectMock.mockRejectedValue(new Error('mux failed'));

    let cb: (() => Promise<void>) | undefined;
    render(<Probe onReady={(c) => { cb = c; }} />);
    await act(async () => { await cb!(); });

    expect(dir.writable.abort).toHaveBeenCalledTimes(1);
    expect(dir.removeEntry).toHaveBeenCalledTimes(1);
    expect(dir.removeEntry).toHaveBeenCalledWith('DJI_0001_edit.mp4');
    const err = useToastStore.getState().toasts.find((t) => t.kind === 'error');
    expect(err).toBeDefined();
    expect(err!.description).toContain('mux failed');
  });

  it('shows frame counts for encode progress', async () => {
    installGpuReady();
    usePrefsStore.setState({
      exportDirHandle: makeDirHandle() as unknown as FileSystemDirectoryHandle,
    });

    let progress: ReturnType<typeof runningStatus>;
    encodeGradedMock.mockImplementation(async (opts: {
      onProgress?: (progress: unknown) => void;
    }) => {
      opts.onProgress?.({
        phase: 'encode',
        ratio: 0.004,
        framesDone: 12,
        framesTotal: 3000,
      });
      progress = runningStatus();
      return { frameCount: 3000 };
    });

    let cb: (() => Promise<void>) | undefined;
    render(<Probe onReady={(c) => { cb = c; }} />);
    await act(async () => { await cb!(); });

    expect(progress?.description).toBe('Encoding frame 12/3000 (0%)');
    expect(progress?.ratio).toBe(0.004);
  });

  it('shows a ratio-only encode progress on the direct path', async () => {
    usePrefsStore.setState({
      exportDirHandle: makeDirHandle() as unknown as FileSystemDirectoryHandle,
    });
    useDeliverStore.setState({ bakeGrade: false });

    let progress: ReturnType<typeof runningStatus>;
    encodeDirectMock.mockImplementation(async (opts: {
      onProgress?: (progress: unknown) => void;
    }) => {
      opts.onProgress?.({ phase: 'encode', ratio: 0.5 });
      progress = runningStatus();
      return { audioIncluded: true, frameCount: 100 };
    });

    let cb: (() => Promise<void>) | undefined;
    render(<Probe onReady={(c) => { cb = c; }} />);
    await act(async () => { await cb!(); });

    expect(progress?.description).toBe('Encoding (50%)');
    expect(progress?.ratio).toBe(0.5);
  });

  it('shows the current rendering frame before grabFrame resolves', async () => {
    installGpuReady();
    usePrefsStore.setState({
      exportDirHandle: makeDirHandle() as unknown as FileSystemDirectoryHandle,
    });

    let progress: ReturnType<typeof runningStatus>;
    encodeGradedMock.mockImplementation(async (opts: {
      onProgress?: (progress: unknown) => void;
    }) => {
      opts.onProgress?.({
        phase: 'grab',
        ratio: 0,
        frameCurrent: 1,
        framesDone: 0,
        framesTotal: 350,
      });
      progress = runningStatus();
      return { frameCount: 350 };
    });

    let cb: (() => Promise<void>) | undefined;
    render(<Probe onReady={(c) => { cb = c; }} />);
    await act(async () => { await cb!(); });

    expect(progress?.description).toBe('Rendering frame 1/350 (0%)');
  });

  it('shows when the export-only video source is loading', async () => {
    installGpuReady();
    usePrefsStore.setState({
      exportDirHandle: makeDirHandle() as unknown as FileSystemDirectoryHandle,
    });

    let resolveSource: (source: ExportVideoSourceMock) => void = () => undefined;
    createExportVideoSourceMock.mockReturnValue(
      new Promise<ExportVideoSourceMock>((resolve) => {
        resolveSource = resolve;
      }),
    );

    let cb: (() => Promise<void>) | undefined;
    render(<Probe onReady={(c) => { cb = c; }} />);

    let exportPromise: Promise<void> | undefined;
    await act(async () => {
      exportPromise = cb!();
      await Promise.resolve();
    });

    expect(runningStatus()?.description).toBe('Loading export video…');
    expect(runningStatus()?.ratio).toBeNull();

    await act(async () => {
      resolveSource(exportVideoSource);
      await exportPromise;
    });

    expect(useExportStatusStore.getState().status.kind).toBe('idle');
  });

  it('shows planning progress before rendering starts', async () => {
    installGpuReady();
    usePrefsStore.setState({
      exportDirHandle: makeDirHandle() as unknown as FileSystemDirectoryHandle,
    });

    let progress: ReturnType<typeof runningStatus>;
    encodeGradedMock.mockImplementation(async (opts: {
      onProgress?: (progress: unknown) => void;
    }) => {
      opts.onProgress?.({
        phase: 'plan',
        ratio: 0,
        framesDone: 0,
        framesTotal: 350,
      });
      progress = runningStatus();
      return { frameCount: 350 };
    });

    let cb: (() => Promise<void>) | undefined;
    render(<Probe onReady={(c) => { cb = c; }} />);
    await act(async () => { await cb!(); });

    expect(progress?.description).toBe('Planning 350 frames…');
  });

  it('errors when fps is unknown instead of assuming 30', async () => {
    installGpuReady();
    usePrefsStore.setState({
      exportDirHandle: makeDirHandle() as unknown as FileSystemDirectoryHandle,
    });
    useEditStore.setState({ fps: 0 });

    let cb: (() => Promise<void>) | undefined;
    render(<Probe onReady={(c) => { cb = c; }} />);
    await act(async () => { await cb!(); });

    const toasts = useToastStore.getState().toasts;
    expect(toasts.some((t) => t.kind === 'error')).toBe(true);
    expect(encodeGradedMock).not.toHaveBeenCalled();
  });

  it('scales the encode size to the 1080p deliver resolution', async () => {
    installGpuReady();
    usePrefsStore.setState({
      exportDirHandle: makeDirHandle() as unknown as FileSystemDirectoryHandle,
    });
    useDeliverStore.setState({ resolution: '1080p' });
    exportVideoSource.width = 3840;
    exportVideoSource.height = 2160;

    let cb: (() => Promise<void>) | undefined;
    render(<Probe onReady={(c) => { cb = c; }} />);
    await act(async () => { await cb!(); });

    const args = encodeGradedMock.mock.calls[0]![0] as {
      height: number;
      width: number;
    };
    expect(args.width).toBe(1920);
    expect(args.height).toBe(1080);
  });

  it('passes bake flags through and drops the grade on the rendered fallback path', async () => {
    installGpuReady();
    usePrefsStore.setState({
      exportDirHandle: makeDirHandle() as unknown as FileSystemDirectoryHandle,
    });
    useDeliverStore.setState({
      bakeGrade: false,
      bakeSpeed: false,
      bakeTrim: false,
      resolution: '1080p',
    });

    let cb: (() => Promise<void>) | undefined;
    render(<Probe onReady={(c) => { cb = c; }} />);
    await act(async () => { await cb!(); });

    const args = encodeGradedMock.mock.calls[0]![0] as {
      bakeSpeed: boolean;
      bakeTrim: boolean;
      grabFrame: (sourceTime: number, grade: unknown) => unknown;
    };
    expect(args.bakeSpeed).toBe(false);
    expect(args.bakeTrim).toBe(false);

    await args.grabFrame(1, { exposure: 2 });
    expect(grabFrameMock).toHaveBeenCalledWith(
      expect.objectContaining({ bypassGrade: true }),
      1,
      undefined,
    );
  });

  it('does not clobber the onProgress ratio with grabFrame statuses', async () => {
    installGpuReady();
    usePrefsStore.setState({
      exportDirHandle: makeDirHandle() as unknown as FileSystemDirectoryHandle,
    });

    grabFrameMock.mockImplementation(
      async (
        _ctx: unknown,
        _sourceTime: number,
        _grade: unknown,
        opts?: { onStatus?: (status: string) => void },
      ) => {
        opts?.onStatus?.('Seeking export video to 1.00s…');
        return { width: 2, height: 2, rgba: new Uint8Array(16) };
      },
    );

    let statusAfterGrab: ReturnType<typeof runningStatus>;
    encodeGradedMock.mockImplementation(async (opts: {
      grabFrame: (sourceTime: number, grade: unknown) => Promise<unknown>;
      onProgress?: (progress: unknown) => void;
    }) => {
      opts.onProgress?.({
        phase: 'grab',
        ratio: 0.4,
        frameCurrent: 140,
        framesDone: 139,
        framesTotal: 350,
      });
      await opts.grabFrame(1, { exposure: 1 });
      statusAfterGrab = runningStatus();
      return { frameCount: 350 };
    });

    let cb: (() => Promise<void>) | undefined;
    render(<Probe onReady={(c) => { cb = c; }} />);
    await act(async () => { await cb!(); });

    expect(statusAfterGrab?.description).toBe('Rendering frame 140/350 (40%)');
    expect(statusAfterGrab?.ratio).toBe(0.4);
  });

  it('exports one file per segment in multi output mode', async () => {
    installGpuReady();
    const dir = makeDirHandle('Exports');
    usePrefsStore.setState({
      exportDirHandle: dir as unknown as FileSystemDirectoryHandle,
    });
    useDeliverStore.setState({ outputMode: 'multi' });
    useClipDataStore.setState({
      entries: {
        'clip-1': {
          markers: [],
          segments: [
            { id: 'b', in: 3, out: 4, playMode: 'normal', speed: 1 },
            { id: 'a', in: 0, out: 1, playMode: 'normal', speed: 1 },
          ],
          baseGrade: {},
          status: 'idle',
          readOnly: false,
        },
      },
    });

    const descriptions: (string | undefined)[] = [];
    encodeGradedMock.mockImplementation(async () => {
      descriptions.push(runningStatus()?.description);
      return { frameCount: 0 };
    });

    let cb: (() => Promise<void>) | undefined;
    render(<Probe onReady={(c) => { cb = c; }} />);
    await act(async () => { await cb!(); });

    expect(encodeGradedMock).toHaveBeenCalledTimes(2);
    expect(descriptions).toEqual([
      'Segment 1/2: Preparing encoder…',
      'Segment 2/2: Preparing encoder…',
    ]);
    const firstArgs = encodeGradedMock.mock.calls[0]![0] as {
      segments: { id: string }[];
    };
    const secondArgs = encodeGradedMock.mock.calls[1]![0] as {
      segments: { id: string }[];
    };
    expect(firstArgs.segments.map((s) => s.id)).toEqual(['a']);
    expect(secondArgs.segments.map((s) => s.id)).toEqual(['b']);
    expect(dir.getFileHandle).toHaveBeenCalledWith('DJI_0001_seg01.mp4', { create: true });
    expect(dir.getFileHandle).toHaveBeenCalledWith('DJI_0001_seg02.mp4', { create: true });

    const success = useToastStore
      .getState()
      .toasts.find((t) => t.kind === 'success');
    expect(success!.description).toBe(
      'DJI_0001_seg01.mp4, DJI_0001_seg02.mp4',
    );
  });

  it('rejects a second export while one is running', async () => {
    installGpuReady();
    usePrefsStore.setState({
      exportDirHandle: makeDirHandle() as unknown as FileSystemDirectoryHandle,
    });

    let release: () => void = () => undefined;
    encodeGradedMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          release = () => resolve({ frameCount: 1 });
        }),
    );

    let cb: (() => Promise<void>) | undefined;
    render(<Probe onReady={(c) => { cb = c; }} />);

    let first: Promise<void> | undefined;
    await act(async () => {
      first = cb!();
      await Promise.resolve();
      await cb!();
    });

    expect(encodeGradedMock).toHaveBeenCalledTimes(1);
    expect(useToastStore.getState().toasts).toHaveLength(0);

    await act(async () => {
      release();
      await first;
    });
  });

  it('cancels via the store cancel and reports cancellation instead of failure', async () => {
    installGpuReady();
    usePrefsStore.setState({
      exportDirHandle: makeDirHandle() as unknown as FileSystemDirectoryHandle,
    });
    encodeGradedMock.mockImplementation(async (opts: { signal: AbortSignal }) => {
      const status = runningStatus();
      expect(status).toBeDefined();
      status!.cancel();
      opts.signal.throwIfAborted();
      throw new Error('unreachable');
    });

    let cb: (() => Promise<void>) | undefined;
    render(<Probe onReady={(c) => { cb = c; }} />);
    await act(async () => { await cb!(); });

    expect(useExportStatusStore.getState().status.kind).toBe('idle');
    const toasts = useToastStore.getState().toasts;
    expect(toasts.some((t) => t.kind === 'error')).toBe(false);
    expect(toasts.some((t) => t.title === 'Export canceled')).toBe(true);
  });

  it('aborts the writable, removes the stub file and surfaces an error toast when encodeGraded rejects', async () => {
    installGpuReady();
    const dir = makeDirHandle('Exports');
    usePrefsStore.setState({
      exportDirHandle: dir as unknown as FileSystemDirectoryHandle,
    });
    encodeGradedMock.mockRejectedValue(new Error('boom'));

    let cb: (() => Promise<void>) | undefined;
    render(<Probe onReady={(c) => { cb = c; }} />);
    await act(async () => { await cb!(); });

    expect(dir.writable.abort).toHaveBeenCalledTimes(1);
    expect(dir.removeEntry).toHaveBeenCalledTimes(1);
    expect(dir.removeEntry).toHaveBeenCalledWith('DJI_0001_edit.mp4');
    expect(useExportStatusStore.getState().status.kind).toBe('idle');
    const toasts = useToastStore.getState().toasts;
    const err = toasts.find((t) => t.kind === 'error');
    expect(err).toBeDefined();
    expect(err!.description).toContain('boom');
  });
});
