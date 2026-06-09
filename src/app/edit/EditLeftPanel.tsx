import { EditClipSwitcher } from './EditClipSwitcher';
import { EditOutline } from './EditOutline';

export function EditLeftPanel() {
  return (
    <div
      className="grid h-full min-h-0 grid-rows-[auto_minmax(0,1fr)]"
      data-testid="edit-left-panel"
    >
      <EditClipSwitcher />
      <div className="min-h-0 overflow-auto">
        <EditOutline />
      </div>
    </div>
  );
}
