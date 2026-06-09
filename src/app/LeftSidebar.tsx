import { useEditModeStore } from '~/state/editModeStore';

import { EditLeftPanelPlaceholder } from './edit/EditLeftPanelPlaceholder';
import { ViewLeftPanel } from './ViewLeftPanel';

export function LeftSidebar() {
  const mode = useEditModeStore((s) => s.mode);
  return mode === 'edit' ? <EditLeftPanelPlaceholder /> : <ViewLeftPanel />;
}
