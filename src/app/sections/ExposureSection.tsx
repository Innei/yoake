import { Sun } from 'lucide-react';

import { PanelSection } from '~/components/ui/panel';
import { Slider } from '~/components/ui/slider';
import { useEditStore } from '~/state/editStore';

const EXPOSURE_MIN = -3;
const EXPOSURE_MAX = 3;
const EXPOSURE_STEP = 0.1;

export default function ExposureSection() {
  const exposure = useEditStore((s) => s.grading.exposure);
  const setExposure = useEditStore((s) => s.setExposure);

  return (
    <PanelSection
      icon={<Sun aria-hidden className="size-3.5" />}
      label="Exposure"
      meta={`${exposure >= 0 ? '+' : ''}${exposure.toFixed(1)} EV`}
    >
      <Slider
        bipolar
        aria-label="Exposure"
        max={EXPOSURE_MAX}
        min={EXPOSURE_MIN}
        step={EXPOSURE_STEP}
        value={exposure}
        onChange={(event) => setExposure(Number(event.target.value))}
        onDoubleClick={() => setExposure(0)}
      />
      <div className="flex justify-between text-[10px] tabular-nums text-text-quaternary">
        <span>{EXPOSURE_MIN.toFixed(0)}</span>
        <span>0</span>
        <span>+{EXPOSURE_MAX.toFixed(0)}</span>
      </div>
    </PanelSection>
  );
}
