import { Button } from '~/components/ui/button';
import { useClipsStore } from '~/features/clips/clipsStore';
import { useEditModeStore } from '~/features/edit/editModeStore';

interface Props {
  variant: 'edit' | 'done';
}

const HINTS = {
  edit: 'E',
  done: 'Esc',
} as const;

const LABELS = {
  edit: 'Edit',
  done: 'Done',
} as const;

export function EditToggleButton({ variant }: Props) {
  const toggle = useEditModeStore((s) => s.toggle);
  const selectedClipId = useClipsStore((s) => s.selectedClipId);
  const disabled = variant === 'edit' && selectedClipId === undefined;

  const label = LABELS[variant];
  const hint = HINTS[variant];

  return (
    <Button
      aria-disabled={disabled || undefined}
      aria-label={label}
      data-testid={`edit-toggle-${variant}`}
      disabled={disabled}
      size="sm"
      title={disabled ? 'Select a clip first' : `${label} (${hint})`}
      type="button"
      variant={variant === 'done' ? 'primary' : 'secondary'}
      onClick={() => {
        if (disabled) return;
        toggle();
      }}
    >
      <span>{label}</span>
      <kbd className="inline-flex h-4 items-center rounded-sm border border-border bg-background px-1 font-mono text-[10px] tabular-nums text-text-secondary">
        {hint}
      </kbd>
    </Button>
  );
}
