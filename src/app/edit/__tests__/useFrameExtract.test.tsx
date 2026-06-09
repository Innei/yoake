import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { setPreviewCanvas } from '~/app/previewCanvasRef';
import { useClipsStore } from '~/state/clipsStore';
import { useEditStore } from '~/state/editStore';
import { usePrefsStore } from '~/state/prefsStore';
import { useToastStore } from '~/state/toastStore';

import { useFrameExtract } from '../useFrameExtract';

const extractFrameMock = vi.fn();

vi.mock('~/export/extractFrame', () => ({
  extractFrame: (...args: unknown[]) => extractFrameMock(...args),
}));

const fileHandle = {} as FileSystemFileHandle;

function Probe({ onReady }: { onReady: (cb: () => Promise<void>) => void }) {
  const cb = useFrameExtract();
  onReady(cb);
  return null;
}

function makeCanvas(): HTMLCanvasElement {
  return {
    toBlob: vi.fn((fn: BlobCallback) => {
      fn(new Blob(['x'], { type: 'image/png' }));
    }),
  } as unknown as HTMLCanvasElement;
}

function makeDirHandle(name = 'Exports'): FileSystemDirectoryHandle {
  return { name } as unknown as FileSystemDirectoryHandle;
}

function resetAll() {
  extractFrameMock.mockReset();
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
  useToastStore.setState({ toasts: [] });
  setPreviewCanvas(null);
}

beforeEach(() => {
  resetAll();
});

afterEach(() => {
  cleanup();
  setPreviewCanvas(null);
});

describe('useFrameExtract', () => {
  it('shows an error toast when no clip is selected', async () => {
    useClipsStore.setState({ selectedClipId: undefined });
    setPreviewCanvas(makeCanvas());
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
    setPreviewCanvas(makeCanvas());

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

  it('shows an error toast when canvas is not available', async () => {
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

  it('calls extractFrame and surfaces a success toast on success', async () => {
    setPreviewCanvas(makeCanvas());
    usePrefsStore.setState({ exportDirHandle: makeDirHandle() });
    extractFrameMock.mockResolvedValue({ filename: 'DJI_0001_00-01-23-456.png' });

    let cb: (() => Promise<void>) | undefined;
    render(<Probe onReady={(c) => { cb = c; }} />);

    await act(async () => {
      await cb!();
    });

    expect(extractFrameMock).toHaveBeenCalledTimes(1);
    const callArg = extractFrameMock.mock.calls[0]![0] as {
      baseName: string;
      currentTime: number;
      fps: number;
    };
    expect(callArg.baseName).toBe('DJI_0001');
    expect(callArg.currentTime).toBe(83.456);
    expect(callArg.fps).toBe(30);

    const toasts = useToastStore.getState().toasts;
    const success = toasts.find((t) => t.kind === 'success');
    expect(success).toBeDefined();
    expect(success!.title).toMatch(/frame saved/i);
    expect(success!.description).toContain('DJI_0001_00-01-23-456.png');
  });

  it('surfaces an error toast when extractFrame rejects', async () => {
    setPreviewCanvas(makeCanvas());
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
