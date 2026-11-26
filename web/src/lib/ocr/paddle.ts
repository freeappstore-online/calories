import { cropLine, ctcDecode, detBoxes, detSize, detTensor, pieceLines, resizeRgba, scaleBox, REC_HEIGHT, type Piece } from "./paddlePipeline";
import { importModule, UNAVAILABLE } from "./glue";
import type { EngineRuntime, OcrResult, OpenAssets, Rgba } from "./types";

/**
 * PaddleOCR PP-OCRv4 mobile (Apache-2.0): a text detector and an English text recogniser, run with ONNX Runtime Web
 * (MIT) on WebAssembly. The neural networks live in public/ocr/; the steps around them are in paddlePipeline.ts.
 */

interface OrtTensor { data: Float32Array; dims: readonly number[] }
interface OrtSession {
  inputNames: readonly string[];
  outputNames: readonly string[];
  run(feeds: Record<string, unknown>): Promise<Record<string, OrtTensor>>;
  release(): Promise<void>;
}
interface Ort {
  env: { wasm: { wasmPaths: unknown; numThreads: number; proxy: boolean } };
  Tensor: new (type: "float32", data: Float32Array, dims: number[]) => unknown;
  InferenceSession: { create(model: Uint8Array, options: object): Promise<OrtSession> };
}

/** Longest side the detector sees: bigger finds smaller print but costs time */
const DET_SIDE = 1088;
/** The same for the live camera view, which must keep up */
const LIVE_DET_SIDE = 736;

export async function open(files: OpenAssets, options: { detSide?: number } = {}): Promise<EngineRuntime> {
  const sessions: OrtSession[] = [];
  try {
    const ort = await importModule<Ort>(files.url("ort.wasm.bundle.min.mjs"));
    ort.env.wasm.wasmPaths = { wasm: files.url("ort-wasm-simd-threaded.wasm") };
    // Without cross-origin isolation (this host does not set it) ONNX Runtime is single threaded anyway; say so rather than try to start workers
    ort.env.wasm.numThreads = 1;
    ort.env.wasm.proxy = false;
    const bytes = async (name: string) => new Uint8Array(await files.blob(name).arrayBuffer());
    const create = async (name: string) => {
      const s = await ort.InferenceSession.create(await bytes(name), { executionProviders: ["wasm"], graphOptimizationLevel: "all" });
      sessions.push(s);
      return s;
    };
    const det = await create("paddle-det.onnx");
    const rec = await create("paddle-rec.onnx");
    const dict = (await files.blob("paddle-dict.txt").text()).split("\n").filter((l) => l !== "");
    const fullSide = options.detSide ?? DET_SIDE;

    return {
      async recognise(canvas, onProgress, opts) {
        const detSide = opts?.fast ? LIVE_DET_SIDE : fullSide;
        const ctx = canvas.getContext("2d")!;
        const img: Rgba = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const { w, h } = detSize(img.width, img.height, detSide);
        const small = resizeRgba(img, w, h);
        const out = await det.run({ [det.inputNames[0]!]: new ort.Tensor("float32", detTensor(small), [1, 3, h, w]) });
        const prob = out[det.outputNames[0]!]!.data;
        const boxes = detBoxes(prob, w, h).map((b) => scaleBox(b, img.width / w, img.height / h));
        const pieces: Piece[] = [];
        for (const [i, box] of boxes.entries()) {
          const crop = cropLine(img, box);
          const res = await rec.run({ [rec.inputNames[0]!]: new ort.Tensor("float32", crop.data, [1, 3, REC_HEIGHT, crop.width]) });
          const o = res[rec.outputNames[0]!]!;
          const dec = ctcDecode(o.data, o.dims[1]!, o.dims[2]!, dict);
          pieces.push({ text: dec.text, conf: dec.conf, box, centres: dec.centres });
          onProgress?.((i + 1) / boxes.length);
          // Let the page paint between lines
          await new Promise((r) => setTimeout(r, 0));
        }
        return { lines: pieceLines(pieces, img.width, img.height), width: img.width, height: img.height } satisfies OcrResult;
      },
      async close() {
        await Promise.all(sessions.map((s) => s.release().catch(() => undefined)));
      },
    };
  } catch (e) {
    await Promise.all(sessions.map((s) => s.release().catch(() => undefined)));
    console.warn("Label scanner: could not start", e);
    throw e instanceof Error && e.message === UNAVAILABLE ? e : new Error(UNAVAILABLE);
  }
}

