import {
  closeContextMenuFromState,
  showContextMenuFromState,
  updateContextMenuItemsInState,
} from './store';
import type { ContextMenuItemDef, ShowContextMenuOptions } from './types';

export function showContextMenu(
  items: ContextMenuItemDef[],
  opts?: ShowContextMenuOptions,
): void {
  showContextMenuFromState(items, opts);
}

export function updateContextMenuItems(items: ContextMenuItemDef[]): void {
  updateContextMenuItemsInState(items);
}

export function closeContextMenu(): void {
  closeContextMenuFromState();
}
