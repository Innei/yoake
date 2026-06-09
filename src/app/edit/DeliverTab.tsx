import { Share2 } from 'lucide-react';

import { Panel, PanelHeader, PanelSection } from '~/components/ui/panel';

export function DeliverTab() {
  return (
    <Panel className="h-full" data-testid="deliver-tab">
      <PanelHeader
        icon={<Share2 aria-hidden className="size-3.5" />}
        label="Deliver"
      />
      <PanelSection>
        <p className="text-xs text-text-tertiary">Deliver tab — coming soon</p>
      </PanelSection>
    </Panel>
  );
}
