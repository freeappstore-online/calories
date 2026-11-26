/** Helpers for the engine modules, which are built into public/ocr/ and loaded after their download */

export const UNAVAILABLE = "The label scanner could not start on this device. Remove it in Profile and download it again.";

/** Load a script file from a blob URL as an ES module; a failure is the "could not start" message, not the raw error */
export async function importModule<T>(url: string): Promise<T> {
  try {
    return (await import(/* @vite-ignore */ url)) as T;
  } catch (e) {
    console.warn("Label scanner: could not load an engine file", e);
    throw new Error(UNAVAILABLE);
  }
}
