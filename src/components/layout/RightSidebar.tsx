import { useEditModeStore } from '~/features/edit/editModeStore';

import { EditRightPanel } from '~/features/edit/components/EditRightPanel';
import { ViewRightPanel } from './ViewRightPanel';

export function RightSidebar() {
  const mode = useEditModeStore((s) => s.mode);
  return mode === 'edit' ? <EditRightPanel /> : <ViewRightPanel />;
}
