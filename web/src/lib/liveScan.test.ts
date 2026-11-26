import { describe, expect, it } from "vitest";
import { frameDifference, THUMB } from "./liveScan";

const flat = (v: number) => new Uint8Array(THUMB * THUMB).fill(v);

describe("frameDifference", () => {
  it("is the mean change per pixel", () => {
    expect(frameDifference(flat(100), flat(100))).toBe(0);
    expect(frameDifference(flat(100), flat(110))).toBe(10);
  });
});
