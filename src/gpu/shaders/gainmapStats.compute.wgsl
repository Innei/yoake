@group(0) @binding(0) var hdrTex: texture_2d<f32>;
@group(0) @binding(1) var sdrTex: texture_2d<f32>;
@group(0) @binding(2) var<storage, read_write> stats: array<atomic<i32>, 2>;

const EPS: f32 = 1.0e-6;
const SRGB_CODED_BREAK: f32 = 0.04045;
const SRGB_LINEAR_SLOPE: f32 = 12.92;
const SRGB_ALPHA: f32 = 0.055;
const SRGB_GAMMA: f32 = 2.4;

const WG_X: u32 = 8u;
const WG_Y: u32 = 8u;
const WG_SIZE: u32 = WG_X * WG_Y;

var<workgroup> wg_min: array<f32, WG_SIZE>;
var<workgroup> wg_max: array<f32, WG_SIZE>;

fn srgbToLinear(c: f32) -> f32 {
  if (c <= SRGB_CODED_BREAK) {
    return c / SRGB_LINEAR_SLOPE;
  }
  return pow((c + SRGB_ALPHA) / (1.0 + SRGB_ALPHA), SRGB_GAMMA);
}

fn perChannelMaxLog2(hdr: vec3f, sdr: vec3f) -> f32 {
  let r = log2(max(hdr.r, EPS) / max(sdr.r, EPS));
  let g = log2(max(hdr.g, EPS) / max(sdr.g, EPS));
  let b = log2(max(hdr.b, EPS) / max(sdr.b, EPS));
  return max(r, max(g, b));
}

// Non-negative f32 bit patterns sort identically to i32. Pass 3 clamps
// gain >= 1.0, so log2(gain) >= 0; the gainmap branch never encodes
// negative values in MVP.
@compute @workgroup_size(WG_X, WG_Y, 1)
fn main(
  @builtin(global_invocation_id) gid: vec3u,
  @builtin(local_invocation_index) lid: u32,
) {
  let dims = textureDimensions(hdrTex, 0);
  let inside = gid.x < dims.x && gid.y < dims.y;

  var local_val: f32 = 0.0;
  if (inside) {
    let hdr = textureLoad(hdrTex, vec2i(gid.xy), 0).rgb;
    let sdr_coded = textureLoad(sdrTex, vec2i(gid.xy), 0).rgb;
    let sdr_lin = vec3f(srgbToLinear(sdr_coded.r), srgbToLinear(sdr_coded.g), srgbToLinear(sdr_coded.b));
    local_val = max(perChannelMaxLog2(hdr, sdr_lin), 0.0);
  }

  let init_min = select(3.4028235e38, local_val, inside);
  let init_max = select(0.0, local_val, inside);
  wg_min[lid] = init_min;
  wg_max[lid] = init_max;
  workgroupBarrier();

  var stride: u32 = WG_SIZE >> 1u;
  loop {
    if (stride == 0u) { break; }
    if (lid < stride) {
      wg_min[lid] = min(wg_min[lid], wg_min[lid + stride]);
      wg_max[lid] = max(wg_max[lid], wg_max[lid + stride]);
    }
    workgroupBarrier();
    stride = stride >> 1u;
  }

  if (lid == 0u) {
    let final_min = wg_min[0];
    let final_max = wg_max[0];
    if (final_max > 0.0 || final_min < 3.4028235e38) {
      atomicMin(&stats[0], bitcast<i32>(final_min));
      atomicMax(&stats[1], bitcast<i32>(final_max));
    }
  }
}
