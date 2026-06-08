import { encodeUltraHdr } from 'open-ultrahdr';

type StillId = 'clipped-sky' | 'specular' | 'flat-midtone';

interface StillDef {
  buildHdrLinear: (sdrRgba: Uint8ClampedArray, w: number, h: number) => Float32Array;
  hdrPeakStops: number;
  height: number;
  id: StillId;
  paintSdr: (ctx: CanvasRenderingContext2D, w: number, h: number) => void;
  width: number;
}

interface EncodedEntry {
  blob: Blob;
  hdrPeakStops: number;
  height: number;
  sdrBytes: number;
  width: number;
}

const encoded = new Map<StillId, EncodedEntry>();
const logEl = document.getElementById('log') as HTMLDivElement;
const statusEl = document.getElementById('status') as HTMLDivElement;

const stills: StillDef[] = [
  {
    id: 'clipped-sky',
    width: 640,
    height: 360,
    hdrPeakStops: 3,
    paintSdr: paintClippedSky,
    buildHdrLinear: buildClippedSkyHdr,
  },
  {
    id: 'specular',
    width: 640,
    height: 360,
    hdrPeakStops: 3,
    paintSdr: paintSpecular,
    buildHdrLinear: buildSpecularHdr,
  },
  {
    id: 'flat-midtone',
    width: 640,
    height: 360,
    hdrPeakStops: 0,
    paintSdr: paintFlatMidtone,
    buildHdrLinear: buildFlatMidtoneHdr,
  },
];

function log(msg: string, level: 'info' | 'warn' | 'err' = 'info'): void {
  const ts = new Date().toISOString().slice(11, 19);
  const prefix = level === 'err' ? '[ERR]' : level === 'warn' ? '[WRN]' : '[INF]';
  logEl.textContent = `${ts} ${prefix} ${msg}\n${logEl.textContent ?? ''}`.slice(0, 12000);
}

function setStatus(text: string, kind: 'ok' | 'err' | 'warn' | 'neutral'): void {
  statusEl.textContent = text;
  statusEl.className = `status ${kind}`;
}

function srgbToLinear(c: number): number {
  const x = c / 255;
  return x <= 0.04045 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
}

function paintClippedSky(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  const grd = ctx.createLinearGradient(0, 0, 0, h);
  grd.addColorStop(0, '#8ab8ff');
  grd.addColorStop(0.7, '#dfe9f5');
  grd.addColorStop(1, '#f2efe0');
  ctx.fillStyle = grd;
  ctx.fillRect(0, 0, w, h);

  ctx.fillStyle = '#3a4f3a';
  ctx.beginPath();
  ctx.moveTo(0, h * 0.78);
  ctx.lineTo(w * 0.2, h * 0.68);
  ctx.lineTo(w * 0.45, h * 0.74);
  ctx.lineTo(w * 0.7, h * 0.66);
  ctx.lineTo(w, h * 0.72);
  ctx.lineTo(w, h);
  ctx.lineTo(0, h);
  ctx.closePath();
  ctx.fill();

  const sunR = Math.min(w, h) * 0.07;
  const sunCx = w * 0.78;
  const sunCy = h * 0.28;
  const haloGrd = ctx.createRadialGradient(sunCx, sunCy, 0, sunCx, sunCy, sunR * 4.5);
  haloGrd.addColorStop(0, 'rgba(255,255,255,1)');
  haloGrd.addColorStop(0.25, 'rgba(255,250,235,0.85)');
  haloGrd.addColorStop(0.55, 'rgba(255,235,200,0.35)');
  haloGrd.addColorStop(1, 'rgba(255,200,150,0)');
  ctx.fillStyle = haloGrd;
  ctx.beginPath();
  ctx.arc(sunCx, sunCy, sunR * 4.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(sunCx, sunCy, sunR, 0, Math.PI * 2);
  ctx.fill();
}

function buildClippedSkyHdr(sdrRgba: Uint8ClampedArray, w: number, h: number): Float32Array {
  const out = new Float32Array(w * h * 3);
  const sunCx = w * 0.78;
  const sunCy = h * 0.28;
  const sunR = Math.min(w, h) * 0.07;
  const halo = sunR * 4.5;
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const i = (y * w + x) * 4;
      const j = (y * w + x) * 3;
      const r = sdrRgba[i] ?? 0;
      const g = sdrRgba[i + 1] ?? 0;
      const b = sdrRgba[i + 2] ?? 0;
      const lr = srgbToLinear(r);
      const lg = srgbToLinear(g);
      const lb = srgbToLinear(b);
      const dx = x - sunCx;
      const dy = y - sunCy;
      const d = Math.sqrt(dx * dx + dy * dy);
      let gain = 1;
      if (d < sunR) {
        gain = 8;
      } else if (d < halo) {
        const t = 1 - (d - sunR) / (halo - sunR);
        gain = 1 + t * 6;
      } else if (lr + lg + lb > 2.4) {
        gain = 2.2;
      }
      out[j] = lr * gain;
      out[j + 1] = lg * gain;
      out[j + 2] = lb * gain;
    }
  }
  return out;
}

function paintSpecular(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  const grd = ctx.createLinearGradient(0, 0, 0, h);
  grd.addColorStop(0, '#1d2530');
  grd.addColorStop(1, '#2c3a4a');
  ctx.fillStyle = grd;
  ctx.fillRect(0, 0, w, h);

  ctx.fillStyle = '#6b7280';
  ctx.fillRect(0, h * 0.55, w, h * 0.45);

  ctx.strokeStyle = 'rgba(160,170,180,0.4)';
  ctx.lineWidth = 1;
  for (let i = 0; i < 12; i += 1) {
    const y = h * 0.55 + (i / 12) * h * 0.45;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y + (i - 6) * 4);
    ctx.stroke();
  }

  const sCx = w * 0.42;
  const sCy = h * 0.6;
  const sR = 8;
  const halo = ctx.createRadialGradient(sCx, sCy, 0, sCx, sCy, sR * 8);
  halo.addColorStop(0, 'rgba(255,255,255,1)');
  halo.addColorStop(0.3, 'rgba(255,255,240,0.6)');
  halo.addColorStop(1, 'rgba(255,255,200,0)');
  ctx.fillStyle = halo;
  ctx.beginPath();
  ctx.arc(sCx, sCy, sR * 8, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(sCx, sCy, sR, 0, Math.PI * 2);
  ctx.fill();
}

function buildSpecularHdr(sdrRgba: Uint8ClampedArray, w: number, h: number): Float32Array {
  const out = new Float32Array(w * h * 3);
  const sCx = w * 0.42;
  const sCy = h * 0.6;
  const sR = 8;
  const halo = sR * 8;
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const i = (y * w + x) * 4;
      const j = (y * w + x) * 3;
      const lr = srgbToLinear(sdrRgba[i] ?? 0);
      const lg = srgbToLinear(sdrRgba[i + 1] ?? 0);
      const lb = srgbToLinear(sdrRgba[i + 2] ?? 0);
      const dx = x - sCx;
      const dy = y - sCy;
      const d = Math.sqrt(dx * dx + dy * dy);
      let gain = 1;
      if (d < sR) {
        gain = 7.5;
      } else if (d < halo) {
        const t = 1 - (d - sR) / (halo - sR);
        gain = 1 + t * 5.5;
      }
      out[j] = lr * gain;
      out[j + 1] = lg * gain;
      out[j + 2] = lb * gain;
    }
  }
  return out;
}

function paintFlatMidtone(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  const grd = ctx.createLinearGradient(0, 0, w, h);
  grd.addColorStop(0, '#7d8a72');
  grd.addColorStop(0.5, '#8c9882');
  grd.addColorStop(1, '#7a8870');
  ctx.fillStyle = grd;
  ctx.fillRect(0, 0, w, h);

  ctx.fillStyle = 'rgba(60,70,55,0.7)';
  ctx.font = '600 28px -apple-system, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('flat midtone — must match SDR', w / 2, h / 2);
}

function buildFlatMidtoneHdr(sdrRgba: Uint8ClampedArray, w: number, h: number): Float32Array {
  const out = new Float32Array(w * h * 3);
  for (let i = 0, j = 0; i < sdrRgba.length; i += 4, j += 3) {
    out[j] = srgbToLinear(sdrRgba[i] ?? 0);
    out[j + 1] = srgbToLinear(sdrRgba[i + 1] ?? 0);
    out[j + 2] = srgbToLinear(sdrRgba[i + 2] ?? 0);
  }
  return out;
}

function renderStillCanvas(def: StillDef): {
  canvas: HTMLCanvasElement;
  rgba: Uint8ClampedArray;
} {
  const canvas = document.getElementById(`canvas-${def.id}`) as HTMLCanvasElement;
  canvas.width = def.width;
  canvas.height = def.height;
  const ctx = canvas.getContext('2d', { colorSpace: 'srgb' });
  if (!ctx) throw new Error(`2D context unavailable for ${def.id}`);
  def.paintSdr(ctx, def.width, def.height);
  const imageData = ctx.getImageData(0, 0, def.width, def.height);
  return { canvas, rgba: imageData.data };
}

function canvasToJpegBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error('canvas.toBlob returned null'));
          return;
        }
        resolve(blob);
      },
      'image/jpeg',
      quality
    );
  });
}

async function encodeStill(def: StillDef): Promise<void> {
  const card = document.querySelector(`[data-id="${def.id}"]`) as HTMLElement | null;
  const downloadBtn = card?.querySelector('.download-btn') as HTMLButtonElement | null;
  const metaEl = document.getElementById(`meta-${def.id}`) as HTMLDivElement | null;

  setStatus(`encoding ${def.id}…`, 'neutral');
  log(`encode ${def.id}: rendering SDR canvas`);
  const { canvas, rgba } = renderStillCanvas(def);

  log(`encode ${def.id}: building linear HDR buffer`);
  const hdrLinear = def.buildHdrLinear(rgba, def.width, def.height);

  log(`encode ${def.id}: jpeg-compressing SDR base (q=0.95)`);
  const sdrJpegBlob = await canvasToJpegBlob(canvas, 0.95);
  const sdrJpegBuffer = await sdrJpegBlob.arrayBuffer();

  log(
    `encode ${def.id}: handing off to open-ultrahdr (sdr=${sdrJpegBuffer.byteLength}B, hdr=${hdrLinear.byteLength}B float32 linear)`
  );

  const t0 = performance.now();
  let outBuffer: ArrayBuffer;
  try {
    outBuffer = await encodeUltraHdr(def.id, sdrJpegBuffer, hdrLinear.buffer as ArrayBuffer, {
      baseQuality: 95,
      gainMapQuality: 90,
      targetHdrCapacity: Math.max(1, def.hdrPeakStops + 0.001),
      gainMapScale: 1,
    });
  } catch (err) {
    log(`encode ${def.id} failed: ${(err as Error).message}`, 'err');
    setStatus(`encode ${def.id} failed — see log`, 'err');
    throw err;
  }
  const dt = (performance.now() - t0).toFixed(0);

  const blob = new Blob([outBuffer], { type: 'image/jpeg' });
  encoded.set(def.id, {
    blob,
    width: def.width,
    height: def.height,
    sdrBytes: sdrJpegBuffer.byteLength,
    hdrPeakStops: def.hdrPeakStops,
  });

  if (downloadBtn) downloadBtn.disabled = false;
  if (metaEl) {
    metaEl.textContent =
      `dim:        ${def.width}x${def.height}\n` +
      `sdr jpeg:   ${sdrJpegBuffer.byteLength.toLocaleString()} B\n` +
      `ultra hdr:  ${outBuffer.byteLength.toLocaleString()} B\n` +
      `targetCap:  ${def.hdrPeakStops.toFixed(2)} stops\n` +
      `encode:     ${dt} ms`;
  }
  log(`encode ${def.id} done in ${dt} ms, output=${outBuffer.byteLength} bytes`);
  setStatus('encoder ok', 'ok');

  const downloadAllBtn = document.getElementById('download-all') as HTMLButtonElement | null;
  if (downloadAllBtn && encoded.size === stills.length) downloadAllBtn.disabled = false;
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

function wireUi(): void {
  for (const def of stills) {
    renderStillCanvas(def);
  }

  document.querySelectorAll<HTMLButtonElement>('.encode-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.id as StillId | undefined;
      if (!id) return;
      const def = stills.find((s) => s.id === id);
      if (!def) return;
      btn.disabled = true;
      try {
        await encodeStill(def);
      } finally {
        btn.disabled = false;
      }
    });
  });

  document.querySelectorAll<HTMLButtonElement>('.download-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.id as StillId | undefined;
      if (!id) return;
      const entry = encoded.get(id);
      if (!entry) return;
      downloadBlob(entry.blob, `spike-b-${id}.uhdr.jpg`);
    });
  });

  document.querySelectorAll<HTMLButtonElement>('.download-sdr-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.id as StillId | undefined;
      if (!id) return;
      const def = stills.find((s) => s.id === id);
      if (!def) return;
      const { canvas } = renderStillCanvas(def);
      const blob = await canvasToJpegBlob(canvas, 0.95);
      downloadBlob(blob, `spike-b-${id}.sdr.jpg`);
    });
  });

  const encodeAllBtn = document.getElementById('encode-all') as HTMLButtonElement;
  encodeAllBtn.addEventListener('click', async () => {
    encodeAllBtn.disabled = true;
    try {
      for (const def of stills) {
        await encodeStill(def);
      }
    } finally {
      encodeAllBtn.disabled = false;
    }
  });

  const downloadAllBtn = document.getElementById('download-all') as HTMLButtonElement;
  downloadAllBtn.addEventListener('click', () => {
    for (const [id, entry] of encoded) {
      downloadBlob(entry.blob, `spike-b-${id}.uhdr.jpg`);
    }
  });
}

wireUi();
log('spike B ready — click "Encode all three" to generate Ultra HDR JPEGs');
setStatus('ready', 'neutral');
