// Barcode detection on a canvas: the browser's own BarcodeDetector where it has one, else zxing-wasm (MIT, with zxing-cpp, Apache-2.0; pinned,
// self-hosted in public/zxing/ and loaded on first use, never precached).

import { normalizeBarcode } from "./gtin";

interface NativeDetector {
  detect(source: CanvasImageSource): Promise<{ rawValue: string }[]>;
}
interface NativeDetectorClass {
  new (options: { formats: string[] }): NativeDetector;
  getSupportedFormats(): Promise<string[]>;
}

const NATIVE_FORMATS = ["ean_13", "ean_8", "upc_a", "upc_e"];
const ZXING_FORMATS = ["EAN-13", "EAN-8", "UPC-A", "UPC-E"] as const;

let native: Promise<NativeDetector | null> | undefined;
/** The browser's detector when it reads the formats we want, else null (Safari, Firefox, desktop Chrome on most systems) */
function nativeDetector(): Promise<NativeDetector | null> {
  native ??= (async () => {
    const Detector = (globalThis as { BarcodeDetector?: NativeDetectorClass }).BarcodeDetector;
    if (!Detector) return null;
    try {
      const supported = await Detector.getSupportedFormats();
      const formats = NATIVE_FORMATS.filter((f) => supported.includes(f));
      return formats.length ? new Detector({ formats }) : null;
    } catch {
      return null;
    }
  })();
  return native;
}

type Reader = typeof import("zxing-wasm/reader");
let zxing: Promise<Reader> | undefined;
const WASM_URL = `${import.meta.env.BASE_URL}zxing/zxing_reader.wasm`;

/** The reader's wasm: from Cache Storage when it was fetched before (so it works offline), else fetched from this app and kept */
async function wasmBytes(): Promise<ArrayBuffer> {
  const cache = typeof caches === "undefined" ? undefined : await caches.open("zxing").catch(() => undefined);
  const hit = await cache?.match(WASM_URL);
  if (hit) return hit.arrayBuffer();
  const res = await fetch(WASM_URL);
  if (!res.ok) throw new Error("The barcode reader could not be loaded.");
  await cache?.put(WASM_URL, res.clone()).catch(() => undefined);
  return res.arrayBuffer();
}

function loadZxing(): Promise<Reader> {
  zxing ??= Promise.all([import("zxing-wasm/reader"), wasmBytes()]).then(([mod, wasmBinary]) => {
    // The wasm comes from this app, not the library's default CDN
    mod.prepareZXingModule({ overrides: { wasmBinary } });
    return mod;
  });
  // A failed load (offline the first time) must not stick
  zxing.catch(() => {
    zxing = undefined;
  });
  return zxing;
}

/** The barcode number (EAN-13, or EAN-8) in a picture, or null when there is none. Throws only when no detector could load. */
export async function detectBarcode(canvas: HTMLCanvasElement): Promise<string | null> {
  const nativeD = await nativeDetector();
  if (nativeD) {
    try {
      for (const hit of await nativeD.detect(canvas)) {
        const code = normalizeBarcode(hit.rawValue);
        if (code) return code;
      }
      return null;
    } catch {
      // Fall through to the library: a native failure on one frame is not "no barcode"
    }
  }
  const { readBarcodes } = await loadZxing();
  const image = canvas.getContext("2d", { willReadFrequently: true })!.getImageData(0, 0, canvas.width, canvas.height);
  for (const hit of await readBarcodes(image, { formats: [...ZXING_FORMATS], tryHarder: true, maxNumberOfSymbols: 2 })) {
    const code = normalizeBarcode(hit.text);
    if (code) return code;
  }
  return null;
}
