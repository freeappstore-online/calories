/**
 * Clean a label photo for OCR: greyscale, adaptive threshold (so glare and shading do not matter), then remove the
 * table's ruled lines and box borders, which Tesseract otherwise reads as part of the text. Lines are found as ink
 * components far larger than any character, so tilted and perspective-skewed lines go too.
 */
export function cleanLabelCanvas(source: HTMLCanvasElement): HTMLCanvasElement {
  const { width: w, height: h } = source;
  const rgba = source.getContext("2d")!.getImageData(0, 0, w, h).data;
  const n = w * h;

  // Greyscale, and its integral image for local averages
  const grey = new Uint8Array(n);
  for (let i = 0; i < n; i++) grey[i] = (rgba[i * 4]! * 77 + rgba[i * 4 + 1]! * 150 + rgba[i * 4 + 2]! * 29) >> 8;
  const iw = w + 1;
  const integral = new Float64Array(iw * (h + 1));
  for (let y = 0; y < h; y++) {
    let row = 0;
    for (let x = 0; x < w; x++) {
      row += grey[y * w + x]!;
      integral[(y + 1) * iw + x + 1] = integral[y * iw + x + 1]! + row;
    }
  }

  // Ink = clearly darker than its neighbourhood
  const half = Math.max(8, Math.round(Math.max(w, h) / 48));
  const ink = new Uint8Array(n);
  for (let y = 0; y < h; y++) {
    const y0 = Math.max(0, y - half);
    const y1 = Math.min(h, y + half + 1);
    for (let x = 0; x < w; x++) {
      const x0 = Math.max(0, x - half);
      const x1 = Math.min(w, x + half + 1);
      const sum = integral[y1 * iw + x1]! - integral[y0 * iw + x1]! - integral[y1 * iw + x0]! + integral[y0 * iw + x0]!;
      const mean = sum / ((x1 - x0) * (y1 - y0));
      if (grey[y * w + x]! < mean * 0.86 - 6) ink[y * w + x] = 1;
    }
  }

  // Drop specks and anything line-like: components much longer than a character
  const maxLen = 0.22;
  const stack = new Int32Array(n);
  const seen = new Uint8Array(n);
  for (let start = 0; start < n; start++) {
    if (!ink[start] || seen[start]) continue;
    let top = 0;
    stack[top++] = start;
    seen[start] = 1;
    const members: number[] = [];
    let x0 = w, x1 = 0, y0 = h, y1 = 0;
    while (top > 0) {
      const p = stack[--top]!;
      members.push(p);
      const x = p % w;
      const y = (p - x) / w;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          const q = ny * w + nx;
          if (ink[q] && !seen[q]) {
            seen[q] = 1;
            stack[top++] = q;
          }
        }
      }
    }
    const tooSmall = members.length < 4;
    const lineLike = x1 - x0 > maxLen * w || y1 - y0 > maxLen * h;
    if (tooSmall || lineLike) for (const p of members) ink[p] = 0;
  }

  const out = document.createElement("canvas");
  out.width = w;
  out.height = h;
  const ctx = out.getContext("2d")!;
  const img = ctx.createImageData(w, h);
  for (let i = 0; i < n; i++) {
    const v = ink[i] ? 0 : 255;
    img.data[i * 4] = v;
    img.data[i * 4 + 1] = v;
    img.data[i * 4 + 2] = v;
    img.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return out;
}
