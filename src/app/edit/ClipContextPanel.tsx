import { Aperture } from 'lucide-react';

import { HdrSection } from '~/app/HdrSection';
import { RenderModeSection } from '~/app/RenderModeSection';
import { ExposureSection } from '~/app/sections/ExposureSection';
import { LutSection } from '~/app/sections/LutSection';
import { Panel, PanelHeader } from '~/components/ui/panel';

export function ClipContextPanel() {
  return (
    <Panel className="h-full" data-testid="clip-context-panel">
      <PanelHeader
        icon={<Aperture aria-hidden className="size-3.5" />}
        label="Edit · Clip"
      />

      <LutSection />

      <div className="border-t border-border" />
      <RenderModeSection />
      <div className="border-t border-border" />

      <ExposureSection />

      <div className="border-t border-border" />
      <HdrSection />
    </Panel>
  );
}
