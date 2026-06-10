import type { ReactNode } from 'react';
import { useRef } from 'react';

import { TimelineContext, type TimelineContextValue } from '../context';

interface Props {
  children: ReactNode;
  duration?: number;
  fps?: number;
  readOnly?: boolean;
}

function clamp(v: number, lo: number, hi: number): number {
  if (hi < lo) return lo;
  return Math.min(hi, Math.max(lo, v));
}

export function TimelineTestProvider({
  children,
  duration = 10,
  fps = 30,
  readOnly = false,
}: Props) {
  const trackRef = useRef<HTMLDivElement | null>(null);
  const value: TimelineContextValue = {
    duration,
    fps,
    readOnly,
    trackRef,
    timeToPercent: (t) =>
      duration > 0 ? clamp((t / duration) * 100, 0, 100) : 0,
    clientXToTime: (clientX) => {
      const r = trackRef.current?.getBoundingClientRect();
      if (!r || r.width <= 0 || duration <= 0) return undefined;
      const ratio = (clientX - r.left) / r.width;
      return clamp(ratio * duration, 0, duration);
    },
  };
  return (
    <TimelineContext value={value}>
      <div
        data-testid="timeline-test-track"
        ref={trackRef}
        style={{ position: 'relative', width: 200, height: 36 }}
      >
        {children}
      </div>
    </TimelineContext>
  );
}
