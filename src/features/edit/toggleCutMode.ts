import { useClipDataStore } from '~/features/clips/clipDataStore';
import { useClipsStore } from '~/features/clips/clipsStore';
import { useEditModeStore } from '~/features/edit/editModeStore';
import { useEditStore } from '~/features/edit/editStore';

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

  const maxOut = duration > 0 ? duration : currentTime + DEFAULT_NEW_SEGMENT_HALF_SECS * 2;
  const lo = Math.max(0, currentTime - DEFAULT_NEW_SEGMENT_HALF_SECS);
  const hi = Math.min(maxOut, currentTime + DEFAULT_NEW_SEGMENT_HALF_SECS);
  if (!(hi > lo)) return;

  const sorted = [...entry.segments].sort((a, b) => a.in - b.in);
  let inSec = lo;
  let outSec = hi;
  for (const seg of sorted) {
    if (seg.out <= inSec) continue;
    if (seg.in >= outSec) break;
    if (seg.in <= inSec && seg.out >= outSec) return;
    if (inSec < seg.in && outSec > seg.in) outSec = seg.in;
    if (outSec > seg.out && inSec < seg.out) inSec = seg.out;
    if (!(outSec > inSec)) return;
  }

  const id = useClipDataStore.getState().addSegment(clipId, inSec, outSec);
  if (!id) return;
  editMode.enterCutMode(id);
}
