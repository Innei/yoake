import { useCallback } from 'react';

import { toast } from '~/state/toastStore';

export type FrameExtractHandler = () => void | Promise<void>;

export function useFrameExtract(): FrameExtractHandler {
  return useCallback(() => {
    toast.info('Frame extract', {
      description: 'Wiring lands with the frame extract task.',
    });
  }, []);
}
