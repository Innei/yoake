import { useEffect, useState } from 'react';

import { probeCodecSupport } from '~/export/encoder/webcodecs/codecSupport';
import { cn } from '~/lib/cn';
import type { DeliverContainer } from '~/state/deliverStore';

const UNSUPPORTED_CONTAINER_HINT = 'ProRes export is not supported.';
const HEVC_UNAVAILABLE_HINT = 'No HEVC hardware encoder available.';

const CONTAINERS: readonly {
  disabled?: boolean;
  hint?: string;
  label: string;
  value: DeliverContainer;
}[] = [
  { value: 'mp4-h264', label: 'H.264 .mp4' },
  { value: 'mp4-h265', label: 'H.265 .mp4' },
  {
    value: 'mov-prores',
    label: 'ProRes 422 .mov',
    disabled: true,
    hint: UNSUPPORTED_CONTAINER_HINT,
  },
];

function useHevcSupported(): boolean {
  const [supported, setSupported] = useState(false);
  useEffect(() => {
    let active = true;
    probeCodecSupport()
      .then((support) => {
        if (active) setSupported(support.hevc);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);
  return supported;
}

export function DeliverContainerPicker({
  container,
  onSelect,
}: {
  container: DeliverContainer;
  onSelect: (value: DeliverContainer) => void;
}) {
  const hevcSupported = useHevcSupported();
  return (
    <div
      aria-label="Container"
      className="flex flex-col gap-1"
      role="radiogroup"
    >
      {CONTAINERS.map((c) => {
        const active = container === c.value;
        const hevcGated = c.value === 'mp4-h265' && !hevcSupported;
        const disabled = c.disabled === true || hevcGated;
        const hint = hevcGated ? HEVC_UNAVAILABLE_HINT : c.hint;
        return (
          <label
            key={c.value}
            title={hint}
            className={cn(
              'flex items-center gap-2 rounded-md border px-2 py-1.5 text-xs transition-colors',
              disabled
                ? 'cursor-not-allowed border-border bg-background-secondary text-text-tertiary opacity-50'
                : active
                  ? 'cursor-pointer border-accent bg-accent/10 text-text'
                  : 'cursor-pointer border-border bg-background-secondary text-text-secondary hover:bg-fill/60',
            )}
          >
            <input
              checked={active}
              className="sr-only"
              data-testid={`deliver-container-${c.value}`}
              disabled={disabled}
              name="deliver-container"
              type="radio"
              value={c.value}
              onChange={() => onSelect(c.value)}
            />
            <span
              aria-hidden
              className={cn(
                'inline-block size-2 rounded-full',
                active ? 'bg-accent' : 'bg-border',
              )}
            />
            <span className="flex flex-col">
              <span>{c.label}</span>
              {hint ? (
                <span className="text-[10px] text-text-tertiary">{hint}</span>
              ) : null}
            </span>
          </label>
        );
      })}
    </div>
  );
}
