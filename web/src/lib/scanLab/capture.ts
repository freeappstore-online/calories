import { photoToCanvas, scanCanvas } from "../labelScanner";
import type { Attempt } from "../ocr/chain";
import { readyEngines } from "../ocr/engines";
import { suggestName } from "./accuracy";
import { makePhoto, runItem } from "./run";
import { createItem, type LabItem, type LabRead, type PhotoKind } from "./store";

/**
 * "Save to scan lab" from Create food: keep the photo that was just scanned, with what the models already read from
 * it, and read it with the rest of the downloaded models (and the front photo, when there is one) in the background.
 */
export async function saveScanToLab(nutrition: HTMLCanvasElement, attempts: Attempt[], name: string, front?: Blob): Promise<LabItem> {
  const reads: LabRead[] = attempts.map((attempt) => ({ photo: "nutrition" as PhotoKind, engine: attempt.engine, ranAt: Date.now(), attempt }));
  const item = await createItem(name, { nutrition: await makePhoto(nutrition), ...(front ? { front: await makePhoto(front) } : {}) }, reads);
  if (readyEngines().length > 0) void runItem(item.id, { skip: reads }).catch(() => undefined);
  return item;
}

/** The product name printed on the front of a pack, read by the fastest downloaded model (Florence-2 takes minutes, so it is not used) */
export async function nameFromFront(photo: Blob): Promise<string> {
  if (!readyEngines().some((e) => e !== "florence")) throw new Error("Reading a name needs PaddleOCR or Tesseract. Download one under Label scanner in Profile.");
  const attempts = await scanCanvas(await photoToCanvas(photo), () => undefined, { single: true });
  const name = suggestName(attempts.find((a) => a.result)?.result?.lines ?? []);
  if (!name) throw new Error("No name could be read from this photo. Type it instead, or try a sharper photo of the front.");
  return name;
}
