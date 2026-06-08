import { Download, FolderOpen, Loader2, Sparkles } from 'lucide-react';
import { useCallback, useEffect, useMemo } from 'react';

import { Button } from '~/components/ui/button';
import { Panel, PanelHeader } from '~/components/ui/panel';
import { cn } from '~/lib/cn';
import { useEditStore } from '~/state/editStore';
import { usePrefsStore } from '~/state/prefsStore';
import { toast } from '~/state/toastStore';

import { Shortcut, StatusBar } from './ExportPanelStatus';
import type { ExportPanelProps } from './exportPanelTypes';
import { errorMessage, pickDirectory } from './exportPanelUtils';
import { useExportActions } from './useExportActions';

export function ExportPanel(props: ExportPanelProps) {
  const { hdrCaps, lut3d } = props;

  const exportDirHandle = usePrefsStore((s) => s.exportDirHandle);
  const setHandle = usePrefsStore((s) => s.setHandle);
  const hdrEnabled = useEditStore((s) => s.hdrEnabled);
  const { runCopy, runExport, status } = useExportActions({
    ...props,
    exportDirHandle,
  });

  const ultraHdrSupported = hdrCaps.toneMappingExtended;
  const ultraHdrActive = ultraHdrSupported && hdrEnabled;
  const isRunning = status.kind === 'running';
  const canExport = Boolean(exportDirHandle) && !isRunning && lut3d !== null;

  const handlePickFolder = useCallback(async () => {
    try {
      const handle = await pickDirectory();
      if (!handle) return;
      await setHandle('exportDirHandle', handle);
    } catch (cause) {
      toast.error('Folder pick failed', { description: errorMessage(cause) });
    }
  }, [setHandle]);

  useEffect(() => {
    const isMac =
      typeof navigator !== 'undefined' &&
      /Mac|iPhone|iPad|iPod/.test(navigator.platform);
    const onKey = (e: KeyboardEvent) => {
      const meta = isMac ? e.metaKey : e.ctrlKey;
      if (!meta || e.altKey) return;
      const key = e.key.toLowerCase();

      if (key === 's' && !e.shiftKey) {
        if (!canExport) return;
        e.preventDefault();
        void runExport(ultraHdrActive ? 'ultraHdr' : 'sdr');
        return;
      }

      if (key === 'c' && !e.shiftKey) {
        const target = e.target as HTMLElement | null;
        if (
          target &&
          (target.tagName === 'INPUT' ||
            target.tagName === 'TEXTAREA' ||
            target.isContentEditable)
        ) {
          return;
        }
        const selection = window.getSelection();
        if (selection && selection.toString().length > 0) return;
        if (!lut3d) return;
        e.preventDefault();
        void runCopy();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [canExport, lut3d, runCopy, runExport, ultraHdrActive]);

  const ultraHdrTooltip = useMemo(() => {
    if (ultraHdrActive) return 'Export Ultra HDR JPEG (⌘S)';
    if (ultraHdrSupported) return 'Enable HDR rendering to export Ultra HDR JPEG.';
    return 'Ultra HDR disabled — canvas toneMapping.mode !== "extended". Use SDR JPEG.';
  }, [ultraHdrActive, ultraHdrSupported]);

  return (
    <Panel className="h-full">
      <PanelHeader
        icon={<Download aria-hidden className="size-3.5" />}
        label="Export"
        actions={
          ultraHdrActive ? (
            <span
              className="inline-flex items-center gap-1 rounded-sm bg-green/15 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-green"
              title="HDR rendering active"
            >
              <Sparkles aria-hidden className="size-3" />
              HDR
            </span>
          ) : null
        }
      />

      <div className="flex flex-col gap-3 p-3">
        <button
          title={exportDirHandle?.name ?? 'Pick export folder'}
          type="button"
          className={cn(
            'group flex items-center gap-2 rounded-md border border-border bg-background px-2.5 py-2',
            'text-left transition-colors hover:bg-fill/60',
            'focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40',
          )}
          onClick={() => void handlePickFolder()}
        >
          <FolderOpen aria-hidden className="size-4 shrink-0 text-text-tertiary" />
          <div className="min-w-0 flex-1">
            <div className="text-[10px] font-medium uppercase tracking-wider text-text-tertiary">
              Folder
            </div>
            <div className="truncate text-xs text-text">
              {exportDirHandle?.name ?? (
                <span className="text-text-tertiary">
                  Not set — click to pick…
                </span>
              )}
            </div>
          </div>
        </button>

        <div className="flex flex-col gap-1.5">
          <Button
            disabled={!canExport || !ultraHdrActive}
            title={ultraHdrTooltip}
            type="button"
            onClick={() => void runExport('ultraHdr')}
          >
            {status.kind === 'running' && status.format === 'ultraHdr' ? (
              <>
                <Loader2 aria-hidden className="size-3.5 animate-spin" />
                Exporting Ultra HDR…
              </>
            ) : (
              <>
                <Sparkles aria-hidden className="size-3.5" />
                Export Ultra HDR
                <Shortcut keys="⌘S" />
              </>
            )}
          </Button>
          <Button
            disabled={!canExport}
            title="Export SDR JPEG"
            type="button"
            variant="secondary"
            onClick={() => void runExport('sdr')}
          >
            {status.kind === 'running' && status.format === 'sdr' ? (
              <>
                <Loader2 aria-hidden className="size-3.5 animate-spin" />
                Exporting SDR…
              </>
            ) : (
              <>
                <Download aria-hidden className="size-3.5" />
                Export SDR JPEG
              </>
            )}
          </Button>
        </div>

        <StatusBar status={status} />
      </div>
    </Panel>
  );
}
