import { toast } from '~/components/ui/toast/toastStore';
import { useClipDataStore } from '~/features/clips/clipDataStore';
import { useClipsStore } from '~/features/clips/clipsStore';
import { useEditModeStore } from '~/features/edit/editModeStore';
import { useEditStore } from '~/features/edit/editStore';

import { clampSegmentRange } from './segmentRange';

export type PresetAnchor = 'before' | 'after' | 'center';

function presetBounds(
  anchor: PresetAnchor,
  durationSec: number,
  time: number,
): { hi: number; lo: number } {
  if (anchor === 'before') return { lo: time - durationSec, hi: time };
  if (anchor === 'after') return { lo: time, hi: time + durationSec };
  return { lo: time - durationSec / 2, hi: time + durationSec / 2 };
}

export function addPresetSegment(
  anchor: PresetAnchor,
  durationSec: number,
): void {
  if (useEditModeStore.getState().mode !== 'edit') return;
  const clipId = useClipsStore.getState().selectedClipId;
  if (!clipId) return;
  const entry = useClipDataStore.getState().entries[clipId];
  if (!entry) return;

  const { currentTime, duration } = useEditStore.getState();
  const { lo, hi } = presetBounds(anchor, durationSec, currentTime);

  const range = clampSegmentRange(lo, hi, duration, entry.segments);
  const id = range
    ? useClipDataStore.getState().addSegment(clipId, range.in, range.out)
    : undefined;
  if (!id) {
    toast.warning('No room for a segment here');
    return;
  }
  useEditModeStore.getState().selectSegment(id);
}

export function applyPresetRange(
  clipId: string,
  segId: string,
  anchor: PresetAnchor,
  durationSec: number,
): void {
  const entry = useClipDataStore.getState().entries[clipId];
  if (!entry) return;
  if (!entry.segments.some((s) => s.id === segId)) return;

  const { currentTime, duration } = useEditStore.getState();
  const { lo, hi } = presetBounds(anchor, durationSec, currentTime);

  const others = entry.segments.filter((s) => s.id !== segId);
  const range = clampSegmentRange(lo, hi, duration, others);
  if (!range) {
    toast.warning('No room for a segment here');
    return;
  }
  useClipDataStore
    .getState()
    .updateSegment(clipId, segId, { in: range.in, out: range.out });
}
