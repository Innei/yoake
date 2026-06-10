import { Gauge } from 'lucide-react';

import { PanelSection } from '~/components/ui/panel';
import { Slider } from '~/components/ui/slider';
import { cn } from '~/lib/cn';
import { useEditStore } from '~/features/edit/editStore';
import type { PeakNits } from '~/types';

const PEAK_OPTIONS: PeakNits[] = [400, 600, 1000];

export function HdrSection() {
  const peakNits = useEditStore((s) => s.hdr.peakNits);
  const setPeakNits = useEditStore((s) => s.setPeakNits);
  const hdrStrength = useEditStore((s) => s.hdr.strength);
  const setHdrStrength = useEditStore((s) => s.setHdrStrength);
  const hdrEnabled = useEditStore((s) => s.hdrEnabled);
  const setHdrEnabled = useEditStore((s) => s.setHdrEnabled);

  return (
    <PanelSection
      icon={<Gauge aria-hidden className="size-3.5" />}
      label="HDR peak"
      meta={hdrEnabled ? `${peakNits} · ${hdrStrength.toFixed(2)}` : 'off'}
    >
      <label className="mb-2 flex items-center justify-between gap-2 text-xs">
        <span className="text-text-secondary">HDR rendering</span>
        <button
          aria-checked={hdrEnabled}
          role="switch"
          type="button"
          className={cn(
            'relative inline-flex h-4 w-7 shrink-0 items-center rounded-full transition-colors',
            hdrEnabled ? 'bg-accent' : 'bg-fill',
          )}
          onClick={() => setHdrEnabled(!hdrEnabled)}
        >
          <span
            className={cn(
              'inline-block size-3 transform rounded-full bg-background transition-transform',
              hdrEnabled ? 'translate-x-3.5' : 'translate-x-0.5',
            )}
          />
        </button>
      </label>
      <div
        aria-label="HDR peak nits"
        role="radiogroup"
        className={cn(
          'grid grid-cols-3 gap-0.5 rounded-md bg-fill p-0.5',
          !hdrEnabled && 'pointer-events-none opacity-40',
        )}
      >
        {PEAK_OPTIONS.map((value) => {
          const selected = peakNits === value;
          return (
            <button
              aria-checked={selected}
              disabled={!hdrEnabled}
              key={value}
              role="radio"
              type="button"
              className={cn(
                'h-7 rounded-sm text-xs font-medium tabular-nums transition-colors',
                'focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40',
                selected
                  ? 'bg-background text-text shadow-xs'
                  : 'text-text-secondary hover:text-text',
              )}
              onClick={() => setPeakNits(value)}
            >
              {value}
            </button>
          );
        })}
      </div>
      <div
        className={cn(
          'mt-3 space-y-1.5',
          !hdrEnabled && 'pointer-events-none opacity-40',
        )}
      >
        <div className="flex items-center justify-between text-xs">
          <span className="text-text-secondary">Strength</span>
          <span className="font-mono tabular-nums text-text-tertiary">
            {hdrStrength.toFixed(2)}
          </span>
        </div>
        <Slider
          aria-label="HDR strength"
          disabled={!hdrEnabled}
          max={1}
          min={0}
          step={0.05}
          value={hdrStrength}
          onDoubleClick={() => setHdrStrength(0.2)}
          onValueChange={setHdrStrength}
        />
      </div>
    </PanelSection>
  );
}
