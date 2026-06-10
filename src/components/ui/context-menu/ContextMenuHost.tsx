import { Menu } from '@base-ui/react/menu';
import { memo, useEffect, useSyncExternalStore } from 'react';

import { cn } from '~/lib/cn';

import { renderContextMenuItems } from './renderItems';
import {
  attachPointerTracker,
  closeContextMenuFromState,
  getServerSnapshot,
  getSnapshot,
  subscribe,
} from './store';

function ContextMenuHostInner() {
  const state = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  useEffect(() => attachPointerTracker(), []);

  if (!state.open && state.items.length === 0) return null;

  return (
    <Menu.Root
      modal={false}
      open={state.open}
      onOpenChange={(open) => {
        if (!open) closeContextMenuFromState();
      }}
    >
      <Menu.Portal>
        <Menu.Positioner
          align="start"
          anchor={state.anchor ?? undefined}
          className="z-50"
          side="bottom"
          sideOffset={6}
        >
          <Menu.Popup
            className={cn(
              'min-w-44 overflow-hidden rounded-lg bg-background-secondary/95 p-1 text-text',
              'ring-1 ring-border/80 shadow-lg shadow-black/10 backdrop-blur dark:shadow-black/40',
            )}
          >
            {state.header}
            {renderContextMenuItems(state.items)}
            {state.footer}
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}

export const ContextMenuHost = memo(ContextMenuHostInner);
