import { useEffect, useRef } from 'react';

import { useClipDataStore } from '~/features/clips/clipDataStore';
import { useClipsStore } from '~/features/clips/clipsStore';
import { useEditModeStore } from '~/features/edit/editModeStore';
import { useEditStore } from '~/features/edit/editStore';

import { ClipOverview } from './ClipOverview';
import { MarkerContextPanel } from './MarkerContextPanel';
import { SegmentInspector } from './SegmentInspector';

export function InspectTab() {
  const outlineSelection = useEditModeStore((s) => s.outlineSelection);
  const clearSelection = useEditModeStore((s) => s.clearSelection);
  const clipId = useClipsStore((s) => s.selectedClipId);
  const markerTime = useClipDataStore((s) => {
    if (outlineSelection.kind !== 'marker' || !clipId) return undefined;
    return s.entries[clipId]?.markers.find((m) => m.id === outlineSelection.id)
      ?.time;
  });
  const markerExists = markerTime !== undefined;
  const shouldReset = outlineSelection.kind === 'marker' && !markerExists;

  useEffect(() => {
    if (shouldReset) clearSelection();
  }, [shouldReset, clearSelection]);

  const lastJumpedIdRef = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (outlineSelection.kind !== 'marker') {
      lastJumpedIdRef.current = undefined;
      return;
    }
    if (markerTime === undefined) return;
    if (lastJumpedIdRef.current === outlineSelection.id) return;
    lastJumpedIdRef.current = outlineSelection.id;
    useEditStore.getState().setCurrentTime(markerTime);
  }, [outlineSelection, markerTime]);

  if (outlineSelection.kind === 'marker' && markerExists) {
    return <MarkerContextPanel id={outlineSelection.id} />;
  }
  if (outlineSelection.kind === 'segment') {
    return <SegmentInspector />;
  }
  return <ClipOverview />;
}
