import { Pencil } from 'lucide-react';

import { PanelHeader } from '~/components/ui/panel';

import { EditClipSwitcher } from './EditClipSwitcher';
import { EditOutline } from './EditOutline';
import { EditToggleButton } from './EditToggleButton';

export function EditLeftPanel() {
  return (
    <div
      className="grid h-full min-h-0 grid-rows-[auto_auto_minmax(0,1fr)]"
      data-testid="edit-left-panel"
    >
      <PanelHeader
        actions={<EditToggleButton variant="done" />}
        icon={<Pencil aria-hidden className="size-3.5" />}
        label="Edit"
      />
      <EditClipSwitcher />
      <div className="min-h-0 overflow-auto">
        <EditOutline />
      </div>
    </div>
  );
}
