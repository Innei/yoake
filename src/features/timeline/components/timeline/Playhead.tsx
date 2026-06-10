import { Slider } from '@base-ui/react/slider';

import { cn } from '~/lib/cn';

import { useTimeline } from './context';

export function Playhead() {
  const { duration } = useTimeline();
  const disabled = duration <= 0;
  return (
    <Slider.Thumb
      aria-label="Playhead"
      className={cn(
        'absolute top-1/2 z-40 size-3.5 -translate-y-1/2 rounded-full',
        'border-2 border-background-secondary bg-accent shadow-xs',
        'outline-none focus-visible:ring-2 focus-visible:ring-accent/40',
        disabled && 'opacity-40',
      )}
    />
  );
}
