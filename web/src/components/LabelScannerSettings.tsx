import { OCR_DOWNLOAD_BYTES, downloadLabelScanner, removeLabelScanner, useLabelScanner } from "../lib/labelScanner";

const btn = "px-3 py-2 rounded-lg text-sm font-medium cursor-pointer";
const btnStyle = { background: "var(--paper)", border: "1px solid var(--line)", color: "var(--ink)" };

const SIZE_MB = Math.round(OCR_DOWNLOAD_BYTES / 1_000_000);

/** Profile section: optional download of the on-device OCR model used by Scan label in Create food */
export default function LabelScannerSettings() {
  const { status, progress, error } = useLabelScanner();
  const percent = Math.round(progress * 100);

  const statusText =
    status === "ready" ? "Ready" : status === "downloading" ? `Downloading ${percent}%` : status === "none" ? "Not downloaded" : status === "unsupported" ? "Not available in this browser" : "Checking...";

  return (
    <div id="label-scanner" className="rounded-xl p-4 mt-4 space-y-3" style={{ background: "var(--panel)", border: "1px solid var(--line)" }}>
      <div>
        <h2 className="text-sm font-semibold" style={{ color: "var(--ink)" }}>
          Label scanner
        </h2>
        <p className="text-xs mt-1" style={{ color: "var(--muted)" }}>
          Photograph a nutrition label to fill in a custom food. Text is read on this device by Tesseract (open source, Apache-2.0)
          using its English model, so no photo is ever uploaded. It is a one-time download of about {SIZE_MB} MB, kept for offline use.
        </p>
      </div>

      <div className="flex items-center justify-between gap-3">
        <span className="text-xs" style={{ color: "var(--ink)" }}>
          Status: <span role="status" className="font-semibold">{statusText}</span>
        </span>
        {status === "none" && (
          <button className={btn} style={{ ...btnStyle, background: "var(--accent)", color: "#fff", border: "none" }} onClick={() => void downloadLabelScanner()}>
            Download ({SIZE_MB} MB)
          </button>
        )}
        {status === "ready" && (
          <button className={btn} style={btnStyle} onClick={() => void removeLabelScanner()}>
            Remove
          </button>
        )}
      </div>

      {status === "downloading" && (
        <div
          role="progressbar"
          aria-label="Label scanner download"
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
