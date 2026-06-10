import { createContext, useContext } from 'react';

export interface TimelineContextValue {
  clientXToTime: (clientX: number) => number | undefined;
  duration: number;
  fps: number;
  readOnly: boolean;
  timeToPercent: (time: number) => number;
  trackRef: React.RefObject<HTMLDivElement | null>;
}

export const TimelineContext = createContext<TimelineContextValue | null>(null);

export function useTimeline(): TimelineContextValue {
  const ctx = useContext(TimelineContext);
  if (!ctx) {
    throw new Error('Timeline subparts must be rendered inside <Timeline.Root>');
  }
  return ctx;
}
