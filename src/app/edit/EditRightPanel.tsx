import { ContextExportAction } from './ContextExportAction';
import { ContextPanel } from './ContextPanel';
import { EditToggleButton } from './EditToggleButton';

export function EditRightPanel() {
  return (
    <div
      className="grid h-full min-h-0 grid-rows-[auto_minmax(0,1fr)_auto]"
      data-testid="edit-right-panel"
    >
      <div className="flex h-9 items-center justify-end border-b border-border px-2">
        <EditToggleButton variant="done" />
      </div>
      <div className="min-h-0 overflow-auto">
        <ContextPanel />
      </div>
      <div className="min-h-0 border-t border-border">
        <ContextExportAction />
      </div>
    </div>
  );
}
