import { describe, expect, it } from 'vitest';

import type { SidecarV1 } from '../clipSidecar';
import { readSidecar, SIDECAR_VERSION, writeSidecar } from '../clipSidecar';

interface MockFile {
  text: () => Promise<string>;
}

interface MockFileHandle {
  createWritable: () => Promise<MockWritable>;
  getFile: () => Promise<MockFile>;
}

interface MockWritable {
  close: () => Promise<void>;
  write: (chunk: string) => Promise<void>;
}

function makeMockDir(initial: Record<string, string> = {}): {
  files: Map<string, string>;
  handle: FileSystemDirectoryHandle;
} {
  const files = new Map<string, string>(Object.entries(initial));

  const handle = {
    async getFileHandle(
      name: string,
      options?: { create?: boolean },
    ): Promise<MockFileHandle> {
      if (!files.has(name) && !options?.create) {
        throw new DOMException(
          `A requested file or directory could not be found: ${name}`,
          'NotFoundError',
        );
      }
      if (options?.create && !files.has(name)) {
        files.set(name, '');
      }
      return {
        async getFile(): Promise<MockFile> {
          return {
            async text(): Promise<string> {
              return files.get(name) ?? '';
            },
          };
        },
        async createWritable(): Promise<MockWritable> {
          let buffer = '';
          return {
            async write(chunk: string): Promise<void> {
              buffer += chunk;
            },
            async close(): Promise<void> {
              files.set(name, buffer);
            },
          };
        },
      };
    },
  } as unknown as FileSystemDirectoryHandle;

  return { files, handle };
}

describe('readSidecar', () => {
  it('returns undefined when the sidecar file is absent', async () => {
    const { handle } = makeMockDir();
    const result = await readSidecar(handle, 'DJI_0042_D');
    expect(result).toBeUndefined();
  });

  it('returns parsed data for a valid v1 sidecar', async () => {
    const data: SidecarV1 = {
      version: 1,
      markers: [
        { id: 'a', time: 1.5, label: 'one' },
        { id: 'b', time: 4.25, label: '' },
      ],
    };
    const { handle } = makeMockDir({
      'DJI_0042_D.djilut.json': JSON.stringify(data),
    });
    const result = await readSidecar(handle, 'DJI_0042_D');
    expect(result).toEqual(data);
  });

  it('throws when the sidecar file contains malformed JSON', async () => {
    const { handle } = makeMockDir({
      'DJI_0042_D.djilut.json': '{ not json',
    });
    await expect(readSidecar(handle, 'DJI_0042_D')).rejects.toThrow(
      /malformed JSON/,
    );
  });

  it('throws when the sidecar version is unsupported', async () => {
    const { handle } = makeMockDir({
      'DJI_0042_D.djilut.json': JSON.stringify({ version: 2, markers: [] }),
    });
    await expect(readSidecar(handle, 'DJI_0042_D')).rejects.toThrow(
      /unsupported sidecar version/,
    );
  });
});

describe('writeSidecar', () => {
  it('round-trips data through write and read', async () => {
    const { handle, files } = makeMockDir();
    const data: SidecarV1 = {
      version: SIDECAR_VERSION,
      markers: [
        { id: 'one', time: 0, label: 'start' },
        { id: 'two', time: 9.875, label: '' },
      ],
    };
    await writeSidecar(handle, 'DJI_0042_D', data);

    const stored = files.get('DJI_0042_D.djilut.json');
    expect(stored).toBeDefined();
    expect(stored).toContain('\n');
    expect(stored).toContain('  ');

    const reread = await readSidecar(handle, 'DJI_0042_D');
    expect(reread).toEqual(data);
  });
});
