import { useEditModeStore } from '~/state/editModeStore';

import { EditLeftPanel } from './edit/EditLeftPanel';
import { ViewLeftPanel } from './ViewLeftPanel';

export function LeftSidebar() {
  const mode = useEditModeStore((s) => s.mode);
  return mode === 'edit' ? <EditLeftPanel /> : <ViewLeftPanel />;
}
