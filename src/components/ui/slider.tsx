import { Slider as Base } from '@base-ui/react/slider';

import { cn } from '~/lib/cn';

interface SliderProps {
  'aria-label'?: string;
  bipolar?: boolean;
  className?: string;
  disabled?: boolean;
  max: number;
  min: number;
  onDoubleClick?: () => void;
  onValueChange: (value: number) => void;
  onValueCommitted?: (value: number) => void;
  step?: number;
  thumbClassName?: string;
  trackClassName?: string;
  value: number;
}

function pickScalar(v: number | readonly number[]): number {
  return typeof v === 'number' ? v : (v[0] ?? 0);
}

export function Slider({
  'aria-label': ariaLabel,
  bipolar = false,
  className,
  disabled,
  max,
  min,
  onDoubleClick,
  onValueChange,
  onValueCommitted,
  step,
  thumbClassName,
  trackClassName,
  value,
}: SliderProps) {
  const range = max - min || 1;
  const ratio = Math.min(1, Math.max(0, (value - min) / range));
  const pct = ratio * 100;
  const zeroPct = ((0 - min) / range) * 100;
  const bipolarStyle = bipolar
    ? {
        left: `${Math.min(zeroPct, pct)}%`,
        width: `${Math.abs(pct - zeroPct)}%`,
      }
    : undefined;

  return (
    <Base.Root
      className={cn('relative flex h-5 w-full items-center', className)}
      disabled={disabled}
      max={max}
      min={min}
      step={step}
      value={value}
      onValueChange={(next) => onValueChange(pickScalar(next))}
      onValueCommitted={
        onValueCommitted
          ? (next) => onValueCommitted(pickScalar(next))
          : undefined
      }
    >
      <Base.Control
        className="group relative flex h-full w-full items-center"
        onDoubleClick={onDoubleClick}
      >
        <Base.Track
          className={cn(
            'h-1 w-full rounded-full bg-fill',
            trackClassName,
          )}
        >
          {bipolar ? (
            <div
              aria-hidden
              className="absolute inset-y-0 rounded-full bg-accent"
              style={bipolarStyle}
            />
          ) : (
            <Base.Indicator className="h-full rounded-full bg-accent" />
          )}
        </Base.Track>
        {bipolar ? (
          <div
            aria-hidden
            className="pointer-events-none absolute top-1/2 h-2 w-px -translate-y-1/2 bg-border"
            style={{ left: `${zeroPct}%` }}
          />
        ) : null}
        <Base.Thumb
          getAriaLabel={ariaLabel ? () => ariaLabel : undefined}
          className={cn(
            'size-4 rounded-full border border-border bg-background shadow-xs',
            'outline-none transition-transform active:scale-110',
            'focus-visible:ring-2 focus-visible:ring-accent/40',
            disabled && 'pointer-events-none opacity-40',
            thumbClassName,
          )}
        />
      </Base.Control>
    </Base.Root>
  );
}
