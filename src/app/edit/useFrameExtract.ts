import { useCallback } from 'react';

import { getPreviewCanvas } from '~/app/previewCanvasRef';
import { extractFrame } from '~/export/extractFrame';
import { useClipsStore } from '~/state/clipsStore';
import { useEditStore } from '~/state/editStore';
import { usePrefsStore } from '~/state/prefsStore';
import { toast } from '~/state/toastStore';

export type FrameExtractHandler = () => Promise<void>;

function stripExt(name: string): string {
  return name.replace(/\.[^./]+$/, '');
}

export function useFrameExtract(): FrameExtractHandler {
  return useCallback(async () => {
    const { clips, selectedClipId } = useClipsStore.getState();
    const clip = clips.find((c) => c.id === selectedClipId);
    if (!clip) {
      toast.error('No clip selected', {
        description: 'Pick a clip in the sidebar before extracting a frame.',
      });
      return;
    }

    const exportDir = usePrefsStore.getState().exportDirHandle;
    if (!exportDir) {
      toast.error('No export folder set', {
        description: 'Choose an export folder in Deliver before extracting.',
      });
      return;
    }

    const canvas = getPreviewCanvas();
    if (!canvas) {
      toast.error("Preview canvas isn't ready", {
        description: 'Wait for the preview to load and try again.',
      });
      return;
    }

    const { currentTime, fps } = useEditStore.getState();
    const baseName = stripExt(clip.name);

    try {
      const { filename } = await extractFrame({
        canvas,
        baseName,
        currentTime,
        fps,
        exportDir,
      });
      toast.success('Frame saved', { description: filename });
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);
      toast.error("Couldn't save frame", { description: message });
    }
  }, []);
}
