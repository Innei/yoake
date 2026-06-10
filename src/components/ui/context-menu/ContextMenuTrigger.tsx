import {
  Children,
  cloneElement,
  type HTMLAttributes,
  isValidElement,
  type MouseEvent as ReactMouseEvent,
  type ReactElement,
  type ReactNode,
  useId,
  useSyncExternalStore,
} from 'react';

import { cn } from '~/lib/cn';

import { showContextMenu } from './imperative';
import { getServerSnapshot, getSnapshot, subscribe } from './store';
import type { ContextMenuItemDef } from './types';

type ItemsProp = ContextMenuItemDef[] | (() => ContextMenuItemDef[]);

interface OwnProps {
  children?: ReactNode;
  items?: ItemsProp;
}

export type ContextMenuTriggerProps = OwnProps &
  Omit<HTMLAttributes<HTMLElement>, 'children'>;

function resolveItems(items: ItemsProp): ContextMenuItemDef[] {
  return typeof items === 'function' ? items() : items;
}

function combineClassName(a: unknown, b: string | undefined): string {
  return cn(typeof a === 'string' ? a : undefined, b);
}

export function ContextMenuTrigger({
  children,
  items,
  className,
  onContextMenu,
  ...rest
}: ContextMenuTriggerProps) {
  const id = useId();
  const state = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const open = state.open && state.triggerId === id;

  const handleContextMenu = (event: ReactMouseEvent<HTMLElement>) => {
    if (items !== undefined) {
      event.preventDefault();
      showContextMenu(resolveItems(items), { event });
    }
    onContextMenu?.(event);
  };

  const triggerProps = {
    ...rest,
    'aria-expanded': open || undefined,
    'data-contextmenu-trigger': id,
    'data-popup-open': open ? '' : undefined,
    onContextMenu: handleContextMenu,
  };

  if (children == null) {
    return <div {...triggerProps} className={className} />;
  }

  if (isValidElement(children)) {
    // eslint-disable-next-line @eslint-react/no-children-only
    const only = Children.only(children) as ReactElement<
      HTMLAttributes<HTMLElement> & Record<string, unknown>
    >;
    const childProps = only.props;
    const mergedClassName = combineClassName(childProps.className, className);
    const userOnContextMenu = childProps.onContextMenu;
    // eslint-disable-next-line @eslint-react/no-clone-element
    return cloneElement(only, {
      ...triggerProps,
      className: mergedClassName,
      onContextMenu: (event: ReactMouseEvent<HTMLElement>) => {
        handleContextMenu(event);
        if (typeof userOnContextMenu === 'function') {
          userOnContextMenu(event);
        }
      },
    });
  }

  return (
    <div {...triggerProps} className={className}>
      {children}
    </div>
  );
}
