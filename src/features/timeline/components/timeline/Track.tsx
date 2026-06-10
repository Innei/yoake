import { Slider } from '@base-ui/react/slider';
import type { ReactNode } from 'react';

import { useTimeline } from './context';

interface TrackProps {
  children: ReactNode;
}

export function Track({ children }: TrackProps) {
  const { trackRef } = useTimeline();
  return (
    <Slider.Control
      className="relative block h-9 w-full rounded-sm touch-none focus-within:ring-2 focus-within:ring-accent/40 focus-within:ring-offset-1 focus-within:ring-offset-background-secondary"
      ref={trackRef}
    >
      {children}
    </Slider.Control>
  );
}
