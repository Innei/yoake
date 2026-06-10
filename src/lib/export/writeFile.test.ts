import { describe, expect, it, vi } from 'vitest';

import { resolveAvailableName, writeJpegToDir } from './writeFile';

interface MockWritable {
  close: ReturnType<typeof vi.fn>;
  write: ReturnType<typeof vi.fn>;
}

interface MockFileHandle {
  createWritable: ReturnType<typeof vi.fn>;
}

function makeMockDir(existing: string[]): {
  createdWith: string[];
  handle: FileSystemDirectoryHandle;
  writes: { bytes: Uint8Array; name: string }[];
} {
  const pool = new Set(existing);
  const writes: { bytes: Uint8Array; name: string }[] = [];
  const createdWith: string[] = [];

  const handle = {
    async getFileHandle(
      name: string,
      options?: { create?: boolean },
    ): Promise<MockFileHandle> {
      if (options?.create) {
        createdWith.push(name);
        pool.add(name);
        return {
          createWritable: vi.fn(async (): Promise<MockWritable> => {
            const writable: MockWritable = {
              write: vi.fn(async (chunk: ArrayBuffer | ArrayBufferView) => {
                const view =
                  chunk instanceof ArrayBuffer
                    ? new Uint8Array(chunk)
                    : new Uint8Array(
                        chunk.buffer,
                        chunk.byteOffset,
                        chunk.byteLength,
                      );
                writes.push({ name, bytes: new Uint8Array(view) });
              }),
              close: vi.fn(async () => {}),
            };
            return writable;
          }),
        };
      }
      if (pool.has(name)) {
        return {
          createWritable: vi.fn(),
        };
      }
      throw new DOMException(
        `A requested file or directory could not be found: ${name}`,
        'NotFoundError',
      );
    },
  } as unknown as FileSystemDirectoryHandle;

  return { handle, writes, createdWith };
}

describe('resolveAvailableName', () => {
  it('returns the base name when no conflict exists', async () => {
    const { handle } = makeMockDir([]);
    const name = await resolveAvailableName(handle, 'clip_0001234_lut.jpg');
    expect(name).toBe('clip_0001234_lut.jpg');
  });

  it('appends _2 when base name is taken', async () => {
    const { handle } = makeMockDir(['clip.jpg']);
    const name = await resolveAvailableName(handle, 'clip.jpg');
    expect(name).toBe('clip_2.jpg');
  });

  it('walks suffixes until a free name is found', async () => {
    const { handle } = makeMockDir([
      'clip.jpg',
      'clip_2.jpg',
      'clip_3.jpg',
      'clip_4.jpg',
    ]);
    const name = await resolveAvailableName(handle, 'clip.jpg');
    expect(name).toBe('clip_5.jpg');
  });

  it('accepts a base name without extension and appends .jpg', async () => {
    const { handle } = makeMockDir([]);
    const name = await resolveAvailableName(handle, 'clip_x');
    expect(name).toBe('clip_x.jpg');
  });

  it('rethrows unexpected errors from getFileHandle', async () => {
    const handle = {
      async getFileHandle(): Promise<never> {
        throw new TypeError('boom');
      },
    } as unknown as FileSystemDirectoryHandle;
    await expect(resolveAvailableName(handle, 'a.jpg')).rejects.toThrow('boom');
  });
});

describe('writeJpegToDir', () => {
  it('writes bytes to the resolved name and returns it', async () => {
    const { handle, writes, createdWith } = makeMockDir(['shot.jpg']);
    const bytes = new Uint8Array([1, 2, 3, 4]);
    const final = await writeJpegToDir(handle, 'shot.jpg', bytes);
    expect(final).toBe('shot_2.jpg');
    expect(createdWith).toEqual(['shot_2.jpg']);
    expect(writes).toHaveLength(1);
    expect(writes[0]!.name).toBe('shot_2.jpg');
    expect(writes[0]!.bytes).toEqual(bytes);
  });

  it('writes under the original name when no conflict', async () => {
    const { handle, writes } = makeMockDir([]);
    const bytes = new Uint8Array([9, 9, 9]);
    const final = await writeJpegToDir(handle, 'first.jpg', bytes);
    expect(final).toBe('first.jpg');
    expect(writes[0]!.name).toBe('first.jpg');
  });
});
