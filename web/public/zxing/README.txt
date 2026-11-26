Barcode reader for browsers without a built-in BarcodeDetector (never precached: web/vite.config.ts ignores zxing/**, and the service
app keeps it in Cache Storage after the first use, so barcodes read offline).

- zxing_reader.wasm   zxing-wasm 3.1.8 (MIT), dist/reader/zxing_reader.wasm: a build of zxing-cpp (Apache-2.0)
                      https://github.com/Sec-ant/zxing-wasm  /  https://github.com/zxing-cpp/zxing-cpp
  An exact copy of the pinned npm package's file; a test (src/lib/barcode/barcode.test.ts) fails when they differ.
  To update: bump the zxing-wasm version in web/package.json and copy the file again.
