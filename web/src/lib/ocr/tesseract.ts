import { cleanLabelCanvas } from "../labelImage";
import { parseLabel } from "../labelParser";
import { normaliseText, rectQuad } from "./geometry";
import { importModule, UNAVAILABLE } from "./glue";
import { ocrText, type EngineRuntime, type OcrLine, type OcrResult, type OpenAssets } from "./types";

/**
 * Tesseract.js (Apache-2.0) with the open-source English "fast" LSTM model, self-hosted in public/ocr/. The files are
 * read from Cache Storage and handed to Tesseract as blob URLs, so scanning works offline.
 */

interface Bbox { x0: number; y0: number; x1: number; y1: number }
interface TSymbol { text: string; bbox: Bbox }
interface TWord { text: string; confidence: number; bbox: Bbox; symbols?: TSymbol[] | null }
interface TLine { text: string; confidence: number; bbox: Bbox; words: TWord[] }
interface TPage { text: string; blocks: { paragraphs: { lines: TLine[] }[] }[] | null }
interface TesseractWorker {
  terminate(): Promise<unknown>;
  recognize(image: HTMLCanvasElement, options: object, output: object): Promise<{ data: TPage }>;
}

/** Lines with their positions, from Tesseract's page layout */
export function linesOfPage(page: TPage): OcrLine[] {
  const out: OcrLine[] = [];
  for (const block of page.blocks ?? []) {
    for (const para of block.paragraphs) {
      for (const line of para.lines) {
        const words = line.words.filter((w) => normaliseText(w.text) !== "");
        if (!words.length) continue;
        const { x0, x1 } = line.bbox;
        const span = x1 - x0 || 1;
        const fx = (x: number) => Math.min(1, Math.max(0, (x - x0) / span));
        // Where each character sits: from Tesseract's symbol boxes when they add up to the word, else spread across the word's box
        const edges: number[] = [];
        let text = "";
        words.forEach((w, wi) => {
          const t = normaliseText(w.text);
          if (wi > 0) {
            // The space sits in the gap before the word
            edges.push(fx(words[wi - 1]!.bbox.x1));
            text += " ";
          }
          const syms = w.symbols ?? [];
          if (syms.length && syms.map((s) => s.text).join("") === t) {
            for (const s of syms) edges.push(fx(s.bbox.x0));
          } else {
            for (let i = 0; i < t.length; i++) edges.push(fx(w.bbox.x0 + ((w.bbox.x1 - w.bbox.x0) * i) / t.length));
          }
          text += t;
        });
        edges.push(fx(words[words.length - 1]!.bbox.x1));
        out.push({ text, conf: line.confidence, quad: rectQuad(line.bbox.x0, line.bbox.y0, line.bbox.x1, line.bbox.y1), charX: edges });
      }
    }
  }
  return out;
}

/** How trustworthy a read looks: nutrients found, minus a penalty for columns that disagree */
function readQuality(text: string): number {
  const scan = parseLabel(text);
  // No serving size usually means the header line was lost, which can leave the columns the wrong way round
  return Object.keys(scan.values).length + (scan.values.calories ? 1 : 0) - (scan.conflicts.length ? 3 : 0) - (scan.warnings.some((w) => w.includes("serving size")) ? 2 : 0);
}

export async function open(files: OpenAssets): Promise<EngineRuntime> {
  // Tesseract.js fetches the model by URL (and mishandles model bytes passed directly), so the worker's fetch is pointed at the cached copy
  const workerWrapper = URL.createObjectURL(
    new Blob(
      [`const f = self.fetch; self.fetch = (u, ...a) => f(String(u).endsWith(".traineddata.gz") ? "${files.url("eng.traineddata.gz")}" : u, ...a); importScripts("${files.url("worker.min.js")}");`],
      { type: "text/javascript" },
    ),
  );
  let progress: (fraction: number) => void = () => undefined;
  let worker: TesseractWorker;
  try {
    const mod = await importModule<{ default: { createWorker(lang: string, oem: number, options: object): Promise<TesseractWorker> } }>(files.url("tesseract.esm.min.js"));
    worker = await mod.default
      .createWorker("eng", 1, {
        workerPath: workerWrapper,
        langPath: "https://label-scanner.invalid",
        // Tesseract treats a path ending in "js" as the exact core file; the fragment keeps a blob URL from being read as a folder
        corePath: `${files.url(files.has("tesseract-core-simd-lstm.wasm.js") ? "tesseract-core-simd-lstm.wasm.js" : "tesseract-core-lstm.wasm.js")}#js`,
        cacheMethod: "none",
        logger: (m: { status: string; progress: number }) => {
          if (m.status === "recognizing text") progress(m.progress);
        },
      })
      .catch((e) => {
        console.warn("Label scanner: could not start", e);
        throw new Error(UNAVAILABLE);
      });
  } catch (e) {
    URL.revokeObjectURL(workerWrapper);
    throw e;
  }

  const read = async (c: HTMLCanvasElement): Promise<OcrResult> => {
    const { data } = await worker.recognize(c, {}, { text: true, blocks: true });
    return { lines: linesOfPage(data), width: c.width, height: c.height };
  };

  return {
    async recognise(canvas, onProgress) {
      progress = onProgress ?? (() => undefined);
      // Plain photo first; ruled and boxed tables, shading and glare read badly that way, so a poor result is retried on a cleaned copy
      const plain = await read(canvas);
      if (readQuality(ocrText(plain)) >= 9) return plain;
      const cleaned = await read(cleanLabelCanvas(canvas));
      return readQuality(ocrText(cleaned)) > readQuality(ocrText(plain)) ? cleaned : plain;
    },
    async close() {
      await worker.terminate().catch(() => undefined);
      URL.revokeObjectURL(workerWrapper);
    },
  };
}
