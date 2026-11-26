import type { EngineId } from "../ocr/types";
import type { PhotoKind } from "./store";

/** The read in progress, for the lab screen and the AI tools */
export interface LabJob {
  itemId: string;
  photo: PhotoKind;
  engine: EngineId;
  /** 0..1 within this read */
  fraction: number;
}

export interface JobState {
  job: LabJob | null;
  /** Runs started and not finished, including the current one */
  queued: number;
}

let state: JobState = { job: null, queued: 0 };
const listeners = new Set<() => void>();

export const getJobState = (): JobState => state;
export const subscribeJob = (l: () => void) => (listeners.add(l), () => void listeners.delete(l));

export function updateJob(patch: Partial<JobState>) {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
}
