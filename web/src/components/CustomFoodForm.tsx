import { useRef, useState } from "react";
import type { CustomFood } from "../data/types";
import { CUSTOM_IMAGE, isValidGrams, MAX_CUSTOM_VALUE, MAX_GRAMS, MIN_GRAMS, newCustomId, saveCustomFood } from "../lib/customFoods";
import { MICRO_DEFS } from "../data/types";
import { OPEN_LABEL_SCANNER_EVENT, photoToCanvas, scanCanvas, useEngines, type ScanProgress } from "../lib/labelScanner";
import { bestAttempt, nextEngine, type Attempt } from "../lib/ocr/chain";
import { ENGINES, readyEngines } from "../lib/ocr/engines";
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

const round = (n: number, dp: number) => Math.round(n * 10 ** dp) / 10 ** dp;

/** Fields filled from a scan get an accent border until the user edits them */
const scannedStyle = { ...inputStyle, border: "1px solid var(--accent)" };

/** Create a custom food from label values entered per serving; stored per 100 g */
export default function CustomFoodForm({ onSaved, onClose }: CustomFoodFormProps) {
  const [values, setValues] = useState<Record<string, string>>({ name: "", servingLabel: "1 serving", servingGrams: "100", calories: "" });
  const [error, setError] = useState<string | null>(null);
  const engines = useEngines();
  const anyReady = readyEngines().length > 0;
  const photoRef = useRef<HTMLInputElement>(null);
  const [scanning, setScanning] = useState<ScanProgress | null>(null);
  const [scanned, setScanned] = useState<Set<string>>(new Set());
  const [scanNote, setScanNote] = useState<{ text: string; error: boolean } | null>(null);
  // What the last scan saw: the photo, every model's attempt, and the one whose values are in the form
  const [review, setReview] = useState<{ canvas: HTMLCanvasElement; attempts: Attempt[]; shown: number } | null>(null);
  const set = (key: string, v: string) => {
    setValues((prev) => ({ ...prev, [key]: v }));
    setScanned((prev) => (prev.has(key) ? new Set([...prev].filter((k) => k !== key)) : prev));
  };

  /** Put one attempt's values in the form (replacing what an earlier attempt filled, never what was typed by hand) */
  const apply = (attempt: Attempt, attempts: Attempt[]) => {
    const scan = attempt.scan;
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
    setValues((prev) => {
      const next = { ...prev };
      for (const k of scanned) next[k] = k === "servingLabel" ? "1 serving" : k === "servingGrams" ? "100" : "";
      return { ...next, ...filled };
    });
    setScanned(new Set(Object.keys(filled)));
    // No model read all four key values cleanly: this is the best of what they read
    const weak = attempts.length > 1 && !attempt.good && !nextEngine(new Set(readyEngines()), attempts) ? "No model read the whole label cleanly; these are the best reading. " : "";
    setScanNote({
      text: `Filled ${count} nutrient${count === 1 ? "" : "s"} from the label (outlined). ${how} ${weak}Check them against the label before saving. ${scan.warnings.join(" ")}`.trim(),
      error: scan.warnings.length > 0 || weak !== "",
    });
  };

  const showReview = (canvas: HTMLCanvasElement, attempts: Attempt[], shown: number) => {
    setReview({ canvas, attempts, shown });
    const attempt = attempts[shown];
    if (attempt) apply(attempt, attempts);
  };

  /** Read a photo with the downloaded models in order, or (continuing a scan) with the next one */
  const runScan = async (canvas: HTMLCanvasElement, previous?: Attempt[]) => {
    setScanning({ engine: readyEngines()[0] ?? "tesseract", fraction: 0 });
    setScanNote(null);
    setError(null);
    try {
      const attempts = await scanCanvas(canvas, setScanning, { previous, single: !!previous });
      const best = previous ? attempts.length - 1 : attempts.indexOf(bestAttempt(attempts)!);
      showReview(canvas, attempts, best);
    } catch (e) {
      setScanNote({ text: e instanceof Error ? e.message : "Could not scan the label.", error: true });
    } finally {
      setScanning(null);
    }
  };

  const handlePhoto = async (photo: File | undefined) => {
    if (!photo) return;
    try {
      await runScan(await photoToCanvas(photo));
    } catch (e) {
      setScanNote({ text: e instanceof Error ? e.message : "Could not scan the label.", error: true });
    }
  };

  const tryNext = () => review && void runScan(review.canvas, review.attempts);

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

    const per100 = (key: string, dp: number) => {
      const v = perServing[key];
      return v === null || v === undefined ? null : round((v * 100) / grams.value!, dp);
    };
    const food: CustomFood = {
      id: newCustomId(),
      name,
      category: "custom",
      image: CUSTOM_IMAGE,
      servingLabel: get("servingLabel").trim() || "1 serving",
      servingGrams: grams.value,
      calories: per100("calories", 1)!,
      protein: per100("protein", 1) ?? 0,
      carbs: per100("carbs", 1) ?? 0,
      fat: per100("fat", 1) ?? 0,
      fiber: per100("fiber", 1) ?? 0,
      sugar: per100("sugar", 1) ?? 0,
      satFat: per100("satFat", 3),
      cholesterol: per100("cholesterol", 3),
      sodium: per100("sodium", 3),
      potassium: per100("potassium", 3),
      calcium: per100("calcium", 3),
      iron: per100("iron", 3),
      magnesium: per100("magnesium", 3),
      vitaminA: per100("vitaminA", 3),
      vitaminC: per100("vitaminC", 3),
      vitaminD: per100("vitaminD", 3),
      vitaminB12: per100("vitaminB12", 3),
    };
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
              onClick={() => photoRef.current?.click()}
              disabled={scanning !== null}
              className="w-full py-2.5 rounded-lg text-sm font-semibold cursor-pointer disabled:opacity-60"
              style={{ background: "var(--panel)", border: "1px solid var(--accent)", color: "var(--accent)" }}
            >
              {scanning === null
                ? review ? "Scan again" : "Scan label"
                : `Reading with ${ENGINES[scanning.engine].name}...${scanning.fraction > 0 ? ` ${Math.round(scanning.fraction * 100)}%` : ""}`}
            </button>
          )}
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
                      onClick={() => showReview(review.canvas, review.attempts, i)}
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
          <input
            ref={photoRef}
            type="file"
            accept="image/*"
            capture="environment"
            aria-label="Label photo"
            className="hidden"
            onChange={(e) => {
              void handlePhoto(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
          <label className="block">
            <span className="text-[0.6875rem] font-medium block mb-0.5" style={{ color: "var(--muted)" }}>Name</span>
            <input
              type="text"
              value={values["name"]}
              maxLength={60}
              autoFocus
              onChange={(e) => set("name", e.target.value)}
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
