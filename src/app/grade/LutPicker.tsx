import { Aperture, ChevronDown, FolderOpen } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';

import { parseCubeLut } from '~/color/lutCube';
import { Button } from '~/components/ui/button';
import { PanelSection } from '~/components/ui/panel';
import type { ScannedLut } from '~/fs/lutLoader';
import { readLut, scanLuts } from '~/fs/lutLoader';
import { cn } from '~/lib/cn';
import { usePrefsStore } from '~/state/prefsStore';
import { toast } from '~/state/toastStore';
import type { LutDescriptor, ParsedLut } from '~/types';

async function pickLutDirectory(): Promise<
  FileSystemDirectoryHandle | undefined
> {
  if (!('showDirectoryPicker' in window)) return undefined;
  try {
    return await window.showDirectoryPicker({ mode: 'read' });
  } catch {
    return undefined;
  }
}

interface LutPickerProps {
  onSelect: (descriptor: LutDescriptor, parsed: ParsedLut) => void;
  value: LutDescriptor | undefined;
}

export function LutPicker({ value, onSelect }: LutPickerProps) {
  const lutDirHandle = usePrefsStore((s) => s.lutDirHandle);
  const setHandle = usePrefsStore((s) => s.setHandle);

  const [popoverOpen, setPopoverOpen] = useState(false);
  const [scannedLuts, setScannedLuts] = useState<ScannedLut[]>([]);
  const [scannedFor, setScannedFor] = useState<
    FileSystemDirectoryHandle | undefined
  >(undefined);
  const popoverRef = useRef<HTMLDivElement | null>(null);

  const luts = scannedFor === lutDirHandle ? scannedLuts : [];

  useEffect(() => {
    if (!lutDirHandle) return;
    let cancelled = false;
    scanLuts(lutDirHandle)
      .then((entries) => {
        if (cancelled) return;
        setScannedLuts(entries);
        setScannedFor(lutDirHandle);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        toast.error('Failed to scan LUTs', {
          description: err instanceof Error ? err.message : String(err),
        });
      });
    return () => {
      cancelled = true;
    };
  }, [lutDirHandle]);

  useEffect(() => {
    if (!popoverOpen) return;
    const onDown = (event: MouseEvent) => {
      if (!popoverRef.current) return;
      if (!popoverRef.current.contains(event.target as Node)) {
        setPopoverOpen(false);
      }
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [popoverOpen]);

  const handlePickLutDir = useCallback(async () => {
    const handle = await pickLutDirectory();
    if (!handle) return;
    await setHandle('lutDirHandle', handle);
  }, [setHandle]);

  const handleSelectLut = useCallback(
    async (entry: ScannedLut) => {
      try {
        const text = await readLut(entry.fileHandle);
        const parsed = parseCubeLut(text);
        onSelect(
          { id: entry.id, name: entry.name, handle: entry.fileHandle },
          parsed,
        );
        setPopoverOpen(false);
      } catch (err: unknown) {
        toast.error('Failed to load LUT', {
          description: err instanceof Error ? err.message : String(err),
        });
      }
    },
    [onSelect],
  );

  const currentLutLabel = value ? value.name.replace(/\.cube$/i, '') : undefined;

  return (
    <PanelSection
      icon={<Aperture aria-hidden className="size-3.5" />}
      label="LUT"
    >
      {lutDirHandle ? (
        <div className="flex flex-col gap-1.5" ref={popoverRef}>
          <div className="relative">
            <button
              aria-expanded={popoverOpen}
              aria-haspopup="listbox"
              type="button"
              className={cn(
                'flex h-8 w-full items-center justify-between gap-2 rounded-md px-2.5',
                'border border-border bg-background text-sm text-text',
                'transition-colors hover:bg-fill/60',
                'focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40',
              )}
              onClick={() => setPopoverOpen((o) => !o)}
            >
              <span className="truncate text-left">
                {currentLutLabel ?? (
                  <span className="text-text-tertiary">Choose LUT</span>
                )}
              </span>
              <ChevronDown
                aria-hidden
                className={cn(
                  'size-3.5 shrink-0 text-text-tertiary transition-transform',
                  popoverOpen && 'rotate-180',
                )}
              />
            </button>
            {popoverOpen ? (
              <div
                role="listbox"
                className={cn(
                  'absolute left-0 right-0 top-full z-20 mt-1 max-h-72 overflow-auto',
                  'rounded-md border border-border bg-background py-1 shadow-lg',
                )}
              >
                {luts.length === 0 ? (
                  <p className="px-3 py-2 text-xs text-text-tertiary">
                    No .cube files
                  </p>
                ) : (
                  luts.map((entry) => {
                    const selected = value?.id === entry.id;
                    return (
                      <button
                        aria-selected={selected}
                        key={entry.id}
                        role="option"
                        type="button"
                        className={cn(
                          'flex w-full items-center px-3 py-1.5 text-left text-sm',
                          'hover:bg-fill focus:bg-fill focus:outline-none',
                          selected && 'text-accent',
                        )}
                        onClick={() => handleSelectLut(entry)}
                      >
                        <span className="truncate">{entry.label}</span>
                      </button>
                    );
                  })
                )}
              </div>
            ) : null}
          </div>
          <button
            className="inline-flex items-center gap-1 text-[11px] text-text-tertiary transition-colors hover:text-text"
            type="button"
            onClick={handlePickLutDir}
          >
            <FolderOpen aria-hidden className="size-3" />
            <span className="truncate">{lutDirHandle.name}</span>
          </button>
        </div>
      ) : (
        <Button type="button" variant="secondary" onClick={handlePickLutDir}>
          <FolderOpen aria-hidden className="size-3.5" />
          Pick LUT folder…
        </Button>
      )}
    </PanelSection>
  );
}
