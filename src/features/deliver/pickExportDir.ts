import { toast } from '~/components/ui/toast/toastStore';

export async function pickExportDir(
  setHandle: (handle: FileSystemDirectoryHandle) => Promise<void>,
): Promise<void> {
  const picker = (
    window as unknown as {
      showDirectoryPicker?: (opts?: {
        mode?: 'read' | 'readwrite';
      }) => Promise<FileSystemDirectoryHandle>;
    }
  ).showDirectoryPicker;
  if (!picker) {
    toast.error('Folder picker unavailable', {
      description: 'This browser does not support showDirectoryPicker.',
    });
    return;
  }
  try {
    const handle = await picker({ mode: 'readwrite' });
    await setHandle(handle);
  } catch (cause) {
    if (cause instanceof DOMException && cause.name === 'AbortError') return;
    const message = cause instanceof Error ? cause.message : String(cause);
    toast.error("Couldn't choose folder", { description: message });
  }
}
