import type { Asset } from "./assets";
import { UNAVAILABLE } from "./glue";
import type { EngineModule, EngineRuntime, OpenAssets } from "./types";

export const NOT_DOWNLOADED = "The label scanner is not downloaded.";

/** The downloaded files of an engine, read back from Cache Storage */
export async function openAssets(assets: Asset[]): Promise<OpenAssets> {
  const blobs = new Map<string, Blob>();
  for (const a of assets) {
    const hit = await (await caches.open(a.cache)).match(a.url);
    if (!hit) throw new Error(NOT_DOWNLOADED);
    blobs.set(a.name, await hit.blob());
  }
  const urls = new Map<string, string>();
  return {
    has: (name) => blobs.has(name),
    blob: (name) => blobs.get(name)!,
    url(name) {
      let u = urls.get(name);
      if (!u) {
        u = URL.createObjectURL(blobs.get(name)!);
        urls.set(name, u);
      }
      return u;
    },
    revoke: () => urls.forEach((u) => URL.revokeObjectURL(u)),
  };
}

/**
 * Start an engine from its downloaded files. The engine's own code is one of those files: it is read from Cache Storage
 * and imported from a blob URL, so none of it is in the app bundle or the PWA precache.
 */
export async function startEngine(id: string, assets: Asset[]): Promise<EngineRuntime> {
  const files = await openAssets(assets);
  try {
    const mod = (await import(/* @vite-ignore */ files.url(`engine-${id}.mjs`)).catch(() => {
      throw new Error(UNAVAILABLE);
    })) as EngineModule;
    const runtime = await mod.open(files);
    return {
      recognise: (c, p, o) => runtime.recognise(c, p, o),
      close: async () => {
        await runtime.close();
        files.revoke();
      },
    };
  } catch (e) {
    files.revoke();
    throw e;
  }
}
