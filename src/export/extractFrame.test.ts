import { describe, expect, it, vi } from 'vitest';

import { extractFrame, formatTimeForFilename } from './extractFrame';

interface MockWritable {
  close: ReturnType<typeof vi.fn>;
  write: ReturnType<typeof vi.fn>;
}

interface MockFileHandle {
  createWritable: ReturnType<typeof vi.fn>;
}

function makeMockDir(): {
  createdWith: string[];
  handle: FileSystemDirectoryHandle;
  writes: { blob: Blob; name: string }[];
} {
  const writes: { blob: Blob; name: string }[] = [];
  const createdWith: string[] = [];
  const handle = {
    async getFileHandle(
      name: string,
      options?: { create?: boolean },
    ): Promise<MockFileHandle> {
      if (options?.create) {
        createdWith.push(name);
        return {
          createWritable: vi.fn(async (): Promise<MockWritable> => {
            const writable: MockWritable = {
              write: vi.fn(async (chunk: Blob) => {
                writes.push({ name, blob: chunk });
              }),
              close: vi.fn(async () => {}),
            };
            return writable;
          }),
        };
      }
      throw new DOMException('not found', 'NotFoundError');
    },
  } as unknown as FileSystemDirectoryHandle;
  return { handle, writes, createdWith };
}

function makeMockCanvas(blob: Blob | null = new Blob(['png'], { type: 'image/png' })): HTMLCanvasElement {
  return {
    toBlob: vi.fn((cb: BlobCallback) => {
      queueMicrotask(() => cb(blob));
    }),
  } as unknown as HTMLCanvasElement;
}

describe('formatTimeForFilename', () => {
  it('formats zero as 00-00-00-000', () => {
    expect(formatTimeForFilename(0, 30)).toBe('00-00-00-000');
  });

  it('formats a time of 1h 2m 3.456s as 01-02-03-456', () => {
    expect(formatTimeForFilename(3723.456, 30)).toBe('01-02-03-456');
  });

  it('rounds milliseconds to nearest ms', () => {
    expect(formatTimeForFilename(0.001, 30)).toBe('00-00-00-001');
  });

  it('handles times beyond 24h by clipping hours to two digits', () => {
    expect(formatTimeForFilename(99 * 3600, 30)).toBe('99-00-00-000');
  });
});

describe('extractFrame', () => {
  it('writes a PNG via createWritable + write + close', async () => {
    const { handle, writes, createdWith } = makeMockDir();
    const canvas = makeMockCanvas();
    const result = await extractFrame({
      canvas,
      baseName: 'DJI_0001',
      currentTime: 83.456,
      fps: 30,
      exportDir: handle,
    });
    expect(result.filename).toBe('DJI_0001_00-01-23-456.png');
    expect(createdWith).toEqual(['DJI_0001_00-01-23-456.png']);
    expect(writes).toHaveLength(1);
    expect(writes[0]!.name).toBe('DJI_0001_00-01-23-456.png');
    expect(writes[0]!.blob.type).toBe('image/png');
  });

  it('throws when canvas.toBlob returns null', async () => {
    const { handle } = makeMockDir();
    const canvas = makeMockCanvas(null);
    await expect(
      extractFrame({
        canvas,
        baseName: 'clip',
        currentTime: 0,
        fps: 30,
        exportDir: handle,
      }),
    ).rejects.toThrow(/canvas/i);
  });
});
