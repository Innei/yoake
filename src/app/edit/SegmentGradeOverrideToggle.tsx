import { PanelSection } from '~/components/ui/panel';
import { cn } from '~/lib/cn';

interface SegmentGradeOverrideToggleProps {
  active: boolean;
  onToggle: () => void;
}

export function SegmentGradeOverrideToggle({
  active,
  onToggle,
}: SegmentGradeOverrideToggleProps) {
  return (
    <PanelSection label="Grade override">
      <label className="flex items-center justify-between gap-2 text-xs">
        <span className="text-text-secondary">Grade override</span>
        <button
          aria-checked={active}
          data-testid="segment-grade-override-toggle"
          role="switch"
          type="button"
          className={cn(
            'relative inline-flex h-4 w-7 shrink-0 items-center rounded-full transition-colors',
            active ? 'bg-accent' : 'bg-fill',
          )}
          onClick={onToggle}
        >
          <span
            className={cn(
              'inline-block size-3 transform rounded-full bg-background transition-transform',
              active ? 'translate-x-3.5' : 'translate-x-0.5',
            )}
          />
        </button>
      </label>
      <p
        className="text-[11px] text-text-tertiary"
        data-testid="segment-grade-override-hint"
      >
        Open Grade tab to edit override values.
      </p>
    </PanelSection>
  );
}
