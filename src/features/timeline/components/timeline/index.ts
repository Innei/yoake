import { CutThumbs } from './CutThumbs';
import { MarkerLayer } from './MarkerLayer';
import { Playhead } from './Playhead';
import { Progress } from './Progress';
import { Root } from './Root';
import { SegmentLayer } from './SegmentLayer';
import { Track } from './Track';

export const Timeline = {
  CutThumbs,
  MarkerLayer,
  Playhead,
  Progress,
  Root,
  SegmentLayer,
  Track,
};

export type { TimelineContextValue } from './context';
export { TimelineContext, useTimeline } from './context';
