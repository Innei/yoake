import { Button } from '~/components/ui/button';
import { useClipsStore } from '~/features/clips/clipsStore';
import type {
  DeliverContainer,
  DeliverQuality,
  DeliverResolution,
} from '~/features/deliver/deliverStore';
import { useDeliverStore } from '~/features/deliver/deliverStore';
import { useExportStatusStore } from '~/features/deliver/exportStatusStore';
import { usePrefsStore } from '~/features/preferences/prefsStore';

import { pickExportDir } from '../pickExportDir';
import { useExport } from '../useExport';
import { DeliverExportProgress } from './DeliverExportProgress';

const CONTAINER_LABEL: Record<DeliverContainer, string> = {
  'mp4-h264': 'H.264',
  'mp4-h265': 'H.265',
  'mov-prores': 'ProRes',
};

const RESOLUTION_LABEL: Record<DeliverResolution, string> = {
  'source': 'Source',
  '1080p': '1080p',
  '4k': '4K',
};

const QUALITY_LABEL: Record<DeliverQuality, string> = {
  'low': 'Low',
  'medium': 'Medium',
  'high': 'High',
  'very-high': 'Very high',
};

export function QuickExportBar() {
  const hasClip = useClipsStore((s) => s.selectedClipId !== undefined);
  const exporting = useExportStatusStore((s) => s.status.kind === 'running');
  const exportDirHandle = usePrefsStore((s) => s.exportDirHandle);
  const setPrefHandle = usePrefsStore((s) => s.setHandle);
  const container = useDeliverStore((s) => s.container);
  const resolution = useDeliverStore((s) => s.resolution);
  const quality = useDeliverStore((s) => s.quality);
  const runExport = useExport();

  const handleClick = async () => {
    if (!usePrefsStore.getState().exportDirHandle) {
      await pickExportDir((handle) => setPrefHandle('exportDirHandle', handle));
      if (!usePrefsStore.getState().exportDirHandle) return;
    }
    await runExport();
  };

  return (
    <div
      className="flex flex-col gap-1.5 px-3 py-2"
      data-testid="quick-export-bar"
    >
      {exporting ? (
        <DeliverExportProgress />
      ) : (
        <p
          className="truncate text-[11px] text-text-tertiary"
          data-testid="quick-export-summary"
        >
          {CONTAINER_LABEL[container]} · {RESOLUTION_LABEL[resolution]} ·{' '}
          {QUALITY_LABEL[quality]}
          {exportDirHandle
            ? ` → ${exportDirHandle.name}`
            : ' · folder chosen on export'}
        </p>
      )}
      <Button
        data-testid="quick-export-button"
        disabled={!hasClip || exporting}
        type="button"
        variant="primary"
        onClick={() => {
          void handleClick();
        }}
      >
        Export
      </Button>
    </div>
  );
}
