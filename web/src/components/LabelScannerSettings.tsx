import { useState } from "react";
import { ENGINES, downloadBytes, downloadEngine, removeEngine, useEngines } from "../lib/ocr/engines";
import { ENGINE_ORDER } from "../lib/ocr/chain";
import type { EngineId } from "../lib/ocr/types";

const btn = "px-3 py-2 rounded-lg text-sm font-medium cursor-pointer";
const btnStyle = { background: "var(--paper)", border: "1px solid var(--line)", color: "var(--ink)" };
const primaryStyle = { ...btnStyle, background: "var(--accent)", color: "#fff", border: "none" };

const megabytes = (id: EngineId) => Math.round(downloadBytes(id) / 1_000_000);

/** A download this large is confirmed first, in the page rather than in a dialog */
const BIG_MB = 100;

function EngineRow({ id, position }: { id: EngineId; position: number }) {
  const engine = ENGINES[id];
  const { status, progress, error } = useEngines()[id];
  const [confirming, setConfirming] = useState(false);
  const percent = Math.round(progress * 100);
  const mb = megabytes(id);

  const statusText =
    status === "ready" ? "Ready" : status === "downloading" ? `Downloading ${percent}%` : status === "none" ? "Not downloaded" : status === "unsupported" ? "Not available in this browser" : "Checking...";

  const start = () => {
    setConfirming(false);
    void downloadEngine(id);
  };

  return (
    <div data-engine={id} className="rounded-lg p-3 space-y-2" style={{ background: "var(--paper)", border: "1px solid var(--line)" }}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold" style={{ color: "var(--ink)" }}>
            {position}. {engine.name}
            {engine.tag && (
              <span
                className="ml-2 align-middle px-1.5 py-0.5 rounded text-[0.625rem] font-semibold"
                style={{
                  background: `color-mix(in srgb, ${engine.tag.tone === "good" ? "var(--success)" : "var(--warning)"} 18%, transparent)`,
                  color: engine.tag.tone === "good" ? "var(--success)" : "var(--warning)",
                }}
              >
                {engine.tag.text}
              </span>
            )}
          </h3>
          <p className="text-xs mt-0.5" style={{ color: "var(--muted)" }}>
            {engine.about}
          </p>
          <p className="text-[0.6875rem] mt-1" style={{ color: "var(--muted)" }}>
            {mb} MB &middot; {engine.speed} &middot; {engine.licence}
          </p>
        </div>
      </div>

      <div className="flex items-center justify-between gap-3">
        <span className="text-xs" style={{ color: "var(--ink)" }}>
          Status: <span role="status" className="font-semibold">{statusText}</span>
        </span>
        {status === "none" && !confirming && (
          <button className={btn} style={primaryStyle} onClick={() => (mb >= BIG_MB ? setConfirming(true) : start())}>
            Download ({mb} MB)
          </button>
        )}
        {status === "ready" && (
          <button className={btn} style={btnStyle} onClick={() => void removeEngine(id)}>
            Remove
          </button>
        )}
      </div>

      {confirming && (
        <div className="rounded-lg p-2.5 space-y-2" style={{ background: "var(--panel)", border: "1px solid var(--line)" }}>
          <p className="text-xs" style={{ color: "var(--ink)" }}>
            This is a large download ({mb} MB) and takes the same space on this device. A Wi-Fi connection is best.
          </p>
          <div className="flex gap-2">
            <button className={btn} style={primaryStyle} onClick={start}>
              Download {mb} MB
            </button>
            <button className={btn} style={btnStyle} onClick={() => setConfirming(false)}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {status === "downloading" && (
        <div
          role="progressbar"
          aria-label={`${engine.name} download`}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percent}
          className="h-1.5 rounded-full overflow-hidden"
          style={{ background: "var(--line)" }}
        >
          <div className="h-full" style={{ width: `${percent}%`, background: "var(--accent)" }} />
        </div>
      )}

      {error && (
        <p role="alert" className="text-xs font-medium" style={{ color: "var(--error)" }}>
          {error}
        </p>
      )}
    </div>
  );
}

/** Profile section: optional downloads of the on-device OCR models used by Scan label in Create food */
export default function LabelScannerSettings() {
  return (
    <div id="label-scanner" className="rounded-xl p-4 mt-4 space-y-3" style={{ background: "var(--panel)", border: "1px solid var(--line)" }}>
      <div>
        <h2 className="text-sm font-semibold" style={{ color: "var(--ink)" }}>
          Label scanner
        </h2>
        <p className="text-xs mt-1" style={{ color: "var(--muted)" }}>
          Point the camera at a nutrition label to fill in a custom food. Text is read on this device by open-source models, so no photo is ever
          uploaded. Download any of them below; nothing downloads until you tap, and each is kept for offline use.
        </p>
        <p className="text-xs mt-1" style={{ color: "var(--muted)" }}>
          A scan tries the models you have downloaded in the order shown, and stops at the first one that reads all four of calories, protein,
          carbs and fat.
        </p>
      </div>
      {ENGINE_ORDER.map((id, i) => (
        <EngineRow key={id} id={id} position={i + 1} />
      ))}
    </div>
  );
}
