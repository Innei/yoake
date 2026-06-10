import { Aperture } from 'lucide-react';

import { HdrSection } from '~/features/grade/components/HdrSection';
import { RenderModeSection } from '~/features/grade/components/RenderModeSection';
import { ExposureSection } from '~/features/grade/components/ExposureSection';
import { LutSection } from '~/features/grade/components/LutSection';
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

      <RenderModeSection />

      <div className="border-t border-border" />

      <HdrSection />
    </Panel>
  );
}
