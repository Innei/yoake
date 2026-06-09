import { useEffect, useRef } from 'react';

import { useClipDataStore } from '~/state/clipDataStore';
import { useClipsStore } from '~/state/clipsStore';
import { useEditModeStore } from '~/state/editModeStore';
import { useEditStore } from '~/state/editStore';

import { ClipOverview } from './ClipOverview';
import { MarkerContextPanel } from './MarkerContextPanel';

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
    return (
      <div className="p-3 text-xs text-text-secondary" data-testid="segment-inspector-stub">
        SegmentInspector — implemented in T4
      </div>
    );
  }
  return <ClipOverview />;
}
