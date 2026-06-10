export const SIDECAR_VERSION = 2;

export interface Marker {
  color?: string;
  id: string;
  label: string;
  time: number;
}

export type CurveSpec = unknown;
export type HslSpec = unknown;
export type WheelSpec = unknown;

export interface GradeState {
  contrast?: number;
  curves?: CurveSpec;
  exposure?: number;
  hsl?: HslSpec;
  lutId?: string;
  lutOpacity?: number;
  tint?: number;
  wb?: number;
  wheels?: WheelSpec;
}

export type SegmentPlayMode = 'normal' | 'reverse' | 'freeze';

export interface Segment {
  freezeDurationSec?: number;
  gradeOverride?: Partial<GradeState>;
  id: string;
  in: number;
  label?: string;
  out: number;
  playMode: SegmentPlayMode;
  speed: number;
}

export interface SidecarV1 {
  markers: Marker[];
  version: 1;
}

export interface SidecarV2 {
  baseGrade: GradeState;
  markers: Marker[];
  segments: Segment[];
  version: 2;
}

export type SidecarAny = SidecarV1 | SidecarV2;

const sidecarFileName = (baseName: string) => `${baseName}.djilut.json`;

const isNotFound = (cause: unknown): boolean => {
  if (cause instanceof DOMException && cause.name === 'NotFoundError') {
    return true;
  }
  return (
    typeof cause === 'object' &&
    cause !== null &&
    'name' in cause &&
    (cause as { name?: unknown }).name === 'NotFoundError'
  );
};

export function migrateV1ToV2(v1: SidecarV1): SidecarV2 {
  return {
    version: 2,
    markers: v1.markers.map((m) => ({ ...m })),
    segments: [],
    baseGrade: {},
  };
}

function normalizeMarker(raw: unknown): Marker {
  const r = raw as Record<string, unknown>;
  const marker: Marker = {
    id: String(r.id),
    time: Number(r.time),
    label: typeof r.label === 'string' ? r.label : '',
  };
  if (typeof r.color === 'string') marker.color = r.color;
  return marker;
}

function ensureV2(parsed: unknown, fileName: string): SidecarV2 {
  if (typeof parsed !== 'object' || parsed === null) {
    throw new Error(`clipSidecar: malformed sidecar object in ${fileName}`);
  }
  const version = (parsed as { version?: unknown }).version;
  if (version === 1) {
    const markersRaw = (parsed as { markers?: unknown }).markers;
    if (!Array.isArray(markersRaw)) {
      throw new Error(`clipSidecar: missing markers array in ${fileName}`);
    }
    const v1: SidecarV1 = {
      version: 1,
      markers: markersRaw.map(normalizeMarker),
    };
    return migrateV1ToV2(v1);
  }
  if (version === 2) {
    const markersRaw = (parsed as { markers?: unknown }).markers;
    if (!Array.isArray(markersRaw)) {
      throw new Error(`clipSidecar: missing markers array in ${fileName}`);
    }
    const segmentsRaw = (parsed as { segments?: unknown }).segments ?? [];
    if (!Array.isArray(segmentsRaw)) {
      throw new Error(`clipSidecar: segments must be an array in ${fileName}`);
    }
    const baseGradeRaw = (parsed as { baseGrade?: unknown }).baseGrade ?? {};
    if (typeof baseGradeRaw !== 'object' || baseGradeRaw === null) {
      throw new Error(
        `clipSidecar: baseGrade must be an object in ${fileName}`,
      );
    }
    return {
      version: 2,
      markers: markersRaw.map(normalizeMarker),
      segments: segmentsRaw as Segment[],
      baseGrade: baseGradeRaw as GradeState,
    };
  }
  throw new Error(
    `clipSidecar: unsupported sidecar version in ${fileName} (got ${String(version)})`,
  );
}

export async function readSidecar(
  dirHandle: FileSystemDirectoryHandle,
  baseName: string,
): Promise<SidecarV2 | undefined> {
  const fileName = sidecarFileName(baseName);
  let fileHandle: FileSystemFileHandle;
  try {
    fileHandle = await dirHandle.getFileHandle(fileName);
  } catch (cause) {
    if (isNotFound(cause)) return undefined;
    throw cause;
  }
  const file = await fileHandle.getFile();
  const text = await file.text();
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (cause) {
    throw new Error(`clipSidecar: malformed JSON in ${fileName}`, {
      cause,
    });
  }
  return ensureV2(parsed, fileName);
}

export async function writeSidecar(
  dirHandle: FileSystemDirectoryHandle,
  baseName: string,
  data: SidecarAny,
): Promise<void> {
  const v2: SidecarV2 = data.version === 1 ? migrateV1ToV2(data) : data;
  const fileName = sidecarFileName(baseName);
  const fileHandle = await dirHandle.getFileHandle(fileName, { create: true });
  const writable = await fileHandle.createWritable();
  try {
    await writable.write(JSON.stringify(v2, null, 2));
  } finally {
    await writable.close();
  }
}

export function validateSegments(
  segments: readonly Segment[],
  duration?: number,
): boolean {
  if (segments.length === 0) return true;
  for (const seg of segments) {
    if (!(seg.in < seg.out)) return false;
    if (duration !== undefined) {
      if (seg.in < 0 || seg.out > duration) return false;
    } else if (seg.in < 0) {
      return false;
    }
  }
  const sorted = [...segments].sort((a, b) => a.in - b.in);
  for (let i = 1; i < sorted.length; i += 1) {
    if (sorted[i]!.in < sorted[i - 1]!.out) return false;
  }
  return true;
}
