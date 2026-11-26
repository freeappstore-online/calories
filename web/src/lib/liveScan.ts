import { laplacianVariance } from "./consensus";

/** Side of the greyscale thumbnail used to compare frames */
export const THUMB = 24;

/** Mean brightness change per pixel (0..255) between two thumbnails */
export function frameDifference(a: Uint8Array, b: Uint8Array): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += Math.abs(a[i]! - b[i]!);
  return sum / a.length;
}

/** Greyscale THUMB x THUMB copy of a canvas */
export function thumbnail(source: CanvasImageSource): Uint8Array {
  const c = document.createElement("canvas");
  c.width = THUMB;
  c.height = THUMB;
  const ctx = c.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(source, 0, 0, THUMB, THUMB);
  const rgba = ctx.getImageData(0, 0, THUMB, THUMB).data;
  const out = new Uint8Array(THUMB * THUMB);
  for (let i = 0; i < out.length; i++) out[i] = (rgba[i * 4]! * 77 + rgba[i * 4 + 1]! * 150 + rgba[i * 4 + 2]! * 29) >> 8;
  return out;
}

/** Longest side of the greyscale copy that sharpness is measured on */
const SHARPNESS_SIDE = 480;

/** Sharpness (variance of the Laplacian) of the middle of a frame, where the label is aimed */
export function measureSharpness(source: HTMLCanvasElement): number {
  const sw = source.width * 0.8;
  const sh = source.height * 0.8;
  const scale = Math.min(1, SHARPNESS_SIDE / Math.max(sw, sh));
  const w = Math.max(3, Math.round(sw * scale));
  const h = Math.max(3, Math.round(sh * scale));
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(source, source.width * 0.1, source.height * 0.1, sw, sh, 0, 0, w, h);
  const rgba = ctx.getImageData(0, 0, w, h).data;
  const grey = new Uint8Array(w * h);
  for (let i = 0; i < grey.length; i++) grey[i] = (rgba[i * 4]! * 77 + rgba[i * 4 + 1]! * 150 + rgba[i * 4 + 2]! * 29) >> 8;
  return laplacianVariance(grey, w, h);
}
