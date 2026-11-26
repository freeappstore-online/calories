import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { MICRO_DEFS } from "../data/types";
import { download } from "../lib/download";
import { today } from "../lib/dates";
import { ENGINES, readyEngines, useEngines } from "../lib/ocr/engines";
import { ENGINE_ORDER } from "../lib/ocr/chain";
import { ocrText } from "../lib/ocr/types";
import { chainPick, percent, readValue, suggestName, verdict, type Accuracy, type CorrectKey } from "../lib/scanLab/accuracy";
import { getJobState, subscribeJob } from "../lib/scanLab/jobState";
import { makePhoto, runItem } from "../lib/scanLab/run";
import {
  createItem, deleteItem, exportLab, itemAccuracyOf, labAccuracy, listItems, readsOf, setCorrect, setPhoto, storageBytes, updateItem,
  subscribeLab, type LabItem, type PhotoKind,
} from "../lib/scanLab/store";
import LabelCamera from "./LabelCamera";
import { fieldName } from "./LabelReview";
import Modal from "./Modal";

const btn = "px-3 py-2 rounded-lg text-xs font-semibold cursor-pointer disabled:opacity-60";
const btnStyle = { background: "var(--paper)", border: "1px solid var(--line)", color: "var(--ink)" };
const primaryStyle = { background: "var(--panel)", border: "1px solid var(--accent)", color: "var(--accent)" };
const inputStyle = { background: "var(--panel)", border: "1px solid var(--line)", color: "var(--ink)" };

const megabytes = (bytes: number) => (bytes < 100_000 ? "0.1" : (bytes / 1_000_000).toFixed(1));
const r1 = (n: number) => String(Math.round(n * 10) / 10);
const share = (a: Accuracy | null | undefined) => (percent(a) === null ? "–" : `${percent(a)}%`);
const message = (e: unknown, fallback: string) => (e instanceof Error ? e.message : fallback);

/** Every lab item, kept up to date while any screen or AI tool changes them */
function useLabItems(): LabItem[] | null {
  const [items, setItems] = useState<LabItem[] | null>(null);
  useEffect(() => {
    let live = true;
    const load = () => void listItems().then((list) => live && setItems(list), () => live && setItems([]));
    load();
    const off = subscribeLab(load);
    return () => {
      live = false;
      off();
    };
  }, []);
  return items;
}

const useJob = () => useSyncExternalStore(subscribeJob, getJobState);

function useBlobUrl(blob: Blob | undefined): string | undefined {
  const [url, setUrl] = useState<string>();
  useEffect(() => {
    if (!blob) return setUrl(undefined);
    const u = URL.createObjectURL(blob);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [blob]);
  return url;
}

const exportName = (what: string) => `calories-scan-lab-${what}-${today()}.json`;

async function exportItems(items: LabItem[], what: string) {
  download(exportName(what), JSON.stringify(await exportLab(items)), "application/json");
}

function CloseButton({ onClose }: { onClose: () => void }) {
  return (
    <button onClick={onClose} aria-label="Close" className="w-7 h-7 flex items-center justify-center rounded-lg cursor-pointer" style={{ background: "var(--panel)", border: "none", color: "var(--ink)" }}>
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
      </svg>
    </button>
  );
}

const sheetClass = "w-full max-w-lg max-h-[90vh] flex flex-col rounded-t-2xl sm:rounded-2xl overflow-hidden";
const sheetStyle = { background: "var(--paper)", border: "1px solid var(--line)" };

function Thumb({ item }: { item: LabItem }) {
  const url = useBlobUrl((item.nutrition ?? item.front)?.small);
  return (
    <div className="w-12 h-12 rounded-md overflow-hidden shrink-0" style={{ background: "var(--panel)", border: "1px solid var(--line)" }}>
      {url && <img src={url} alt="" className="w-full h-full object-cover" draggable={false} />}
    </div>
  );
}

/** Scan lab: real label photos, what each model read from them, and how right it was */
export default function ScanLab({ onClose }: { onClose: () => void }) {
  const items = useLabItems();
  const [openId, setOpenId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const overall = items ? labAccuracy(items) : null;

  const create = async () => {
    try {
      setOpenId((await createItem("")).id);
    } catch (e) {
      setError(message(e, "Could not create the item."));
    }
  };

  return (
    <>
      <Modal titleId="scan-lab-title" onClose={onClose} sheet className={sheetClass} style={sheetStyle}>
        <div className="flex items-center justify-between px-4 py-3 shrink-0" style={{ borderBottom: "1px solid var(--line)" }}>
          <h2 id="scan-lab-title" className="text-base font-bold" style={{ color: "var(--ink)" }}>Scan lab</h2>
          <CloseButton onClose={onClose} />
        </div>
        <div className="p-4 flex flex-col gap-3 overflow-y-auto">
          <p className="text-xs" style={{ color: "var(--muted)" }}>
            Keep a front photo and a nutrition photo of real foods, see what every downloaded model reads from them, and enter the true values to measure
            accuracy. Photos stay on this device in the browser's storage and are never uploaded. Photos are not part of Backup and restore; use Export.
          </p>
          <div className="flex flex-wrap gap-2">
            <button className={btn} style={primaryStyle} onClick={() => void create()}>New item</button>
            <button className={btn} style={btnStyle} disabled={!items?.length} onClick={() => items && void exportItems(items, "all").catch((e) => setError(message(e, "Could not export.")))}>
              Export all
            </button>
          </div>
          {error && <p role="alert" className="text-xs font-medium" style={{ color: "var(--error)" }}>{error}</p>}
          {items && (
            <p className="text-[0.6875rem]" data-testid="lab-storage" style={{ color: "var(--muted)" }}>
              {items.length} item{items.length === 1 ? "" : "s"} &middot; {megabytes(storageBytes(items))} MB used on this device
            </p>
          )}
          {overall && overall.items > 0 && (
            <div className="rounded-lg p-3 text-xs space-y-1" data-testid="lab-overall" style={{ background: "var(--panel)", border: "1px solid var(--line)", color: "var(--ink)" }}>
              <div className="font-semibold">Accuracy over {overall.items} item{overall.items === 1 ? "" : "s"} with correct values</div>
              {overall.chain && <div>Failover chain: <b>{share(overall.chain)}</b> ({overall.chain.right} of {overall.chain.total} fields)</div>}
              {ENGINE_ORDER.filter((e) => overall.byEngine[e]).map((e) => (
                <div key={e}>{ENGINES[e].name}: <b>{share(overall.byEngine[e])}</b> ({overall.byEngine[e]!.right} of {overall.byEngine[e]!.total})</div>
              ))}
            </div>
          )}
          {items?.length === 0 && <p className="text-xs" style={{ color: "var(--muted)" }}>No items yet. Tap New item, then add the front photo and the nutrition photo.</p>}
          <ul className="flex flex-col gap-2">
            {items?.map((item) => {
              const acc = itemAccuracyOf(item);
              return (
                <li key={item.id}>
                  <button
                    onClick={() => setOpenId(item.id)}
                    data-testid="lab-item"
                    className="w-full flex items-center gap-3 p-2 rounded-lg text-left cursor-pointer"
                    style={{ background: "var(--panel)", border: "1px solid var(--line)", color: "var(--ink)" }}
                  >
                    <Thumb item={item} />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold truncate">{item.name || "Unnamed food"}</span>
                      <span className="block text-[0.6875rem]" style={{ color: "var(--muted)" }}>
                        {[item.front && "front", item.nutrition && "nutrition"].filter(Boolean).join(" + ") || "no photos"} &middot; {new Set(item.reads.map((r) => r.engine)).size} model
                        {new Set(item.reads.map((r) => r.engine)).size === 1 ? "" : "s"} read
                        {acc?.chain ? ` · chain ${share(acc.chain)} right` : ""}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      </Modal>
      {openId && <ScanLabItem id={openId} onClose={() => setOpenId(null)} />}
    </>
  );
}

const MAIN_FIELDS: CorrectKey[] = ["calories", "protein", "carbs", "fat", "fiber", "sugar", "servingGrams"];
const fieldLabel = (k: CorrectKey) => (k === "servingGrams" ? "Serving size (g)" : fieldName(k));

function ScanLabItem({ id, onClose }: { id: string; onClose: () => void }) {
  const items = useLabItems();
  const item = items?.find((i) => i.id === id);
  const job = useJob();
  const engines = useEngines();
  const anyReady = Object.values(engines).some((e) => e.status === "ready");
  const [note, setNote] = useState<{ text: string; error: boolean } | null>(null);
  const [camera, setCamera] = useState<PhotoKind | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [drafts, setDrafts] = useState<Partial<Record<CorrectKey, string>>>({});
  const frontUrl = useBlobUrl(item?.front?.small);
  const nutritionUrl = useBlobUrl(item?.nutrition?.small);

  const [nameDraft, setNameDraft] = useState<string | null>(null);
  // A deleted item (here or by an AI tool) closes the screen; one just created may not be in the list yet
  const seen = useRef(false);
  if (item) seen.current = true;
  useEffect(() => {
    if (seen.current && items && !item) onClose();
  }, [items, item, onClose]);

  const fail = useCallback((e: unknown, fallback: string) => setNote({ text: message(e, fallback), error: true }), []);

  const addPhoto = async (kind: PhotoKind, source: Blob | HTMLCanvasElement) => {
    setCamera(null);
    if (!item) return;
    try {
      setNote(null);
      const saved = await setPhoto(item.id, kind, await makePhoto(source));
      if (readyEngines().length === 0) return setNote({ text: "Saved. No scanner model is downloaded yet, so nothing was read. Download one under Label scanner, then tap Read again.", error: false });
      const done = saved && (await runItem(saved.id, { photos: [kind] }));
      // The front photo names the food, unless the user already did
      if (kind === "front" && done && !done.name.trim()) {
        const name = suggestName(chainPickLines(done));
        if (name) await updateItem(done.id, (i) => (i.name.trim() ? i : { ...i, name }));
      }
    } catch (e) {
      fail(e, "Could not save the photo.");
    }
  };

  const rerun = async () => {
    if (!item) return;
    setNote(null);
    try {
      await runItem(item.id);
    } catch (e) {
      fail(e, "Could not read the photos.");
    }
  };

  if (!item) return null;

  const nutritionReads = readsOf(item, "nutrition");
  const pick = chainPick(nutritionReads);
  const acc = itemAccuracyOf(item);
  const frontSuggestion = suggestName(chainPickLines(item));
  const busy = job.job?.itemId === item.id;

  const commit = async (key: CorrectKey) => {
    const text = drafts[key];
    if (text === undefined) return;
    setDrafts(({ [key]: _, ...rest }) => rest);
    const t = text.trim();
    if (t === "" ? item.correct[key] === undefined : Number(t) === item.correct[key]) return;
    if (t !== "" && !(Number.isFinite(Number(t)) && Number(t) >= 0)) return setNote({ text: `${fieldLabel(key)} must be a number, 0 or more.`, error: true });
    await setCorrect(item.id, { [key]: t === "" ? null : Number(t) });
  };

  const fillFromChain = async () => {
    const scan = pick?.scan;
    if (!scan) return;
    const values: Partial<Record<CorrectKey, number>> = { ...scan.values };
    if (scan.servingGrams !== undefined) values.servingGrams = scan.servingGrams;
    await setCorrect(item.id, { ...values, ...item.correct });
  };

  const rows: CorrectKey[] = [
    ...MAIN_FIELDS,
    ...MICRO_DEFS.map((m) => m.key).filter((k) => item.correct[k] !== undefined || nutritionReads.some((a) => readValue(a.scan, k) !== undefined)),
  ];
  const cols = ENGINE_ORDER.filter((e) => nutritionReads.some((a) => a.engine === e));
  const hasCorrect = Object.keys(item.correct).length > 0;

  const slot = (kind: PhotoKind, label: string, url: string | undefined) => (
    <div className="flex flex-col gap-1.5" data-testid={`lab-slot-${kind}`}>
      <span className="text-[0.6875rem] font-medium" style={{ color: "var(--muted)" }}>{label}</span>
      <div className="rounded-lg overflow-hidden flex items-center justify-center" style={{ background: "var(--panel)", border: "1px solid var(--line)", aspectRatio: "3 / 4" }}>
        {url ? <img src={url} alt={`${label} photo`} className="w-full h-full object-contain" draggable={false} /> : <span className="text-[0.6875rem]" style={{ color: "var(--muted)" }}>No photo</span>}
      </div>
      <div className="flex gap-1.5">
        {kind === "nutrition" ? (
          <button className={`${btn} flex-1`} style={btnStyle} onClick={() => setCamera("nutrition")}>Take photo</button>
        ) : (
          <label className={`${btn} flex-1 text-center`} style={btnStyle}>
            Take photo
            <input type="file" accept="image/*" capture="environment" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void addPhoto(kind, f); }} />
          </label>
        )}
        <label className={`${btn} flex-1 text-center`} style={btnStyle}>
          Choose
          <input type="file" accept="image/*" hidden data-testid={`lab-choose-${kind}`} onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void addPhoto(kind, f); }} />
        </label>
      </div>
    </div>
  );

  return (
    <Modal titleId="scan-lab-item-title" onClose={onClose} sheet className={sheetClass} style={sheetStyle}>
      <div className="flex items-center justify-between px-4 py-3 shrink-0" style={{ borderBottom: "1px solid var(--line)" }}>
        <h2 id="scan-lab-item-title" className="text-base font-bold truncate" style={{ color: "var(--ink)" }}>{item.name || "New item"}</h2>
        <CloseButton onClose={onClose} />
      </div>
      <div className="p-4 flex flex-col gap-3 overflow-y-auto" data-testid="lab-item-detail">
        <label className="block">
          <span className="text-[0.6875rem] font-medium block mb-0.5" style={{ color: "var(--muted)" }}>Name</span>
          <input
            type="text"
            value={nameDraft ?? item.name}
            maxLength={60}
            data-testid="lab-name"
            onChange={(e) => setNameDraft(e.target.value)}
            onBlur={() => {
              if (nameDraft !== null) void updateItem(item.id, (i) => ({ ...i, name: nameDraft.trim() }));
              setNameDraft(null);
            }}
            className="w-full px-3 py-2 rounded-lg text-sm outline-none"
            style={inputStyle}
          />
        </label>
        {frontSuggestion && frontSuggestion !== item.name && (
          <p className="text-[0.6875rem]" style={{ color: "var(--muted)" }}>
            Read from the front: "{frontSuggestion}".{" "}
            <button type="button" onClick={() => void updateItem(item.id, (i) => ({ ...i, name: frontSuggestion }))} className="underline cursor-pointer" style={{ background: "none", border: "none", padding: 0, color: "var(--accent)", font: "inherit" }}>
              Use as name
            </button>
          </p>
        )}
        <div className="grid grid-cols-2 gap-3">
          {slot("front", "Front (brand, name)", frontUrl)}
          {slot("nutrition", "Nutrition panel", nutritionUrl)}
        </div>
        {camera && <LabelCamera onPhoto={(p) => void addPhoto(camera, p)} onClose={() => setCamera(null)} />}

        {busy && (
          <p role="status" data-testid="lab-progress" className="text-xs" style={{ color: "var(--muted)" }}>
            Reading the {job.job!.photo} photo with {ENGINES[job.job!.engine].name}...{job.job!.fraction > 0 ? ` ${Math.round(job.job!.fraction * 100)}%` : ""}
          </p>
        )}
        {note && <p role="status" className="text-xs" style={{ color: note.error ? "var(--error)" : "var(--muted)" }}>{note.text}</p>}
        {!anyReady && <p className="text-xs" style={{ color: "var(--muted)" }}>No scanner model is downloaded. Close this and download one under Label scanner to read the photos.</p>}

        <div className="flex flex-wrap gap-2">
          <button className={btn} style={primaryStyle} disabled={!anyReady || busy || (!item.front && !item.nutrition)} onClick={() => void rerun()}>
            {item.reads.length ? "Re-run all models" : "Read photos"}
          </button>
          {pick?.scan && <button className={btn} style={btnStyle} onClick={() => void fillFromChain()}>Start correct values from the chain's read</button>}
        </div>

        {nutritionReads.length > 0 && (
          <div className="overflow-x-auto shrink-0" data-testid="lab-results">
            <table className="w-full text-xs" style={{ color: "var(--ink)", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid var(--line)" }}>
                  <th className="text-left font-medium py-1 pr-2" style={{ color: "var(--muted)" }}>Per serving</th>
                  <th className="text-left font-medium py-1 px-1" style={{ color: "var(--muted)" }}>Correct</th>
                  {cols.map((e) => (
                    <th key={e} className="text-left font-semibold py-1 px-1" data-engine={e}>
                      {ENGINES[e].name}
                      {pick?.engine === e && <span title="The failover chain would use this read" data-testid="chain-pick"> ★</span>}
                      {acc?.byEngine[e] && <div className="font-normal" data-testid={`acc-${e}`} style={{ color: "var(--muted)" }}>{share(acc.byEngine[e])} right</div>}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((key) => (
                  <tr key={key} style={{ borderBottom: "1px solid var(--line)" }}>
                    <td className="py-1 pr-2" style={{ color: "var(--muted)" }}>{fieldLabel(key)}</td>
                    <td className="py-1 px-1">
                      <input
                        type="text"
                        inputMode="decimal"
                        aria-label={`Correct ${fieldLabel(key)}`}
                        data-testid={`correct-${key}`}
                        value={drafts[key] ?? (item.correct[key] === undefined ? "" : r1(item.correct[key]!))}
                        onChange={(e) => setDrafts((d) => ({ ...d, [key]: e.target.value }))}
                        onBlur={() => void commit(key)}
                        onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
                        className="w-16 px-1.5 py-1 rounded text-xs outline-none"
                        style={inputStyle}
                      />
                    </td>
                    {cols.map((e) => {
                      const read = readValue(nutritionReads.find((a) => a.engine === e)?.scan, key);
                      const c = item.correct[key];
                      const v = c === undefined ? null : verdict(read, c);
                      return (
                        <td key={e} className="py-1 px-1 font-semibold" data-verdict={v ?? undefined} style={{ color: v === "right" ? "var(--success)" : v === "wrong" ? "var(--error)" : "var(--ink)" }}>
                          {read === undefined ? <span style={{ color: v === "missing" ? "var(--error)" : "var(--muted)" }}>–</span> : r1(read)}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {hasCorrect && acc?.chain && (
          <p className="text-xs font-semibold" data-testid="chain-accuracy" style={{ color: "var(--ink)" }}>
            Failover chain ({pick ? ENGINES[pick.engine].name : "none"}): {share(acc.chain)} right ({acc.chain.right} of {acc.chain.total} fields
            {acc.chain.wrong ? `, ${acc.chain.wrong} wrong` : ""}{acc.chain.missing ? `, ${acc.chain.missing} missing` : ""})
          </p>
        )}
        {nutritionReads.length > 0 && !hasCorrect && <p className="text-[0.6875rem]" style={{ color: "var(--muted)" }}>Type the true values from the label in the Correct column to see how accurate each model is.</p>}

        {item.reads.length > 0 && (
          <details>
            <summary className="text-xs cursor-pointer" style={{ color: "var(--muted)" }}>What each model read</summary>
            <div className="flex flex-col gap-2 mt-2">
              {[...item.reads].sort((a, b) => a.photo.localeCompare(b.photo) || ENGINE_ORDER.indexOf(a.engine) - ENGINE_ORDER.indexOf(b.engine)).map((r) => (
                <div key={`${r.photo}-${r.engine}`} className="rounded-lg p-2 text-[0.6875rem]" style={{ background: "var(--panel)", border: "1px solid var(--line)", color: "var(--ink)" }}>
                  <div className="font-semibold">
                    {ENGINES[r.engine].name} &middot; {r.photo} &middot; {(r.attempt.ms / 1000).toFixed(1)} s
                    {r.attempt.confidence !== null ? ` · confidence ${Math.round(r.attempt.confidence)}` : ""}
                    {r.attempt.result && r.photo === "nutrition" ? (r.attempt.good ? " · good read" : " · weak read") : ""}
                  </div>
                  {r.attempt.error && <div style={{ color: "var(--error)" }}>{r.attempt.error}</div>}
                  {r.attempt.scan?.warnings.map((w) => <div key={w} style={{ color: "var(--warning)" }}>{w}</div>)}
                  {r.attempt.result && <pre className="whitespace-pre-wrap mt-1" style={{ font: "inherit", color: "var(--muted)" }}>{ocrText(r.attempt.result)}</pre>}
                </div>
              ))}
            </div>
          </details>
        )}

        <div className="flex flex-wrap gap-2 pt-1">
          <button className={btn} style={btnStyle} onClick={() => void exportItems([item], item.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase() || "item").catch((e) => fail(e, "Could not export."))}>Export this item</button>
          {!confirmDelete ? (
            <button className={btn} style={{ ...btnStyle, color: "var(--error)" }} onClick={() => setConfirmDelete(true)}>Delete</button>
          ) : (
            <span className="flex items-center gap-2 text-xs" style={{ color: "var(--ink)" }}>
              Delete this item and its photos?
              <button className={btn} style={{ ...btnStyle, color: "var(--error)" }} onClick={() => void deleteItem(item.id)}>Delete</button>
              <button className={btn} style={btnStyle} onClick={() => setConfirmDelete(false)}>Cancel</button>
            </span>
          )}
        </div>
      </div>
    </Modal>
  );
}

/** The lines of the front photo as the chain would have read them, for the name suggestion */
function chainPickLines(item: LabItem) {
  return chainPick(readsOf(item, "front"))?.result?.lines ?? [];
}
