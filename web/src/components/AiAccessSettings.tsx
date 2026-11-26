import type { BridgeStatus } from "@freeappstore/sdk/bridge";

const DESKTOP_URL = "https://freeappstore.online/download";

const STATUS: Record<BridgeStatus, { label: string; dot: string }> = {
  off: { label: "Off", dot: "var(--muted)" },
  connecting: { label: "Desktop app not running", dot: "var(--warning)" },
  connected: { label: "Connected", dot: "var(--success)" },
  rejected: { label: "Rejected by the desktop app", dot: "var(--error)" },
};

interface AiAccessSettingsProps {
  allowed: boolean;
  setAllowed: (allowed: boolean) => void;
  status: BridgeStatus;
}

/** Profile section: let an AI on this computer use the scan lab and food log through the FreeAppStore desktop app */
export default function AiAccessSettings({ allowed, setAllowed, status }: AiAccessSettingsProps) {
  const shown = allowed ? STATUS[status] : STATUS.off;
  return (
    <div id="ai-access" className="rounded-xl p-4 mt-4 space-y-3" style={{ background: "var(--panel)", border: "1px solid var(--line)" }}>
      <div>
        <h2 className="text-sm font-semibold" style={{ color: "var(--ink)" }}>
          AI access
        </h2>
        <p className="text-xs mt-1" style={{ color: "var(--muted)" }}>
          Let an AI on this computer, such as Claude, read and edit your food log and scan lab through the FreeAppStore desktop app. It can see your
          log, targets and scan lab photos, and can add entries and foods. Your data stays in this browser; nothing goes to a server. It is off until you turn it on.
        </p>
        <p className="text-xs mt-1" style={{ color: "var(--muted)" }}>
          This works on a computer only. The phone app has no desktop app to connect to, so the switch does nothing there.
        </p>
      </div>
      <label className="flex items-center gap-2 text-sm font-medium cursor-pointer" style={{ color: "var(--ink)" }}>
        <input type="checkbox" role="switch" checked={allowed} onChange={(e) => setAllowed(e.target.checked)} style={{ accentColor: "var(--accent)", margin: 0 }} />
        Allow AI access
      </label>
      {allowed && (
        <p className="text-xs flex items-center gap-1.5 flex-wrap" style={{ color: "var(--muted)" }}>
          <span aria-hidden className="inline-block rounded-full" style={{ width: 8, height: 8, background: shown.dot }} />
          <span role="status" aria-live="polite" data-testid="ai-status">
            {shown.label}
          </span>
          {status !== "connected" && (
            <a href={DESKTOP_URL} target="_blank" rel="noopener noreferrer" style={{ color: "var(--accent)" }}>
              Install and open the FreeAppStore desktop app
            </a>
          )}
        </p>
      )}
    </div>
  );
}
