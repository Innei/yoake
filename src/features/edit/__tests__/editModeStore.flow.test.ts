import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useClipsStore } from '~/features/clips/clipsStore';
import { useEditModeStore } from '~/features/edit/editModeStore';

vi.mock('~/features/clips/clipsStore', () => {
  let selectedClipId: string | undefined;
  return {
    useClipsStore: {
      getState: () => ({
        get selectedClipId() {
          return selectedClipId;
        },
      }),
      __setSelectedClipId: (id: string | undefined) => {
        selectedClipId = id;
      },
    },
  };
});

const clipsMock = useClipsStore as unknown as {
  __setSelectedClipId: (id: string | undefined) => void;
};

describe('editModeStore', () => {
  beforeEach(() => {
    clipsMock.__setSelectedClipId(undefined);
    useEditModeStore.setState({
      mode: 'view',
      outlineSelection: { kind: 'none' },
    });
  });

  it('has the expected initial state', () => {
    const state = useEditModeStore.getState();
    expect(state.mode).toBe('view');
    expect(state.outlineSelection).toEqual({ kind: 'none' });
  });

  it('enter() is a no-op when no clip is selected', () => {
    clipsMock.__setSelectedClipId(undefined);
    useEditModeStore.getState().enter();
    expect(useEditModeStore.getState().mode).toBe('view');
  });

  it('enter() switches to edit and resets outlineSelection when a clip is selected', () => {
    clipsMock.__setSelectedClipId('clip-1');
    useEditModeStore.setState({ outlineSelection: { kind: 'marker', id: 'm1' } });
    useEditModeStore.getState().enter();
    const state = useEditModeStore.getState();
    expect(state.mode).toBe('edit');
    expect(state.outlineSelection).toEqual({ kind: 'none' });
  });

  it('exit() returns to view without clearing outlineSelection', () => {
    clipsMock.__setSelectedClipId('clip-1');
    useEditModeStore.getState().enter();
    useEditModeStore.getState().selectMarker('marker-42');
    useEditModeStore.getState().exit();
    const state = useEditModeStore.getState();
    expect(state.mode).toBe('view');
    expect(state.outlineSelection).toEqual({ kind: 'marker', id: 'marker-42' });
  });

  it('toggle() flips between view and edit when a clip is selected', () => {
    clipsMock.__setSelectedClipId('clip-1');
    useEditModeStore.getState().toggle();
    expect(useEditModeStore.getState().mode).toBe('edit');
    useEditModeStore.getState().toggle();
    expect(useEditModeStore.getState().mode).toBe('view');
  });

  it('toggle() stays in view when no clip is selected', () => {
    clipsMock.__setSelectedClipId(undefined);
    useEditModeStore.getState().toggle();
    expect(useEditModeStore.getState().mode).toBe('view');
  });

  it('selectMarker(id) sets outlineSelection to that marker', () => {
    useEditModeStore.getState().selectMarker('marker-1');
    expect(useEditModeStore.getState().outlineSelection).toEqual({
      kind: 'marker',
      id: 'marker-1',
    });
  });

  it('clearSelection() resets outlineSelection to none', () => {
    useEditModeStore.getState().selectMarker('marker-1');
    useEditModeStore.getState().clearSelection();
    expect(useEditModeStore.getState().outlineSelection).toEqual({ kind: 'none' });
  });
});
