let activeScrollRafId: number | null = null;
let cleanupScrollInterruptListeners: (() => void) | null = null;

function cancelActiveSmoothScroll(): void {
  if (activeScrollRafId !== null && typeof window !== "undefined") {
    window.cancelAnimationFrame(activeScrollRafId);
    activeScrollRafId = null;
  }
  if (cleanupScrollInterruptListeners) {
    cleanupScrollInterruptListeners();
    cleanupScrollInterruptListeners = null;
  }
}

export function getPageScrollTop(): number {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return 0;
  }
  return Math.max(
    window.scrollY || 0,
    window.pageYOffset || 0,
    document.scrollingElement?.scrollTop || 0,
    document.documentElement?.scrollTop || 0,
    document.body?.scrollTop || 0
  );
}

function setAllScrollRootsTop(top: number, container?: HTMLElement | null): void {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return;
  }
  window.scrollTo({ top, left: 0, behavior: "auto" });
  if (document.scrollingElement) {
    document.scrollingElement.scrollTop = top;
    document.scrollingElement.scrollLeft = 0;
  }
  if (document.documentElement) {
    document.documentElement.scrollTop = top;
    document.documentElement.scrollLeft = 0;
  }
  if (document.body) {
    document.body.scrollTop = top;
    document.body.scrollLeft = 0;
  }
  if (container) {
    container.scrollTop = top;
    container.scrollLeft = 0;
  }
}

/**
 * Immediately resets vertical and horizontal scroll position to the top (0, 0)
 * across all browser/mobile scroll roots so newly opened tabs always paint from the top.
 */
export function resetPageScrollToTop(container?: HTMLElement | null): void {
  cancelActiveSmoothScroll();
  setAllScrollRootsTop(0, container);
}

/**
 * Smoothly scrolls to the top using a 150-250ms cubic ease-out animation (default 190ms).
 * Automatically falls back to instant reset when reduced motion is preferred, and cancels
 * cleanly if the user starts scrolling manually.
 */
export function smoothScrollToTop(
  durationMs = 190,
  container?: HTMLElement | null
): void {
  cancelActiveSmoothScroll();

  if (typeof window === "undefined") return;

  const prefersReducedMotion =
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const startY = Math.max(getPageScrollTop(), container?.scrollTop || 0);
  if (startY <= 0) {
    setAllScrollRootsTop(0, container);
    return;
  }

  if (prefersReducedMotion || durationMs <= 0) {
    setAllScrollRootsTop(0, container);
    return;
  }

  const clampedDuration = Math.min(250, Math.max(150, durationMs));
  const startTime = performance.now();

  const onUserInterrupt = () => {
    cancelActiveSmoothScroll();
  };

  window.addEventListener("wheel", onUserInterrupt, { passive: true, once: true });
  window.addEventListener("touchstart", onUserInterrupt, { passive: true, once: true });
  cleanupScrollInterruptListeners = () => {
    window.removeEventListener("wheel", onUserInterrupt);
    window.removeEventListener("touchstart", onUserInterrupt);
  };

  const step = (now: number) => {
    const elapsed = now - startTime;
    const progress = Math.min(1, elapsed / clampedDuration);
    const eased = 1 - Math.pow(1 - progress, 3);
    const nextY = Math.round(startY * (1 - eased));

    setAllScrollRootsTop(nextY, container);

    if (progress < 1) {
      activeScrollRafId = window.requestAnimationFrame(step);
    } else {
      activeScrollRafId = null;
      if (cleanupScrollInterruptListeners) {
        cleanupScrollInterruptListeners();
        cleanupScrollInterruptListeners = null;
      }
      setAllScrollRootsTop(0, container);
    }
  };

  activeScrollRafId = window.requestAnimationFrame(step);
}
