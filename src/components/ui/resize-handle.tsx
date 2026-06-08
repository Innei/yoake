import type { PointerEvent as ReactPointerEvent } from 'react';
import { useCallback, useEffect, useRef } from 'react';

import { cn } from '~/lib/cn';

interface Props {
  className?: string;
  /** Which edge of the panel this handle sits on — controls drag math. */
  edge: 'left' | 'right';
  getWidth: () => number;
  max: number;
  min: number;
  onChange: (px: number) => void;
}

export function ResizeHandle({
  className,
  edge,
  getWidth,
  max,
  min,
  onChange,
}: Props) {
  const draggingRef = useRef(false);
  const startXRef = useRef(0);
  const startWidthRef = useRef(0);
  const pointerIdRef = useRef<number | null>(null);
  const elRef = useRef<HTMLDivElement | null>(null);

  const finish = useCallback(() => {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    delete document.body.dataset.resizing;
    const el = elRef.current;
    const id = pointerIdRef.current;
    if (el && id != null) {
      try {
        el.releasePointerCapture(id);
      } catch {
        // ignore
      }
    }
    pointerIdRef.current = null;
  }, []);

  useEffect(() => {
    const onBlur = () => finish();
    window.addEventListener('blur', onBlur);
    return () => window.removeEventListener('blur', onBlur);
  }, [finish]);

  useEffect(() => () => finish(), [finish]);

  const onPointerDown = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (e.button !== 0) return;
      e.preventDefault();
      draggingRef.current = true;
      startXRef.current = e.clientX;
      startWidthRef.current = getWidth();
      pointerIdRef.current = e.pointerId;
      document.body.dataset.resizing = 'true';
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        // ignore
      }
    },
    [getWidth],
  );

  const onPointerMove = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (!draggingRef.current) return;
      const dx = e.clientX - startXRef.current;
      const signed = edge === 'left' ? dx : -dx;
      const next = Math.min(max, Math.max(min, startWidthRef.current + signed));
      onChange(next);
    },
    [edge, max, min, onChange],
  );

  return (
    <div
      aria-label="Resize panel"
      aria-orientation="vertical"
      data-active={draggingRef.current ? 'true' : 'false'}
      ref={elRef}
      role="separator"
      className={cn(
        'group relative z-20 w-px shrink-0 cursor-col-resize bg-border transition-colors',
        'before:absolute before:inset-y-0 before:-left-[3px] before:-right-[3px] before:content-[""]',
        'hover:bg-accent/60 data-[active=true]:bg-accent',
        className,
      )}
      onDoubleClick={() => onChange((min + max) / 2)}
      onLostPointerCapture={finish}
      onPointerCancel={finish}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={finish}
    />
  );
}
