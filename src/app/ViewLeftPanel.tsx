import { ClipList } from './ClipList';

export function ViewLeftPanel() {
  return (
    <div className="grid h-full min-h-0 grid-rows-[auto_minmax(0,1fr)]">
      <div className="h-9 border-b border-border" data-testid="view-edit-button-slot" />
      <div className="min-h-0">
        <ClipList />
      </div>
    </div>
  );
}
