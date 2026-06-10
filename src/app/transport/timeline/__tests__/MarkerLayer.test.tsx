import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Marker } from '~/fs/clipSidecar';
import { useClipDataStore } from '~/state/clipDataStore';
import { useClipsStore } from '~/state/clipsStore';
import { useEditModeStore } from '~/state/editModeStore';
import { useEditStore } from '~/state/editStore';

import { MarkerLayer } from '../MarkerLayer';
import { TimelineTestProvider } from './testHelpers';

const fileHandle = {} as FileSystemFileHandle;

function seedClip(markers: Marker[], duration = 10): void {
  useClipsStore.setState({
    clips: [
      { id: 'clip-1', name: 'DJI.MP4', handle: fileHandle, lastModified: 0, size: 0 },
    ],
    selectedClipId: 'clip-1',
    directoryHandle: undefined,
  });
  useClipDataStore.setState({
    entries: {
      'clip-1': {
        markers,
        segments: [],
        baseGrade: {},
        status: 'idle',
        readOnly: false,
      },
    },
  });
  useEditStore.setState({ duration, fps: 30, currentTime: 0 });
}

beforeEach(() => {
  useClipsStore.setState({
    clips: [],
    selectedClipId: undefined,
    directoryHandle: undefined,
  });
  useClipDataStore.setState({ entries: {} });
  useEditStore.setState({ duration: 0, fps: 0, currentTime: 0 });
  useEditModeStore.setState({
    mode: 'edit',
    outlineSelection: { kind: 'none' },
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('MarkerLayer', () => {
  it('renders one pin per marker positioned by time', () => {
    seedClip([
      { id: 'm1', time: 2, label: '' },
      { id: 'm2', time: 5, label: 'hero' },
    ]);
    const { getByTestId } = render(
      <TimelineTestProvider duration={10}>
        <MarkerLayer />
      </TimelineTestProvider>,
    );
    const pin1 = getByTestId('transport-marker-dot-m1') as HTMLElement;
    const pin2 = getByTestId('transport-marker-dot-m2') as HTMLElement;
    expect(pin1.style.left).toBe('20%');
    expect(pin2.style.left).toBe('50%');
  });

  it('right-click on marker opens 2-item menu', async () => {
    seedClip([{ id: 'm1', time: 2, label: '' }]);
    const { getByTestId } = render(
      <TimelineTestProvider duration={10}>
        <MarkerLayer />
      </TimelineTestProvider>,
    );
    const pin = getByTestId('transport-marker-dot-m1');

    fireEvent.contextMenu(pin, { clientX: 50 });

    expect(await screen.findByText('Jump to time')).toBeTruthy();
    expect(screen.getByText('Delete')).toBeTruthy();
  });

  it('"Jump to time" sets currentTime to marker.time', async () => {
    seedClip([{ id: 'm1', time: 2.5, label: '' }]);
    const setSpy = vi.spyOn(useEditStore.getState(), 'setCurrentTime');

    const { getByTestId } = render(
      <TimelineTestProvider duration={10}>
        <MarkerLayer />
      </TimelineTestProvider>,
    );
    const pin = getByTestId('transport-marker-dot-m1');
    fireEvent.contextMenu(pin, { clientX: 50 });
    const item = await screen.findByText('Jump to time');
    fireEvent.click(item);

    expect(setSpy).toHaveBeenCalledWith(2.5);
  });

  it('"Delete" calls removeMarker', async () => {
    seedClip([{ id: 'm1', time: 2, label: '' }]);
    const removeSpy = vi.spyOn(useClipDataStore.getState(), 'removeMarker');

    const { getByTestId } = render(
      <TimelineTestProvider duration={10}>
        <MarkerLayer />
      </TimelineTestProvider>,
    );
    const pin = getByTestId('transport-marker-dot-m1');
    fireEvent.contextMenu(pin, { clientX: 50 });
    const item = await screen.findByText('Delete');
    fireEvent.click(item);

    expect(removeSpy).toHaveBeenCalledWith('clip-1', 'm1');
  });

  it('view mode renders a non-interactive pin with no menu', () => {
    seedClip([{ id: 'm1', time: 2, label: '' }]);
    useEditModeStore.setState({ mode: 'view' });

    const { getByTestId } = render(
      <TimelineTestProvider readOnly duration={10}>
        <MarkerLayer />
      </TimelineTestProvider>,
    );
    const pin = getByTestId('transport-marker-dot-m1');
    fireEvent.contextMenu(pin, { clientX: 50 });
    expect(screen.queryByText('Jump to time')).toBeNull();
  });
});
