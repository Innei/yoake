import { Film } from 'lucide-react';

import { PanelSection } from '~/components/ui/panel';
import { cn } from '~/lib/cn';
import { useEditStore } from '~/features/edit/editStore';
import type { RenderMode } from '~/types';

const OPTIONS: Array<{ label: string; value: RenderMode }> = [
  { label: 'LUT grade', value: 'graded' },
  { label: 'Original flat', value: 'original' },
];

export function RenderModeSection() {
  const renderMode = useEditStore((s) => s.renderMode);
  const setRenderMode = useEditStore((s) => s.setRenderMode);

  return (
    <PanelSection
      icon={<Film aria-hidden className="size-3.5" />}
      label="Render"
      meta={renderMode === 'original' ? 'flat' : 'LUT'}
    >
      <div
        aria-label="Render mode"
        className="grid grid-cols-2 gap-0.5 rounded-md bg-fill p-0.5"
        role="radiogroup"
      >
        {OPTIONS.map((option) => {
          const selected = renderMode === option.value;
          return (
            <button
              aria-checked={selected}
              key={option.value}
              role="radio"
              type="button"
              className={cn(
                'h-7 rounded-sm text-xs font-medium transition-colors',
                'focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40',
                selected
                  ? 'bg-background text-text shadow-xs'
                  : 'text-text-secondary hover:text-text',
              )}
              onClick={() => setRenderMode(option.value)}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </PanelSection>
  );
}
