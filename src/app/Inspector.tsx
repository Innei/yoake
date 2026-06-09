import { Aperture } from 'lucide-react';

import { HdrSection } from '~/app/HdrSection';
import { ExposureSection } from '~/app/sections/ExposureSection';
import { LutSection } from '~/app/sections/LutSection';
import { Panel, PanelHeader } from '~/components/ui/panel';

export function Inspector() {
  return (
    <Panel className="h-full">
      <PanelHeader
        icon={<Aperture aria-hidden className="size-3.5" />}
        label="Inspect"
      />

      <LutSection />

      <div className="border-t border-border" />

      <ExposureSection />

      <div className="border-t border-border" />

      <HdrSection />
    </Panel>
  );
}
