import { EditClipSwitcher } from './EditClipSwitcher';
import { EditOutline } from './EditOutline';
import { EditToggleButton } from './EditToggleButton';

export function EditLeftPanel() {
  return (
    <div
      className="grid h-full min-h-0 grid-rows-[auto_auto_minmax(0,1fr)]"
      data-testid="edit-left-panel"
    >
      <div className="flex h-9 items-center border-b border-border px-2">
        <EditToggleButton variant="done" />
      </div>
      <EditClipSwitcher />
      <div className="min-h-0 overflow-auto">
        <EditOutline />
      </div>
    </div>
  );
}
