struct VsOut {
  @builtin(position) position: vec4f,
  @location(0) uv: vec2f,
};

struct Params {
  exposure: f32,
};

@group(0) @binding(0) var sceneTex: texture_2d<f32>;
@group(0) @binding(1) var sceneSampler: sampler;

@group(1) @binding(0) var lutTex: texture_3d<f32>;
@group(1) @binding(1) var lutSampler: sampler;

@group(2) @binding(0) var<uniform> params: Params;

const LINEAR_BREAK: f32 = 0.0078;
const LINEAR_SLOPE: f32 = 6.025;
const LINEAR_OFFSET: f32 = 0.0929;
const LOG_SCALE_IN: f32 = 0.9892;
const LOG_BIAS_IN: f32 = 0.0108;
const LOG_SCALE_OUT: f32 = 0.256663;
const LOG_OFFSET_OUT: f32 = 0.584555;

fn linear_to_dlogM(x: f32) -> f32 {
  if (x <= LINEAR_BREAK) {
    return LINEAR_SLOPE * x + LINEAR_OFFSET;
  }
  return log(x * LOG_SCALE_IN + LOG_BIAS_IN) * (LOG_SCALE_OUT / log(10.0)) + LOG_OFFSET_OUT;
}

fn linear_to_dlogM3(rgb: vec3f) -> vec3f {
  return vec3f(
    linear_to_dlogM(rgb.r),
    linear_to_dlogM(rgb.g),
    linear_to_dlogM(rgb.b),
  );
}

fn sample_lut(coded: vec3f) -> vec3f {
  let lutSize = vec3f(textureDimensions(lutTex, 0));
  let clamped = clamp(coded, vec3f(0.0), vec3f(1.0));
  let scaled = (clamped * (lutSize - vec3f(1.0)) + vec3f(0.5)) / lutSize;
  return textureSampleLevel(lutTex, lutSampler, scaled, 0.0).rgb;
}

@fragment
fn fs(in: VsOut) -> @location(0) vec4f {
  let scene = textureSampleLevel(sceneTex, sceneSampler, in.uv, 0.0).rgb;
  let gain = exp2(params.exposure);
  let graded = max(scene * gain, vec3f(0.0));
  let coded = linear_to_dlogM3(graded);
  let looked = sample_lut(coded);
  return vec4f(looked, 1.0);
}
