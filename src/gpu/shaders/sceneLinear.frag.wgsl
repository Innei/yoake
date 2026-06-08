// Pass 1: video external texture -> scene-linear rgba16float master.
// Chrome exposes bt709 video as sRGB display-coded RGB, so recover Rec.709 /
// D-Log code values before applying the D-Log M inverse OETF.

@group(0) @binding(0) var videoTex: texture_external;
@group(0) @binding(1) var videoSamp: sampler;

const LINEAR_SLOPE: f32 = 6.025;
const LINEAR_OFFSET: f32 = 0.0929;
const LOG_SCALE_IN: f32 = 0.9892;
const LOG_BIAS_IN: f32 = 0.0108;
const CODED_BREAK: f32 = 0.14;
const INV_LOG_SLOPE: f32 = 3.89616;
const INV_LOG_OFFSET: f32 = 2.27752;

const SRGB_CODED_BREAK: f32 = 0.04045;
const SRGB_LINEAR_SLOPE: f32 = 12.92;
const SRGB_ALPHA: f32 = 0.055;
const SRGB_GAMMA: f32 = 2.4;

const BT709_LINEAR_BREAK: f32 = 0.018;
const BT709_LINEAR_SLOPE: f32 = 4.5;
const BT709_ALPHA: f32 = 1.099;
const BT709_BETA: f32 = 0.099;
const BT709_GAMMA: f32 = 0.45;

fn srgb_to_linear_component(coded: f32) -> f32 {
  let c = clamp(coded, 0.0, 1.0);
  if (c <= SRGB_CODED_BREAK) {
    return c / SRGB_LINEAR_SLOPE;
  }
  return pow((c + SRGB_ALPHA) / (1.0 + SRGB_ALPHA), SRGB_GAMMA);
}

fn linear_to_bt709_component(linear: f32) -> f32 {
  let x = max(linear, 0.0);
  if (x < BT709_LINEAR_BREAK) {
    return BT709_LINEAR_SLOPE * x;
  }
  return BT709_ALPHA * pow(x, BT709_GAMMA) - BT709_BETA;
}

fn externalTextureToBt709Coded(rgb: vec3f) -> vec3f {
  return vec3f(
    linear_to_bt709_component(srgb_to_linear_component(rgb.r)),
    linear_to_bt709_component(srgb_to_linear_component(rgb.g)),
    linear_to_bt709_component(srgb_to_linear_component(rgb.b)),
  );
}

fn dlogMtoLinear(coded: f32) -> f32 {
  if (coded <= CODED_BREAK) {
    return (coded - LINEAR_OFFSET) / LINEAR_SLOPE;
  }
  return (pow(10.0, INV_LOG_SLOPE * coded - INV_LOG_OFFSET) - LOG_BIAS_IN) / LOG_SCALE_IN;
}

struct VsOut {
  @builtin(position) position: vec4f,
  @location(0) uv: vec2f,
};

@fragment
fn fs(in: VsOut) -> @location(0) vec4f {
  let sampled = textureSampleBaseClampToEdge(videoTex, videoSamp, in.uv);
  let coded = externalTextureToBt709Coded(sampled.rgb);
  let lin = vec3f(
    dlogMtoLinear(coded.r),
    dlogMtoLinear(coded.g),
    dlogMtoLinear(coded.b),
  );
  return vec4f(lin, 1.0);
}
