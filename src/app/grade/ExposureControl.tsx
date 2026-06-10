import { Sun } from 'lucide-react';

import { PanelSection } from '~/components/ui/panel';
import { Slider } from '~/components/ui/slider';

const EXPOSURE_MIN = -3;
const EXPOSURE_MAX = 3;
const EXPOSURE_STEP = 0.1;

interface ExposureControlProps {
  onChange: (value: number) => void;
  value: number;
}

export function ExposureControl({ value, onChange }: ExposureControlProps) {
  return (
    <PanelSection
      icon={<Sun aria-hidden className="size-3.5" />}
      label="Exposure"
      meta={`${value >= 0 ? '+' : ''}${value.toFixed(1)} EV`}
    >
      <Slider
        bipolar
        aria-label="Exposure"
        max={EXPOSURE_MAX}
        min={EXPOSURE_MIN}
        step={EXPOSURE_STEP}
        value={value}
        onDoubleClick={() => onChange(0)}
        onValueChange={onChange}
      />
      <div className="flex justify-between text-[10px] tabular-nums text-text-quaternary">
        <span>{EXPOSURE_MIN.toFixed(0)}</span>
        <span>0</span>
        <span>+{EXPOSURE_MAX.toFixed(0)}</span>
      </div>
    </PanelSection>
  );
}
