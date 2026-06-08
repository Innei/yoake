import type { InputHTMLAttributes } from 'react';

import { cn } from '~/lib/cn';

interface SliderProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  bipolar?: boolean;
  max: number;
  min: number;
  value: number;
}

export function Slider({
  className,
  min,
  max,
  value,
  bipolar = false,
  ...props
}: SliderProps) {
  const range = max - min || 1;
  const ratio = Math.min(1, Math.max(0, (value - min) / range));
  const pct = ratio * 100;

  const fillStyle: React.CSSProperties = bipolar
    ? (() => {
        const zero = ((0 - min) / range) * 100;
        const left = Math.min(zero, pct);
        const width = Math.abs(pct - zero);
        return { left: `${left}%`, width: `${width}%` };
      })()
    : { left: 0, width: `${pct}%` };

  return (
    <div className={cn('group relative flex h-5 items-center', className)}>
      <div className="pointer-events-none absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 rounded-full bg-fill" />
      <div
        aria-hidden
        className="pointer-events-none absolute top-1/2 h-1 -translate-y-1/2 rounded-full bg-accent"
        style={fillStyle}
      />
      {bipolar ? (
        <div
          aria-hidden
          className="pointer-events-none absolute top-1/2 h-2 w-px -translate-y-1/2 bg-border"
          style={{ left: `${((0 - min) / range) * 100}%` }}
        />
      ) : null}
      <input
        max={max}
        min={min}
        type="range"
        value={value}
        className={cn(
          'relative z-10 h-5 w-full cursor-pointer appearance-none bg-transparent',
          '[&::-webkit-slider-runnable-track]:h-5 [&::-webkit-slider-runnable-track]:bg-transparent',
          '[&::-webkit-slider-thumb]:size-4 [&::-webkit-slider-thumb]:appearance-none',
          '[&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border [&::-webkit-slider-thumb]:border-border',
          '[&::-webkit-slider-thumb]:bg-background [&::-webkit-slider-thumb]:shadow-xs',
          '[&::-webkit-slider-thumb]:transition-transform [&:active::-webkit-slider-thumb]:scale-110',
          '[&::-moz-range-thumb]:size-4 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border',
          '[&::-moz-range-thumb]:border-border [&::-moz-range-thumb]:bg-background',
          'focus-visible:outline-none [&:focus-visible::-webkit-slider-thumb]:ring-2 [&:focus-visible::-webkit-slider-thumb]:ring-accent/40',
        )}
        {...props}
      />
    </div>
  );
}
