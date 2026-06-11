import { useClipDataStore } from '~/features/clips/clipDataStore';
import { useClipsStore } from '~/features/clips/clipsStore';
import { useEditModeStore } from '~/features/edit/editModeStore';
import { useEditStore } from '~/features/edit/editStore';

import { clampSegmentRange } from './segmentRange';

const DEFAULT_NEW_SEGMENT_HALF_SECS = 2.5;

export function toggleCutMode(): void {
  const editMode = useEditModeStore.getState();
  if (editMode.cutMode.active) {
    editMode.exitCutMode();
    return;
  }
  if (editMode.mode !== 'edit') return;

  const clipId = useClipsStore.getState().selectedClipId;
  if (!clipId) return;
  const entry = useClipDataStore.getState().entries[clipId];
  if (!entry) return;

  const selection = editMode.outlineSelection;
  if (selection.kind === 'segment') {
    const exists = entry.segments.some((s) => s.id === selection.id);
    if (exists) {
      editMode.enterCutMode(selection.id);
      return;
    }
  }

  const { currentTime, duration } = useEditStore.getState();
  const within = entry.segments.find(
    (s) => currentTime >= s.in && currentTime <= s.out,
  );
  if (within) {
    editMode.enterCutMode(within.id);
    return;
  }

  const range = clampSegmentRange(
    currentTime - DEFAULT_NEW_SEGMENT_HALF_SECS,
    currentTime + DEFAULT_NEW_SEGMENT_HALF_SECS,
    duration,
    entry.segments,
  );
  if (!range) return;

  const id = useClipDataStore.getState().addSegment(clipId, range.in, range.out);
  if (!id) return;
  editMode.enterCutMode(id);
}
