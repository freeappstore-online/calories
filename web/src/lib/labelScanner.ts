import { runChain, type Attempt } from "./ocr/chain";
import { ENGINES, openEngine, readyEngines } from "./ocr/engines";
import type { EngineId, EngineRuntime } from "./ocr/types";

/**
 * Label scanning on this device. Several open-source OCR models, each an optional download from Profile, are tried
 * in turn (fastest first) until one reads the nutrition table well. Nothing is fetched until the user taps Download;
 * the files then live in their own Cache Storage entries (never the PWA precache), so scanning works offline.
 */

export { OCR_CACHE } from "./ocr/assets";
export { useEngines } from "./ocr/engines";

/** Window event asking the app to show Profile at the Label scanner section */
export const OPEN_LABEL_SCANNER_EVENT = "calories:open-label-scanner";

/** A canvas no larger than needed: phone photos are 12 MP, far more than OCR benefits from, and small ones read better scaled up */
export function fitCanvas(source: CanvasImageSource, width: number, height: number): HTMLCanvasElement {
  const long = Math.max(width, height);
  const scale = long > 2200 ? 2200 / long : long < 1100 ? 2 : 1;
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);
  canvas.getContext("2d")!.drawImage(source, 0, 0, canvas.width, canvas.height);
  return canvas;
}

/** A photo file to the canvas that is read */
export async function photoToCanvas(file: Blob): Promise<HTMLCanvasElement> {
  if (file.type && !file.type.startsWith("image/")) throw new Error("That file is not a photo. Choose a picture of the label.");
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    throw new Error("This photo could not be opened (HEIC photos are not supported on every browser). Take the photo again or choose a JPEG or PNG.");
  }
  const canvas = fitCanvas(bitmap, bitmap.width, bitmap.height);
  bitmap.close();
  return canvas;
}

export interface ScanProgress {
  engine: EngineId;
  /** 0..1 within this engine, 0 while it loads */
  fraction: number;
}

/** Run the downloaded models on a photo in order, stopping at the first good read; `previous` continues an earlier scan */
export async function scanCanvas(
  canvas: HTMLCanvasElement,
  onProgress: (p: ScanProgress) => void,
  options: { previous?: Attempt[]; single?: boolean } = {},
): Promise<Attempt[]> {
  const ready = new Set(readyEngines());
  if (ready.size === 0) throw new Error("The label scanner is not downloaded.");
  const attempts = await runChain({
    ready,
    previous: options.previous,
    single: options.single,
    onStart: (engine) => onProgress({ engine, fraction: 0 }),
    recognise: async (engine) => {
      const runtime = await openEngine(engine);
      try {
        return await runtime.recognise(canvas, (fraction) => onProgress({ engine, fraction }));
      } finally {
        await runtime.close();
      }
    },
  });
  // Every engine failed to run: say so instead of showing nothing
  if (!attempts.some((a) => a.result)) throw new Error(attempts.find((a) => a.error)?.error ?? "The label scanner could not read this photo.");
  return attempts;
}

/** The fastest downloaded model that can keep up with a live camera view, opened and kept open until closed */
export async function openLiveEngine(): Promise<{ engine: EngineId; runtime: EngineRuntime } | null> {
  const id = readyEngines().find((e) => ENGINES[e].live);
  if (!id) return null;
  return { engine: id, runtime: await openEngine(id) };
}
