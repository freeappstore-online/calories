import type { Attempt } from "../ocr/chain";
import { ocrText, type EngineId } from "../ocr/types";
import { chainPick, describeScan, itemAccuracy, overallAccuracy, type CorrectKey, type CorrectValues } from "./accuracy";

/**
 * The scan lab: real label photos kept on this device in IndexedDB (never localStorage, never uploaded), with what each
 * downloaded model read from them. Photos are Blobs; everything else is plain data.
 */

export type PhotoKind = "front" | "nutrition";
export const PHOTO_KINDS: PhotoKind[] = ["front", "nutrition"];

/** The downscaled copy is what is shown, exported and sent to an AI: base64 adds a third, and a bridge message is capped at 1 MB */
export const SMALL_PHOTO_MAX_BYTES = 640_000;

export interface LabPhoto {
  /** The photo as taken or chosen (a camera frame is stored as a high-quality JPEG) */
  original: Blob;
  /** Downscaled JPEG, at most SMALL_PHOTO_MAX_BYTES */
  small: Blob;
  /** Size of the original in pixels, after rotation */
  width: number;
  height: number;
}

/** What one model read from one photo (a failed run has `error` and no result) */
export interface LabRead {
  photo: PhotoKind;
  engine: EngineId;
  ranAt: number;
  attempt: Attempt;
}

export interface LabItem {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  front?: LabPhoto;
  nutrition?: LabPhoto;
  reads: LabRead[];
  /** The true label values per serving, as entered by the user */
  correct: CorrectValues;
}

// ── Storage ──

export interface LabDb {
  all(): Promise<LabItem[]>;
  put(item: LabItem): Promise<void>;
  remove(id: string): Promise<void>;
}

const DB_NAME = "calories_scan_lab";
const STORE = "items";

export function idbDb(): LabDb {
  let opened: Promise<IDBDatabase> | undefined;
  const open = () =>
    (opened ??= new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: "id" });
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(new Error("The scan lab could not open this browser's storage (private browsing can block it)."));
    }));
  const run = async <T,>(mode: IDBTransactionMode, f: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> => {
    const db = await open();
    return new Promise<T>((resolve, reject) => {
      const req = f(db.transaction(STORE, mode).objectStore(STORE));
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(new Error("The scan lab could not save. The browser storage may be full."));
    });
  };
  return {
    all: () => run<LabItem[]>("readonly", (s) => s.getAll()),
    put: async (item) => void (await run("readwrite", (s) => s.put(item))),
    remove: async (id) => void (await run("readwrite", (s) => s.delete(id))),
  };
}

export function memoryDb(): LabDb {
  const m = new Map<string, LabItem>();
  return {
    all: async () => [...m.values()],
    put: async (item) => void m.set(item.id, item),
    remove: async (id) => void m.delete(id),
  };
}

let db: LabDb | undefined;
const getDb = () => (db ??= idbDb());
/** Replace the storage (tests use memory) */
export function setLabDb(next: LabDb | undefined) {
  db = next;
}

const listeners = new Set<() => void>();
/** Called after every change to the lab, from the app or an AI tool */
export const subscribeLab = (l: () => void) => (listeners.add(l), () => void listeners.delete(l));
const changed = () => listeners.forEach((l) => l());

/** Items, newest first */
export async function listItems(): Promise<LabItem[]> {
  return (await getDb().all()).sort((a, b) => b.createdAt - a.createdAt);
}

export async function getItem(id: string): Promise<LabItem | undefined> {
  return (await getDb().all()).find((i) => i.id === id);
}

/** Save an item, and tell everything that shows the lab */
export async function saveItem(item: LabItem): Promise<LabItem> {
  const next = { ...item, updatedAt: Date.now() };
  await getDb().put(next);
  changed();
  return next;
}

export async function createItem(name: string, photos: Partial<Record<PhotoKind, LabPhoto>> = {}, reads: LabRead[] = []): Promise<LabItem> {
  const now = Date.now();
  return saveItem({ id: crypto.randomUUID(), name: name.trim().slice(0, 60), createdAt: now, updatedAt: now, ...photos, reads, correct: {} });
}

/** Changes to stored items run one at a time: two read-change-write cycles at once would lose one of the changes */
let writes: Promise<unknown> = Promise.resolve();
function inOrder<T>(job: () => Promise<T>): Promise<T> {
  const run = writes.then(job);
  writes = run.catch(() => undefined);
  return run;
}

export const deleteItem = (id: string): Promise<void> =>
  inOrder(async () => {
    await getDb().remove(id);
    changed();
  });

/** The photo replaces the old one, and the reads of the old one go with it */
export const setPhoto = (id: string, kind: PhotoKind, photo: LabPhoto) =>
  updateItem(id, (item) => ({ ...item, [kind]: photo, reads: item.reads.filter((r) => r.photo !== kind) }));

export function withRead(item: LabItem, read: LabRead): LabItem {
  return { ...item, reads: [...item.reads.filter((r) => !(r.photo === read.photo && r.engine === read.engine)), read] };
}

/** Change an item as it is now in storage (a read may have been saved since the screen last loaded it) */
export function updateItem(id: string, change: (item: LabItem) => LabItem): Promise<LabItem | undefined> {
  return inOrder(async () => {
    const item = await getItem(id);
    return item && saveItem(change(item));
  });
}

/** Merge correct values; a null clears that value */
export async function setCorrect(id: string, values: Partial<Record<CorrectKey, number | null>>): Promise<LabItem | undefined> {
  return updateItem(id, (item) => {
    const correct = { ...item.correct };
    for (const [k, v] of Object.entries(values) as [CorrectKey, number | null | undefined][]) {
      if (v === null) delete correct[k];
      else if (v !== undefined) correct[k] = v;
    }
    return { ...item, correct };
  });
}

// ── Reading the results ──

export const readsOf = (item: LabItem, photo: PhotoKind): Attempt[] => item.reads.filter((r) => r.photo === photo).map((r) => r.attempt);

export const itemAccuracyOf = (item: LabItem) => itemAccuracy(item.correct, readsOf(item, "nutrition"));

export const labAccuracy = (items: LabItem[]) => overallAccuracy(items.map(itemAccuracyOf));

/** Bytes the photos of these items take */
export const storageBytes = (items: LabItem[]): number =>
  items.reduce((sum, i) => sum + PHOTO_KINDS.reduce((s, k) => s + (i[k] ? i[k]!.original.size + i[k]!.small.size : 0), 0), 0);

// ── Reports (export and AI tools) ──

const r1 = (n: number) => Math.round(n * 10) / 10;

export interface ReadReport {
  photo: PhotoKind;
  engine: EngineId;
  ranAt: string;
  ms: number;
  confidence: number | null;
  good: boolean;
  error?: string;
  /** What the chain would keep for this photo */
  chainPick?: boolean;
  text?: string;
  lines?: { text: string; conf: number | null; box: number[][] }[];
  parsed?: ReturnType<typeof describeScan>;
}

export function readReport(item: LabItem, read: LabRead, boxes: boolean): ReadReport {
  const a = read.attempt;
  const pick = chainPick(readsOf(item, read.photo));
  return {
    photo: read.photo,
    engine: read.engine,
    ranAt: new Date(read.ranAt).toISOString(),
    ms: Math.round(a.ms),
    confidence: a.confidence === null ? null : r1(a.confidence),
    good: a.good,
    ...(a.error ? { error: a.error } : {}),
    ...(pick === a ? { chainPick: true } : {}),
    ...(a.result ? { text: ocrText(a.result) } : {}),
    ...(a.result && boxes ? { lines: a.result.lines.map((l) => ({ text: l.text, conf: l.conf === null ? null : r1(l.conf), box: l.quad.map(([x, y]) => [Math.round(x), Math.round(y)]) })) } : {}),
    ...(a.scan && a.result ? { parsed: describeScan(a.scan, a.result.lines) } : {}),
  };
}

export function accuracyReport(item: LabItem) {
  const acc = itemAccuracyOf(item);
  if (!acc) return null;
  const pc = (a: { total: number; right: number }) => (a.total ? Math.round((100 * a.right) / a.total) : null);
  return {
    correctFields: Object.keys(item.correct).length,
    chain: acc.chain ? { engine: acc.chainEngine, ...acc.chain, percentRight: pc(acc.chain) } : null,
    byEngine: Object.fromEntries(Object.entries(acc.byEngine).map(([e, a]) => [e, { ...a, percentRight: pc(a) }])),
  };
}

/** An item as plain JSON without photos (photos are fetched on their own) */
export function itemReport(item: LabItem, boxes: boolean) {
  return {
    id: item.id,
    name: item.name,
    createdAt: new Date(item.createdAt).toISOString(),
    photos: Object.fromEntries(PHOTO_KINDS.filter((k) => item[k]).map((k) => [k, { width: item[k]!.width, height: item[k]!.height, bytes: item[k]!.small.size }])),
    correct: item.correct,
    accuracy: accuracyReport(item),
    reads: item.reads.map((r) => readReport(item, r, boxes)),
  };
}

export async function blobToDataUrl(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return `data:${blob.type || "image/jpeg"};base64,${btoa(binary)}`;
}

/** The file the Export buttons write: items with downscaled photos as data URLs, every model's read, correct values and accuracy */
export async function exportLab(items: LabItem[]) {
  const out = [];
  for (const item of items) {
    const photos: Record<string, { width: number; height: number; dataUrl: string }> = {};
    for (const k of PHOTO_KINDS) if (item[k]) photos[k] = { width: item[k]!.width, height: item[k]!.height, dataUrl: await blobToDataUrl(item[k]!.small) };
    out.push({ ...itemReport(item, true), photos });
  }
  return { app: "calories", kind: "scan-lab", version: 1, exportedAt: new Date().toISOString(), items: out };
}

/** One line per item for lists */
export function itemSummary(item: LabItem) {
  const acc = accuracyReport(item);
  return {
    id: item.id,
    name: item.name,
    createdAt: new Date(item.createdAt).toISOString(),
    hasPhotos: { front: !!item.front, nutrition: !!item.nutrition },
    engines: [...new Set(item.reads.map((r) => r.engine))],
    hasCorrectValues: Object.keys(item.correct).length > 0,
    chainPercentRight: acc?.chain?.percentRight ?? null,
  };
}
