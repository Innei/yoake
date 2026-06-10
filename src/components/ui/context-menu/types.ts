import type { ReactNode } from 'react';

export interface ContextMenuItemEntry {
  destructive?: boolean;
  disabled?: boolean;
  icon?: ReactNode;
  key?: string;
  kind?: 'item';
  label: ReactNode;
  onSelect?: () => void;
}

export interface ContextMenuSeparatorEntry {
  key?: string;
  kind: 'separator';
}

export interface ContextMenuGroupEntry {
  key?: string;
  kind: 'group';
  label: ReactNode;
}

export type ContextMenuItemDef =
  | ContextMenuItemEntry
  | ContextMenuSeparatorEntry
  | ContextMenuGroupEntry;

export interface ShowContextMenuOptions {
  event?: MouseEvent | React.MouseEvent;
  footer?: ReactNode;
  header?: ReactNode;
}

export interface VirtualAnchor {
  getBoundingClientRect: () => DOMRect;
}
