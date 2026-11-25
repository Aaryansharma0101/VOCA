"use client";

import { useCallback, useRef, type MouseEvent } from "react";

/**
 * Tracks the cursor as CSS variables so a decorative layer can follow it.
 * The hook only writes variables; it never changes layout or scroll height.
 */
export function useSpotlight<T extends HTMLElement = HTMLDivElement>() {
  const ref = useRef<T | null>(null);

  const onMouseMove = useCallback((event: MouseEvent<T>) => {
    const node = ref.current;
    if (!node) return;
    const rect = node.getBoundingClientRect();
    node.style.setProperty("--mx", `${event.clientX - rect.left}px`);
    node.style.setProperty("--my", `${event.clientY - rect.top}px`);
  }, []);

  return { ref, onMouseMove };
}
