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
      <ContextMenuPrimitive.Positioner className="z-[60]" sideOffset={sideOffset} {...props}>
        <ContextMenuPrimitive.Popup
          className={cn(
            'min-w-44 overflow-hidden rounded-xl p-1 text-text',
            'bg-background-secondary/85 backdrop-blur-2xl backdrop-saturate-150',
            'ring-1 ring-border/60 shadow-lg shadow-black/10 dark:shadow-black/40',
            'origin-[var(--transform-origin)] transition-[opacity,transform] duration-150 ease-out',
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
        'relative flex min-h-7 cursor-default select-none items-center gap-2 rounded-md px-2 py-1',
        'text-[13px] outline-none transition-colors duration-75',
        'data-[disabled]:pointer-events-none data-[disabled]:opacity-40',
        destructive
          ? 'text-red/90 data-[highlighted]:bg-red data-[highlighted]:text-white'
          : 'text-text-secondary data-[highlighted]:bg-accent data-[highlighted]:text-white',
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
      className={cn('-mx-1 my-1 h-px bg-border/60', className)}
      {...props}
    />
  );
}
