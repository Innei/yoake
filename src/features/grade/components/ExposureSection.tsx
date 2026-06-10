import { useCallback } from 'react';

import { ExposureControl } from '~/features/grade/components/ExposureControl';
import { useClipDataStore } from '~/features/clips/clipDataStore';
import { useClipsStore } from '~/features/clips/clipsStore';
import { useEditStore } from '~/features/edit/editStore';

export function ExposureSection() {
  const exposure = useEditStore((s) => s.grading.exposure);
  const setExposure = useEditStore((s) => s.setExposure);
  const selectedClipId = useClipsStore((s) => s.selectedClipId);
  const setBaseGrade = useClipDataStore((s) => s.setBaseGrade);

  const handleChange = useCallback(
    (value: number) => {
      setExposure(value);
      if (selectedClipId) {
        setBaseGrade(selectedClipId, { exposure: value });
      }
    },
    [setExposure, setBaseGrade, selectedClipId],
  );

  return <ExposureControl value={exposure} onChange={handleChange} />;
}
