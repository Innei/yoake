import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useClipDataStore } from '~/state/clipDataStore';
import { useClipsStore } from '~/state/clipsStore';
import { useDeliverStore } from '~/state/deliverStore';
import { usePrefsStore } from '~/state/prefsStore';

import { DeliverTab } from '../DeliverTab';

const extractFrameMock = vi.fn();

vi.mock('~/app/edit/useFrameExtract', () => ({
  useFrameExtract: () => extractFrameMock,
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
  it('container radio updates the store', () => {
    const { getByTestId } = render(<DeliverTab />);
    fireEvent.click(getByTestId('deliver-container-mp4-h265'));
    expect(useDeliverStore.getState().container).toBe('mp4-h265');
    fireEvent.click(getByTestId('deliver-container-mov-prores'));
    expect(useDeliverStore.getState().container).toBe('mov-prores');
  });

  it('resolution select updates the store', () => {
    const { getByTestId } = render(<DeliverTab />);
    const select = getByTestId('deliver-resolution-select') as HTMLSelectElement;
    fireEvent.change(select, { target: { value: '4k' } });
    expect(useDeliverStore.getState().resolution).toBe('4k');
  });

  it('colorspace select updates the store', () => {
    const { getByTestId } = render(<DeliverTab />);
    const select = getByTestId('deliver-colorspace-select') as HTMLSelectElement;
    fireEvent.change(select, { target: { value: 'rec2020-hdr' } });
    expect(useDeliverStore.getState().colorspace).toBe('rec2020-hdr');
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
  it('Export button is disabled and announces the coming-soon hint', () => {
    const { getByTestId } = render(<DeliverTab />);
    const btn = getByTestId('deliver-export-button') as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    expect(btn.getAttribute('aria-disabled')).toBe('true');
    expect(btn.getAttribute('aria-label') ?? btn.getAttribute('title')).toMatch(
      /coming soon|next/i,
    );
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
