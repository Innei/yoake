import { beforeEach, describe, expect, it } from 'vitest';

import { useClipsStore } from '~/features/clips/clipsStore';
import { useEditModeStore } from '~/features/edit/editModeStore';

const fileHandle = {} as FileSystemFileHandle;

function seedClip(id = 'clip-1'): void {
  useClipsStore.setState({
    clips: [{ id, name: 'a.MP4', handle: fileHandle, lastModified: 0, size: 0 }],
    selectedClipId: id,
  });
}

function resetEditMode(): void {
  useEditModeStore.setState({
    mode: 'view',
    outlineSelection: { kind: 'none' },
  });
}

describe('editModeStore.selectSegment', () => {
  beforeEach(() => {
    resetEditMode();
    seedClip();
  });

  it('sets outlineSelection to a segment kind with the given id', () => {
    useEditModeStore.getState().selectSegment('seg-42');
    expect(useEditModeStore.getState().outlineSelection).toEqual({
      kind: 'segment',
      id: 'seg-42',
    });
  });

  it('selectMarker still works and replaces segment selection', () => {
    useEditModeStore.getState().selectSegment('seg-42');
    useEditModeStore.getState().selectMarker('m-1');
    expect(useEditModeStore.getState().outlineSelection).toEqual({
      kind: 'marker',
      id: 'm-1',
    });
  });

  it('clearSelection resets to none', () => {
    useEditModeStore.getState().selectSegment('seg-42');
    useEditModeStore.getState().clearSelection();
    expect(useEditModeStore.getState().outlineSelection).toEqual({
      kind: 'none',
    });
  });
});
