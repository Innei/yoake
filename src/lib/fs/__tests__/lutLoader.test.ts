import { describe, expect, it } from 'vitest';

import { readLut, scanLuts } from '~/lib/fs/lutLoader';

interface FakeFileHandle {
  getFile: () => Promise<{ text: () => Promise<string> }>;
  kind: 'file';
  name: string;
}

interface FakeSubDir {
  kind: 'directory';
  name: string;
}

type FakeEntry = FakeFileHandle | FakeSubDir;

const makeFile = (name: string, text = ''): FakeFileHandle => ({
  kind: 'file',
  name,
  getFile: async () => ({ text: async () => text }),
});

const makeDir = (name: string): FakeSubDir => ({ kind: 'directory', name });

const makeDirHandle = (entries: FakeEntry[]) => ({
  values: () => {
    let i = 0;
    return {
      [Symbol.asyncIterator]() {
        return this;
      },
      async next() {
        if (i < entries.length) {
          const value = entries[i++];
          return { value, done: false } as IteratorResult<FakeEntry>;
        }
        return { value: undefined, done: true } as IteratorResult<FakeEntry>;
      },
    };
  },
});

describe('lutLoader', () => {
  it('filters .cube files only', async () => {
    const handle = makeDirHandle([
      makeFile('dji-dlog-m.cube'),
      makeFile('readme.txt'),
      makeFile('Other.CUBE'),
      makeDir('subdir'),
    ]) as unknown as FileSystemDirectoryHandle;

    const luts = await scanLuts(handle);
    expect(luts.map((l) => l.name).sort()).toEqual(
      ['Other.CUBE', 'dji-dlog-m.cube'].sort(),
    );
  });

  it('strips extension for label', async () => {
    const handle = makeDirHandle([
      makeFile('Look-A.cube'),
    ]) as unknown as FileSystemDirectoryHandle;

    const [lut] = await scanLuts(handle);
    expect(lut?.label).toBe('Look-A');
  });

  it('returns empty when no .cube present', async () => {
    const handle = makeDirHandle([
      makeFile('notes.txt'),
    ]) as unknown as FileSystemDirectoryHandle;

    expect(await scanLuts(handle)).toEqual([]);
  });

  it('readLut returns file text', async () => {
    const fileHandle = makeFile(
      'a.cube',
      'TITLE "x"\nLUT_3D_SIZE 2\n',
    );
    const text = await readLut(fileHandle as unknown as FileSystemFileHandle);
    expect(text).toContain('LUT_3D_SIZE 2');
  });
});
