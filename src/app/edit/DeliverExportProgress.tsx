import { Button } from '~/components/ui/button';
import { useExportStatusStore } from '~/state/exportStatusStore';

export function DeliverExportProgress() {
  const status = useExportStatusStore((s) => s.status);
  if (status.kind !== 'running') return null;
  const { cancel, description, ratio } = status;
  const determinate = ratio !== null;
  return (
    <div
      className="flex flex-col gap-1.5"
      data-testid="deliver-export-progress"
    >
      <div
        aria-valuemax={100}
        aria-valuemin={0}
        aria-valuenow={determinate ? Math.round(ratio * 100) : undefined}
        className="h-1 w-full overflow-hidden rounded-full border border-border bg-background-secondary"
        data-testid="deliver-export-progress-track"
        role="progressbar"
      >
        {determinate ? (
          <div
            className="h-full rounded-full bg-accent transition-[width]"
            data-testid="deliver-export-progress-bar"
            style={{ width: `${ratio * 100}%` }}
          />
        ) : (
          <div
            className="h-full w-full animate-pulse rounded-full bg-accent/50"
            data-testid="deliver-export-progress-indeterminate"
          />
        )}
      </div>
      <div className="flex items-center justify-between gap-2">
        <span
          className="truncate text-[11px] text-text-tertiary"
          data-testid="deliver-export-progress-status"
          role="status"
        >
          {description}
        </span>
        <Button
          data-testid="deliver-export-cancel"
          size="sm"
          type="button"
          variant="secondary"
          onClick={cancel}
        >
          Cancel
        </Button>
      </div>
    </div>
  );
}
