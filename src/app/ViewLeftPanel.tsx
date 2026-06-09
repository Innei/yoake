import { ClipList } from './ClipList';
import { EditToggleButton } from './edit/EditToggleButton';

export function ViewLeftPanel() {
  return (
    <div className="grid h-full min-h-0 grid-rows-[auto_minmax(0,1fr)]">
      <div className="flex h-9 items-center border-b border-border px-2">
        <EditToggleButton variant="edit" />
      </div>
      <div className="min-h-0 overflow-auto">
        <ClipList />
      </div>
    </div>
  );
}
