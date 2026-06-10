import { Slider } from '@base-ui/react/slider';
import { type ReactNode,useCallback, useMemo, useRef } from 'react';

import { TimelineContext, type TimelineContextValue } from './context';

interface RootProps {
  children: ReactNode;
  'data-testid'?: string;
  duration: number;
  fps: number;
  onChange: (time: number) => void;
  readOnly: boolean;
  value: number;
}

function clamp(v: number, lo: number, hi: number): number {
  if (hi < lo) return lo;
  return Math.min(hi, Math.max(lo, v));
}

export function Root({
  children,
  duration,
  fps,
  onChange,
  readOnly,
  value,
  'data-testid': testId,
}: RootProps) {
  const trackRef = useRef<HTMLDivElement | null>(null);

  const timeToPercent = useCallback(
    (time: number): number => {
      if (duration <= 0) return 0;
      return clamp((time / duration) * 100, 0, 100);
    },
    [duration],
  );

  const clientXToTime = useCallback(
    (clientX: number): number | undefined => {
      const el = trackRef.current;
      if (!el || duration <= 0) return undefined;
      const rect = el.getBoundingClientRect();
      if (rect.width <= 0) return undefined;
      const ratio = (clientX - rect.left) / rect.width;
      return clamp(ratio * duration, 0, duration);
    },
    [duration],
  );

  const ctxValue = useMemo<TimelineContextValue>(
    () => ({ clientXToTime, duration, fps, readOnly, timeToPercent, trackRef }),
    [clientXToTime, duration, fps, readOnly, timeToPercent],
  );

  const step = fps > 0 ? 1 / fps : 1 / 30;
  const handleValueChange = useCallback(
    (next: number | number[]) => {
      const t = Array.isArray(next) ? (next[0] ?? 0) : next;
      onChange(t);
    },
    [onChange],
  );

  return (
    <TimelineContext value={ctxValue}>
      <Slider.Root
        className="block w-full"
        data-testid={testId}
        disabled={duration <= 0}
        max={duration > 0 ? duration : 1}
        min={0}
        step={step}
        value={value}
        onValueChange={handleValueChange}
      >
        {children}
      </Slider.Root>
    </TimelineContext>
  );
}
