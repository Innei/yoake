import { useEffect } from 'react';

import { useClipDataStore } from '~/state/clipDataStore';
import { useClipsStore } from '~/state/clipsStore';
import { useEditModeStore } from '~/state/editModeStore';

import { ClipContextPanel } from './ClipContextPanel';
import { MarkerContextPanel } from './MarkerContextPanel';

export function ContextPanel() {
  const outlineSelection = useEditModeStore((s) => s.outlineSelection);
  const clearSelection = useEditModeStore((s) => s.clearSelection);
  const clipId = useClipsStore((s) => s.selectedClipId);
  const markerExists = useClipDataStore((s) => {
    if (outlineSelection.kind !== 'marker' || !clipId) return false;
    return Boolean(
      s.entries[clipId]?.markers.some((m) => m.id === outlineSelection.id),
    );
  });

  const shouldReset = outlineSelection.kind === 'marker' && !markerExists;

  useEffect(() => {
    if (shouldReset) clearSelection();
  }, [shouldReset, clearSelection]);

  if (outlineSelection.kind === 'marker' && markerExists) {
    return <MarkerContextPanel id={outlineSelection.id} />;
  }

  return <ClipContextPanel />;
}
