Label scanner files (optional download from Profile -> Label scanner; never precached).

All Apache-2.0:
- tesseract.esm.min.js, worker.min.js   tesseract.js 7.0.0 (dist/)            https://github.com/naptha/tesseract.js
- tesseract-core-simd-lstm.wasm.js      tesseract.js-core 7.0.0 (WASM, LSTM)  https://github.com/naptha/tesseract.js-core
- eng.traineddata.gz                    tessdata_fast eng.traineddata, gzipped https://github.com/tesseract-ocr/tessdata_fast

To update: copy the same files from the pinned tesseract.js / tesseract.js-core packages in node_modules, and keep the sizes in
web/src/lib/labelScanner.ts (FILES) in step.
