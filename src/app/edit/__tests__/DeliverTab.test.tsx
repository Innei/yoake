import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useClipDataStore } from '~/state/clipDataStore';
import { useClipsStore } from '~/state/clipsStore';
import { useDeliverStore } from '~/state/deliverStore';
import { usePrefsStore } from '~/state/prefsStore';

import { DeliverTab } from '../DeliverTab';

const extractFrameMock = vi.fn();
const runExportMock = vi.fn();

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
  useDeliverStore.setState({
    container: 'mp4-h264',
    resolution: 'source',
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
  it('H.265 and ProRes container choices are disabled', () => {
    const { getByTestId } = render(<DeliverTab />);
    const h265 = getByTestId('deliver-container-mp4-h265') as HTMLInputElement;
    const prores = getByTestId('deliver-container-mov-prores') as HTMLInputElement;
    expect(h265.disabled).toBe(true);
    expect(prores.disabled).toBe(true);
    expect(useDeliverStore.getState().container).toBe('mp4-h264');
  });

  it('resolution select updates the store', () => {
    const { getByTestId } = render(<DeliverTab />);
    const select = getByTestId('deliver-resolution-select') as HTMLSelectElement;
    fireEvent.change(select, { target: { value: '4k' } });
    expect(useDeliverStore.getState().resolution).toBe('4k');
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
