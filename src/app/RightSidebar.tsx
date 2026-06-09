import { useEditModeStore } from '~/state/editModeStore';

import { EditRightPanel } from './edit/EditRightPanel';
import { ViewRightPanel } from './ViewRightPanel';

export function RightSidebar() {
  const mode = useEditModeStore((s) => s.mode);
  return mode === 'edit' ? <EditRightPanel /> : <ViewRightPanel />;
}
