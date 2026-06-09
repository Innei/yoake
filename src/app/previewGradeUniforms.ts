import { useEffect, useRef } from 'react';

import { useClipDataStore } from '~/state/clipDataStore';
import { useClipsStore } from '~/state/clipsStore';
import { useEditStore } from '~/state/editStore';

export interface EffectiveExposureInputs {
  clipBaseExposure: number | undefined;
  clipId: string | undefined;
  currentTime: number;
  fallbackExposure: number;
  segments: readonly {
    gradeOverride?: { exposure?: number };
    in: number;
    out: number;
  }[];
}

export function selectEffectiveExposure(
  inputs: EffectiveExposureInputs,
): number {
  const { clipBaseExposure, segments, currentTime, fallbackExposure } = inputs;
  const base = clipBaseExposure ?? fallbackExposure;
  if (segments.length === 0) return base;
  const segment = segments.find(
    (s) => currentTime >= s.in && currentTime < s.out,
  );
  const override = segment?.gradeOverride?.exposure;
  if (override !== undefined) return override;
  return base;
}

interface UseEffectiveGradePushArgs {
  enabled: boolean;
  pushExposure: (exposure: number) => void;
}

export function useEffectiveGradePush({
  enabled,
  pushExposure,
}: UseEffectiveGradePushArgs): void {
  const lastPushedRef = useRef<number | undefined>(undefined);
  const pushRef = useRef(pushExposure);
  pushRef.current = pushExposure;

  const fallbackExposure = useEditStore((s) => s.grading.exposure);
  const currentTime = useEditStore((s) => s.currentTime);
  const clipId = useClipsStore((s) => s.selectedClipId);
  const entry = useClipDataStore((s) =>
    clipId ? s.entries[clipId] : undefined,
  );

  useEffect(() => {
    if (!enabled) {
      lastPushedRef.current = undefined;
      return;
    }
    const next = selectEffectiveExposure({
      clipBaseExposure: entry?.baseGrade.exposure,
      clipId,
      currentTime,
      fallbackExposure,
      segments: entry?.segments ?? [],
    });
    if (lastPushedRef.current === next) return;
    lastPushedRef.current = next;
    pushRef.current(next);
  }, [
    enabled,
    fallbackExposure,
    currentTime,
    clipId,
    entry,
  ]);
}

export function pushExposureToGpu(
  device: GPUDevice,
  buffer: GPUBuffer,
  exposure: number,
): void {
  device.queue.writeBuffer(buffer, 0, new Float32Array([exposure, 0, 0, 0]));
}
