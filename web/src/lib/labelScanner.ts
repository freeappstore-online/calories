import { useSyncExternalStore } from "react";
import { cleanLabelCanvas } from "./labelImage";
import { parseLabel } from "./labelParser";

/**
 * On-device label OCR: Tesseract.js (Apache-2.0) with the open-source English "fast" LSTM model, self-hosted in
 * public/ocr/. Nothing here is fetched until the user taps Download; the files then live in their own Cache
 * Storage entry (never the PWA precache) and are served to Tesseract through blob URLs, so scanning works offline.
 */

/** Window event asking the app to show Profile at the Label scanner section */
export const OPEN_LABEL_SCANNER_EVENT = "calories:open-label-scanner";

export const OCR_CACHE = "calories-ocr-v1";

/** WebAssembly SIMD support (missing before iOS 16.4); without it the slower plain core is used instead */
const HAS_SIMD =
  typeof WebAssembly !== "undefined" &&
  WebAssembly.validate(new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0, 10, 10, 1, 8, 0, 65, 0, 253, 15, 253, 98, 11]));

/** Files in public/ocr/ with their size in bytes (also the progress denominator, as servers may compress). Only one core is downloaded. */
const FILES = [
  { name: "tesseract.esm.min.js", bytes: 63220, type: "text/javascript" },
  { name: "worker.min.js", bytes: 111307, type: "text/javascript" },
  HAS_SIMD
    ? { name: "tesseract-core-simd-lstm.wasm.js", bytes: 3899472, type: "text/javascript" }
    : { name: "tesseract-core-lstm.wasm.js", bytes: 3896484, type: "text/javascript" },
  { name: "eng.traineddata.gz", bytes: 1967616, type: "application/gzip" },
] as const;

export const OCR_DOWNLOAD_BYTES = FILES.reduce((sum, f) => sum + f.bytes, 0);

const urlOf = (name: string) => `${import.meta.env.BASE_URL}ocr/${name}`;

export type ScannerStatus = "checking" | "none" | "downloading" | "ready" | "unsupported";

interface ScannerState {
  status: ScannerStatus;
  /** 0..1 while downloading */
  progress: number;
  error: string | null;
}

let state: ScannerState = { status: "checking", progress: 0, error: null };
const listeners = new Set<() => void>();
let checked = false;

function set(next: Partial<ScannerState>) {
  state = { ...state, ...next };
  listeners.forEach((l) => l());
}

async function isDownloaded(): Promise<boolean> {
  const cache = await caches.open(OCR_CACHE);
  const hits = await Promise.all(FILES.map((f) => cache.match(urlOf(f.name))));
  return hits.every(Boolean);
}

function check() {
  checked = true;
  if (typeof caches === "undefined" || typeof WebAssembly === "undefined") return set({ status: "unsupported" });
  isDownloaded().then(
    (ok) => state.status === "checking" && set({ status: ok ? "ready" : "none" }),
    () => set({ status: "unsupported" }),
  );
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (!checked) check();
  return () => listeners.delete(listener);
}

/** Live download state of the label scanner model */
export function useLabelScanner(): ScannerState {
  return useSyncExternalStore(subscribe, () => state);
}

const UNAVAILABLE = "The label scanner could not start on this device. Remove it in Profile and download it again.";
const DOWNLOAD_FAILED = "The download did not finish. Try again in a moment.";
const OFFLINE = "Could not download. Check that you are online, then try again.";

/** Download every file into Cache Storage; the scanner only becomes ready once all of them arrived */
export async function downloadLabelScanner(): Promise<void> {
  if (state.status === "downloading") return;
  set({ status: "downloading", progress: 0, error: null });
  try {
    const got: Blob[] = [];
    let done = 0;
    for (const f of FILES) {
      let read = 0;
      const res = await fetch(urlOf(f.name), { cache: "no-store" });
      if (!res.ok || (res.headers.get("content-type") ?? "").includes("text/html")) throw new Error(DOWNLOAD_FAILED);
      const chunks: Uint8Array<ArrayBuffer>[] = [];
      const reader = res.body?.getReader();
      if (reader) {
        for (;;) {
          const { done: end, value } = await reader.read();
          if (end) break;
          chunks.push(value as Uint8Array<ArrayBuffer>);
          read += value.length;
          // A server may compress and so send more bytes than the stored size; never count past the file
          set({ progress: Math.min((done + Math.min(read, f.bytes)) / OCR_DOWNLOAD_BYTES, 0.99) });
        }
      } else {
        chunks.push(new Uint8Array(await res.arrayBuffer()));
      }
      const blob = new Blob(chunks, { type: f.type });
      if (blob.size < f.bytes / 2) throw new Error(DOWNLOAD_FAILED);
      got.push(blob);
      done += f.bytes;
    }
    const cache = await caches.open(OCR_CACHE);
    await Promise.all(FILES.map((f, i) => cache.put(urlOf(f.name), new Response(got[i], { headers: { "Content-Type": f.type } }))));
    set({ status: "ready", progress: 1 });
  } catch (e) {
    await caches.delete(OCR_CACHE).catch(() => undefined);
    // A network failure ("Failed to fetch") is not worth showing as is
    set({ status: "none", progress: 0, error: e instanceof Error && e.message === DOWNLOAD_FAILED ? e.message : OFFLINE });
  }
}

/** Free the cached model */
export async function removeLabelScanner(): Promise<void> {
  await caches.delete(OCR_CACHE);
  set({ status: "none", progress: 0, error: null });
}

/** Photo to a canvas no larger than needed: phone photos are 12 MP, far more than OCR benefits from */
async function toCanvas(file: Blob): Promise<HTMLCanvasElement> {
  if (file.type && !file.type.startsWith("image/")) throw new Error("That file is not a photo. Choose a picture of the label.");
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    throw new Error("This photo could not be opened (HEIC photos are not supported on every browser). Take the photo again or choose a JPEG or PNG.");
  }
  const long = Math.max(bitmap.width, bitmap.height);
  const scale = long > 2200 ? 2200 / long : long < 1100 ? 2 : 1;
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return canvas;
}

/** How trustworthy a read looks: nutrients found, minus a penalty for columns that disagree */
function readQuality(text: string): number {
  const scan = parseLabel(text);
  const disagree = scan.warnings.some((w) => w.includes("do not match"));
  // No serving size usually means the header line was lost, which can leave the columns the wrong way round
  return Object.keys(scan.values).length + (scan.values.calories ? 1 : 0) - (disagree ? 3 : 0) - (scan.warnings.some((w) => w.includes("serving size")) ? 2 : 0);
}

/** Recognise the text in a label photo using only the downloaded files */
export async function scanLabelImage(file: Blob, onProgress: (fraction: number) => void): Promise<string> {
  const cache = await caches.open(OCR_CACHE);
  const responses = await Promise.all(FILES.map((f) => cache.match(urlOf(f.name))));
  if (responses.some((r) => !r)) {
    set({ status: "none" });
    throw new Error("The label scanner is not downloaded.");
  }
  const [engine, worker, core, model] = await Promise.all(responses.map((r) => r!.blob()));
  const urls = [engine!, worker!, core!, model!].map((b) => URL.createObjectURL(b));
  // Tesseract.js fetches the model by URL (and mishandles model bytes passed directly), so the worker's fetch is pointed at the cached copy
  const workerWrapper = URL.createObjectURL(
    new Blob(
      [`const f = self.fetch; self.fetch = (u, ...a) => f(String(u).endsWith(".traineddata.gz") ? "${urls[3]}" : u, ...a); importScripts("${urls[1]}");`],
      { type: "text/javascript" },
    ),
  );
  urls.push(workerWrapper);
  let tess: { terminate(): Promise<unknown>; recognize(image: HTMLCanvasElement): Promise<{ data: { text: string } }> } | null = null;
  try {
    const mod = await import(/* @vite-ignore */ urls[0]!).catch(() => {
      throw new Error(UNAVAILABLE);
    });
    const raw = await toCanvas(file);
    tess = await mod.default.createWorker("eng", 1, {
      workerPath: workerWrapper,
      langPath: "https://label-scanner.invalid",
      // Tesseract treats a path ending in "js" as the exact core file; the fragment keeps a blob URL from being read as a folder
      corePath: `${urls[2]}#js`,
      cacheMethod: "none",
      logger: (m: { status: string; progress: number }) => {
        if (m.status === "recognizing text") onProgress(m.progress);
      },
    }).catch(() => {
      throw new Error(UNAVAILABLE);
    });
    const read = async (c: HTMLCanvasElement) => (await tess!.recognize(c)).data.text;
    // Plain photo first; ruled and boxed tables, shading and glare read badly that way, so a poor result is retried on a cleaned copy
    const plain = await read(raw);
    if (readQuality(plain) >= 9) return plain;
    const cleaned = await read(cleanLabelCanvas(raw));
    return readQuality(cleaned) > readQuality(plain) ? cleaned : plain;
  } finally {
    await tess?.terminate().catch(() => undefined);
    urls.forEach((u) => URL.revokeObjectURL(u));
  }
}
