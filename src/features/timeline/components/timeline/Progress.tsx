import { Slider } from '@base-ui/react/slider';

export function Progress() {
  return (
    <Slider.Track className="pointer-events-none absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 rounded-full bg-fill">
      <Slider.Indicator className="absolute inset-y-0 left-0 rounded-full bg-accent" />
    </Slider.Track>
  );
}
