import { ContextMenu as ContextMenuPrimitive } from '@base-ui/react/context-menu';

import { cn } from '~/lib/cn';

export function ContextMenu(props: React.ComponentProps<typeof ContextMenuPrimitive.Root>) {
  return <ContextMenuPrimitive.Root {...props} />;
}

export function ContextMenuTrigger(
  props: React.ComponentProps<typeof ContextMenuPrimitive.Trigger>,
) {
  return <ContextMenuPrimitive.Trigger {...props} />;
}

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
      <ContextMenuPrimitive.Positioner className="z-50" sideOffset={sideOffset} {...props}>
        <ContextMenuPrimitive.Popup
          className={cn(
            'min-w-44 overflow-hidden rounded-lg bg-background-secondary/95 p-1 text-text',
            'ring-1 ring-border/80 shadow-lg shadow-black/10 backdrop-blur dark:shadow-black/40',
            'origin-[var(--transform-origin)] transition-[opacity,transform] duration-100 ease-out',
            'data-[starting-style]:scale-[0.96] data-[starting-style]:opacity-0',
            'data-[ending-style]:scale-[0.96] data-[ending-style]:opacity-0',
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
        'relative flex h-7 cursor-default select-none items-center gap-2 rounded px-2',
        'text-[13px] font-normal outline-none transition-colors duration-75',
        'data-[disabled]:pointer-events-none data-[disabled]:opacity-40',
        destructive
          ? 'text-red data-[highlighted]:bg-red/10'
          : 'text-text data-[highlighted]:bg-fill',
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
      className={cn('-mx-1 my-1 h-px bg-border/50', className)}
      {...props}
    />
  );
}
