import { describe, expect, it } from 'vitest';

import type { SidecarV1, SidecarV2 } from '../clipSidecar';
import {
  migrateV1ToV2,
  readSidecar,
  SIDECAR_VERSION,
  validateSegments,
  writeSidecar,
} from '../clipSidecar';

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

describe('SIDECAR_VERSION', () => {
  it('is bumped to 2', () => {
    expect(SIDECAR_VERSION).toBe(2);
  });
});

describe('migrateV1ToV2', () => {
  it('returns v2 shape with empty segments and empty baseGrade, markers preserved', () => {
    const v1: SidecarV1 = {
      version: 1,
      markers: [
        { id: 'a', time: 1.5, label: 'one' },
        { id: 'b', time: 4.25, label: '' },
      ],
    };
    const v2 = migrateV1ToV2(v1);
    expect(v2.version).toBe(2);
    expect(v2.markers).toEqual(v1.markers);
    expect(v2.segments).toEqual([]);
    expect(v2.baseGrade).toEqual({});
  });

  it('does not mutate the input', () => {
    const v1: SidecarV1 = {
      version: 1,
      markers: [{ id: 'a', time: 1, label: 'a' }],
    };
    const snapshot = structuredClone(v1);
    migrateV1ToV2(v1);
    expect(v1).toEqual(snapshot);
  });

  it('produces a markers array that is not the same reference as the input', () => {
    const v1: SidecarV1 = {
      version: 1,
      markers: [{ id: 'a', time: 1, label: 'a' }],
    };
    const v2 = migrateV1ToV2(v1);
    expect(v2.markers).not.toBe(v1.markers);
  });
});

describe('readSidecar', () => {
  it('returns undefined when the sidecar file is absent', async () => {
    const { handle } = makeMockDir();
    const result = await readSidecar(handle, 'DJI_0042_D');
    expect(result).toBeUndefined();
  });

  it('migrates a v1 sidecar to v2 on read', async () => {
    const v1: SidecarV1 = {
      version: 1,
      markers: [
        { id: 'a', time: 1.5, label: 'one' },
        { id: 'b', time: 4.25, label: '' },
      ],
    };
    const { handle } = makeMockDir({
      'DJI_0042_D.djilut.json': JSON.stringify(v1),
    });
    const result = await readSidecar(handle, 'DJI_0042_D');
    expect(result).toEqual({
      version: 2,
      markers: v1.markers,
      segments: [],
      baseGrade: {},
    });
  });

  it('returns a v2 sidecar as-is', async () => {
    const v2: SidecarV2 = {
      version: 2,
      markers: [{ id: 'a', time: 1, label: 'a' }],
      segments: [
        {
          id: 's1',
          in: 0,
          out: 5,
          playMode: 'normal',
          speed: 1,
        },
      ],
      baseGrade: { exposure: 0.5 },
    };
    const { handle } = makeMockDir({
      'DJI_0042_D.djilut.json': JSON.stringify(v2),
    });
    const result = await readSidecar(handle, 'DJI_0042_D');
    expect(result).toEqual(v2);
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
      'DJI_0042_D.djilut.json': JSON.stringify({ version: 99, markers: [] }),
    });
    await expect(readSidecar(handle, 'DJI_0042_D')).rejects.toThrow(
      /unsupported sidecar version/,
    );
  });
});

describe('writeSidecar', () => {
  it('round-trips a v2 payload through write and read', async () => {
    const { handle, files } = makeMockDir();
    const data: SidecarV2 = {
      version: 2,
      markers: [
        { id: 'one', time: 0, label: 'start' },
        { id: 'two', time: 9.875, label: '' },
      ],
      segments: [
        {
          id: 's1',
          in: 0,
          out: 5,
          playMode: 'normal',
          speed: 1,
        },
      ],
      baseGrade: { lutId: 'rec709', lutOpacity: 1, exposure: 0.25 },
    };
    await writeSidecar(handle, 'DJI_0042_D', data);

    const stored = files.get('DJI_0042_D.djilut.json');
    expect(stored).toBeDefined();
    expect(stored).toContain('\n');
    expect(stored).toContain('  ');

    const reread = await readSidecar(handle, 'DJI_0042_D');
    expect(reread).toEqual(data);
  });

  it('upgrades a v1 payload to v2 on write', async () => {
    const { handle, files } = makeMockDir();
    const v1: SidecarV1 = {
      version: 1,
      markers: [{ id: 'one', time: 0, label: 'start' }],
    };
    await writeSidecar(handle, 'DJI_0042_D', v1);
    const stored = files.get('DJI_0042_D.djilut.json');
    expect(stored).toBeDefined();
    const parsed = JSON.parse(stored!) as SidecarV2;
    expect(parsed.version).toBe(2);
    expect(parsed.markers).toEqual(v1.markers);
    expect(parsed.segments).toEqual([]);
    expect(parsed.baseGrade).toEqual({});
  });
});

describe('validateSegments', () => {
  it('accepts an empty array', () => {
    expect(validateSegments([])).toBe(true);
    expect(validateSegments([], 10)).toBe(true);
  });

  it('accepts non-overlapping segments in order', () => {
    expect(
      validateSegments([
        { id: 'a', in: 0, out: 2, playMode: 'normal', speed: 1 },
        { id: 'b', in: 2, out: 4, playMode: 'normal', speed: 1 },
        { id: 'c', in: 5, out: 7, playMode: 'normal', speed: 1 },
      ]),
    ).toBe(true);
  });

  it('accepts non-overlapping segments given out of order', () => {
    expect(
      validateSegments([
        { id: 'c', in: 5, out: 7, playMode: 'normal', speed: 1 },
        { id: 'a', in: 0, out: 2, playMode: 'normal', speed: 1 },
        { id: 'b', in: 2, out: 4, playMode: 'normal', speed: 1 },
      ]),
    ).toBe(true);
  });

  it('rejects when in >= out', () => {
    expect(
      validateSegments([
        { id: 'a', in: 2, out: 2, playMode: 'normal', speed: 1 },
      ]),
    ).toBe(false);
    expect(
      validateSegments([
        { id: 'a', in: 3, out: 2, playMode: 'normal', speed: 1 },
      ]),
    ).toBe(false);
  });

  it('rejects overlapping segments', () => {
    expect(
      validateSegments([
        { id: 'a', in: 0, out: 5, playMode: 'normal', speed: 1 },
        { id: 'b', in: 3, out: 7, playMode: 'normal', speed: 1 },
      ]),
    ).toBe(false);
  });

  it('rejects segments outside [0, duration]', () => {
    expect(
      validateSegments(
        [{ id: 'a', in: 0, out: 5, playMode: 'normal', speed: 1 }],
        4,
      ),
    ).toBe(false);
    expect(
      validateSegments(
        [{ id: 'a', in: -0.5, out: 2, playMode: 'normal', speed: 1 }],
        10,
      ),
    ).toBe(false);
  });

  it('accepts segments exactly at the duration boundary', () => {
    expect(
      validateSegments(
        [{ id: 'a', in: 0, out: 10, playMode: 'normal', speed: 1 }],
        10,
      ),
    ).toBe(true);
  });
});
