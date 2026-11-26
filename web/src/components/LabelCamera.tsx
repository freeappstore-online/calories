import { useCallback, useEffect, useRef, useState } from "react";
import { Consensus, FrameGate, FramePool, frameRead, type ConsensusResult, type FieldReport, type VoteField } from "../lib/consensus";
import { detectBarcode } from "../lib/barcode/detect";
import { parseLabel, type LabelField } from "../lib/labelParser";
import { fitCanvas, openLiveEngine } from "../lib/labelScanner";
import { frameDifference, measureSharpness, thumbnail } from "../lib/liveScan";
import { KEY_FIELDS } from "../lib/ocr/chain";
import { ENGINES } from "../lib/ocr/engines";
import { highlightsOf, type Highlight } from "../lib/ocr/provenance";
import { ocrConfidence, ocrText, type EngineId, type OcrLine } from "../lib/ocr/types";
import LabelOverlay, { fieldColor } from "./LabelOverlay";
import Modal from "./Modal";

interface LabelCameraProps {
  /** A photo of the label: the best full-resolution frame seen (with the values the frames settled on), or a file the user chose */
  onPhoto: (photo: HTMLCanvasElement | File, consensus?: ConsensusResult) => void;
  /** A barcode was read in the picture; the camera is released and a photo is not taken */
  onBarcode?: (code: string) => void;
  /** Barcodes to look past (ones that were just looked up and not found), so the camera does not stop on the same one again */
  ignoreBarcodes?: ReadonlySet<string>;
  /** Only read barcodes: no label reading, no key values, no shutter */
  barcodeOnly?: boolean;
  onClose: () => void;
}

type CameraState = "starting" | "live" | "paused" | "denied" | "unavailable";

/** Longest side of the frames the live view reads: small enough to keep up */
const LIVE_SIDE = 1280;
/** Least time between live reads: about 1.5 a second at most, and never two at once */
const LIVE_INTERVAL_MS = 650;
/** Wait before looking at the next frame after one that was too blurry or moving to read */
const SKIP_INTERVAL_MS = 120;
/** Time between looks for a barcode: it is read from a frame of its own, so it never waits for the label read */
const BARCODE_INTERVAL_MS = 500;

/** Sharp frames after which, if the four values still have not settled, the hint points at the shutter */
const SLOW_AFTER_FRAMES = 10;
/** Sharp frames after which auto takes the best frame anyway: the model chain reads what the frames did not settle */
const AUTO_GIVE_UP_FRAMES = 15;

const KEY_LABELS: Record<string, string> = { calories: "Calories", protein: "Protein", carbs: "Carbs", fat: "Fat" };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const MESSAGES: Record<"denied" | "unavailable", string> = {
  denied: "Camera access was not allowed. You can allow it in the browser settings, or choose a photo of the label instead.",
  unavailable: "No camera is available here. Choose a photo of the label instead.",
};

/** Live camera view with a framing guide and boxes on the text it can read; falls back to choosing a photo */
export default function LabelCamera({ onPhoto, onBarcode, ignoreBarcodes, barcodeOnly, onClose }: LabelCameraProps) {
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<CameraState>("starting");
  const [auto, setAuto] = useState(true);
  const autoRef = useRef(auto);
  autoRef.current = auto;
  const [live, setLive] = useState<{ lines: OcrLine[]; width: number; height: number; highlights: Highlight[]; engine: EngineId } | null>(null);
  // The votes so far: what each field reads as, how many frames agree, and why the last frame was skipped
  const [votes, setVotes] = useState<{ fields: Partial<Record<VoteField, FieldReport>>; frames: number; skipped: number; reason?: "blurry" | "moving" }>({ fields: {}, frames: 0, skipped: 0 });
  const session = useRef<{ consensus: Consensus; pool: FramePool<HTMLCanvasElement> } | null>(null);
  const [liveOff, setLiveOff] = useState<string | null>(null);
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const done = useRef(false);
  const frameBox = useRef<HTMLDivElement>(null);
  const reads = useRef(0);
  const examined = useRef(0);
  const onBarcodeRef = useRef(onBarcode);
  onBarcodeRef.current = onBarcode;
  const ignoreRef = useRef(ignoreBarcodes);
  ignoreRef.current = ignoreBarcodes;

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
    // The best frame seen so far (not necessarily this one), with the values the frames agreed on
    const result = session.current?.consensus.result();
    const best = result && session.current?.pool.best(result);
    const canvas = best ?? fitCanvas(v, v.videoWidth, v.videoHeight);
    stop();
    onPhoto(canvas, result && (Object.keys(result.values).length > 0 || result.servingGrams !== undefined) ? result : undefined);
  }, [onPhoto, stop]);
  const captureRef = useRef(capture);
  captureRef.current = capture;

  // The live read: the fastest downloaded model, one frame at a time, never overlapping, paused when hidden
  useEffect(() => {
    if (state !== "live" || barcodeOnly) return;
    let cancelled = false;
    const consensus = new Consensus();
    const pool = new FramePool<HTMLCanvasElement>();
    const gate = new FrameGate();
    session.current = { consensus, pool };
    setVotes({ fields: {}, frames: 0, skipped: 0 });
    let skipped = 0;
    let previous: Uint8Array | undefined;
    void (async () => {
      let opened;
      try {
        opened = await openLiveEngine();
      } catch {
        return setLiveOff("The live read could not start. You can still take the photo.");
      }
      if (!opened) return setLiveOff("No model that is fast enough for the live view is downloaded. You can still take the photo.");
      const { engine, runtime } = opened;
      // The worker is closed only once the read in flight has finished: stopping it mid-read made Tesseract
      // fail inside its own teardown ("Cannot read properties of null (reading 'postMessage')") when the shutter was pressed
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
        // Blurry or moving frames do not vote (and are not read at all, which keeps the loop fast)
        const sharpness = measureSharpness(frame);
        const thumb = thumbnail(frame);
        const verdict = gate.check(sharpness, previous ? frameDifference(previous, thumb) : 0);
        previous = thumb;
        if (frameBox.current) {
          frameBox.current.dataset.sharpness = String(Math.round(sharpness));
          frameBox.current.dataset.examined = String(++examined.current);
        }
        if (!verdict.pass) {
          skipped++;
          setVotes((s) => ({ ...s, skipped, reason: verdict.reason }));
          // Checking a frame is cheap (no read), so look again soon: a steady moment may be brief
          await sleep(SKIP_INTERVAL_MS);
          continue;
        }
        // A full-resolution copy from the same moment, kept if this turns out to be among the best frames
        const full = fitCanvas(v, v.videoWidth, v.videoHeight);
        try {
          const result = await runtime.recognise(frame, undefined, { fast: true });
          if (cancelled) break;
          const scan = parseLabel(ocrText(result));
          if (frameBox.current) frameBox.current.dataset.reads = String(++reads.current);
          setLive({ lines: result.lines, width: result.width, height: result.height, highlights: highlightsOf(scan, result.lines).filter((h) => KEY_FIELDS.includes(h.field as LabelField)), engine });
          const read = frameRead(scan, ocrConfidence(result), verdict.quality);
          if (Object.keys(read.values).length > 0) {
            consensus.add(read);
            pool.add(full, read);
          }
        
          setVotes({ fields: consensus.fields(), frames: consensus.frames, skipped, reason: undefined });
          if (autoRef.current && (consensus.keysSettled() || consensus.frames >= AUTO_GIVE_UP_FRAMES)) {
            captureRef.current();
            break;
          }
        } catch {
          if (cancelled) break;
        }
        await sleep(Math.max(0, LIVE_INTERVAL_MS - (performance.now() - t0)));
      }
      await runtime.close().catch(() => undefined);
    })();
    return () => {
      cancelled = true;
    };
  }, [state, barcodeOnly]);

  // The barcode look: a frame of its own every half second, the same whether or not a model is downloaded
  useEffect(() => {
    if (state !== "live" || !onBarcodeRef.current) return;
    let cancelled = false;
    void (async () => {
      while (!cancelled) {
        await sleep(BARCODE_INTERVAL_MS);
        const v = video.current;
        if (cancelled || document.hidden || !v || v.readyState < 2 || !v.videoWidth) continue;
        const scale = Math.min(1, LIVE_SIDE / Math.max(v.videoWidth, v.videoHeight));
        const frame = document.createElement("canvas");
        frame.width = Math.round(v.videoWidth * scale);
        frame.height = Math.round(v.videoHeight * scale);
        frame.getContext("2d", { willReadFrequently: true })!.drawImage(v, 0, 0, frame.width, frame.height);
        try {
          const code = await detectBarcode(frame);
          if (cancelled || done.current) return;
          if (code && !ignoreRef.current?.has(code)) {
            done.current = true;
            stop();
            onBarcodeRef.current?.(code);
            return;
          }
        } catch {
          // The reader could not load (offline the first time): the label read carries on without it
          return;
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [state, stop]);

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
        {barcodeOnly ? "Scan barcode" : "Scan label"}
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
            {/* Boxes belong to the frame that was read: hidden while the picture is blurred or moving, when they would sit off the text */}
            {live && state === "live" && !votes.reason && <LabelOverlay width={live.width} height={live.height} lines={live.lines} highlights={live.highlights} />}
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
            ? barcodeOnly ? "Scan barcode" : "Scan label"
            : barcodeOnly
            ? "Aim at the barcode on the package. It is looked up on Open Food Facts."
            : liveOff ??
              (votes.reason
                ? votes.reason === "blurry" ? "Not sharp enough, hold steady and let the camera focus." : "Moving, hold the phone steady."
                : live && votes.frames >= SLOW_AFTER_FRAMES
                  ? "Hard to read live. Tap the shutter, or wait and the best frame is taken."
                  : live
                  ? `${ENGINES[live.engine].name} is reading ${votes.frames} sharp frame${votes.frames === 1 ? "" : "s"}. Fit the nutrition table inside the frame.`
                  : "Fit the nutrition table inside the frame, or aim at its barcode.")}
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
        {!unavailable && !barcodeOnly && (
          <div className="flex items-center justify-between gap-2" aria-label="Values the camera can read">
            {KEY_FIELDS.map((f) => {
              // A chip fills in once the frames agree on the value; before that it only says it is still reading
              const report = votes.fields[f];
              const color = fieldColor(f);
              const read = report?.settled === true;
              const unsure = !read && report?.unstable === true;
              return (
                <span
                  key={f}
                  data-key={f}
                  data-read={read}
                  data-agree={read ? `${report.agree}/${report.reads}` : undefined}
                  className={`flex-1 text-center rounded-lg px-1 py-1 text-[0.6875rem] font-semibold leading-tight ${report && !read && !unsure ? "animate-pulse" : ""}`}
                  style={read ? { background: color, color: "#fff", border: `1px solid ${color}` } : unsure ? { ...glass, border: "1px dashed #fbbf24", color: "#fbbf24" } : glass}
                >
                  {KEY_LABELS[f]}
                  {read ? ` ${Math.round(report.value as number)}` : ""}
                  <span className="block text-[0.5625rem] font-medium opacity-80">
                    {read ? `${report.agree}/${report.reads}` : unsure ? "unsure" : report ? "reading" : " "}
                  </span>
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
          {!unavailable && !barcodeOnly && (
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
        {!unavailable && !barcodeOnly && (
          <p className="text-[0.625rem] text-center" style={{ color: "rgba(255,255,255,0.75)" }}>
            Auto takes the best frame once the four values have settled. The shutter takes it now.
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
