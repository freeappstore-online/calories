import { energyAgrees, KEY_FIELDS } from "./ocr/chain";
import type { LabelField, LabelScan } from "./labelParser";

/** What the live view has seen in one frame: the key values it could read, and a tiny greyscale copy to tell if the phone is steady */
export interface LiveFrame {
  values: Partial<Record<LabelField, number>>;
  thumb: Uint8Array;
}

/** Side of the greyscale thumbnail used to compare frames */
export const THUMB = 24;

/** Mean brightness change per pixel (0..255) between two thumbnails */
export function frameDifference(a: Uint8Array, b: Uint8Array): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += Math.abs(a[i]! - b[i]!);
  return sum / a.length;
}

/** The four key values a scan has read so far */
export const keyValues = (scan: LabelScan): Partial<Record<LabelField, number>> =>
  Object.fromEntries(KEY_FIELDS.filter((f) => scan.values[f] !== undefined).map((f) => [f, scan.values[f]!]));

/** Frames in a row that must agree before auto-capture fires, and the most the picture may change between them */
export const STEADY_FRAMES = 2;
export const STEADY_DIFFERENCE = 6;

/**
 * Auto-capture when the last few frames all read the same four key values, which add up, and the picture hardly changed
 * between them (so the label is in focus and the phone is held still).
 */
export function readyToCapture(frames: LiveFrame[]): boolean {
  if (frames.length < STEADY_FRAMES) return false;
  const recent = frames.slice(-STEADY_FRAMES);
  const first = recent[0]!;
  if (!KEY_FIELDS.every((f) => first.values[f] !== undefined) || !energyAgrees(first.values)) return false;
  return recent.every((f, i) => KEY_FIELDS.every((k) => f.values[k] === first.values[k]) && (i === 0 || frameDifference(recent[i - 1]!.thumb, f.thumb) <= STEADY_DIFFERENCE));
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
