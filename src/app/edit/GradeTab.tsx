import { Palette } from 'lucide-react';

import { Panel, PanelHeader, PanelSection } from '~/components/ui/panel';

export function GradeTab() {
  return (
    <Panel className="h-full" data-testid="grade-tab">
      <PanelHeader
        icon={<Palette aria-hidden className="size-3.5" />}
        label="Grade"
      />
      <PanelSection>
        <p className="text-xs text-text-tertiary">Grade tab — coming soon</p>
      </PanelSection>
    </Panel>
  );
}
