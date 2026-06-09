import { useEditModeStore } from '~/state/editModeStore';

import { EditRightPanelPlaceholder } from './edit/EditRightPanelPlaceholder';
import { ViewRightPanel } from './ViewRightPanel';

export function RightSidebar() {
  const mode = useEditModeStore((s) => s.mode);
  return mode === 'edit' ? <EditRightPanelPlaceholder /> : <ViewRightPanel />;
}
