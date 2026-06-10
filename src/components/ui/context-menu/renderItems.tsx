import { Menu } from '@base-ui/react/menu';
import { Fragment } from 'react';

import { cn } from '~/lib/cn';

import type { ContextMenuItemDef } from './types';

export function renderContextMenuItems(items: ContextMenuItemDef[]) {
  return items.map((entry, index) => {
    const key = entry.key ?? `ctx-${index}`;
    if (entry.kind === 'separator') {
      return (
        <div
          aria-hidden
          className="-mx-1 my-1 h-px bg-border/50"
          key={key}
        />
      );
    }
    if (entry.kind === 'group') {
      return (
        <div
          className="px-2 py-1 text-[10px] uppercase tracking-wider text-text-tertiary"
          key={key}
        >
          {entry.label}
        </div>
      );
    }
    const destructive = entry.destructive ?? false;
    return (
      <Menu.Item
        disabled={entry.disabled}
        key={key}
        className={cn(
          'relative flex h-7 cursor-default select-none items-center gap-2 rounded px-2',
          'text-[13px] font-normal outline-none transition-colors duration-75',
          'data-[disabled]:pointer-events-none data-[disabled]:opacity-40',
          destructive
            ? 'text-red data-[highlighted]:bg-red/10'
            : 'text-text data-[highlighted]:bg-fill',
        )}
        onClick={() => {
          entry.onSelect?.();
        }}
      >
        {entry.icon ? <Fragment>{entry.icon}</Fragment> : null}
        <span className="min-w-0 flex-1 truncate">{entry.label}</span>
      </Menu.Item>
    );
  });
}
