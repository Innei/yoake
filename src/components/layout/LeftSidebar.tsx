import { useEditModeStore } from '~/features/edit/editModeStore';

import { EditLeftPanel } from '~/features/edit/components/EditLeftPanel';
import { ViewLeftPanel } from './ViewLeftPanel';

export function LeftSidebar() {
  const mode = useEditModeStore((s) => s.mode);
  return mode === 'edit' ? <EditLeftPanel /> : <ViewLeftPanel />;
}
