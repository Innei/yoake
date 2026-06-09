import { SlidersHorizontal } from 'lucide-react';

import { HdrSection } from '~/app/HdrSection';
import { RenderModeSection } from '~/app/RenderModeSection';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '~/components/ui/popover';
import { cn } from '~/lib/cn';

export function ViewSettingsPopover() {
  return (
    <Popover>
      <PopoverTrigger
        aria-label="View settings"
        data-testid="transport-view-settings-trigger"
        title="View settings"
        className={cn(
          'ml-1 inline-flex size-7 items-center justify-center rounded-md',
          'text-text-secondary transition-colors hover:bg-fill hover:text-text',
          'focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40',
          'data-[popup-open]:bg-fill data-[popup-open]:text-text',
        )}
      >
        <SlidersHorizontal aria-hidden className="size-3.5" />
        <span className="sr-only">View settings</span>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        data-testid="transport-view-settings-content"
        side="top"
      >
        <div className="flex flex-col divide-y divide-border">
          <RenderModeSection />
          <HdrSection />
        </div>
      </PopoverContent>
    </Popover>
  );
}
