import { ContextMenu as ContextMenuPrimitive } from '@base-ui/react/context-menu';

import { cn } from '~/lib/cn';

export const ContextMenu = ContextMenuPrimitive.Root;
export const ContextMenuTrigger = ContextMenuPrimitive.Trigger;

export function ContextMenuContent({
  children,
  className,
  sideOffset = 4,
  ...props
}: React.ComponentProps<typeof ContextMenuPrimitive.Positioner> & {
  className?: string;
}) {
  return (
    <ContextMenuPrimitive.Portal>
      <ContextMenuPrimitive.Positioner sideOffset={sideOffset} {...props}>
        <ContextMenuPrimitive.Popup
          className={cn(
            'z-50 min-w-44 rounded-lg bg-background-secondary p-1 text-text shadow-xl',
            'ring-1 ring-border/80',
            'origin-[var(--transform-origin)] transition-[opacity,transform] duration-100 ease-out',
            'data-[starting-style]:scale-95 data-[starting-style]:opacity-0',
            'data-[ending-style]:scale-95 data-[ending-style]:opacity-0',
            className,
          )}
        >
          {children}
        </ContextMenuPrimitive.Popup>
      </ContextMenuPrimitive.Positioner>
    </ContextMenuPrimitive.Portal>
  );
}

export function ContextMenuItem({
  children,
  className,
  destructive,
  ...props
}: React.ComponentProps<typeof ContextMenuPrimitive.Item> & {
  destructive?: boolean;
}) {
  return (
    <ContextMenuPrimitive.Item
      className={cn(
        'flex min-h-8 cursor-default select-none items-center gap-2 rounded-md px-2 py-1.5',
        'text-sm outline-none transition-[background-color,color] duration-100',
        'data-[disabled]:pointer-events-none data-[disabled]:opacity-40',
        destructive
          ? 'text-red data-[highlighted]:bg-red/10 data-[highlighted]:text-red'
          : 'text-text-secondary data-[highlighted]:bg-fill data-[highlighted]:text-text',
        className,
      )}
      {...props}
    >
      {children}
    </ContextMenuPrimitive.Item>
  );
}

export function ContextMenuSeparator({
  className,
  ...props
}: React.ComponentProps<typeof ContextMenuPrimitive.Separator>) {
  return (
    <ContextMenuPrimitive.Separator
      className={cn('my-1 h-px bg-border', className)}
      {...props}
    />
  );
}
