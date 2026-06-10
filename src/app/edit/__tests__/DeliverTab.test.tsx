import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useClipDataStore } from '~/state/clipDataStore';
import { useClipsStore } from '~/state/clipsStore';
import { useDeliverStore } from '~/state/deliverStore';
import { useExportStatusStore } from '~/state/exportStatusStore';
import { usePrefsStore } from '~/state/prefsStore';

import { DeliverTab } from '../DeliverTab';

const extractFrameMock = vi.fn();
const runExportMock = vi.fn();
const probeCodecSupportMock = vi.fn();

vi.mock('~/export/encoder/webcodecs/codecSupport', () => ({
  probeCodecSupport: () => probeCodecSupportMock(),
}));

vi.mock('~/app/edit/useFrameExtract', () => ({
  useFrameExtract: () => extractFrameMock,
}));

vi.mock('~/app/edit/useExport', () => ({
  useExport: () => runExportMock,
}));

vi.mock('~/fs/clipSidecar', async () => {
  const actual = await vi.importActual<typeof import('~/fs/clipSidecar')>(
    '~/fs/clipSidecar',
  );
  return {
    ...actual,
    readSidecar: vi.fn(),
    writeSidecar: vi.fn(),
  };
});

const fileHandle = {} as FileSystemFileHandle;

function resetAll(): void {
  extractFrameMock.mockReset();
  runExportMock.mockReset();
  probeCodecSupportMock.mockReset();
  probeCodecSupportMock.mockReturnValue(new Promise(() => undefined));
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
  usePrefsStore.setState({
    clipDirHandle: undefined,
    lutDirHandle: undefined,
    exportDirHandle: undefined,
    lastSession: undefined,
  });
  useExportStatusStore.setState({ status: { kind: 'idle' } });
}

beforeEach(() => {
  resetAll();
});

afterEach(() => {
  cleanup();
});

describe('DeliverTab sections', () => {
  it('renders Output, Bake, Output mode, Output location and action sections', () => {
    const { getByTestId } = render(<DeliverTab />);
    expect(getByTestId('deliver-tab')).toBeTruthy();
    expect(getByTestId('deliver-output-section')).toBeTruthy();
    expect(getByTestId('deliver-bake-section')).toBeTruthy();
    expect(getByTestId('deliver-mode-section')).toBeTruthy();
    expect(getByTestId('deliver-location-section')).toBeTruthy();
    expect(getByTestId('deliver-export-button')).toBeTruthy();
    expect(getByTestId('deliver-frame-extract-button')).toBeTruthy();
  });
});

describe('DeliverTab output controls', () => {
  it('H.265 and ProRes container choices are disabled while the codec probe is pending', () => {
    const { getByTestId } = render(<DeliverTab />);
    const h265 = getByTestId('deliver-container-mp4-h265') as HTMLInputElement;
    const prores = getByTestId('deliver-container-mov-prores') as HTMLInputElement;
    expect(h265.disabled).toBe(true);
    expect(prores.disabled).toBe(true);
    expect(useDeliverStore.getState().container).toBe('mp4-h264');
  });

  it('enables H.265 when an HEVC encoder is available', async () => {
    probeCodecSupportMock.mockResolvedValue({ avc: true, hevc: true });
    const { getByTestId } = render(<DeliverTab />);
    await act(async () => undefined);
    const h265 = getByTestId('deliver-container-mp4-h265') as HTMLInputElement;
    expect(h265.disabled).toBe(false);
    expect(h265.closest('label')?.title).toBe('');
    fireEvent.click(h265);
    expect(useDeliverStore.getState().container).toBe('mp4-h265');
  });

  it('keeps H.265 disabled with a hint when no HEVC encoder is available', async () => {
    probeCodecSupportMock.mockResolvedValue({ avc: true, hevc: false });
    const { getByTestId } = render(<DeliverTab />);
    await act(async () => undefined);
    const h265 = getByTestId('deliver-container-mp4-h265') as HTMLInputElement;
    expect(h265.disabled).toBe(true);
    expect(h265.closest('label')?.title).toContain(
      'No HEVC hardware encoder available',
    );
  });

  it('keeps H.265 disabled when the codec probe rejects', async () => {
    probeCodecSupportMock.mockRejectedValue(new Error('probe failed'));
    const { getByTestId } = render(<DeliverTab />);
    await act(async () => undefined);
    const h265 = getByTestId('deliver-container-mp4-h265') as HTMLInputElement;
    expect(h265.disabled).toBe(true);
  });

  it('ProRes stays disabled with its own hint even when HEVC is available', async () => {
    probeCodecSupportMock.mockResolvedValue({ avc: true, hevc: true });
    const { getByTestId } = render(<DeliverTab />);
    await act(async () => undefined);
    const prores = getByTestId('deliver-container-mov-prores') as HTMLInputElement;
    expect(prores.disabled).toBe(true);
    expect(prores.closest('label')?.title).toContain('ProRes export is not supported');
  });

  it('resolution select updates the store', () => {
    const { getByTestId } = render(<DeliverTab />);
    const select = getByTestId('deliver-resolution-select') as HTMLSelectElement;
    fireEvent.change(select, { target: { value: '4k' } });
    expect(useDeliverStore.getState().resolution).toBe('4k');
  });

  it('quality select renders all tiers and updates the store', () => {
    const { getByTestId } = render(<DeliverTab />);
    const select = getByTestId('deliver-quality-select') as HTMLSelectElement;
    expect(Array.from(select.options).map((o) => o.value)).toEqual([
      'low',
      'medium',
      'high',
      'very-high',
    ]);
    expect(select.value).toBe('high');
    fireEvent.change(select, { target: { value: 'very-high' } });
    expect(useDeliverStore.getState().quality).toBe('very-high');
  });

  it('Rec.2020 HDR colorspace option is disabled', () => {
    const { getByTestId } = render(<DeliverTab />);
    const select = getByTestId('deliver-colorspace-select') as HTMLSelectElement;
    const hdrOpt = Array.from(select.options).find((o) => o.value === 'rec2020-hdr');
    expect(hdrOpt?.disabled).toBe(true);
  });
});

describe('DeliverTab bake toggles', () => {
  it('flips bakeTrim', () => {
    const { getByTestId } = render(<DeliverTab />);
    fireEvent.click(getByTestId('deliver-bake-trim'));
    expect(useDeliverStore.getState().bakeTrim).toBe(false);
  });

  it('flips bakeSpeed', () => {
    const { getByTestId } = render(<DeliverTab />);
    fireEvent.click(getByTestId('deliver-bake-speed'));
    expect(useDeliverStore.getState().bakeSpeed).toBe(false);
  });

  it('flips bakeGrade', () => {
    const { getByTestId } = render(<DeliverTab />);
    fireEvent.click(getByTestId('deliver-bake-grade'));
    expect(useDeliverStore.getState().bakeGrade).toBe(false);
  });
});

describe('DeliverTab filename preview', () => {
  it('single mode shows "<basename>_edit.mp4"', () => {
    const { getByTestId } = render(<DeliverTab />);
    const list = getByTestId('deliver-filename-list');
    expect(list.textContent).toContain('DJI_0001_edit.mp4');
  });

  it('multi mode with 3 segments lists three "_seg##" files', () => {
    useClipDataStore.setState({
      entries: {
        'clip-1': {
          markers: [],
          segments: [
            { id: 's1', in: 0, out: 1, playMode: 'normal', speed: 1 },
            { id: 's2', in: 1, out: 2, playMode: 'normal', speed: 1 },
            { id: 's3', in: 2, out: 3, playMode: 'normal', speed: 1 },
          ],
          baseGrade: {},
          status: 'idle',
          readOnly: false,
        },
      },
    });
    useDeliverStore.getState().setOutputMode('multi');
    const { getByTestId } = render(<DeliverTab />);
    const list = getByTestId('deliver-filename-list');
    expect(list.textContent).toContain('DJI_0001_seg01.mp4');
    expect(list.textContent).toContain('DJI_0001_seg02.mp4');
    expect(list.textContent).toContain('DJI_0001_seg03.mp4');
    expect(list.textContent).not.toContain('_seg04');
  });

  it('multi mode with no segments falls back to single filename', () => {
    useDeliverStore.getState().setOutputMode('multi');
    const { getByTestId } = render(<DeliverTab />);
    const list = getByTestId('deliver-filename-list');
    expect(list.textContent).toContain('DJI_0001_edit.mp4');
  });

  it('mov-prores container changes the filename extension to .mov', () => {
    useDeliverStore.getState().setContainer('mov-prores');
    const { getByTestId } = render(<DeliverTab />);
    const list = getByTestId('deliver-filename-list');
    expect(list.textContent).toContain('DJI_0001_edit.mov');
  });
});

describe('DeliverTab output mode', () => {
  it('mode radio flips between single and multi', () => {
    const { getByTestId } = render(<DeliverTab />);
    fireEvent.click(getByTestId('deliver-mode-multi'));
    expect(useDeliverStore.getState().outputMode).toBe('multi');
    fireEvent.click(getByTestId('deliver-mode-single'));
    expect(useDeliverStore.getState().outputMode).toBe('single');
  });
});

describe('DeliverTab export action', () => {
  it('Export button is disabled when no export folder is set', () => {
    const { getByTestId } = render(<DeliverTab />);
    const btn = getByTestId('deliver-export-button') as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    expect(btn.getAttribute('aria-disabled')).toBe('true');
  });

  it('Export button is disabled when no clip is selected', () => {
    useClipsStore.setState({ selectedClipId: undefined });
    usePrefsStore.setState({
      exportDirHandle: { name: 'Exports' } as unknown as FileSystemDirectoryHandle,
    });
    const { getByTestId } = render(<DeliverTab />);
    const btn = getByTestId('deliver-export-button') as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
  });

  it('Export button becomes enabled and calls runExport once when clicked', () => {
    usePrefsStore.setState({
      exportDirHandle: { name: 'Exports' } as unknown as FileSystemDirectoryHandle,
    });
    const { getByTestId } = render(<DeliverTab />);
    const btn = getByTestId('deliver-export-button') as HTMLButtonElement;
    expect(btn.disabled).toBe(false);
    fireEvent.click(btn);
    expect(runExportMock).toHaveBeenCalledTimes(1);
  });

  it('Frame extract button calls the extract function', () => {
    const { getByTestId } = render(<DeliverTab />);
    fireEvent.click(getByTestId('deliver-frame-extract-button'));
    expect(extractFrameMock).toHaveBeenCalledTimes(1);
  });
});

describe('DeliverTab export progress', () => {
  function setRunning(overrides: { cancel?: () => void; ratio?: number | null } = {}) {
    useExportStatusStore.getState().setStatus({
      kind: 'running',
      cancel: overrides.cancel ?? (() => undefined),
      description: 'Rendering frame 120/450 (27%)',
      ratio: overrides.ratio === undefined ? 0.27 : overrides.ratio,
    });
  }

  it('renders nothing extra while idle', () => {
    const { queryByTestId } = render(<DeliverTab />);
    expect(queryByTestId('deliver-export-progress')).toBeNull();
    expect(queryByTestId('deliver-export-cancel')).toBeNull();
  });

  it('renders the determinate bar, status line and Cancel while running', () => {
    usePrefsStore.setState({
      exportDirHandle: { name: 'Exports' } as unknown as FileSystemDirectoryHandle,
    });
    setRunning();
    const { getByTestId } = render(<DeliverTab />);
    const track = getByTestId('deliver-export-progress-track');
    expect(track.getAttribute('role')).toBe('progressbar');
    expect(track.getAttribute('aria-valuemin')).toBe('0');
    expect(track.getAttribute('aria-valuemax')).toBe('100');
    expect(track.getAttribute('aria-valuenow')).toBe('27');
    const bar = getByTestId('deliver-export-progress-bar');
    expect(bar.style.width).toBe('27%');
    const status = getByTestId('deliver-export-progress-status');
    expect(status.getAttribute('role')).toBe('status');
    expect(status.textContent).toBe('Rendering frame 120/450 (27%)');
    expect(getByTestId('deliver-export-cancel')).toBeTruthy();
  });

  it('renders an indeterminate bar when ratio is null', () => {
    setRunning({ ratio: null });
    const { getByTestId, queryByTestId } = render(<DeliverTab />);
    expect(getByTestId('deliver-export-progress-indeterminate')).toBeTruthy();
    expect(queryByTestId('deliver-export-progress-bar')).toBeNull();
    const track = getByTestId('deliver-export-progress-track');
    expect(track.getAttribute('role')).toBe('progressbar');
    expect(track.getAttribute('aria-valuenow')).toBeNull();
  });

  it('Cancel invokes the store cancel', () => {
    const cancel = vi.fn();
    setRunning({ cancel });
    const { getByTestId } = render(<DeliverTab />);
    fireEvent.click(getByTestId('deliver-export-cancel'));
    expect(cancel).toHaveBeenCalledTimes(1);
  });

  it('disables the Export button while running', () => {
    usePrefsStore.setState({
      exportDirHandle: { name: 'Exports' } as unknown as FileSystemDirectoryHandle,
    });
    setRunning();
    const { getByTestId } = render(<DeliverTab />);
    const btn = getByTestId('deliver-export-button') as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    fireEvent.click(btn);
    expect(runExportMock).not.toHaveBeenCalled();
  });
});

describe('DeliverTab output location', () => {
  it('shows the "No export folder" empty state when handle is missing', () => {
    const { getByTestId } = render(<DeliverTab />);
    expect(getByTestId('deliver-location-empty')).toBeTruthy();
    expect(getByTestId('deliver-location-pick')).toBeTruthy();
  });

  it('shows the folder name when handle is set', () => {
    usePrefsStore.setState({
      exportDirHandle: { name: 'Exports' } as unknown as FileSystemDirectoryHandle,
    });
    const { getByTestId } = render(<DeliverTab />);
    expect(getByTestId('deliver-location-name').textContent).toContain('Exports');
    expect(getByTestId('deliver-location-pick').textContent).toMatch(/change/i);
  });
});
