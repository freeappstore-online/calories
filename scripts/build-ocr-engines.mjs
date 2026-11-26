// Builds the self-hosted OCR engine files in web/public/ocr/ from the pinned npm packages and our own engine code
// (see web/public/ocr/README.txt):
//   node scripts/build-ocr-engines.mjs                 everything below
//   node scripts/build-ocr-engines.mjs --transformers  only transformers.min.mjs (run by `pnpm dev` and `pnpm build`)
// The engine-*.mjs files are committed; transformers.min.mjs is generated and git-ignored (its minified text holds
// 32-character class names that GitHub push protection mistakes for API keys). The app never builds these at run time;
// it only serves them for the optional Label scanner downloads, so none of this code is in the app bundle or the PWA
// precache. A test (web/src/lib/ocr/build.test.ts) fails when a committed engine file no longer matches its source.
import { copyFileSync, mkdirSync, statSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const web = join(root, "web");
export const OUT = join(web, "public", "ocr");
// esbuild is a dependency of the web package, not of the repository root where this script sits
const { build } = createRequire(join(web, "package.json"))("esbuild");

const common = { bundle: true, minify: true, format: "esm", target: "es2022", legalComments: "none", write: false, logLevel: "silent", nodePaths: [join(web, "node_modules")] };

/** Our engine code (one module per engine, loaded from Cache Storage after its download) */
const ENGINE_NAMES = ["tesseract", "paddle", "florence"];

const collect = (files, result) => {
  for (const f of result.outputFiles) files.set(f.path.split("/").pop(), f.contents);
  return files;
};

/** transformers.js (Apache-2.0) with ONNX Runtime Web's WASM build inside (no WebGPU: its runtime is 28 MB, over the 25 MB per-file limit) */
export async function buildTransformers() {
  return collect(
    new Map(),
    await build({
      ...common,
      entryPoints: [join(web, "node_modules", "@huggingface", "transformers", "dist", "transformers.web.js")],
      outfile: join(OUT, "transformers.min.mjs"),
      alias: { "onnxruntime-web/webgpu": join(web, "node_modules", "onnxruntime-web", "dist", "ort.wasm.bundle.min.mjs") },
    }),
  );
}

/** The engine modules: name -> bytes. Pure: nothing is written. */
export async function buildEngines() {
  const files = new Map();
  for (const name of ENGINE_NAMES) {
    collect(
      files,
      await build({
        ...common,
        entryPoints: [join(web, "src", "lib", "ocr", `${name}.ts`)],
        outfile: join(OUT, `engine-${name}.mjs`),
        // The engine modules read none of the app's environment; a stray import of it should fail here, not in the browser
        define: { "import.meta.env": "undefined" },
      }),
    );
  }
  return files;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  mkdirSync(OUT, { recursive: true });
  const only = process.argv.includes("--transformers");
  const written = ["transformers.min.mjs"];
  for (const [name, bytes] of await buildTransformers()) writeFileSync(join(OUT, name), bytes);
  if (!only) {
    // ONNX Runtime Web (MIT): the WASM-only build with its loader inlined, and the one WASM binary both ONNX engines share
    const ortDist = join(web, "node_modules", "onnxruntime-web", "dist");
    for (const f of ["ort.wasm.bundle.min.mjs", "ort-wasm-simd-threaded.wasm"]) {
      copyFileSync(join(ortDist, f), join(OUT, f));
      written.push(f);
    }
    for (const [name, bytes] of await buildEngines()) {
      writeFileSync(join(OUT, name), bytes);
      written.push(name);
    }
  }
  for (const f of written) console.log(f.padEnd(32), statSync(join(OUT, f)).size);
}
