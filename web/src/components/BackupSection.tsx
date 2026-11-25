import { useRef, useState } from "react";
import { applyBackup, buildBackup, logsToCsv, parseBackup } from "../lib/backup";
import { today } from "../lib/dates";
import type { Backup, BackupSummary } from "../lib/backup";

type Mode = "merge" | "replace";

function download(filename: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

const btn = "px-3 py-2 rounded-lg text-sm font-medium cursor-pointer";
const btnStyle = { background: "var(--paper)", border: "1px solid var(--line)", color: "var(--ink)" };

export default function BackupSection() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<{ backup: Backup; summary: BackupSummary } | null>(null);
  const [mode, setMode] = useState<Mode | null>(null);
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);

  const handleFile = async (file: File | undefined) => {
    setPending(null);
    setMode(null);
    if (!file) return;
    const result = parseBackup(await file.text());
    if (!result.ok) {
      setMessage({ text: result.error, error: true });
      return;
    }
    setMessage(null);
    setPending(result);
  };

  const handleImport = () => {
    if (!pending || !mode) return;
    applyBackup(pending.backup, mode);
    setMessage({ text: "Import complete. Reloading...", error: false });
    setPending(null);
    window.location.reload();
  };

  return (
    <div
      className="rounded-xl p-4 mt-4 space-y-3"
      style={{ background: "var(--panel)", border: "1px solid var(--line)" }}
    >
      <div>
        <h2 className="text-sm font-semibold" style={{ color: "var(--ink)" }}>
          Backup and restore
        </h2>
        <p className="text-xs mt-1" style={{ color: "var(--muted)" }}>
          Your data lives only in this browser. Download a backup to keep it safe or move it to another device.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          className={btn}
          style={btnStyle}
          onClick={() => download(`calories-backup-${today()}.json`, JSON.stringify(buildBackup(), null, 2), "application/json")}
        >
          Export backup
        </button>
        <button
          className={btn}
          style={btnStyle}
          onClick={() => download(`calories-log-${today()}.csv`, logsToCsv(), "text/csv")}
        >
          Export CSV
        </button>
        <button className={btn} style={btnStyle} onClick={() => fileRef.current?.click()}>
          Import
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          aria-label="Backup file"
          className="hidden"
          onChange={(e) => {
            void handleFile(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
      </div>

      {pending && (
        <div className="space-y-2 text-xs" style={{ color: "var(--ink)" }}>
          <div>
            Backup contains {pending.summary.days} logged day{pending.summary.days === 1 ? "" : "s"},{" "}
            {pending.summary.savedMeals} saved meal{pending.summary.savedMeals === 1 ? "" : "s"}
            {pending.summary.hasGoals ? ", goals" : ""}
            {pending.summary.hasProfile ? ", profile" : ""}.
          </div>
          <div className="flex gap-2" role="radiogroup" aria-label="Import mode">
            {(["merge", "replace"] as const).map((m) => (
              <button
                key={m}
                role="radio"
                aria-checked={mode === m}
                className={btn}
                style={{
                  ...btnStyle,
                  ...(mode === m ? { border: "1px solid var(--accent)", color: "var(--accent)" } : {}),
                }}
                onClick={() => setMode(m)}
              >
                {m === "merge" ? "Merge" : "Replace"}
              </button>
            ))}
          </div>
          {mode && (
            <div style={{ color: "var(--muted)" }}>
              {mode === "merge"
                ? "Merge adds the backup's data and keeps your other local days."
                : "Replace deletes all current Calories data in this browser first."}
            </div>
          )}
          <div className="flex gap-2">
            <button
              className={btn}
              disabled={!mode}
              onClick={handleImport}
              style={{
                background: mode === "replace" ? "var(--error)" : "var(--accent)",
                color: "#fff",
                border: "none",
                opacity: mode ? 1 : 0.5,
              }}
            >
              {mode === "replace" ? "Confirm replace" : "Confirm import"}
            </button>
            <button
              className={btn}
              style={btnStyle}
              onClick={() => {
                setPending(null);
                setMode(null);
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {message && (
        <div className="text-xs" role="status" style={{ color: message.error ? "var(--error)" : "var(--success)" }}>
          {message.text}
        </div>
      )}
    </div>
  );
}
