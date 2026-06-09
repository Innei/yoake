import { useEffect, useRef } from 'react';

import { effectiveGrade, useClipDataStore } from '~/state/clipDataStore';
import { useClipsStore } from '~/state/clipsStore';
import { useEditStore } from '~/state/editStore';

export function useEffectiveExposure(): number {
  const fallbackExposure = useEditStore((s) => s.grading.exposure);
  const currentTime = useEditStore((s) => s.currentTime);
  const clipId = useClipsStore((s) => s.selectedClipId);
  const entry = useClipDataStore((s) =>
    clipId ? s.entries[clipId] : undefined,
  );

  if (!clipId || !entry) return fallbackExposure;
  const grade = effectiveGrade(clipId, currentTime);
  return grade.exposure ?? fallbackExposure;
}

interface UseEffectiveExposurePushArgs {
  enabled: boolean;
  pushExposure: (exposure: number) => void;
}

export function useEffectiveExposurePush({
  enabled,
  pushExposure,
}: UseEffectiveExposurePushArgs): void {
  const lastPushedRef = useRef<number | undefined>(undefined);
  const pushRef = useRef(pushExposure);
  pushRef.current = pushExposure;

  const effective = useEffectiveExposure();

  useEffect(() => {
    if (!enabled) {
      lastPushedRef.current = undefined;
      return;
    }
    if (lastPushedRef.current === effective) return;
    lastPushedRef.current = effective;
    pushRef.current(effective);
  }, [enabled, effective]);
}

export function pushExposureToGpu(
  device: GPUDevice,
  buffer: GPUBuffer,
  exposure: number,
): void {
  device.queue.writeBuffer(buffer, 0, new Float32Array([exposure, 0, 0, 0]));
}
