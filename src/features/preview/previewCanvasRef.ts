let previewCanvas: HTMLCanvasElement | null = null;

export function setPreviewCanvas(canvas: HTMLCanvasElement | null): void {
  previewCanvas = canvas;
}

export function getPreviewCanvas(): HTMLCanvasElement | null {
  return previewCanvas;
}
