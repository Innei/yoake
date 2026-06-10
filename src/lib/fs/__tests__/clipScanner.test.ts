import { describe, expect, it } from 'vitest';

import { scanClips } from '~/lib/fs/clipScanner';

interface FakeFile {
  lastModified: number;
  size: number;
}

interface FakeFileHandle {
  getFile: () => Promise<FakeFile>;
  kind: 'file';
  name: string;
}

interface FakeSubDir {
  kind: 'directory';
  name: string;
}

type FakeEntry = FakeFileHandle | FakeSubDir;

const makeFile = (
  name: string,
  size: number,
  lastModified: number,
): FakeFileHandle => ({
  kind: 'file',
  name,
  getFile: async () => ({ size, lastModified }),
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

describe('clipScanner', () => {
  it('filters *_D.MP4 files and skips other entries', async () => {
    const handle = makeDirHandle([
      makeFile('DJI_0001_D.MP4', 100, 10),
      makeFile('DJI_0002.MP4', 200, 20),
      makeFile('DJI_0003_D.mp4', 300, 30),
      makeFile('notes.txt', 50, 5),
      makeDir('subfolder'),
    ]) as unknown as FileSystemDirectoryHandle;

    const clips = await scanClips(handle);

    expect(clips.map((c) => c.name)).toEqual([
      'DJI_0003_D.mp4',
      'DJI_0001_D.MP4',
    ]);
  });

  it('captures size, lastModified, and file handle', async () => {
    const fileHandle = makeFile('CLIP_D.MP4', 42, 1234);
    const handle = makeDirHandle([
      fileHandle,
    ]) as unknown as FileSystemDirectoryHandle;

    const [clip] = await scanClips(handle);

    expect(clip).toBeDefined();
    expect(clip!.size).toBe(42);
    expect(clip!.lastModified).toBe(1234);
    expect(clip!.fileHandle).toBe(fileHandle as unknown as FileSystemFileHandle);
  });

  it('sorts by name descending', async () => {
    const handle = makeDirHandle([
      makeFile('A_D.MP4', 1, 1),
      makeFile('C_D.MP4', 1, 1),
      makeFile('B_D.MP4', 1, 1),
    ]) as unknown as FileSystemDirectoryHandle;

    const clips = await scanClips(handle);

    expect(clips.map((c) => c.name)).toEqual([
      'C_D.MP4',
      'B_D.MP4',
      'A_D.MP4',
    ]);
  });

  it('returns an empty array when no matches', async () => {
    const handle = makeDirHandle([
      makeFile('foo.mov', 1, 1),
      makeFile('bar.MP4', 1, 1),
    ]) as unknown as FileSystemDirectoryHandle;

    expect(await scanClips(handle)).toEqual([]);
  });
});
