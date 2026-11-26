/** Position in image pixels */
export type Point = [number, number];

/** Four corners in reading order: top-left, top-right, bottom-right, bottom-left (the box may be tilted) */
export type Quad = [Point, Point, Point, Point];

export interface OcrLine {
  /** Single-spaced, trimmed, never empty */
  text: string;
  /** Mean confidence 0..100, or null when the engine does not report one */
  conf: number | null;
  quad: Quad;
  /** Where each character starts and ends along the line, as fractions 0..1 (length text.length + 1), when the engine knows */
  charX?: number[];
}

/** What an engine read, with positions in the pixels of the image it was given */
export interface OcrResult {
  lines: OcrLine[];
  width: number;
  height: number;
}

export type EngineId = "tesseract" | "paddle" | "florence";

/** Image data without the DOM: what the pure parts of the engines work on */
export interface Rgba {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

export const ocrText = (r: OcrResult): string => r.lines.map((l) => l.text).join("\n");

/** Character-weighted mean confidence of a result, null when no line reports one */
export function ocrConfidence(r: OcrResult): number | null {
  let sum = 0;
  let weight = 0;
  for (const l of r.lines) {
    if (l.conf === null) continue;
    sum += l.conf * l.text.length;
    weight += l.text.length;
  }
  return weight > 0 ? sum / weight : null;
}

/** A loaded engine, ready to read photos until closed */
export interface EngineRuntime {
  /** `onProgress` gets 0..1 as the engine works, where it can tell; `fast` trades accuracy for speed (the live camera view) */
  recognise(canvas: HTMLCanvasElement, onProgress?: (fraction: number) => void, options?: { fast?: boolean }): Promise<OcrResult>;
  close(): Promise<void>;
}

/** The downloaded files of an engine, read back from Cache Storage and exposed as blobs and blob URLs */
export interface OpenAssets {
  has(name: string): boolean;
  blob(name: string): Blob;
  url(name: string): string;
  /** Free the blob URLs */
  revoke(): void;
}

/** What an engine's code (built to public/ocr/engine-<id>.mjs and loaded after its download) exports */
export interface EngineModule {
  open(files: OpenAssets): Promise<EngineRuntime>;
}
