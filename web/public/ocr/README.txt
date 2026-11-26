Label scanner files (optional downloads from Profile -> Label scanner; never precached: web/vite.config.ts ignores ocr/**).

Engine 1, Tesseract (Apache-2.0):
- tesseract.esm.min.js, worker.min.js   tesseract.js 7.0.0 (dist/)            https://github.com/naptha/tesseract.js
- tesseract-core-simd-lstm.wasm.js      tesseract.js-core 7.0.0 (WASM SIMD, LSTM)  https://github.com/naptha/tesseract.js-core
- tesseract-core-lstm.wasm.js           tesseract.js-core 7.0.0 (plain WASM, LSTM); only downloaded on browsers without WASM SIMD (before iOS 16.4)
- eng.traineddata.gz                    tessdata_fast eng.traineddata, gzipped https://github.com/tesseract-ocr/tessdata_fast

Engine 2, PaddleOCR PP-OCRv4 mobile (Apache-2.0) on ONNX Runtime Web (MIT):
- paddle-det.onnx   ch_PP-OCRv4_det   text detection (works on any Latin text)
- paddle-rec.onnx   en_PP-OCRv4_rec   English text recognition
- paddle-dict.txt   its 95-character dictionary
  ONNX exports of the PaddlePaddle models, from https://huggingface.co/deepghs/paddleocr (det/ch_PP-OCRv4_det, rec/en_PP-OCRv4_rec).
  Original models: https://github.com/PaddlePaddle/PaddleOCR
- ort.wasm.bundle.min.mjs, ort-wasm-simd-threaded.wasm   onnxruntime-web 1.31.0-dev.20260914-8d85527a0 (WASM only; shared with Florence-2)

Engine 3, Florence-2 base (MIT) on transformers.js (Apache-2.0):
- transformers.min.mjs   @huggingface/transformers 4.3.2 bundled with onnxruntime-web's WASM build (no WebGPU: its 28 MB runtime is over
                         the platform's 25 MB per-file limit). GENERATED and git-ignored: `pnpm dev` and `pnpm build` make it. (Its minified
                         text holds 32-character class names that GitHub push protection mistakes for API keys.)
- The weights (int8, about 275 MB) are NOT here: they are fetched from https://huggingface.co/onnx-community/Florence-2-base at a pinned
  revision (web/src/lib/ocr/constants.ts) when the user taps Download, and kept in Cache Storage (calories-ocr-weights-v1).

Our own engine code, one module per engine, loaded from Cache Storage after the download:
- engine-tesseract.mjs, engine-paddle.mjs, engine-florence.mjs   built from web/src/lib/ocr/{tesseract,paddle,florence}.ts

To rebuild all that is built (the engine-*.mjs files, the copied ONNX Runtime files, transformers.min.mjs):
  node scripts/build-ocr-engines.mjs
A test (web/src/lib/ocr/build.test.ts) fails when engine-*.mjs no longer match their source, and when a file's size differs from the one in
web/src/lib/ocr/assets.ts. To update the other files, copy them from the pinned packages and keep assets.ts in step.
