import { useEffect, useState } from "react";
import type { RefObject } from "react";

/**
 * A counter that changes when a canvas chart has to be redrawn: the theme or text size changed
 * (attributes on <html>, or the system colour scheme) or the container was resized or rotated.
 * Add it to the drawing effect's dependencies.
 */
export function useRedraw(container: RefObject<HTMLElement | null>): number {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const bump = () => setTick((t) => t + 1);
    const html = new MutationObserver(bump);
    html.observe(document.documentElement, { attributes: true });
    const scheme = window.matchMedia("(prefers-color-scheme: dark)");
    scheme.addEventListener("change", bump);
    // The first observation fires on its own; only later size changes should redraw
    let first = true;
    const size = new ResizeObserver(() => {
      if (first) first = false;
      else bump();
    });
    if (container.current) size.observe(container.current);
    return () => {
      html.disconnect();
      scheme.removeEventListener("change", bump);
      size.disconnect();
    };
  }, [container]);
  return tick;
}
