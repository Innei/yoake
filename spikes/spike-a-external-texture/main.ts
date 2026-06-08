/// <reference types="@webgpu/types" />

import { analyzeRampRow, type CurveReport } from './curveFit';

interface ChannelStats {
  max: number;
  mean: number;
  min: number;
  smallestStep: number;
}

interface FrameStats {
  b: ChannelStats;
  curve: CurveReport | null;
  g: ChannelStats;
  height: number;
  inferredBitDepth: number;
  inferredStep: number;
  r: ChannelStats;
  width: number;
}

const SAMPLE_W = 256;
const SAMPLE_H = 144;

const fileInput = document.querySelector<HTMLInputElement>('#file')!;
const video = document.querySelector<HTMLVideoElement>('#video')!;
const playBtn = document.querySelector<HTMLButtonElement>('#play')!;
const pauseBtn = document.querySelector<HTMLButtonElement>('#pause')!;
const sampleBtn = document.querySelector<HTMLButtonElement>('#sample')!;
const autoCheckbox = document.querySelector<HTMLInputElement>('#auto')!;
const heatmap = document.querySelector<HTMLCanvasElement>('#heatmap')!;
const gpuStatus = document.querySelector<HTMLDivElement>('#gpu-status')!;
const logEl = document.querySelector<HTMLDivElement>('#log')!;
const verdictEl = document.querySelector<HTMLDivElement>('#verdict')!;
const bitdepthEl = document.querySelector<HTMLDivElement>('#bitdepth')!;
const stepInfoEl = document.querySelector<HTMLDivElement>('#step-info')!;

heatmap.width = SAMPLE_W;
heatmap.height = SAMPLE_H;

function log(message: string): void {
  const ts = new Date().toISOString().slice(11, 23);
  logEl.textContent = `[${ts}] ${message}\n${logEl.textContent ?? ''}`.slice(0, 8000);
}

function fmt(value: number, digits = 5): string {
  if (!Number.isFinite(value)) return 'n/a';
  return value.toFixed(digits);
}

const WGSL_SHADER = /* wgsl */ `
struct VsOut {
  @builtin(position) position: vec4f,
  @location(0) uv: vec2f,
};

@vertex
fn vs(@builtin(vertex_index) idx: u32) -> VsOut {
  var positions = array<vec2f, 3>(
    vec2f(-1.0, -1.0),
    vec2f( 3.0, -1.0),
    vec2f(-1.0,  3.0),
  );
  let p = positions[idx];
  var out: VsOut;
  out.position = vec4f(p, 0.0, 1.0);
  out.uv = vec2f((p.x + 1.0) * 0.5, 1.0 - (p.y + 1.0) * 0.5);
  return out;
}

@group(0) @binding(0) var tex: texture_external;
@group(0) @binding(1) var samp: sampler;

@fragment
fn fs(in: VsOut) -> @location(0) vec4f {
  let c = textureSampleBaseClampToEdge(tex, samp, in.uv);
  return c;
}
`;

class SpikeRunner {
  private device: GPUDevice | null = null;
  private pipeline: GPURenderPipeline | null = null;
  private sampler: GPUSampler | null = null;
  private offscreen: GPUTexture | null = null;
  private readback: GPUBuffer | null = null;
  private bytesPerRow = 0;
  private rvfcHandle: number | null = null;

  async init(): Promise<void> {
    if (!navigator.gpu) {
      gpuStatus.textContent = 'WebGPU not available in this browser';
      gpuStatus.style.color = '#f99';
      return;
    }
    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) {
      gpuStatus.textContent = 'No GPU adapter returned by navigator.gpu';
      gpuStatus.style.color = '#f99';
      return;
    }
    this.device = await adapter.requestDevice();
    gpuStatus.textContent = `device ready · adapter ${adapter.info?.vendor ?? 'unknown'} ${adapter.info?.architecture ?? ''}`;
    gpuStatus.style.color = '#9f9';

    const module = this.device.createShaderModule({ code: WGSL_SHADER });
    this.pipeline = this.device.createRenderPipeline({
      layout: 'auto',
      vertex: { module, entryPoint: 'vs' },
      fragment: {
        module,
        entryPoint: 'fs',
        targets: [{ format: 'rgba16float' }],
      },
      primitive: { topology: 'triangle-list' },
    });

    this.sampler = this.device.createSampler({ magFilter: 'nearest', minFilter: 'nearest' });

    this.offscreen = this.device.createTexture({
      size: { width: SAMPLE_W, height: SAMPLE_H, depthOrArrayLayers: 1 },
      format: 'rgba16float',
      usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC,
    });

    const bytesPerPixel = 8;
    const rawRowBytes = SAMPLE_W * bytesPerPixel;
    this.bytesPerRow = Math.ceil(rawRowBytes / 256) * 256;
    this.readback = this.device.createBuffer({
      size: this.bytesPerRow * SAMPLE_H,
      usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
    });
  }

  async sampleCurrentFrame(): Promise<FrameStats | null> {
    if (!this.device || !this.pipeline || !this.sampler || !this.offscreen || !this.readback) {
      log('device not ready');
      return null;
    }
    if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
      log('video has no current frame yet');
      return null;
    }

    const externalTexture = this.device.importExternalTexture({ source: video });
    const bindGroup = this.device.createBindGroup({
      layout: this.pipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: externalTexture },
        { binding: 1, resource: this.sampler },
      ],
    });

    const encoder = this.device.createCommandEncoder();
    const pass = encoder.beginRenderPass({
      colorAttachments: [
        {
          view: this.offscreen.createView(),
          clearValue: { r: 0, g: 0, b: 0, a: 1 },
          loadOp: 'clear',
          storeOp: 'store',
        },
      ],
    });
    pass.setPipeline(this.pipeline);
    pass.setBindGroup(0, bindGroup);
    pass.draw(3);
    pass.end();

    encoder.copyTextureToBuffer(
      { texture: this.offscreen },
      { buffer: this.readback, bytesPerRow: this.bytesPerRow, rowsPerImage: SAMPLE_H },
      { width: SAMPLE_W, height: SAMPLE_H, depthOrArrayLayers: 1 },
    );

    this.device.queue.submit([encoder.finish()]);

    await this.readback.mapAsync(GPUMapMode.READ);
    const mapped = this.readback.getMappedRange();
    const copy = new ArrayBuffer(mapped.byteLength);
    new Uint8Array(copy).set(new Uint8Array(mapped));
    this.readback.unmap();

    const pixels = unpackRgba16f(copy, this.bytesPerRow, SAMPLE_W, SAMPLE_H);
    const canvasPixels = readCanvasPixels();
    const stats = computeStats(pixels, SAMPLE_W, SAMPLE_H, canvasPixels);
    paintHeatmap(pixels, SAMPLE_W, SAMPLE_H, stats);
    return stats;
  }

  startRvfcLoop(handler: () => void): void {
    if (!('requestVideoFrameCallback' in video)) {
      log('requestVideoFrameCallback unavailable; falling back to no auto loop');
      return;
    }
    const tick = (): void => {
      handler();
      if (autoCheckbox.checked) {
        this.rvfcHandle = video.requestVideoFrameCallback(tick);
      } else {
        this.rvfcHandle = null;
      }
    };
    this.rvfcHandle = video.requestVideoFrameCallback(tick);
  }

  stopRvfcLoop(): void {
    if (this.rvfcHandle !== null) {
      video.cancelVideoFrameCallback(this.rvfcHandle);
      this.rvfcHandle = null;
    }
  }
}

function unpackRgba16f(
  buffer: ArrayBuffer,
  bytesPerRow: number,
  width: number,
  height: number,
): Float32Array {
  const out = new Float32Array(width * height * 4);
  const view = new DataView(buffer);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const srcOffset = y * bytesPerRow + x * 8;
      const dstOffset = (y * width + x) * 4;
      for (let c = 0; c < 4; c++) {
        const half = view.getUint16(srcOffset + c * 2, true);
        out[dstOffset + c] = halfToFloat(half);
      }
    }
  }
  return out;
}

function readCanvasPixels(): Uint8ClampedArray | null {
  const canvas = document.createElement('canvas');
  canvas.width = SAMPLE_W;
  canvas.height = SAMPLE_H;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(video, 0, 0, SAMPLE_W, SAMPLE_H);
  return ctx.getImageData(0, 0, SAMPLE_W, SAMPLE_H).data;
}

function halfToFloat(h: number): number {
  const s = (h & 0x8000) >> 15;
  const e = (h & 0x7C00) >> 10;
  const f = h & 0x03FF;
  if (e === 0) {
    return (s ? -1 : 1) * Math.pow(2, -14) * (f / 1024);
  }
  if (e === 0x1F) {
    return f ? Number.NaN : (s ? -1 : 1) * Number.POSITIVE_INFINITY;
  }
  return (s ? -1 : 1) * Math.pow(2, e - 15) * (1 + f / 1024);
}

function computeStats(
  pixels: Float32Array,
  width: number,
  height: number,
  canvasPixels: Uint8ClampedArray | null,
): FrameStats {
  const channels: ChannelStats[] = [
    { min: Infinity, max: -Infinity, mean: 0, smallestStep: Infinity },
    { min: Infinity, max: -Infinity, mean: 0, smallestStep: Infinity },
    { min: Infinity, max: -Infinity, mean: 0, smallestStep: Infinity },
  ];

  const total = width * height;
  for (let c = 0; c < 3; c++) {
    let sum = 0;
    for (let i = 0; i < total; i++) {
      const v = pixels[i * 4 + c]!;
      const ch = channels[c]!;
      if (v < ch.min) ch.min = v;
      if (v > ch.max) ch.max = v;
      sum += v;
    }
    channels[c]!.mean = sum / total;
  }

  for (let c = 0; c < 3; c++) {
    channels[c]!.smallestStep = estimateSmallestStep(pixels, total, c);
  }

  const allSteps = [channels[0]!.smallestStep, channels[1]!.smallestStep, channels[2]!.smallestStep]
    .filter((s) => Number.isFinite(s) && s > 0)
    .sort((a, b) => a - b);
  const inferredStep = allSteps[0] ?? Number.NaN;
  const inferredBitDepth = inferredStep > 0 ? Math.round(Math.log2(1 / inferredStep)) : Number.NaN;

  return {
    width,
    height,
    r: channels[0]!,
    g: channels[1]!,
    b: channels[2]!,
    curve: analyzeRampRow(pixels, canvasPixels, width, height),
    inferredBitDepth,
    inferredStep,
  };
}

function estimateSmallestStep(pixels: Float32Array, total: number, channel: number): number {
  const sample: number[] = [];
  const stride = Math.max(1, Math.floor(total / 4096));
  for (let i = 0; i < total; i += stride) {
    const v = pixels[i * 4 + channel]!;
    if (Number.isFinite(v)) sample.push(v);
  }
  if (sample.length < 2) return Number.NaN;
  sample.sort((a, b) => a - b);
  let smallest = Infinity;
  for (let i = 1; i < sample.length; i++) {
    const d = sample[i]! - sample[i - 1]!;
    if (d > 1e-6 && d < smallest) smallest = d;
  }
  return smallest;
}

function paintHeatmap(
  pixels: Float32Array,
  width: number,
  height: number,
  stats: FrameStats,
): void {
  const ctx = heatmap.getContext('2d');
  if (!ctx) return;
  const img = ctx.createImageData(width, height);
  const ref = Math.max(stats.inferredStep, 1 / 1024);
  for (let i = 0; i < width * height; i++) {
    const r = pixels[i * 4 + 0]!;
    const g = pixels[i * 4 + 1]!;
    const b = pixels[i * 4 + 2]!;
    const luma = 0.2627 * r + 0.678 * g + 0.0593 * b;
    const normalized = Math.max(0, Math.min(1, luma));
    const heat = falsecolor(normalized);
    const isStepBoundary = Math.abs(Math.round(luma / ref) * ref - luma) < ref * 0.05;
    const baseIdx = i * 4;
    img.data[baseIdx + 0] = isStepBoundary ? 255 : heat[0];
    img.data[baseIdx + 1] = isStepBoundary ? 0 : heat[1];
    img.data[baseIdx + 2] = isStepBoundary ? 0 : heat[2];
    img.data[baseIdx + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
}

function falsecolor(t: number): [number, number, number] {
  const r = Math.round(255 * Math.max(0, Math.min(1, 1.5 - Math.abs(4 * t - 3))));
  const g = Math.round(255 * Math.max(0, Math.min(1, 1.5 - Math.abs(4 * t - 2))));
  const b = Math.round(255 * Math.max(0, Math.min(1, 1.5 - Math.abs(4 * t - 1))));
  return [r, g, b];
}

function renderStats(stats: FrameStats): void {
  const set = (id: string, v: string): void => {
    const el = document.querySelector<HTMLDivElement>(`#${id}`);
    if (el) el.textContent = v;
  };
  set('r-min', fmt(stats.r.min));
  set('r-max', fmt(stats.r.max));
  set('r-mean', fmt(stats.r.mean));
  set('g-min', fmt(stats.g.min));
  set('g-max', fmt(stats.g.max));
  set('g-mean', fmt(stats.g.mean));
  set('b-min', fmt(stats.b.min));
  set('b-max', fmt(stats.b.max));
  set('b-mean', fmt(stats.b.mean));
  bitdepthEl.textContent = Number.isFinite(stats.inferredBitDepth)
    ? `~${stats.inferredBitDepth} bits per channel`
    : 'undetermined';
  stepInfoEl.textContent = Number.isFinite(stats.inferredStep)
    ? `smallest observed step ≈ ${stats.inferredStep.toExponential(3)} (R ${stats.r.smallestStep.toExponential(2)} · G ${stats.g.smallestStep.toExponential(2)} · B ${stats.b.smallestStep.toExponential(2)})`
    : 'insufficient samples';

  verdictEl.classList.remove('pass', 'fail', 'neutral');
  if (!Number.isFinite(stats.inferredBitDepth)) {
    verdictEl.classList.add('neutral');
    verdictEl.textContent = 'inconclusive — sample more frames';
  } else if (stats.inferredBitDepth >= 10) {
    verdictEl.classList.add('pass');
    verdictEl.textContent = 'PASS — precision consistent with ≥10-bit source';
  } else if (stats.inferredBitDepth >= 9) {
    verdictEl.classList.add('neutral');
    verdictEl.textContent = 'BORDERLINE — re-sample on a frame with smooth gradients';
  } else {
    verdictEl.classList.add('fail');
    verdictEl.textContent = 'FAIL — precision looks 8-bit; Chrome likely quantized the texture';
  }
}

function renderCurve(stats: FrameStats): void {
  const bestEl = document.querySelector<HTMLDivElement>('#curve-best');
  const fitEl = document.querySelector<HTMLDivElement>('#curve-table');
  const sampleEl = document.querySelector<HTMLDivElement>('#row-samples');
  if (!bestEl || !fitEl || !sampleEl || !stats.curve) return;
  const best = stats.curve.best;
  bestEl.textContent = best
    ? `${best.name} · RMSE ${best.rmse.toExponential(3)} · y≈${best.slope.toFixed(3)}x${best.intercept >= 0 ? '+' : ''}${best.intercept.toFixed(3)}`
    : 'inconclusive';
  fitEl.textContent = stats.curve.fits
    .map(
      (fit) =>
        `${fit.name.padEnd(24)} rmse=${fit.rmse.toExponential(3)} max=${fit.maxError.toExponential(3)} slope=${fit.slope.toFixed(3)} intercept=${fit.intercept.toFixed(3)}`,
    )
    .join('\n');
  sampleEl.textContent = stats.curve.samples
    .map(
      (sample) =>
        `x=${sample.x.toString().padStart(3)} expected=${sample.expected.toFixed(4)} gpu=${sample.observed.toFixed(4)} canvas=${sample.canvas === null ? 'n/a' : sample.canvas.toFixed(4)}`,
    )
    .join('\n');
}

const runner = new SpikeRunner();
await runner.init();

async function sampleAndRender(): Promise<void> {
  try {
    const stats = await runner.sampleCurrentFrame();
    if (stats) {
      renderStats(stats);
      renderCurve(stats);
      log(
        `sampled · bits≈${stats.inferredBitDepth} · step ${fmt(stats.inferredStep, 6)} · R[${fmt(stats.r.min, 3)}…${fmt(stats.r.max, 3)}]`,
      );
    }
  } catch (err) {
    log(`sample failed: ${(err as Error).message}`);
  }
}

fileInput.addEventListener('change', () => {
  const file = fileInput.files?.[0];
  if (!file) return;
  const url = URL.createObjectURL(file);
  video.src = url;
  sampleBtn.disabled = false;
  log(`loaded ${file.name} (${(file.size / 1e6).toFixed(1)} MB)`);
});

playBtn.addEventListener('click', () => {
  void video.play();
});

pauseBtn.addEventListener('click', () => {
  video.pause();
});

sampleBtn.addEventListener('click', () => {
  void sampleAndRender();
});

autoCheckbox.addEventListener('change', () => {
  if (autoCheckbox.checked) {
    runner.startRvfcLoop(() => {
      void runner.sampleCurrentFrame().then((stats) => {
        if (stats) {
          renderStats(stats);
          renderCurve(stats);
        }
      });
    });
    log('auto-sample on');
  } else {
    runner.stopRvfcLoop();
    log('auto-sample off');
  }
});

video.addEventListener('error', () => {
  log(`video error: ${video.error?.message ?? 'unknown'}`);
});

const params = new URLSearchParams(window.location.search);
const source = params.get('src');
if (source) {
  video.src = source;
  sampleBtn.disabled = false;
  log(`loaded ${source}`);
  if (params.get('autosample') === '1') {
    video.addEventListener('loadeddata', () => void sampleAndRender(), { once: true });
  }
}
