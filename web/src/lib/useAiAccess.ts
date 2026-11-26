import { useEffect, useRef, useState } from "react";
import { exposeTools, type BridgeStatus, type ToolBridge } from "@freeappstore/sdk/bridge";
import { buildTools, DATA_CHANGED_EVENT } from "./aiTools";
import { ensureEnginesChecked, readyEngines } from "./ocr/engines";
import { runItem } from "./scanLab/run";

// Not "calories_…": backups copy every key with that prefix, and restoring a backup must never switch AI access on.
const STORAGE_KEY = "calories-ai-access";

function loadAllowed(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

const tools = () =>
  buildTools({
    rerun: (id, engine) => runItem(id, { engine }),
    readyEngines,
    changed: () => window.dispatchEvent(new Event(DATA_CHANGED_EVENT)),
  });

/** "Allow AI access" toggle: offers the scan lab and food log tools to the FreeAppStore desktop app while on. Off by default. */
export function useAiAccess() {
  const [allowed, setAllowed] = useState(loadAllowed);
  const [status, setStatus] = useState<BridgeStatus>("off");
  const bridgeRef = useRef<ToolBridge | null>(null);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, allowed ? "1" : "0");
    } catch {
      /* ignore */
    }
    if (!allowed) {
      bridgeRef.current?.setEnabled(false);
      return;
    }
    ensureEnginesChecked();
    if (bridgeRef.current) bridgeRef.current.setEnabled(true);
    // appId: off <id>.freeappstore.online (local dev, preview) the bridge needs it; on the store it is the same
    else bridgeRef.current = exposeTools({ appId: "calories", tools: tools(), onStatus: setStatus });
  }, [allowed]);

  useEffect(
    () => () => {
      bridgeRef.current?.close();
      bridgeRef.current = null;
    },
    [],
  );

  return { allowed, setAllowed, status };
}
