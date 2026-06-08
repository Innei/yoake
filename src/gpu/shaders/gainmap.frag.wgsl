@group(0) @binding(0) var hdrTex: texture_2d<f32>;
@group(0) @binding(1) var sdrTex: texture_2d<f32>;
@group(0) @binding(2) var texSamp: sampler;

struct Meta {
  gainmapMin: f32,
  gainmapMax: f32,
};
@group(0) @binding(3) var<uniform> meta: Meta;

const EPS: f32 = 1.0e-6;
const SRGB_CODED_BREAK: f32 = 0.04045;
const SRGB_LINEAR_SLOPE: f32 = 12.92;
const SRGB_ALPHA: f32 = 0.055;
const SRGB_GAMMA: f32 = 2.4;

fn srgbToLinear(c: f32) -> f32 {
  if (c <= SRGB_CODED_BREAK) {
    return c / SRGB_LINEAR_SLOPE;
  }
  return pow((c + SRGB_ALPHA) / (1.0 + SRGB_ALPHA), SRGB_GAMMA);
}

struct VsOut {
  @builtin(position) position: vec4f,
  @location(0) uv: vec2f,
};

@fragment
fn fs(in: VsOut) -> @location(0) vec4f {
  let hdr = textureSample(hdrTex, texSamp, in.uv).rgb;
  let sdr_coded = textureSample(sdrTex, texSamp, in.uv).rgb;
  let sdr_lin = vec3f(srgbToLinear(sdr_coded.r), srgbToLinear(sdr_coded.g), srgbToLinear(sdr_coded.b));

  let gr = log2(max(hdr.r, EPS) / max(sdr_lin.r, EPS));
  let gg = log2(max(hdr.g, EPS) / max(sdr_lin.g, EPS));
  let gb = log2(max(hdr.b, EPS) / max(sdr_lin.b, EPS));
  let gain_raw_max = max(gr, max(gg, gb));

  let range = max(meta.gainmapMax - meta.gainmapMin, EPS);
  let gain_norm = clamp((gain_raw_max - meta.gainmapMin) / range, 0.0, 1.0);

  return vec4f(gain_norm, 0.0, 0.0, 1.0);
}
