struct VsOut {
  @builtin(position) position: vec4f,
  @location(0) uv: vec2f,
};

struct Params {
  peakHeadroom: f32,
  hdrStrength: f32,
};

@group(0) @binding(0) var sdrBaseTex: texture_2d<f32>;
@group(0) @binding(1) var sdrBaseSampler: sampler;
@group(0) @binding(2) var sceneLinearTex: texture_2d<f32>;
@group(0) @binding(3) var sceneLinearSampler: sampler;

@group(1) @binding(0) var<uniform> params: Params;

const SRGB_CODED_BREAK: f32 = 0.04045;
const SRGB_INV_LINEAR_SLOPE: f32 = 1.0 / 12.92;
const SRGB_ALPHA: f32 = 0.055;
const SRGB_GAMMA: f32 = 2.4;

const REC2020_LUMA: vec3f = vec3f(0.2627, 0.6780, 0.0593);
const LUMA_EPSILON: f32 = 1e-5;
const HDR_KNEE_START: f32 = 0.78;
const HDR_KNEE_END: f32 = 0.98;

fn srgb_to_linear_component(x: f32) -> f32 {
  let c = clamp(x, 0.0, 1.0);
  if (c <= SRGB_CODED_BREAK) {
    return c * SRGB_INV_LINEAR_SLOPE;
  }
  return pow((c + SRGB_ALPHA) / (1.0 + SRGB_ALPHA), SRGB_GAMMA);
}

fn srgb_to_linear(rgb: vec3f) -> vec3f {
  return vec3f(
    srgb_to_linear_component(rgb.r),
    srgb_to_linear_component(rgb.g),
    srgb_to_linear_component(rgb.b),
  );
}

@fragment
fn fs(in: VsOut) -> @location(0) vec4f {
  let sdr_encoded = textureSampleLevel(sdrBaseTex, sdrBaseSampler, in.uv, 0.0).rgb;
  let sdr_lin = srgb_to_linear(sdr_encoded);
  let src_lin = textureSampleLevel(sceneLinearTex, sceneLinearSampler, in.uv, 0.0).rgb;

  let src_luma = dot(src_lin, REC2020_LUMA);
  let sdr_luma = dot(sdr_lin, REC2020_LUMA);
  let sdr_peak = max(max(sdr_encoded.r, sdr_encoded.g), sdr_encoded.b);
  let highlight_mask = smoothstep(HDR_KNEE_START, HDR_KNEE_END, sdr_peak);
  let raw_gain = clamp(src_luma / max(sdr_luma, LUMA_EPSILON), 1.0, params.peakHeadroom);
  let strength = clamp(params.hdrStrength, 0.0, 1.0);
  let max_gain = mix(1.0, params.peakHeadroom, strength);
  let gain = min(mix(1.0, raw_gain, highlight_mask * strength), max_gain);
  let hdr_lin = sdr_lin * gain;
  return vec4f(hdr_lin, 1.0);
}
