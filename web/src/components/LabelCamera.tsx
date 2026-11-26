import { useCallback, useEffect, useRef, useState } from "react";
import { parseLabel, type LabelField } from "../lib/labelParser";
import { fitCanvas, openLiveEngine } from "../lib/labelScanner";
import { keyValues, readyToCapture, thumbnail, type LiveFrame } from "../lib/liveScan";
import { energyAgrees, KEY_FIELDS } from "../lib/ocr/chain";
import { ENGINES } from "../lib/ocr/engines";
import { highlightsOf, type Highlight } from "../lib/ocr/provenance";
import { ocrText, type EngineId, type OcrLine } from "../lib/ocr/types";
import LabelOverlay, { fieldColor } from "./LabelOverlay";
import Modal from "./Modal";

interface LabelCameraProps {
  /** A photo of the label: the camera's full-resolution frame, or a file the user chose */
  onPhoto: (photo: HTMLCanvasElement | File) => void;
  onClose: () => void;
}

type CameraState = "starting" | "live" | "paused" | "denied" | "unavailable";

/** Longest side of the frames the live view reads: small enough to keep up */
const LIVE_SIDE = 1280;
/** Least time between live reads: about 1.5 a second at most, and never two at once */
const LIVE_INTERVAL_MS = 650;

const KEY_LABELS: Record<string, string> = { calories: "Calories", protein: "Protein", carbs: "Carbs", fat: "Fat" };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const MESSAGES: Record<"denied" | "unavailable", string> = {
  denied: "Camera access was not allowed. You can allow it in the browser settings, or choose a photo of the label instead.",
  unavailable: "No camera is available here. Choose a photo of the label instead.",
};

/** Live camera view with a framing guide and boxes on the text it can read; falls back to choosing a photo */
export default function LabelCamera({ onPhoto, onClose }: LabelCameraProps) {
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<CameraState>("starting");
  const [auto, setAuto] = useState(false);
  const autoRef = useRef(auto);
  autoRef.current = auto;
  const [live, setLive] = useState<{ lines: OcrLine[]; width: number; height: number; highlights: Highlight[]; values: Partial<Record<LabelField, number>>; engine: EngineId } | null>(null);
  const [liveOff, setLiveOff] = useState<string | null>(null);
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const done = useRef(false);
  const frameBox = useRef<HTMLDivElement>(null);
  const reads = useRef(0);

  const stop = useCallback(() => {
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
    if (video.current) video.current.srcObject = null;
  }, []);

  const start = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia) return setState("unavailable");
    setState("starting");
    try {
      // Ask for a frame the shape of the screen, so a phone held upright does not get a sideways picture
      const upright = window.innerHeight > window.innerWidth;
      const s = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" }, width: { ideal: upright ? 1080 : 1920 }, height: { ideal: upright ? 1920 : 1080 } },
        audio: false,
      });
      if (done.current) return s.getTracks().forEach((t) => t.stop());
      stream.current = s;
      const v = video.current;
      if (!v) return;
      v.srcObject = s;
      await v.play().catch(() => undefined);
      setState("live");
    } catch (e) {
      setState(e instanceof DOMException && (e.name === "NotAllowedError" || e.name === "SecurityError") ? "denied" : "unavailable");
    }
  }, []);

  // Open on mount, release on close, and let go of the camera whenever the page is hidden
  useEffect(() => {
    done.current = false;
    void start();
    const onVisibility = () => {
      if (document.hidden) {
        stop();
        setState((s) => (s === "live" || s === "starting" ? "paused" : s));
      } else if (!done.current && !stream.current) void start();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      done.current = true;
      document.removeEventListener("visibilitychange", onVisibility);
      stop();
    };
  }, [start, stop]);

  const capture = useCallback(() => {
    const v = video.current;
    if (!v || !v.videoWidth || done.current) return;
    done.current = true;
    const canvas = fitCanvas(v, v.videoWidth, v.videoHeight);
    stop();
    onPhoto(canvas);
  }, [onPhoto, stop]);
  const captureRef = useRef(capture);
  captureRef.current = capture;

  // The live read: the fastest downloaded model, one frame at a time, never overlapping, paused when hidden
  useEffect(() => {
    if (state !== "live") return;
    let cancelled = false;
    let close: (() => Promise<void>) | undefined;
    const frames: LiveFrame[] = [];
    void (async () => {
      let opened;
      try {
        opened = await openLiveEngine();
      } catch {
        return setLiveOff("The live read could not start. You can still take the photo.");
      }
      if (!opened) return setLiveOff("No model that is fast enough for the live view is downloaded. You can still take the photo.");
      close = opened.runtime.close;
      const { engine, runtime } = opened;
      while (!cancelled) {
        const v = video.current;
        if (document.hidden || !v || v.readyState < 2 || !v.videoWidth) {
          await sleep(250);
          continue;
        }
        const t0 = performance.now();
        const long = Math.max(v.videoWidth, v.videoHeight);
        const scale = Math.min(1, LIVE_SIDE / long);
        const frame = document.createElement("canvas");
        frame.width = Math.round(v.videoWidth * scale);
        frame.height = Math.round(v.videoHeight * scale);
        frame.getContext("2d")!.drawImage(v, 0, 0, frame.width, frame.height);
        try {
          const result = await runtime.recognise(frame, undefined, { fast: true });
          if (cancelled) break;
          const scan = parseLabel(ocrText(result));
          const values = keyValues(scan);
          if (frameBox.current) frameBox.current.dataset.reads = String(++reads.current);
          setLive({ lines: result.lines, width: result.width, height: result.height, highlights: highlightsOf(scan, result.lines).filter((h) => KEY_FIELDS.includes(h.field as LabelField)), values, engine });
          frames.push({ values, thumb: thumbnail(frame) });
          if (frames.length > 4) frames.shift();
          if (autoRef.current && readyToCapture(frames)) {
            captureRef.current();
            break;
          }
        } catch {
          if (cancelled) break;
        }
        await sleep(Math.max(0, LIVE_INTERVAL_MS - (performance.now() - t0)));
      }
    })();
    return () => {
      cancelled = true;
      void close?.().catch(() => undefined);
    };
  }, [state]);

  const unavailable = state === "denied" || state === "unavailable";
  // Until the camera reports its size, assume the screen shape
  const aspect = size ? size.w / size.h : window.innerWidth / window.innerHeight;

  // Overlaid controls sit on a dark scrim so they stay legible over any picture
  const glass = { background: "rgba(0,0,0,0.55)", color: "#fff", border: "1px solid rgba(255,255,255,0.25)" };

  return (
    <Modal
      titleId="label-camera-title"
      onClose={onClose}
      className="relative w-full h-full overflow-hidden"
      style={{ background: "#000" }}
    >
      <h2 id="label-camera-title" className="sr-only">
        Scan label
      </h2>

      {unavailable ? (
        <div className="absolute inset-0 flex items-center justify-center px-6">
          <p role="status" className="text-sm text-center" style={{ color: "#e5e7eb" }}>
            {MESSAGES[state]}
          </p>
        </div>
      ) : (
        // Full screen: the video covers the screen (edges cropped, never letterboxed). The overlay boxes share the
        // video's box, so they stay aligned with the text.
        <div className="absolute inset-0" style={{ containerType: "size" }}>
          <div
            ref={frameBox}
            data-testid="camera-frame"
            className="absolute left-1/2 top-1/2"
            style={{
              width: `max(100cqw, calc(100cqh * ${aspect}))`,
              height: `max(100cqh, calc(100cqw / ${aspect}))`,
              transform: "translate(-50%, -50%)",
            }}
          >
            <video
              ref={video}
              playsInline
              muted
              autoPlay
              aria-label="Camera view"
              className="absolute inset-0 w-full h-full"
              onLoadedMetadata={(e) => setSize({ w: e.currentTarget.videoWidth, h: e.currentTarget.videoHeight })}
            />
            {live && state === "live" && <LabelOverlay width={live.width} height={live.height} lines={live.lines} highlights={live.highlights} />}
          </div>
          {/* Framing guide over the visible area, between the top and bottom controls */}
          <div
            aria-hidden
            className="absolute pointer-events-none"
            style={{
              top: "calc(env(safe-area-inset-top, 0px) + 4.5rem)",
              bottom: "calc(env(safe-area-inset-bottom, 0px) + 12.5rem)",
              left: "5%",
              right: "5%",
              border: "2px dashed rgba(255,255,255,0.8)",
              borderRadius: 12,
              boxShadow: "0 0 0 9999px rgba(0,0,0,0.2)",
            }}
          />
          {state !== "live" && (
            <div className="absolute inset-0 flex items-center justify-center" style={{ background: "rgba(0,0,0,0.6)" }}>
              <p role="status" className="text-sm" style={{ color: "#e5e7eb" }}>
                {state === "paused" ? "Camera paused" : "Starting camera..."}
              </p>
            </div>
          )}
        </div>
      )}

      {/* Top: hint and close */}
      <div
        className="absolute inset-x-0 top-0 flex items-start justify-between gap-2 px-3"
        style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 0.75rem)" }}
      >
        <p className="text-[0.75rem] leading-snug rounded-xl px-3 py-2 max-w-[80%]" style={glass}>
          {unavailable
            ? "Scan label"
            : liveOff ?? (live ? `Live read by ${ENGINES[live.engine].name}. Fit the nutrition table inside the frame.` : "Fit the nutrition table inside the frame.")}
        </p>
        <button
          onClick={onClose}
          aria-label="Close camera"
          className="w-10 h-10 shrink-0 flex items-center justify-center rounded-full cursor-pointer"
          style={glass}
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Bottom: values read so far, photo controls and auto-capture */}
      <div
        className="absolute inset-x-0 bottom-0 px-3 pt-8 space-y-3"
        style={{
          paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 0.75rem)",
          background: "linear-gradient(to bottom, rgba(0,0,0,0), rgba(0,0,0,0.75) 35%)",
        }}
      >
        {!unavailable && (
          <div className="flex items-center justify-between gap-2" aria-label="Values the camera can read">
            {KEY_FIELDS.map((f) => {
              // Values that do not add up (calories far from 4/4/9 of the macros) contain a misread digit: not shown as read
              const value = live && energyAgrees(live.values) ? live.values[f] : undefined;
              const color = fieldColor(f);
              const read = value !== undefined;
              return (
                <span
                  key={f}
                  data-key={f}
                  data-read={read}
                  className="flex-1 text-center rounded-lg px-1 py-1 text-[0.6875rem] font-semibold"
                  style={read ? { background: color, color: "#fff", border: `1px solid ${color}` } : glass}
                >
                  {KEY_LABELS[f]}
                  {read ? ` ${Math.round(value)}` : ""}
                </span>
              );
            })}
          </div>
        )}
        <div className="flex items-center justify-between gap-3">
          <button
            onClick={() => fileRef.current?.click()}
            className="flex-1 py-2.5 rounded-xl text-sm font-semibold cursor-pointer"
            style={unavailable ? { background: "var(--accent)", color: "#fff", border: "none" } : glass}
          >
            Choose photo
          </button>
          {!unavailable && (
            <>
              <button
                onClick={capture}
                disabled={state !== "live"}
                aria-label="Take photo"
                className="w-16 h-16 shrink-0 rounded-full cursor-pointer disabled:opacity-50"
                style={{ background: "#fff", border: "4px solid rgba(255,255,255,0.45)", boxShadow: "0 0 0 2px rgba(0,0,0,0.4)" }}
              />
              <label
                className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-[0.75rem] font-semibold cursor-pointer"
                style={glass}
              >
                <input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} />
                Auto
              </label>
            </>
          )}
        </div>
        {!unavailable && (
          <p className="text-[0.625rem] text-center" style={{ color: "rgba(255,255,255,0.75)" }}>
            Auto takes the photo when all four values are readable and steady.
          </p>
        )}
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          aria-label="Label photo"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (f) {
              done.current = true;
              stop();
              onPhoto(f);
            }
          }}
        />
      </div>
    </Modal>
  );
}
