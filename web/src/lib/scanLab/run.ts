import { photoToCanvas } from "../labelScanner";
import { assess, type Attempt } from "../ocr/chain";
import { openEngine, readyEngines } from "../ocr/engines";
import type { EngineId } from "../ocr/types";
import { getJobState, updateJob } from "./jobState";
import { getItem, PHOTO_KINDS, updateItem, SMALL_PHOTO_MAX_BYTES, withRead, type LabItem, type LabPhoto, type LabRead, type PhotoKind } from "./store";

const toBlob = (canvas: HTMLCanvasElement, quality: number) =>
  new Promise<Blob>((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error("Could not keep the photo."))), "image/jpeg", quality));

/** A photo or camera frame ready to keep: the original, and a downscaled JPEG small enough to export and to send to an AI */
export async function makePhoto(source: Blob | HTMLCanvasElement): Promise<LabPhoto> {
  const original = source instanceof Blob ? source : await toBlob(source, 0.92);
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(original, { imageOrientation: "from-image" });
  } catch {
    throw new Error("This photo could not be opened (HEIC photos are not supported on every browser). Take the photo again or choose a JPEG or PNG.");
  }
  const { width, height } = bitmap;
  let side = Math.min(1600, Math.max(width, height));
  let small: Blob;
  for (;;) {
    const scale = side / Math.max(width, height);
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(width * scale));
    canvas.height = Math.max(1, Math.round(height * scale));
    canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    small = await toBlob(canvas, 0.82);
    if (small.size <= SMALL_PHOTO_MAX_BYTES || side <= 400) break;
    side = Math.round(side * 0.8);
  }
  bitmap.close();
  return { original, small, width, height };
}

// ── Running the models ──

/** Reads run one after another: each model is large, and two at once would run a phone out of memory */
let queue: Promise<unknown> = Promise.resolve();

/**
 * Read an item's photos with downloaded models (all of them, or one) and keep each result as soon as it arrives.
 * `only` limits the run to some photos, `skip` leaves out reads already made (used after "Save to scan lab").
 */
export function runItem(itemId: string, options: { engine?: EngineId; photos?: PhotoKind[]; skip?: LabRead[] } = {}): Promise<LabItem | undefined> {
  updateJob({ queued: getJobState().queued + 1 });
  const run = queue.then(async () => {
    try {
      const engines = options.engine ? [options.engine] : readyEngines();
      if (engines.length === 0) throw new Error("No scanner model is downloaded. In the app open Profile, Label scanner, and download PaddleOCR (or another model), then run again.");
      for (const photo of options.photos ?? PHOTO_KINDS) {
        const source = (await getItem(itemId))?.[photo]?.original;
        if (!source) continue;
        const canvas = await photoToCanvas(source);
        for (const engine of engines) {
          if (options.skip?.some((r) => r.photo === photo && r.engine === engine)) continue;
          updateJob({ job: { itemId, photo, engine, fraction: 0 } });
          const t0 = performance.now();
          let attempt: Attempt;
          try {
            const runtime = await openEngine(engine);
            try {
              attempt = assess(engine, await runtime.recognise(canvas, (fraction) => updateJob({ job: { itemId, photo, engine, fraction } })), performance.now() - t0);
            } finally {
              await runtime.close();
            }
          } catch (e) {
            attempt = { engine, ms: performance.now() - t0, confidence: null, good: false, error: e instanceof Error ? e.message : String(e) };
          }
          const saved = await updateItem(itemId, (i) => withRead(i, { photo, engine, ranAt: Date.now(), attempt }));
          if (!saved) return undefined; // deleted while running
        }
      }
      return getItem(itemId);
    } finally {
      const queued = getJobState().queued - 1;
      updateJob({ queued, ...(queued === 0 ? { job: null } : {}) });
    }
  });
  queue = run.catch(() => undefined);
  return run;
}
