import { describe, expect, it } from "vitest";
import { frameDifference, readyToCapture, THUMB, type LiveFrame } from "./liveScan";

const flat = (v: number) => new Uint8Array(THUMB * THUMB).fill(v);
const frame = (values: LiveFrame["values"], thumb = flat(100)): LiveFrame => ({ values, thumb });
const ALL = { calories: 116, protein: 6, carbs: 15, fat: 3 };

describe("frameDifference", () => {
  it("is the mean change per pixel", () => {
    expect(frameDifference(flat(100), flat(100))).toBe(0);
    expect(frameDifference(flat(100), flat(110))).toBe(10);
  });
});

describe("readyToCapture", () => {
  it("waits for two frames that both read all four key values the same way", () => {
    expect(readyToCapture([frame(ALL)])).toBe(false);
    expect(readyToCapture([frame(ALL), frame(ALL)])).toBe(true);
  });
  it("does not fire when a key value is missing", () => {
    expect(readyToCapture([frame(ALL), frame({ ...ALL, fat: undefined })])).toBe(false);
    expect(readyToCapture([frame({ calories: 116, protein: 6, carbs: 15 }), frame({ calories: 116, protein: 6, carbs: 15 })])).toBe(false);
  });
  it("does not fire when the values do not add up (a misread digit)", () => {
    const bad = { calories: 9947, protein: 19, carbs: 49, fat: 11 };
    expect(readyToCapture([frame(bad), frame(bad)])).toBe(false);
  });
  it("does not fire while the readings differ", () => {
    expect(readyToCapture([frame(ALL), frame({ ...ALL, protein: 7 })])).toBe(false);
  });
  it("does not fire while the phone is moving", () => {
    expect(readyToCapture([frame(ALL, flat(100)), frame(ALL, flat(130))])).toBe(false);
    expect(readyToCapture([frame(ALL, flat(100)), frame(ALL, flat(103))])).toBe(true);
  });
  it("only looks at the latest frames", () => {
    expect(readyToCapture([frame({}), frame({}), frame(ALL), frame(ALL)])).toBe(true);
    expect(readyToCapture([frame(ALL), frame(ALL), frame({})])).toBe(false);
  });
});
