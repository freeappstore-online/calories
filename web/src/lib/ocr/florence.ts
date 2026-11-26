import { FLORENCE_MODEL, FLORENCE_REVISION, OCR_CACHE, WEIGHTS_CACHE } from "./constants";
import { orderQuad } from "./geometry";
import { importModule, UNAVAILABLE } from "./glue";
import { pieceLines, type Piece, type TextBox } from "./paddlePipeline";
import type { EngineRuntime, OpenAssets, Point, Quad } from "./types";

/**
 * Florence-2 base (MIT) through transformers.js (Apache-2.0), asked for `<OCR_WITH_REGION>`: a vision-language model
 * that reads text and says where each piece is. Slow, so it is the last resort. The weights come from the Hugging
 * Face hub when the user taps Download and live in our own Cache Storage after that; scanning never touches the network.
 */

interface Transformers {
  env: {
    allowLocalModels: boolean;
    useBrowserCache: boolean;
    fetch: typeof fetch;
    useCustomCache: boolean;
    customCache: { match(key: string): Promise<Response | undefined>; put(key: string, response: Response): Promise<void> };
    backends: { onnx: { wasm: { wasmPaths: unknown; numThreads: number; proxy: boolean } } };
  };
  Florence2ForConditionalGeneration: { from_pretrained(id: string, options: object): Promise<FlorenceModel> };
  AutoProcessor: { from_pretrained(id: string, options: object): Promise<FlorenceProcessor> };
  AutoTokenizer: { from_pretrained(id: string, options: object): Promise<FlorenceTokenizer> };
  RawImage: { fromCanvas(canvas: HTMLCanvasElement): { size: [number, number] } };
}
interface FlorenceModel { generate(inputs: object): Promise<unknown>; dispose(): Promise<unknown> }
interface FlorenceProcessor {
  construct_prompts(task: string): string[];
  (image: unknown): Promise<object>;
  post_process_generation(text: string, task: string, size: [number, number]): Record<string, { labels: string[]; quad_boxes: number[][] }>;
}
interface FlorenceTokenizer {
  (prompts: string[]): object;
  batch_decode(ids: unknown, options: object): string[];
}

const TASK = "<OCR_WITH_REGION>";

/** A quad from the model as a text box (centre, extent along and across the text, tilt) */
function quadBox(q: Quad): TextBox {
  const d = (a: Point, b: Point) => Math.hypot(b[0] - a[0], b[1] - a[1]);
  return {
    cx: (q[0][0] + q[1][0] + q[2][0] + q[3][0]) / 4,
    cy: (q[0][1] + q[1][1] + q[2][1] + q[3][1]) / 4,
    w: (d(q[0], q[1]) + d(q[3], q[2])) / 2,
    h: (d(q[0], q[3]) + d(q[1], q[2])) / 2,
    angle: Math.atan2(q[1][1] - q[0][1] + (q[2][1] - q[3][1]), q[1][0] - q[0][0] + (q[2][0] - q[3][0])),
  };
}

/** The pieces of text Florence-2 found: each label with its four corners (x1, y1, ... x4, y4) */
export function piecesOf(out: { labels: string[]; quad_boxes: number[][] } | undefined): Piece[] {
  const pieces: Piece[] = [];
  for (const [i, label] of (out?.labels ?? []).entries()) {
    const flat = out!.quad_boxes[i];
    if (!flat || flat.length < 8) continue;
    const quad = orderQuad([[flat[0]!, flat[1]!], [flat[2]!, flat[3]!], [flat[4]!, flat[5]!], [flat[6]!, flat[7]!]]);
    pieces.push({ text: label.trim(), conf: null, box: quadBox(quad), centres: [] });
  }
  return pieces;
}

export async function open(files: OpenAssets): Promise<EngineRuntime> {
  const weights = await caches.open(WEIGHTS_CACHE);
  let model: FlorenceModel | undefined;
  try {
    const tf = await importModule<Transformers>(files.url("transformers.min.mjs"));
    tf.env.allowLocalModels = false;
    tf.env.useBrowserCache = false;
    // Every file is read from our own cache. The library asks for some by the branch name instead of the pinned revision
    tf.env.useCustomCache = true;
    tf.env.customCache = {
      match: async (key) => (await weights.match(key.replace("/resolve/main/", `/resolve/${FLORENCE_REVISION}/`))) ?? (await (await caches.open(OCR_CACHE)).match(key)),
      put: async () => undefined,
    };
    // Nothing is ever fetched, online or not: a file that is not cached is simply not found (optional ones are skipped, required ones fail)
    tf.env.fetch = async () => new Response(null, { status: 404 });
    tf.env.backends.onnx.wasm.wasmPaths = { wasm: files.url("ort-wasm-simd-threaded.wasm") };
    tf.env.backends.onnx.wasm.numThreads = 1;
    tf.env.backends.onnx.wasm.proxy = false;
    const opts = { revision: FLORENCE_REVISION };
    model = await tf.Florence2ForConditionalGeneration.from_pretrained(FLORENCE_MODEL, { ...opts, dtype: "q8", device: "wasm" });
    const processor = await tf.AutoProcessor.from_pretrained(FLORENCE_MODEL, opts);
    const tokenizer = await tf.AutoTokenizer.from_pretrained(FLORENCE_MODEL, opts);
    const loaded = model;

    return {
      async recognise(canvas) {
        const image = tf.RawImage.fromCanvas(canvas);
        const inputs = { ...tokenizer(processor.construct_prompts(TASK)), ...(await processor(image)) };
        const ids = await loaded.generate({ ...inputs, max_new_tokens: 1024 });
        const text = tokenizer.batch_decode(ids, { skip_special_tokens: false })[0] ?? "";
        return { lines: pieceLines(piecesOf(processor.post_process_generation(text, TASK, image.size)[TASK]), canvas.width, canvas.height), width: canvas.width, height: canvas.height };
      },
      async close() {
        await loaded.dispose().catch(() => undefined);
      },
    };
  } catch (e) {
    await model?.dispose().catch(() => undefined);
    console.warn("Label scanner: could not start", e);
    throw e instanceof Error && e.message === UNAVAILABLE ? e : new Error(UNAVAILABLE);
  }
}
