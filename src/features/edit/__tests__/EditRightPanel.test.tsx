import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useClipDataStore } from '~/features/clips/clipDataStore';
import { useClipsStore } from '~/features/clips/clipsStore';
import { useEditModeStore } from '~/features/edit/editModeStore';
import { useEditStore } from '~/features/edit/editStore';

import { EditRightPanel } from '../components/EditRightPanel';

vi.mock('~/features/deliver/components/ContextExportAction', () => ({
  ContextExportAction: () => <div data-testid="context-export-mock" />,
}));

vi.mock('../components/MarkerContextPanel', () => ({
  MarkerContextPanel: ({ id }: { id: string }) => (
    <div data-id={id} data-testid="marker-context-panel-mock" />
  ),
}));

const fileHandle = {} as FileSystemFileHandle;

function resetStores(): void {
  useEditModeStore.setState({
    mode: 'view',
    outlineSelection: { kind: 'none' },
  });
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
        markers: [{ id: 'm-1', time: 1.5, label: '' }],
        segments: [],
        baseGrade: {},
        status: 'idle',
        readOnly: false,
      },
    },
  });
  useEditStore.setState({ currentTime: 0, duration: 0, fps: 0 });
}

beforeEach(() => {
  resetStores();
});

afterEach(() => {
  cleanup();
});

describe('EditRightPanel', () => {
  it('renders three tab buttons', () => {
    const { getByTestId } = render(<EditRightPanel />);
    expect(getByTestId('edit-right-tab-inspect')).toBeTruthy();
    expect(getByTestId('edit-right-tab-grade')).toBeTruthy();
    expect(getByTestId('edit-right-tab-deliver')).toBeTruthy();
  });

  it('defaults to the Inspect tab', () => {
    const { getByTestId, queryByTestId } = render(<EditRightPanel />);
    const inspect = getByTestId('edit-right-tab-inspect');
    expect(inspect.getAttribute('aria-selected')).toBe('true');
    expect(getByTestId('clip-overview')).toBeTruthy();
    expect(queryByTestId('grade-tab')).toBeNull();
    expect(queryByTestId('deliver-tab')).toBeNull();
  });

  it('switches to Grade when the Grade tab is clicked', () => {
    const { getByTestId, queryByTestId } = render(<EditRightPanel />);
    fireEvent.click(getByTestId('edit-right-tab-grade'));
    expect(getByTestId('grade-tab')).toBeTruthy();
    expect(queryByTestId('clip-overview')).toBeNull();
  });

  it('half-auto switches to Inspect when a marker is selected', () => {
    const { getByTestId } = render(<EditRightPanel />);
    fireEvent.click(getByTestId('edit-right-tab-deliver'));
    expect(getByTestId('deliver-tab')).toBeTruthy();

    act(() => {
      useEditModeStore.getState().selectMarker('m-1');
    });

    expect(getByTestId('edit-right-tab-inspect').getAttribute('aria-selected')).toBe(
      'true',
    );
    expect(getByTestId('marker-context-panel-mock')).toBeTruthy();
  });

  it('Arrow keys cycle the active tab when the nav is focused', () => {
    const { getByTestId } = render(<EditRightPanel />);
    const nav = getByTestId('edit-right-tabs');
    fireEvent.keyDown(nav, { key: 'ArrowRight' });
    expect(getByTestId('edit-right-tab-grade').getAttribute('aria-selected')).toBe(
      'true',
    );
    fireEvent.keyDown(nav, { key: 'ArrowRight' });
    expect(
      getByTestId('edit-right-tab-deliver').getAttribute('aria-selected'),
    ).toBe('true');
    fireEvent.keyDown(nav, { key: 'ArrowLeft' });
    expect(getByTestId('edit-right-tab-grade').getAttribute('aria-selected')).toBe(
      'true',
    );
  });
});
