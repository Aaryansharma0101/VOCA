"use client";

import { useEffect, useState, type CSSProperties } from "react";

export const EASE_ENTER = "cubic-bezier(0.16, 1, 0.3, 1)";
export const EASE_HOVER = "cubic-bezier(0.4, 0, 0.2, 1)";
export const ENTER_MS = 260;
export const STAGGER_MS = 40;

/** Sets the delay for a staggered entrance. The ninth child and later share one delay. */
export function staggerStyle(index: number, max = 8): CSSProperties {
  return { "--stagger": `${Math.min(index, max) * STAGGER_MS}ms` } as CSSProperties;
}

/** Counts from zero to target on mount, and exits immediately for reduced motion. */
export function useCountUp(target: number, duration = 700): number {
  const [value, setValue] = useState(0);

  useEffect(() => {
    const reduce =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (reduce) {
      setValue(target);
      return;
    }

    let frame = 0;
    const start = performance.now();

    const tick = (now: number) => {
      const progress = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      setValue(Math.round(target * eased));
      if (progress < 1) frame = window.requestAnimationFrame(tick);
    };

    frame = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frame);
  }, [target, duration]);

  return value;
}
