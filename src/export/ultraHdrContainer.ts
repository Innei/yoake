import type { IsoGainMapMetadata } from './iso21496';
import {
  buildIsoApp2Segment,
  serializeGainMapMetadata,
  serializeVersionOnlyPayload,
  spliceSegmentsAfterSoi,
} from './iso21496';

const MPF_PAYLOAD_SIZE = 86;
const MPF_SEGMENT_TOTAL = 4 + MPF_PAYLOAD_SIZE;
const MP_ENTRY_SIZE = 16;
const MP_ENTRY_ATTRIBUTE_PRIMARY_JPEG = 0x03_00_00;

export function buildMpfSegment(
  primaryImageSize: number,
  secondaryImageSize: number,
  secondaryImageOffset: number,
): Uint8Array {
  const out = new Uint8Array(MPF_SEGMENT_TOTAL);
  const view = new DataView(out.buffer);
  let pos = 0;
  const writeU16 = (v: number) => {
    view.setUint16(pos, v);
    pos += 2;
  };
  const writeU32 = (v: number) => {
    view.setUint32(pos, v);
    pos += 4;
  };
  const writeAscii = (s: string) => {
    for (const ch of s) out[pos++] = ch.codePointAt(0)!;
  };

  writeU16(0xFF_E2);
  writeU16(2 + MPF_PAYLOAD_SIZE);
  writeAscii('MPF\0');
  writeAscii('MM');
  writeU16(0x00_2A);
  writeU32(8);
  writeU16(3);
  writeU16(0xB0_00);
  writeU16(7);
  writeU32(4);
  writeAscii('0100');
  writeU16(0xB0_01);
  writeU16(4);
  writeU32(1);
  writeU32(2);
  writeU16(0xB0_02);
  writeU16(7);
  writeU32(MP_ENTRY_SIZE * 2);
  writeU32(50);
  writeU32(0);
  writeU32(MP_ENTRY_ATTRIBUTE_PRIMARY_JPEG);
  writeU32(primaryImageSize);
  writeU32(0);
  writeU32(0);
  writeU32(0);
  writeU32(secondaryImageSize);
  writeU32(secondaryImageOffset);
  writeU32(0);
  return out;
}

export function assembleUltraHdrContainer(
  primaryJpeg: Uint8Array,
  gainMapJpeg: Uint8Array,
  metadata: IsoGainMapMetadata,
): Uint8Array {
  const isoVersionSegment = buildIsoApp2Segment(serializeVersionOnlyPayload());
  const isoMetadataSegment = buildIsoApp2Segment(
    serializeGainMapMetadata(metadata),
  );

  const secondary = spliceSegmentsAfterSoi(gainMapJpeg, [isoMetadataSegment]);
  const primarySize =
    primaryJpeg.length + isoVersionSegment.length + MPF_SEGMENT_TOTAL;
  const mpfMarkerPos = 2 + isoVersionSegment.length;
  const mpfSegment = buildMpfSegment(
    primarySize,
    secondary.length,
    primarySize - mpfMarkerPos - 8,
  );
  const primary = spliceSegmentsAfterSoi(primaryJpeg, [
    isoVersionSegment,
    mpfSegment,
  ]);

  const out = new Uint8Array(primary.length + secondary.length);
  out.set(primary, 0);
  out.set(secondary, primary.length);
  return out;
}
