import type {
  RasterSeparationMode,
  StudioLayer,
  StudioProject,
} from '../types/studio';

function uid(prefix = 'ras'): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 9)}`;
}

function rgbToHex(r: number, g: number, b: number): string {
  const h = (n: number) =>
    Math.max(0, Math.min(255, Math.round(n)))
      .toString(16)
      .padStart(2, '0')
      .toUpperCase();
  return `#${h(r)}${h(g)}${h(b)}`;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Gagal memuat gambar untuk diproses.'));
    img.src = src;
  });
}

export function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Gagal membaca file gambar.'));
    reader.readAsDataURL(file);
  });
}

export interface RasterSeparationOptions {
  mode: RasterSeparationMode;
  colorCount: number; // 2..8
  bgTolerance: number; // 10..90
}

export async function separateRasterToProject(
  imageDataUrl: string,
  fileName: string,
  options: RasterSeparationOptions = {
    mode: 'objects',
    colorCount: 4,
    bgTolerance: 36,
  }
): Promise<StudioProject> {
  const img = await loadImage(imageDataUrl);
  const maxDim = 900;
  const scale = Math.min(1, maxDim / Math.max(img.naturalWidth || 1, img.naturalHeight || 1));
  const w = Math.max(1, Math.round((img.naturalWidth || 256) * scale));
  const h = Math.max(1, Math.round((img.naturalHeight || 256) * scale));

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', {willReadFrequently: true});
  if (!ctx) {
    throw new Error('Canvas 2D tidak tersedia di browser.');
  }

  ctx.drawImage(img, 0, 0, w, h);
  const imgData = ctx.getImageData(0, 0, w, h);
  const data = imgData.data;
  const totalPixels = w * h;

  // Detect whether the image already has meaningful alpha transparency
  let transparentCount = 0;
  for (let i = 3; i < data.length; i += 4) {
    if (data[i] < 220) transparentCount++;
  }
  const hasAlphaChannel = transparentCount > totalPixels * 0.02;

  // Sample corners to estimate solid background if no alpha channel
  const cornerIndices = [
    0,
    (w - 1) * 4,
    (h - 1) * w * 4,
    ((h - 1) * w + (w - 1)) * 4,
  ];
  let bgR = 255;
  let bgG = 255;
  let bgB = 255;
  if (!hasAlphaChannel) {
    let sr = 0;
    let sg = 0;
    let sb = 0;
    for (const idx of cornerIndices) {
      sr += data[idx];
      sg += data[idx + 1];
      sb += data[idx + 2];
    }
    bgR = sr / 4;
    bgG = sg / 4;
    bgB = sb / 4;
  }

  const tolSq = options.bgTolerance * options.bgTolerance * 3;
  const foregroundMask = new Uint8Array(totalPixels);
  let fgCount = 0;

  for (let p = 0; p < totalPixels; p++) {
    const i = p * 4;
    const a = data[i + 3];
    if (hasAlphaChannel) {
      if (a > 24) {
        foregroundMask[p] = 1;
        fgCount++;
      }
    } else {
      if (a > 24) {
        const dr = data[i] - bgR;
        const dg = data[i + 1] - bgG;
        const db = data[i + 2] - bgB;
        if (dr * dr + dg * dg + db * db > tolSq) {
          foregroundMask[p] = 1;
          fgCount++;
        }
      }
    }
  }

  // Fallback: if background subtraction removed almost everything, treat full opaque image as foreground
  if (fgCount < Math.max(16, totalPixels * 0.005)) {
    for (let p = 0; p < totalPixels; p++) {
      if (data[p * 4 + 3] > 24) {
        foregroundMask[p] = 1;
      }
    }
  }

  const layers: StudioLayer[] = [];

  if (options.mode === 'objects') {
    const visited = new Uint8Array(totalPixels);
    const queue = new Int32Array(totalPixels);

    interface ComponentInfo {
      pixels: number[];
      minX: number;
      minY: number;
      maxX: number;
      maxY: number;
      sumR: number;
      sumG: number;
      sumB: number;
    }

    const components: ComponentInfo[] = [];
    const minArea = Math.max(16, Math.floor(totalPixels * 0.0005));

    for (let p = 0; p < totalPixels; p++) {
      if (!foregroundMask[p] || visited[p]) continue;

      let head = 0;
      let tail = 0;
      queue[tail++] = p;
      visited[p] = 1;

      const compPixels: number[] = [];
      let minX = w;
      let minY = h;
      let maxX = 0;
      let maxY = 0;
      let sumR = 0;
      let sumG = 0;
      let sumB = 0;

      while (head < tail) {
        const cur = queue[head++];
        compPixels.push(cur);

        const cx = cur % w;
        const cy = (cur - cx) / w;
        if (cx < minX) minX = cx;
        if (cx > maxX) maxX = cx;
        if (cy < minY) minY = cy;
        if (cy > maxY) maxY = cy;

        const di = cur * 4;
        sumR += data[di];
        sumG += data[di + 1];
        sumB += data[di + 2];

        // 8-connected neighbors for clean region grouping
        for (let dy = -1; dy <= 1; dy++) {
          const ny = cy + dy;
          if (ny < 0 || ny >= h) continue;
          for (let dx = -1; dx <= 1; dx++) {
            if (dx === 0 && dy === 0) continue;
            const nx = cx + dx;
            if (nx < 0 || nx >= w) continue;
            const np = ny * w + nx;
            if (foregroundMask[np] && !visited[np]) {
              visited[np] = 1;
              queue[tail++] = np;
            }
          }
        }
      }

      if (compPixels.length >= minArea) {
        components.push({
          pixels: compPixels,
          minX,
          minY,
          maxX,
          maxY,
          sumR,
          sumG,
          sumB,
        });
      }
    }

    components.sort((a, b) => b.pixels.length - a.pixels.length);
    const capped = components.slice(0, 28);

    capped.forEach((comp, idx) => {
      const cw = comp.maxX - comp.minX + 1;
      const ch = comp.maxY - comp.minY + 1;
      const outCanvas = document.createElement('canvas');
      outCanvas.width = cw;
      outCanvas.height = ch;
      const outCtx = outCanvas.getContext('2d');
      if (!outCtx) return;

      const outImg = outCtx.createImageData(cw, ch);
      const outData = outImg.data;

      for (const p of comp.pixels) {
        const px = p % w;
        const py = (p - px) / w;
        const lx = px - comp.minX;
        const ly = py - comp.minY;
        const srcIdx = p * 4;
        const dstIdx = (ly * cw + lx) * 4;
        outData[dstIdx] = data[srcIdx];
        outData[dstIdx + 1] = data[srcIdx + 1];
        outData[dstIdx + 2] = data[srcIdx + 2];
        outData[dstIdx + 3] = data[srcIdx + 3];
      }

      outCtx.putImageData(outImg, 0, 0);
      const count = comp.pixels.length || 1;
      const avgHex = rgbToHex(
        comp.sumR / count,
        comp.sumG / count,
        comp.sumB / count
      );

      layers.push({
        id: uid('obj'),
        name: `Area Objek ${String(idx + 1).padStart(2, '0')}`,
        type: 'raster',
        sourceTag: 'raster-object',
        isVector: false,
        visible: true,
        locked: false,
        x: comp.minX,
        y: comp.minY,
        width: cw,
        height: ch,
        origWidth: cw,
        origHeight: ch,
        rotation: 0,
        opacity: 1,
        fill: avgHex,
        stroke: 'none',
        strokeWidth: 0,
        rasterDataUrl: outCanvas.toDataURL('image/png'),
      });
    });
  } else {
    // Color quantization k-means clustering
    const k = Math.max(2, Math.min(8, Math.round(options.colorCount)));
    const samplePixels: number[] = [];
    const stride = Math.max(1, Math.floor(totalPixels / 6000));
    for (let p = 0; p < totalPixels; p += stride) {
      if (foregroundMask[p]) samplePixels.push(p);
    }

    if (samplePixels.length > 0) {
      // Deterministic initial centroids spaced across sample array
      const centroids: Array<[number, number, number]> = [];
      for (let c = 0; c < k; c++) {
        const sp = samplePixels[Math.floor((c * samplePixels.length) / k)];
        const di = sp * 4;
        centroids.push([data[di], data[di + 1], data[di + 2]]);
      }

      for (let iter = 0; iter < 8; iter++) {
        const sums = Array.from({length: k}, () => [0, 0, 0, 0]);
        for (const sp of samplePixels) {
          const di = sp * 4;
          const r = data[di];
          const g = data[di + 1];
          const b = data[di + 2];
          let bestIdx = 0;
          let bestDist = Infinity;
          for (let c = 0; c < k; c++) {
            const dr = r - centroids[c][0];
            const dg = g - centroids[c][1];
            const db = b - centroids[c][2];
            const d = dr * dr + dg * dg + db * db;
            if (d < bestDist) {
              bestDist = d;
              bestIdx = c;
            }
          }
          sums[bestIdx][0] += r;
          sums[bestIdx][1] += g;
          sums[bestIdx][2] += b;
          sums[bestIdx][3] += 1;
        }
        for (let c = 0; c < k; c++) {
          if (sums[c][3] > 0) {
            centroids[c] = [
              sums[c][0] / sums[c][3],
              sums[c][1] / sums[c][3],
              sums[c][2] / sums[c][3],
            ];
          }
        }
      }

      // Assign all foreground pixels to nearest centroid
      const clusterPixels: number[][] = Array.from({length: k}, () => []);
      const bounds = Array.from({length: k}, () => ({
        minX: w,
        minY: h,
        maxX: -1,
        maxY: -1,
      }));

      for (let p = 0; p < totalPixels; p++) {
        if (!foregroundMask[p]) continue;
        const di = p * 4;
        const r = data[di];
        const g = data[di + 1];
        const b = data[di + 2];
        let bestIdx = 0;
        let bestDist = Infinity;
        for (let c = 0; c < k; c++) {
          const dr = r - centroids[c][0];
          const dg = g - centroids[c][1];
          const db = b - centroids[c][2];
          const d = dr * dr + dg * dg + db * db;
          if (d < bestDist) {
            bestDist = d;
            bestIdx = c;
          }
        }
        clusterPixels[bestIdx].push(p);
        const px = p % w;
        const py = (p - px) / w;
        if (px < bounds[bestIdx].minX) bounds[bestIdx].minX = px;
        if (px > bounds[bestIdx].maxX) bounds[bestIdx].maxX = px;
        if (py < bounds[bestIdx].minY) bounds[bestIdx].minY = py;
        if (py > bounds[bestIdx].maxY) bounds[bestIdx].maxY = py;
      }

      centroids.forEach((centroid, idx) => {
        const pix = clusterPixels[idx];
        const b = bounds[idx];
        if (pix.length < 12 || b.maxX < b.minX) return;

        const cw = b.maxX - b.minX + 1;
        const ch = b.maxY - b.minY + 1;
        const outCanvas = document.createElement('canvas');
        outCanvas.width = cw;
        outCanvas.height = ch;
        const outCtx = outCanvas.getContext('2d');
        if (!outCtx) return;

        const outImg = outCtx.createImageData(cw, ch);
        const outData = outImg.data;
        for (const p of pix) {
          const px = p % w;
          const py = (p - px) / w;
          const lx = px - b.minX;
          const ly = py - b.minY;
          const srcIdx = p * 4;
          const dstIdx = (ly * cw + lx) * 4;
          outData[dstIdx] = data[srcIdx];
          outData[dstIdx + 1] = data[srcIdx + 1];
          outData[dstIdx + 2] = data[srcIdx + 2];
          outData[dstIdx + 3] = data[srcIdx + 3];
        }
        outCtx.putImageData(outImg, 0, 0);
        const hex = rgbToHex(centroid[0], centroid[1], centroid[2]);

        layers.push({
          id: uid('clr'),
          name: `Klaster Warna ${hex}`,
          type: 'raster',
          sourceTag: 'raster-color',
          isVector: false,
          visible: true,
          locked: false,
          x: b.minX,
          y: b.minY,
          width: cw,
          height: ch,
          origWidth: cw,
          origHeight: ch,
          rotation: 0,
          opacity: 1,
          fill: hex,
          stroke: 'none',
          strokeWidth: 0,
          rasterDataUrl: outCanvas.toDataURL('image/png'),
        });
      });
    }
  }

  // Fallback single raster layer if segmentation yielded nothing
  if (layers.length === 0) {
    layers.push({
      id: uid('img'),
      name: 'Gambar Utuh (Raster)',
      type: 'raster',
      sourceTag: 'raster-full',
      isVector: false,
      visible: true,
      locked: false,
      x: 0,
      y: 0,
      width: w,
      height: h,
      origWidth: w,
      origHeight: h,
      rotation: 0,
      opacity: 1,
      fill: '#94A3B8',
      stroke: 'none',
      strokeWidth: 0,
      rasterDataUrl: canvas.toDataURL('image/png'),
    });
  }

  const baseTitle = fileName.replace(/\.[^.]+$/, '') || 'Raster Image';

  return {
    title: baseTitle,
    width: w,
    height: h,
    fps: 60,
    totalTime: 5000,
    bgcolor: '#00000000',
    sourceFormat: 'raster',
    originalImageUrl: imageDataUrl,
    layers,
    warnings: [
      'Gambar raster (PNG/JPG/WEBP) dipisahkan berdasarkan area piksel atau klaster warna — bukan vector path asli. Anda tetap dapat mengatur posisi, ukuran, opacity, urutan layer, atau mengekspor XML referensi Alight Motion.',
    ],
  };
}
