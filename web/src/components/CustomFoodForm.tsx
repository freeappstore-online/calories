import { useEffect, useRef, useState } from "react";
import type { CustomFood } from "../data/types";
import { buildCustomFood, customFoodByBarcode, isValidGrams, MAX_CUSTOM_VALUE, MAX_GRAMS, MIN_GRAMS, saveCustomFood } from "../lib/customFoods";
import { MICRO_DEFS } from "../data/types";
import { detectBarcode } from "../lib/barcode/detect";
import { lookupBarcode, type OffFood } from "../lib/barcode/off";
import { disagreements, mergeConsensus, type ConsensusResult } from "../lib/consensus";
import { assign, displaced, sameSpan, unassign, type Assignment } from "../lib/assign";
import type { SourceKey, Span } from "../lib/labelParser";
import type { CorrectValues } from "../lib/scanLab/accuracy";
import { OPEN_LABEL_SCANNER_EVENT, photoToCanvas, scanCanvas, useEngines, type ScanProgress } from "../lib/labelScanner";
import { bestAttempt, nextEngine, type Attempt } from "../lib/ocr/chain";
import { ENGINES, readyEngines } from "../lib/ocr/engines";
import { nameFromFront, saveScanToLab } from "../lib/scanLab/capture";
import LabelCamera from "./LabelCamera";
import LabelReview from "./LabelReview";
import Modal from "./Modal";

interface CustomFoodFormProps {
  onSaved: (food: CustomFood) => void;
  onClose: () => void;
}

const MACROS = [
  { key: "protein", label: "Protein (g)" },
  { key: "carbs", label: "Carbs (g)" },
  { key: "fat", label: "Fat (g)" },
  { key: "fiber", label: "Fiber (g)" },
  { key: "sugar", label: "Sugar (g)" },
] as const;

const inputStyle = { background: "var(--panel)", border: "1px solid var(--line)", color: "var(--ink)" };

/** Parses a blank-able number field: null if blank, NaN-free error string otherwise */
function parseField(text: string): { value: number | null; error?: true } {
  const t = text.trim();
  if (t === "") return { value: null };
  const n = Number(t);
  return Number.isFinite(n) && n >= 0 ? { value: n } : { value: null, error: true };
}

/** A nutrient's name as the form labels it, without the unit */
const fieldName = (key: string) =>
  key === "calories" ? "Calories" : [...MACROS, ...MICRO_DEFS].find((m) => m.key === key)?.label.replace(/\s*\(.*\)$/, "") ?? key;

/** Fields filled from a scan get an accent border until the user edits them */
const scannedStyle = { ...inputStyle, border: "1px solid var(--accent)" };

/** Create a custom food from label values entered per serving; stored per 100 g */
export default function CustomFoodForm({ onSaved, onClose }: CustomFoodFormProps) {
  const [values, setValues] = useState<Record<string, string>>({ name: "", servingLabel: "1 serving", servingGrams: "100", calories: "" });
  const [error, setError] = useState<string | null>(null);
  const engines = useEngines();
  const anyReady = readyEngines().length > 0;
  const [cameraOpen, setCameraOpen] = useState(false);
  const [scanning, setScanning] = useState<ScanProgress | null>(null);
  const [scanned, setScanned] = useState<Set<string>>(new Set());
  const [scanNote, setScanNote] = useState<{ text: string; error: boolean } | null>(null);
  // What the last scan saw: the photo, every model's attempt, and the one whose values are in the form
  const [review, setReview] = useState<{ canvas: HTMLCanvasElement; url: string; attempts: Attempt[]; shown: number; consensus?: ConsensusResult } | null>(null);
  const [selected, setSelected] = useState<SourceKey | null>(null);
  const reviewUrl = useRef<string | null>(null);
  useEffect(() => () => {
    if (reviewUrl.current) URL.revokeObjectURL(reviewUrl.current);
  }, []);
  // Numbers the user labelled on the photo, and what the scan itself put in the form (to go back to when one is cleared or moved)
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const scanFilled = useRef<Record<string, string>>({});
  // Barcode: the code that was read (kept on the saved food), what Open Food Facts said, and the barcodes it did not know
  const [barcode, setBarcode] = useState<{ code: string; food?: OffFood } | null>(null);
  const [barcodeNote, setBarcodeNote] = useState<{ text: string; error: boolean } | null>(null);
  const [barcodeOnly, setBarcodeOnly] = useState(false);
  const missed = useRef(new Set<string>());
  const set = (key: string, v: string) => {
    setValues((prev) => ({ ...prev, [key]: v }));
    setScanned((prev) => (prev.has(key) ? new Set([...prev].filter((k) => k !== key)) : prev));
    setAssignments((prev) => (prev.some((a) => a.key === key) ? prev.filter((a) => a.key !== key) : prev));
  };

  /** A box was given to a field: its number fills the field, and a field or box it displaced goes back to what the scan read */
  const original = (k: string) => scanFilled.current[k] ?? (k === "servingGrams" ? "100" : "");
  const assignBox = (a: Assignment) => {
    const lost: string[] = displaced(assignments, a).map((x) => x.key).filter((k) => k !== a.key);
    setAssignments(assign(assignments, a));
    setValues((prev) => ({ ...prev, ...Object.fromEntries(lost.map((k) => [k, original(k)])), [a.key]: String(a.value) }));
    setScanned((prev) => new Set([...[...prev].filter((k) => !lost.includes(k) || k in scanFilled.current), a.key]));
  };
  const unassignBox = (span: Span) => {
    const gone: string[] = assignments.filter((x) => sameSpan(x.span, span)).map((x) => x.key);
    setAssignments(unassign(assignments, span));
    setValues((prev) => ({ ...prev, ...Object.fromEntries(gone.map((k) => [k, original(k)])) }));
    setScanned((prev) => new Set([...prev].filter((k) => !gone.includes(k) || k in scanFilled.current)));
  };
  /** Tapping a field that came from the scan shows its source on the photo */
  const focusField = (key: string) => scanned.has(key) && setSelected(key as SourceKey);

  /** Put one attempt's values in the form (replacing what an earlier attempt filled, never what was typed by hand) */
  const apply = (attempt: Attempt, attempts: Attempt[], consensus?: ConsensusResult) => {
    // What the live camera's frames settled on wins over this one read, unless the full read is a good one
    const scan = attempt.scan && mergeConsensus(attempt.scan, consensus, attempt.good);
    if (!scan) return;
    const count = Object.keys(scan.values).length;
    const how = `Read by ${ENGINES[attempt.engine].name} in ${Math.max(1, Math.round(attempt.ms / 1000))} s.`;
    if (!scan.values.calories && count < 2) {
      setScanNote({ text: `Could not read a nutrition table. ${how} Try a sharper, well lit photo of just the panel${nextEngine(new Set(readyEngines()), attempts) ? ", or try the next model" : ""}.`, error: true });
      return;
    }
    const filled: Record<string, string> = {};
    for (const [key, v] of Object.entries(scan.values)) filled[key] = String(v);
    if (scan.servingGrams) filled["servingGrams"] = String(scan.servingGrams);
    if (scan.servingLabel) filled["servingLabel"] = scan.servingLabel;
    if (scan.name && (!values["name"]?.trim() || scanned.has("name"))) filled["name"] = scan.name;
    scanFilled.current = filled;
    setValues((prev) => {
      const next = { ...prev };
      for (const k of scanned) next[k] = k === "servingLabel" ? "1 serving" : k === "servingGrams" ? "100" : "";
      return { ...next, ...filled };
    });
    setScanned(new Set(Object.keys(filled)));
    // No model read all four key values cleanly: this is the best of what they read
    const weak = attempts.length > 1 && !attempt.good && !nextEngine(new Set(readyEngines()), attempts) ? "No model read the whole label cleanly; these are the best reading. " : "";
    const differ = disagreements(attempt.scan!, consensus).map((d) => `${fieldName(d.field)} (camera ${Math.round(d.live * 10) / 10}, photo ${Math.round(d.photo * 10) / 10})`);
    const differs = differ.length
      ? `The camera frames and the photo read ${differ.join(", ")} differently; ${attempt.good ? "the photo's read was good, so its value is used" : "the camera's value is used"}, so check it. `
      : "";
    setScanNote({
      text: `Filled ${count} nutrient${count === 1 ? "" : "s"} from the label (outlined). ${consensus ? `${Object.keys(consensus.values).length} settled over ${consensus.frames} camera frames. ` : ""}${how} ${weak}${differs}Check them against the label before saving. ${scan.warnings.join(" ")}`.trim(),
      error: scan.warnings.length > 0 || weak !== "" || differ.length > 0,
    });
  };

  const showReview = (canvas: HTMLCanvasElement, attempts: Attempt[], shown: number, url?: string, consensus?: ConsensusResult) => {
    if (url) {
      if (reviewUrl.current) URL.revokeObjectURL(reviewUrl.current);
      reviewUrl.current = url;
    }
    setReview({ canvas, url: reviewUrl.current!, attempts, shown, consensus });
    setSelected(null);
    setAssignments([]);
    const attempt = attempts[shown];
    if (attempt) apply(attempt, attempts, consensus);
  };

  /** Read a photo with the downloaded models in order, or (continuing a scan) with the next one; `consensus` is what the live camera settled on */
  const runScan = async (canvas: HTMLCanvasElement, previous?: Attempt[], consensus?: ConsensusResult) => {
    setScanning({ engine: readyEngines()[0] ?? "tesseract", fraction: 0 });
    setScanNote(null);
    setError(null);
    try {
      const attempts = await scanCanvas(canvas, setScanning, { previous, single: !!previous });
      const url = previous ? undefined : URL.createObjectURL(await new Promise<Blob>((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error("Could not keep the photo."))), "image/jpeg", 0.85)));
      const best = previous ? attempts.length - 1 : attempts.indexOf(bestAttempt(attempts)!);
      showReview(canvas, attempts, best, url, consensus);
    } catch (e) {
      setScanNote({ text: e instanceof Error ? e.message : "Could not scan the label.", error: true });
    } finally {
      setScanning(null);
    }
  };

  /** Put what Open Food Facts has for a product in the form (replacing what a scan filled, never what was typed by hand) */
  const applyOff = (food: OffFood, fromCache: boolean) => {
    const filled: Record<string, string> = { servingLabel: food.servingLabel, servingGrams: String(food.servingGrams) };
    for (const [key, v] of Object.entries(food.values)) filled[key] = String(v);
    if (!values["name"]?.trim() || scanned.has("name")) filled["name"] = food.name;
    scanFilled.current = filled;
    setAssignments([]);
    setValues((prev) => {
      const next = { ...prev };
      for (const k of scanned) next[k] = k === "servingLabel" ? "1 serving" : k === "servingGrams" ? "100" : "";
      return { ...next, ...filled };
    });
    setScanned(new Set(Object.keys(filled)));
    const count = Object.keys(food.values).length;
    const per = food.servingLabel === `${food.servingGrams} g` ? `per ${food.servingGrams} g` : `per ${food.servingLabel}`;
    setBarcodeNote(
      food.values["calories"] === undefined
        ? { text: `Open Food Facts knows this product but has no energy value for it (${count} nutrient${count === 1 ? "" : "s"} filled). Scan the label for the rest.`, error: true }
        : { text: `Filled ${count} nutrient${count === 1 ? "" : "s"} ${per} from Open Food Facts${fromCache ? " (saved on this device)" : ""} (outlined). Check them against the package before saving.`, error: false },
    );
  };

  /** Look a barcode up: this device's foods and cache, then Open Food Facts. "missed" means the label has to be scanned instead. */
  const lookUp = async (code: string): Promise<"filled" | "missed"> => {
    setBarcode({ code });
    const saved = customFoodByBarcode(code);
    if (saved) {
      setBarcodeNote({ text: `"${saved.name}" is already in your foods (saved from this barcode). Find it in Foods to log it.`, error: false });
      return "filled";
    }
    setBarcodeNote({ text: `Looking up barcode ${code} on Open Food Facts...`, error: false });
    const r = await lookupBarcode(code);
    if (r.status === "found") {
      applyOff(r.food, r.fromCache);
      setBarcode({ code, food: r.food });
      if (r.food.values["calories"] !== undefined) return "filled";
    } else {
      missed.current.add(code);
      const why = r.status === "not-found" ? `Open Food Facts does not know barcode ${code}.` : r.status === "offline" ? "Could not reach Open Food Facts (are you offline?)." : r.message;
      setBarcodeNote({ text: `${why} Scan the label instead.`, error: true });
    }
    return "missed";
  };

  /** A barcode was read from the live camera or from a chosen photo: fill the form from Open Food Facts, else carry on with the label */
  const handleBarcode = async (code: string, from: "camera" | "photo", canvas?: HTMLCanvasElement) => {
    setCameraOpen(false);
    setError(null);
    if ((await lookUp(code)) === "filled") return;
    if (from === "camera" && anyReady) {
      setBarcodeOnly(false);
      setCameraOpen(true);
    } else if (from === "photo" && canvas && anyReady) {
      await runScan(canvas);
    }
  };

  const handlePhoto = async (photo: HTMLCanvasElement | File, consensus?: ConsensusResult) => {
    setCameraOpen(false);
    try {
      const canvas = photo instanceof HTMLCanvasElement ? photo : await photoToCanvas(photo);
      if (photo instanceof File) {
        // A chosen photo may be of the barcode (or have it in view): that is looked up before the label is read
        const code = await detectBarcode(canvas).catch(() => null);
        if (code) return await handleBarcode(code, "photo", canvas);
        if (!anyReady) return setBarcodeNote({ text: "No barcode found in that photo.", error: true });
      }
      await runScan(canvas, undefined, consensus);
    } catch (e) {
      setScanNote({ text: e instanceof Error ? e.message : "Could not scan the label.", error: true });
    }
  };

  const tryNext = () => review && void runScan(review.canvas, review.attempts, review.consensus);

  // The scan lab keeps the photos for checking the models later; a front photo also names the food
  const [front, setFront] = useState<Blob | null>(null);
  const [lab, setLab] = useState<{ text: string; error: boolean } | null>(null);
  const frontPhoto = async (file: File | undefined) => {
    if (!file) return;
    setLab({ text: "Reading the name from the front...", error: false });
    try {
      // A barcode on the front photo gives the name and the values at once
      const code = await photoToCanvas(file).then(detectBarcode, () => null).catch(() => null);
      if (code && (await lookUp(code)) === "filled") {
        setFront(file);
        return setLab({ text: "Filled from the barcode on the front photo.", error: false });
      }
      const name = await nameFromFront(file);
      setFront(file);
      set("name", name);
      setLab({ text: `Name read from the front photo: "${name}". Correct it if needed.`, error: false });
    } catch (e) {
      setLab({ text: e instanceof Error ? e.message : "Could not read the front photo.", error: true });
    }
  };
  const saveToLab = async () => {
    if (!review) return;
    try {
      // The numbers the user labelled on the photo are the correct values
      const correct: CorrectValues = Object.fromEntries(assignments.map((a) => [a.key, a.value]));
      await saveScanToLab(review.canvas, review.attempts, values["name"] ?? "", front ?? undefined, correct);
      const n = assignments.length;
      setLab({ text: `Saved to the scan lab (Profile, Label scanner).${n ? ` ${n === 1 ? "The number" : `The ${n} numbers`} you labelled ${n === 1 ? "is its correct value" : "are its correct values"}.` : ""} The other models are reading it there.`, error: false });
    } catch (e) {
      setLab({ text: e instanceof Error ? e.message : "Could not save to the scan lab.", error: true });
    }
  };

  const openProfile = () => {
    onClose();
    window.dispatchEvent(new Event(OPEN_LABEL_SCANNER_EVENT));
  };

  const handleSave = () => {
    const get = (key: string) => values[key] ?? "";
    const name = get("name").trim();
    if (name.length < 1 || name.length > 60) return setError("Name is required (up to 60 characters).");
    const grams = parseField(get("servingGrams"));
    if (grams.error || grams.value === null || !isValidGrams(grams.value)) return setError(`Serving size must be from ${MIN_GRAMS} to ${MAX_GRAMS} grams.`);
    const calories = parseField(get("calories"));
    if (calories.error || calories.value === null) return setError("Calories are required and must be a number, 0 or more.");
    if (calories.value > MAX_CUSTOM_VALUE) return setError(`Values can be at most ${MAX_CUSTOM_VALUE} per serving.`);

    const perServing: Record<string, number | null> = { calories: calories.value };
    for (const key of [...MACROS.map((m) => m.key), ...MICRO_DEFS.map((m) => m.key)]) {
      const parsed = parseField(get(key));
      if (parsed.error) return setError("Nutrient values must be numbers, 0 or more.");
      if (parsed.value !== null && parsed.value > MAX_CUSTOM_VALUE) return setError(`Values can be at most ${MAX_CUSTOM_VALUE} per serving.`);
      perServing[key] = parsed.value;
    }

    const food = buildCustomFood({ name, servingLabel: get("servingLabel").trim() || "1 serving", servingGrams: grams.value, perServing, barcode: barcode?.code });
    if (!saveCustomFood(food)) return setError("Could not save: browser storage is full or unavailable.");
    onSaved(food);
  };

  const field = (key: string, label: string, placeholder?: string) => (
    <label key={key} className="block">
      <span className="text-[0.6875rem] font-medium block mb-0.5" style={{ color: "var(--muted)" }}>{label}</span>
      <input
        type="text"
        inputMode="decimal"
        value={values[key] ?? ""}
        placeholder={placeholder}
        onChange={(e) => set(key, e.target.value)}
        onFocus={() => focusField(key)}
        className="w-full px-3 py-2 rounded-lg text-sm outline-none"
        style={scanned.has(key) ? scannedStyle : inputStyle}
      />
    </label>
  );

  return (
    <Modal
      titleId="custom-food-title"
      onClose={onClose}
      sheet
      className="w-full max-w-lg max-h-[90vh] flex flex-col rounded-t-2xl sm:rounded-2xl overflow-hidden"
      style={{ background: "var(--paper)", border: "1px solid var(--line)" }}
    >
        <div className="flex items-center justify-between px-4 py-3 shrink-0" style={{ borderBottom: "1px solid var(--line)" }}>
          <h2 id="custom-food-title" className="text-base font-bold" style={{ color: "var(--ink)" }}>Create food</h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="w-7 h-7 flex items-center justify-center rounded-lg cursor-pointer"
            style={{ background: "var(--panel)", border: "none", color: "var(--ink)" }}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-4 flex flex-col gap-3 overflow-y-auto">
          {anyReady && (
            <button
              onClick={() => {
                setBarcodeOnly(false);
                setCameraOpen(true);
              }}
              disabled={scanning !== null}
              className="w-full py-2.5 rounded-lg text-sm font-semibold cursor-pointer disabled:opacity-60"
              style={{ background: "var(--panel)", border: "1px solid var(--accent)", color: "var(--accent)" }}
            >
              {scanning === null
                ? review ? "Scan again" : "Scan label"
                : `Reading with ${ENGINES[scanning.engine].name}...${scanning.fraction > 0 ? ` ${Math.round(scanning.fraction * 100)}%` : ""}`}
            </button>
          )}
          <button
            onClick={() => {
              setBarcodeOnly(true);
              setCameraOpen(true);
            }}
            disabled={scanning !== null}
            className="w-full py-2.5 rounded-lg text-sm font-semibold cursor-pointer disabled:opacity-60"
            style={{ background: "var(--panel)", border: "1px solid var(--accent)", color: "var(--accent)" }}
          >
            Scan barcode
          </button>
          {!anyReady && Object.values(engines).some((e) => e.status === "none" || e.status === "downloading") && (
            <p className="text-[0.6875rem]" style={{ color: "var(--muted)" }}>
              Want to fill this in from a photo of the label?{" "}
              <button
                onClick={openProfile}
                className="underline cursor-pointer"
                style={{ background: "none", border: "none", padding: 0, color: "var(--accent)", font: "inherit" }}
              >
                Set up Label scanner in Profile
              </button>
              .
            </p>
          )}
          {scanNote && (
            <p role="status" data-testid="scan-note" data-confidence={review?.attempts[review.shown]?.confidence?.toFixed(0)} data-good={review?.attempts[review.shown]?.good} className="text-xs" style={{ color: scanNote.error ? "var(--error)" : "var(--muted)" }}>
              {scanNote.text}
            </p>
          )}
          {barcodeNote && (
            <p role="status" data-testid="barcode-note" className="text-xs" style={{ color: barcodeNote.error ? "var(--error)" : "var(--muted)" }}>
              {barcodeNote.text}
            </p>
          )}
          {barcode?.food && (
            <p data-testid="off-attribution" className="text-[0.6875rem]" style={{ color: "var(--muted)" }}>
              Data from{" "}
              <a href={`https://world.openfoodfacts.org/product/${barcode.code}`} target="_blank" rel="noopener noreferrer" className="underline" style={{ color: "var(--accent)" }}>
                Open Food Facts
              </a>{" "}
              (ODbL).
            </p>
          )}
          {review && (
            <>
              {review.attempts.length > 1 && (
                <div className="flex flex-wrap gap-1.5" role="group" aria-label="Models that read the label">
                  {review.attempts.map((a, i) => (
                    <button
                      key={a.engine}
                      type="button"
                      aria-pressed={i === review.shown}
                      data-confidence={a.confidence === null ? "" : Math.round(a.confidence)}
                      data-good={a.good}
                      onClick={() => showReview(review.canvas, review.attempts, i, undefined, review.consensus)}
                      className="px-2.5 py-1 rounded-full text-[0.6875rem] font-semibold cursor-pointer"
                      style={{
                        background: i === review.shown ? "var(--accent)" : "var(--paper)",
                        color: i === review.shown ? "#fff" : "var(--ink)",
                        border: "1px solid var(--accent)",
                      }}
                    >
                      {ENGINES[a.engine].name}: {a.scan ? `${Object.keys(a.scan.values).length} values` : "failed"}
                    </button>
                  ))}
                </div>
              )}
              {review.attempts[review.shown]?.result && review.attempts[review.shown]?.scan && (
                <LabelReview imageUrl={review.url} result={review.attempts[review.shown]!.result!} scan={review.attempts[review.shown]!.scan!} selected={selected} onSelect={setSelected} assignments={assignments} servingGrams={Number(values["servingGrams"]) || 0} onAssign={assignBox} onUnassign={unassignBox} />
              )}
              {scanning === null && nextEngine(new Set(readyEngines()), review.attempts) && (
                <button
                  type="button"
                  onClick={tryNext}
                  className="w-full py-2 rounded-lg text-xs font-semibold cursor-pointer"
                  style={{ background: "var(--paper)", border: "1px solid var(--line)", color: "var(--ink)" }}
                >
                  Try next model ({ENGINES[nextEngine(new Set(readyEngines()), review.attempts)!].name})
                </button>
              )}
            </>
          )}
          {anyReady && (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[0.6875rem]" style={{ color: "var(--muted)" }}>
              <label className="underline cursor-pointer" style={{ color: "var(--accent)" }}>
                Name from front photo
                <input type="file" accept="image/*" capture="environment" hidden data-testid="front-photo" onChange={(e) => { void frontPhoto(e.target.files?.[0]); e.target.value = ""; }} />
              </label>
              {review && (
                <button type="button" onClick={() => void saveToLab()} className="underline cursor-pointer" style={{ background: "none", border: "none", padding: 0, color: "var(--accent)", font: "inherit" }}>
                  Save to scan lab
                </button>
              )}
            </div>
          )}
          {lab && <p role="status" data-testid="lab-note" className="text-xs" style={{ color: lab.error ? "var(--error)" : "var(--muted)" }}>{lab.text}</p>}
          {cameraOpen && (
            <LabelCamera
              barcodeOnly={barcodeOnly}
              ignoreBarcodes={missed.current}
              onBarcode={(code) => void handleBarcode(code, "camera")}
              onPhoto={(p, c) => void handlePhoto(p, c)}
              onClose={() => setCameraOpen(false)}
            />
          )}
          <label className="block">
            <span className="text-[0.6875rem] font-medium block mb-0.5" style={{ color: "var(--muted)" }}>Name</span>
            <input
              type="text"
              value={values["name"]}
              maxLength={60}
              autoFocus
              onChange={(e) => set("name", e.target.value)}
              onFocus={() => focusField("name")}
              className="w-full px-3 py-2 rounded-lg text-sm outline-none"
              style={scanned.has("name") ? scannedStyle : inputStyle}
            />
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className="block">
              <span className="text-[0.6875rem] font-medium block mb-0.5" style={{ color: "var(--muted)" }}>Serving name</span>
              <input
                type="text"
                value={values["servingLabel"]}
                onChange={(e) => set("servingLabel", e.target.value)}
                onFocus={() => focusField("servingLabel")}
                className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                style={scanned.has("servingLabel") ? scannedStyle : inputStyle}
              />
            </label>
            {field("servingGrams", "Serving size (g)")}
          </div>
          <p className="text-[0.6875rem]" style={{ color: "var(--muted)" }}>Enter the label values for one serving.</p>
          <div className="grid grid-cols-2 gap-2">
            {field("calories", "Calories (required)")}
            {MACROS.map((m) => field(m.key, m.label))}
          </div>
          <details open={MICRO_DEFS.some((m) => scanned.has(m.key)) || undefined}>
            <summary className="text-xs cursor-pointer" style={{ color: "var(--muted)" }}>More nutrients (optional)</summary>
            <div className="grid grid-cols-2 gap-2 mt-2">
              {MICRO_DEFS.map((m) => field(m.key, `${m.label} (${m.unit})`))}
            </div>
          </details>

          {error && (
            <p role="alert" className="text-xs font-medium" style={{ color: "#ef4444" }}>
              {error}
            </p>
          )}
          <button
            onClick={handleSave}
            className="w-full py-2.5 rounded-lg text-sm font-semibold cursor-pointer"
            style={{ background: "var(--accent)", color: "#fff", border: "none" }}
          >
            Save food
          </button>
        </div>
    </Modal>
  );
}
