# Deliver quality preset

Date: 2026-06-10
Status: approved

## Goal

User-selectable export bitrate tier in the Deliver tab, mapped to mediabunny
quality presets. Default stays High (current behavior).

## Design

- `deliverStore`: new field `quality: DeliverQuality` =
  `'low' | 'medium' | 'high' | 'very-high'`, default `'high'`, plus
  `setQuality` following the existing setter pattern.
- `DeliverTab` Output section: a "Quality" `<select>` below Resolution,
  options Low / Medium / High / Very high, styled like the Resolution select.
  data-testid `deliver-quality-select`.
- Threading: `useExport` reads `quality` and passes it to both `encodeGraded`
  and `encodeDirect`, which forward it to `createMp4Writer`. `mp4Writer` maps
  the enum to mediabunny `QUALITY_LOW | QUALITY_MEDIUM | QUALITY_HIGH |
  QUALITY_VERY_HIGH` for the video track bitrate. Default `'high'` when the
  option is omitted (back-compat for existing callers/tests).
- Approximate resulting bitrates (mediabunny formula, H.264):
  1080p ≈ 1.8 / 3 / 6 / 12 Mbps; 4K ≈ 6.7 / 11.2 / 22.4 / 44.8 Mbps.
  HEVC ≈ 0.6×. No need to surface these numbers in the UI.

## Testing

- deliverStore: quality default + setter.
- mp4Writer: enum→preset mapping reaches VideoSampleSource bitrate; default
  high.
- encodeGraded/encodeDirect: quality forwarded to createMp4Writer.
- useExport: store quality reaches encoder options.
- DeliverTab: select renders, changes store.
