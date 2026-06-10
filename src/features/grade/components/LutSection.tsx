import { useCallback } from 'react';

import { LutPicker } from '~/features/grade/components/LutPicker';
import { useClipDataStore } from '~/features/clips/clipDataStore';
import { useClipsStore } from '~/features/clips/clipsStore';
import { useEditStore } from '~/features/edit/editStore';
import type { LutDescriptor, ParsedLut } from '~/types';

export function LutSection() {
  const lutDescriptor = useEditStore((s) => s.lutDescriptor);
  const setLut = useEditStore((s) => s.setLut);
  const selectedClipId = useClipsStore((s) => s.selectedClipId);
  const setBaseGrade = useClipDataStore((s) => s.setBaseGrade);

  const handleSelect = useCallback(
    (descriptor: LutDescriptor, parsed: ParsedLut) => {
      setLut(descriptor, parsed);
      if (selectedClipId) {
        setBaseGrade(selectedClipId, { lutId: descriptor.id });
      }
    },
    [setLut, setBaseGrade, selectedClipId],
  );

  return <LutPicker value={lutDescriptor} onSelect={handleSelect} />;
}
