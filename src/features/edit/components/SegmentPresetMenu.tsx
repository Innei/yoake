import { Plus } from 'lucide-react';
import { useState } from 'react';

import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '~/components/ui/popover';
import type { PresetAnchor } from '~/features/edit/addPresetSegment';
import { addPresetSegment } from '~/features/edit/addPresetSegment';

const GROUPS: { anchor: PresetAnchor; label: string }[] = [
  { anchor: 'before', label: 'Before playhead' },
  { anchor: 'center', label: 'Centered on playhead' },
  { anchor: 'after', label: 'After playhead' },
];

const DURATIONS = [5, 10, 15];

interface SegmentPresetGridProps {
  onPick: (anchor: PresetAnchor, durationSec: number) => void;
  testIdPrefix: string;
}

export function SegmentPresetGrid({
  onPick,
  testIdPrefix,
}: SegmentPresetGridProps) {
  return (
    <div className="flex flex-col gap-2">
      {GROUPS.map((group) => (
        <div key={group.anchor}>
          <p className="px-1 pb-1 text-[10px] font-medium uppercase tracking-wider text-text-tertiary">
            {group.label}
          </p>
          <div className="flex gap-1">
            {DURATIONS.map((secs) => (
              <button
                className="flex-1 rounded-md bg-fill/60 px-2 py-1 text-xs tabular-nums text-text-secondary transition-colors hover:bg-fill hover:text-text"
                data-testid={`${testIdPrefix}-${group.anchor}-${secs}`}
                key={secs}
                type="button"
                onClick={() => onPick(group.anchor, secs)}
              >
                {secs}s
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export function SegmentPresetMenu() {
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        aria-label="New segment from preset"
        className="rounded p-0.5 text-text-tertiary transition-colors hover:bg-fill hover:text-text"
        data-testid="segment-preset-trigger"
      >
        <Plus aria-hidden className="size-3.5" />
      </PopoverTrigger>
      <PopoverContent align="end" className="w-52 p-2" side="bottom">
        <SegmentPresetGrid
          testIdPrefix="segment-preset"
          onPick={(anchor, secs) => {
            addPresetSegment(anchor, secs);
            setOpen(false);
          }}
        />
      </PopoverContent>
    </Popover>
  );
}
