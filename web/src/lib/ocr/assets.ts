import type { EngineId } from "./types";

import { FLORENCE_MODEL, FLORENCE_REVISION, OCR_CACHE, WEIGHTS_CACHE } from "./constants";

export { OCR_CACHE, WEIGHTS_CACHE };

export interface Asset {
  /** Absolute or app-relative URL; also the cache key */
  url: string;
  /** Size in bytes (also the progress denominator, as servers may compress) */
  bytes: number;
  type: string;
  cache: string;
  /** Short name used to find the file again at run time */
  name: string;
}

const BASE = import.meta.env.BASE_URL;
const own = (name: string, bytes: number, type: string): Asset => ({ url: `${BASE}ocr/${name}`, bytes, type, cache: OCR_CACHE, name });

/** WebAssembly SIMD support (missing before iOS 16.4); without it Tesseract uses the plain core and the ONNX engines are unavailable */
export const HAS_SIMD =
  typeof WebAssembly !== "undefined" &&
  WebAssembly.validate(new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0, 10, 10, 1, 8, 0, 65, 0, 253, 15, 253, 98, 11]));

const TESSERACT: Asset[] = [
  own("engine-tesseract.mjs", 13043, "text/javascript"),
  own("tesseract.esm.min.js", 63220, "text/javascript"),
  own("worker.min.js", 111307, "text/javascript"),
  HAS_SIMD ? own("tesseract-core-simd-lstm.wasm.js", 3899472, "text/javascript") : own("tesseract-core-lstm.wasm.js", 3896484, "text/javascript"),
  own("eng.traineddata.gz", 1967616, "application/gzip"),
];

/** ONNX Runtime Web (WASM only): one binary shared by Paddle and Florence */
const ORT: Asset[] = [own("ort.wasm.bundle.min.mjs", 73123, "text/javascript"), own("ort-wasm-simd-threaded.wasm", 14264838, "application/wasm")];

const PADDLE: Asset[] = [own("engine-paddle.mjs", 6998, "text/javascript"), ...ORT, own("paddle-det.onnx", 4745517, "application/octet-stream"), own("paddle-rec.onnx", 7666529, "application/octet-stream"), own("paddle-dict.txt", 190, "text/plain")];

const hub = (file: string, bytes: number): Asset => ({
  url: `https://huggingface.co/${FLORENCE_MODEL}/resolve/${FLORENCE_REVISION}/${file}`,
  bytes,
  type: file.endsWith(".json") ? "application/json" : "application/octet-stream",
  cache: WEIGHTS_CACHE,
  name: file,
});

const FLORENCE: Asset[] = [
  own("engine-florence.mjs", 4337, "text/javascript"),
  ...ORT,
  own("transformers.min.mjs", 541469, "text/javascript"),
  hub("config.json", 5447),
  hub("generation_config.json", 297),
  hub("preprocessor_config.json", 2673),
  hub("tokenizer_config.json", 197658),
  hub("tokenizer.json", 2297961),
  hub("onnx/embed_tokens_quantized.onnx", 39390496),
  hub("onnx/encoder_model_quantized.onnx", 43651493),
  hub("onnx/vision_encoder_quantized.onnx", 93788276),
  hub("onnx/decoder_model_merged_quantized.onnx", 98177854),
];

export const ASSETS: Record<EngineId, Asset[]> = { tesseract: TESSERACT, paddle: PADDLE, florence: FLORENCE };

export const totalBytes = (assets: Asset[]) => assets.reduce((sum, a) => sum + a.bytes, 0);

/** Whether an engine can run in this browser at all */
export const SUPPORTED: Record<EngineId, boolean> = {
  tesseract: typeof WebAssembly !== "undefined",
  paddle: HAS_SIMD,
  florence: HAS_SIMD,
};
