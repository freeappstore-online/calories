import { useSyncExternalStore } from "react";
import { ASSETS, SUPPORTED, totalBytes, type Asset } from "./assets";
import { ENGINE_ORDER } from "./chain";
import { NOT_DOWNLOADED, startEngine } from "./runtime";
import type { EngineId, EngineRuntime } from "./types";

export interface EngineInfo {
  id: EngineId;
  name: string;
  licence: string;
  /** One line on what it is and when it helps */
  about: string;
  /** How fast it is, in a few words */
  speed: string;
  /** Fast enough to read the live camera view */
  live: boolean;
  /** Short badge shown next to the name in Profile */
  tag?: { text: string; tone: "good" | "warn" };
}

export const ENGINES: Record<EngineId, EngineInfo> = {
  tesseract: {
    id: "tesseract",
    name: "Tesseract",
    licence: "Apache-2.0",
    about: "Classic text reader. Quick and good on clean, flat labels.",
    speed: "About 1 second",
    live: true,
  },
  paddle: {
    id: "paddle",
    name: "PaddleOCR",
    licence: "Apache-2.0, runs on ONNX Runtime (MIT)",
    about: "Finds each line of text first, then reads it. Much better on real photos: glare, curves and tables.",
    speed: "A few seconds",
    live: true,
    tag: { text: "Recommended", tone: "good" },
  },
  florence: {
    id: "florence",
    name: "Florence-2",
    licence: "MIT, runs on transformers.js (Apache-2.0)",
    about: "A large vision model, tried last. Rarely reads more than PaddleOCR, and a very big download.",
    speed: "About 1–2 minutes per scan on a phone",
    live: false,
    tag: { text: "Experimental · very slow", tone: "warn" },
  },
};

export type EngineStatus = "checking" | "none" | "downloading" | "ready" | "unsupported";

export interface EngineState {
  status: EngineStatus;
  /** 0..1 while downloading */
  progress: number;
  error: string | null;
}

/** Bytes to download for an engine (the files not already stored for another engine are what actually transfers) */
export const downloadBytes = (id: EngineId) => totalBytes(ASSETS[id]);

const initial = (id: EngineId): EngineState => ({ status: SUPPORTED[id] && typeof caches !== "undefined" ? "checking" : "unsupported", progress: 0, error: null });
let states: Record<EngineId, EngineState> = { tesseract: initial("tesseract"), paddle: initial("paddle"), florence: initial("florence") };
const listeners = new Set<() => void>();
let checked = false;

function set(id: EngineId, next: Partial<EngineState>) {
  states = { ...states, [id]: { ...states[id], ...next } };
  listeners.forEach((l) => l());
}

async function hasAll(assets: Asset[]): Promise<boolean> {
  const hits = await Promise.all(assets.map(async (a) => (await caches.open(a.cache)).match(a.url)));
  return hits.every(Boolean);
}

function check() {
  checked = true;
  for (const id of ENGINE_ORDER) {
    if (states[id].status === "unsupported") continue;
    hasAll(ASSETS[id]).then(
      (ok) => states[id].status === "checking" && set(id, { status: ok ? "ready" : "none" }),
      () => set(id, { status: "unsupported" }),
    );
  }
}

/** Look up which engines are downloaded without a component showing them (the AI tools need it) */
export function ensureEnginesChecked() {
  if (!checked) check();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (!checked) check();
  return () => listeners.delete(listener);
}

/** Live download state of every label-scanner model */
export function useEngines(): Record<EngineId, EngineState> {
  return useSyncExternalStore(subscribe, () => states);
}

/** Engines that are downloaded, in the order a scan uses them */
export const readyEngines = (): EngineId[] => ENGINE_ORDER.filter((id) => states[id].status === "ready");

const DOWNLOAD_FAILED = "The download did not finish. Try again in a moment.";
const OFFLINE = "Could not download. Check that you are online, then try again.";

/** Files another engine that is stored or downloading also needs (the shared ONNX runtime) */
function neededElsewhere(id: EngineId): Set<string> {
  const keep = new Set<string>();
  for (const other of ENGINE_ORDER) {
    if (other === id || (states[other].status !== "ready" && states[other].status !== "downloading")) continue;
    for (const a of ASSETS[other]) keep.add(a.url);
  }
  return keep;
}

async function dropFiles(id: EngineId) {
  const keep = neededElsewhere(id);
  for (const a of ASSETS[id]) {
    if (!keep.has(a.url)) await (await caches.open(a.cache)).delete(a.url);
  }
}

/** Download an engine's files into Cache Storage; it only becomes ready once every file has arrived */
export async function downloadEngine(id: EngineId): Promise<void> {
  if (states[id].status === "downloading") return;
  set(id, { status: "downloading", progress: 0, error: null });
  const assets = ASSETS[id];
  const total = totalBytes(assets);
  try {
    let done = 0;
    for (const a of assets) {
      const cache = await caches.open(a.cache);
      // Shared files (the ONNX runtime) may already be here from another engine
      if (await cache.match(a.url)) {
        done += a.bytes;
        set(id, { progress: Math.min(done / total, 0.99) });
        continue;
      }
      let read = 0;
      const res = await fetch(a.url, { cache: "no-store" });
      if (!res.ok || (res.headers.get("content-type") ?? "").includes("text/html")) throw new Error(DOWNLOAD_FAILED);
      const chunks: Uint8Array<ArrayBuffer>[] = [];
      const reader = res.body?.getReader();
      if (reader) {
        for (;;) {
          const { done: end, value } = await reader.read();
          if (end) break;
          chunks.push(value as Uint8Array<ArrayBuffer>);
          read += value.length;
          // A server may compress and so send more bytes than the stored size; never count past the file
          set(id, { progress: Math.min((done + Math.min(read, a.bytes)) / total, 0.99) });
        }
      } else {
        chunks.push(new Uint8Array(await res.arrayBuffer()));
      }
      const blob = new Blob(chunks, { type: a.type });
      if (blob.size < a.bytes / 2) throw new Error(DOWNLOAD_FAILED);
      await cache.put(a.url, new Response(blob, { headers: { "Content-Type": a.type } }));
      done += a.bytes;
    }
    set(id, { status: "ready", progress: 1 });
  } catch (e) {
    await dropFiles(id).catch(() => undefined);
    // A network failure ("Failed to fetch") is not worth showing as is
    set(id, { status: "none", progress: 0, error: e instanceof Error && e.message === DOWNLOAD_FAILED ? e.message : OFFLINE });
  }
}

/** Free an engine's stored files */
export async function removeEngine(id: EngineId): Promise<void> {
  await dropFiles(id);
  set(id, { status: "none", progress: 0, error: null });
}

/** The engine's runtime, or a note that its files are gone (the state is corrected so Profile offers the download again) */
export async function openEngine(id: EngineId): Promise<EngineRuntime> {
  try {
    return await startEngine(id, ASSETS[id]);
  } catch (e) {
    if (e instanceof Error && e.message === NOT_DOWNLOADED) set(id, { status: "none" });
    throw e;
  }
}
