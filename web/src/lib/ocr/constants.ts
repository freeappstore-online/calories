/** Cache Storage entries: our own files, and the (much larger) Florence-2 weights fetched from the Hugging Face hub */
export const OCR_CACHE = "calories-ocr-v1";
export const WEIGHTS_CACHE = "calories-ocr-weights-v1";

/** Pinned revision of onnx-community/Florence-2-base (MIT): int8 weights, the smallest variant that kept the text readable */
export const FLORENCE_MODEL = "onnx-community/Florence-2-base";
export const FLORENCE_REVISION = "d59e079711c57174f29265539fb4cc9f0f335916";
