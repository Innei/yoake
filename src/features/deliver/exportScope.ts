import type { OutlineSelection } from '~/features/edit/editModeStore';
import type { Segment } from '~/lib/fs/clipSidecar';

export type ExportScope = 'edit' | 'selection';

export interface SelectedSegmentScope {
  count: number;
  index: number;
  segment: Segment;
}

export function resolveSelectedSegment(
  segments: readonly Segment[],
  selection: OutlineSelection,
): SelectedSegmentScope | undefined {
  if (selection.kind !== 'segment') return undefined;
  const sorted = [...segments].sort((a, b) => a.in - b.in);
  const index = sorted.findIndex((s) => s.id === selection.id);
  if (index === -1) return undefined;
  return { segment: sorted[index]!, index, count: sorted.length };
}
