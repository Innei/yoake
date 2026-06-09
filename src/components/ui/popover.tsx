import { Popover as PopoverPrimitive } from '@base-ui/react/popover';

import { cn } from '~/lib/cn';

export function Popover(props: React.ComponentProps<typeof PopoverPrimitive.Root>) {
  return <PopoverPrimitive.Root {...props} />;
}

export function PopoverTrigger(
  props: React.ComponentProps<typeof PopoverPrimitive.Trigger>,
) {
  return <PopoverPrimitive.Trigger {...props} />;
}

export function PopoverContent({
  children,
  className,
  side = 'top',
  align = 'end',
  sideOffset = 6,
  ...props
}: React.ComponentProps<typeof PopoverPrimitive.Positioner> & {
  className?: string;
}) {
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Positioner
        align={align}
        className="z-50"
        side={side}
        sideOffset={sideOffset}
        {...props}
      >
        <PopoverPrimitive.Popup
          className={cn(
            'w-72 overflow-hidden rounded-lg bg-background-secondary/95 text-text',
            'ring-1 ring-border/80 shadow-lg shadow-black/10 backdrop-blur dark:shadow-black/40',
            'origin-[var(--transform-origin)] transition-[opacity,transform] duration-100 ease-out',
            'data-[starting-style]:scale-[0.96] data-[starting-style]:opacity-0',
            'data-[ending-style]:scale-[0.96] data-[ending-style]:opacity-0',
            'focus:outline-none',
            className,
          )}
        >
          {children}
        </PopoverPrimitive.Popup>
      </PopoverPrimitive.Positioner>
    </PopoverPrimitive.Portal>
  );
}
