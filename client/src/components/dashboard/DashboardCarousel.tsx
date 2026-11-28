import React, { useRef, useState, useEffect, useLayoutEffect, useCallback } from "react";
import {
  ChevronLeft,
  ChevronRight,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  RotateCcw,
  X,
  Check,
} from "lucide-react";
import { useI18n } from "@/i18n";
import {
  DASHBOARD_CARDS_META,
  DEFAULT_DASHBOARD_CARD_ORDER,
  DashboardCardId,
} from "./dashboardCardConfig";

interface DashboardCarouselProps {
  cardOrder: DashboardCardId[];
  activeCardId: DashboardCardId;
  onSelectCard: (cardId: DashboardCardId) => void;
  onChangeOrder: (nextOrder: DashboardCardId[]) => void;
  renderCard: (
    cardId: DashboardCardId,
    ctx: { isActive: boolean; isNear: boolean }
  ) => React.ReactNode;
}

const INTERACTIVE_DRAG_EXCLUDE_SELECTOR =
  'button, a, input, select, textarea, label, [role="button"], [role="switch"], .recharts-wrapper, [data-no-drag="true"]';

export const DashboardCarousel: React.FC<DashboardCarouselProps> = ({
  cardOrder,
  activeCardId,
  onSelectCard,
  onChangeOrder,
  renderCard,
}) => {
  const { t } = useI18n();
  const trackRef = useRef<HTMLDivElement | null>(null);
  const [isReorderOpen, setIsReorderOpen] = useState(false);
  const [isDraggingMouse, setIsDraggingMouse] = useState(false);

  const getCardLabel = (cardId: DashboardCardId) => {
    const fallback = DASHBOARD_CARDS_META[cardId];
    return {
      title: t(`dashboard.cards.${cardId}.title`) || fallback.title,
      category: t(`dashboard.cards.${cardId}.category`) || fallback.category,
    };
  };

  const activeIndex = Math.max(0, cardOrder.indexOf(activeCardId));
  const activeIndexRef = useRef(activeIndex);
  activeIndexRef.current = activeIndex;

  const cardOrderRef = useRef(cardOrder);
  cardOrderRef.current = cardOrder;

  const programmaticTargetRef = useRef<number | null>(null);
  const scrollSyncTimerRef = useRef<number | null>(null);
  const suppressClickRef = useRef(false);
  const dragStateRef = useRef<{
    active: boolean;
    pointerId: number | null;
    startX: number;
    startY: number;
    startScrollLeft: number;
    startIndex: number;
    hasDragged: boolean;
  }>({
    active: false,
    pointerId: null,
    startX: 0,
    startY: 0,
    startScrollLeft: 0,
    startIndex: 0,
    hasDragged: false,
  });

  const prefersReducedMotion = () =>
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;

  const scrollToIndex = useCallback(
    (targetIdx: number, behavior: ScrollBehavior = "smooth") => {
      const track = trackRef.current;
      if (!track) return;
      const clamped = Math.max(0, Math.min(cardOrderRef.current.length - 1, targetIdx));
      const width = track.clientWidth;
      if (width <= 0) return;

      const nextCardId = cardOrderRef.current[clamped];
      if (nextCardId && nextCardId !== activeCardId) {
        onSelectCard(nextCardId);
      }

      const resolvedBehavior: ScrollBehavior = prefersReducedMotion()
        ? "auto"
        : behavior;
      programmaticTargetRef.current =
        resolvedBehavior === "smooth" ? clamped : null;

      track.scrollTo({
        left: clamped * width,
        behavior: resolvedBehavior,
      });

      if (resolvedBehavior === "smooth") {
        window.setTimeout(() => {
          if (programmaticTargetRef.current === clamped) {
            programmaticTargetRef.current = null;
          }
        }, 480);
      }
    },
    [activeCardId, onSelectCard]
  );

  // Align track position immediately on initial mount or when card order shifts around active card
  useLayoutEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    const width = track.clientWidth;
    if (width > 0 && !dragStateRef.current.active) {
      const expectedLeft = activeIndex * width;
      if (Math.abs(track.scrollLeft - expectedLeft) > 2 && programmaticTargetRef.current === null) {
        track.scrollLeft = expectedLeft;
      }
    }
  }, [activeIndex, cardOrder]);

  // Keep active slide centered across viewport/container resizes
  useEffect(() => {
    const track = trackRef.current;
    if (!track || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => {
      if (!trackRef.current || dragStateRef.current.active) return;
      const w = trackRef.current.clientWidth;
      if (w > 0) {
        trackRef.current.scrollLeft = activeIndexRef.current * w;
      }
    });
    observer.observe(track);
    return () => observer.disconnect();
  }, []);

  // Handle native swipe & trackpad scroll settlement
  const handleTrackScroll = useCallback(() => {
    if (dragStateRef.current.active) return;
    const track = trackRef.current;
    if (!track) return;
    const width = track.clientWidth;
    if (width <= 0) return;

    const currentIdx = Math.max(
      0,
      Math.min(cardOrderRef.current.length - 1, Math.round(track.scrollLeft / width))
    );

    if (programmaticTargetRef.current !== null) {
      if (currentIdx === programmaticTargetRef.current) {
        programmaticTargetRef.current = null;
      }
      return;
    }

    if (scrollSyncTimerRef.current !== null) {
      window.clearTimeout(scrollSyncTimerRef.current);
    }

    // Update live once the snap crosses midpoint
    if (currentIdx !== activeIndexRef.current) {
      const targetId = cardOrderRef.current[currentIdx];
      if (targetId) {
        onSelectCard(targetId);
      }
    }

    scrollSyncTimerRef.current = window.setTimeout(() => {
      if (!trackRef.current || dragStateRef.current.active) return;
      const w = trackRef.current.clientWidth;
      if (w <= 0) return;
      const settledIdx = Math.max(
        0,
        Math.min(
          cardOrderRef.current.length - 1,
          Math.round(trackRef.current.scrollLeft / w)
        )
      );
      const settledId = cardOrderRef.current[settledIdx];
      if (settledId && settledIdx !== activeIndexRef.current) {
        onSelectCard(settledId);
      }
    }, 90);
  }, [onSelectCard]);

  // Desktop Mouse Drag Support (leaves touch swipes & trackpad completely native)
  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType !== "mouse" || e.button !== 0) return;
    const target = e.target as HTMLElement | null;
    if (target && target.closest(INTERACTIVE_DRAG_EXCLUDE_SELECTOR)) {
      return;
    }
    const track = trackRef.current;
    if (!track) return;

    dragStateRef.current = {
      active: true,
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      startScrollLeft: track.scrollLeft,
      startIndex: activeIndexRef.current,
      hasDragged: false,
    };
    programmaticTargetRef.current = null;
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragStateRef.current;
    if (!drag.active || e.pointerId !== drag.pointerId) return;
    const track = trackRef.current;
    if (!track) return;

    const dx = e.clientX - drag.startX;
    const dy = e.clientY - drag.startY;

    if (!drag.hasDragged) {
      if (Math.abs(dx) < 8) return;
      if (Math.abs(dy) > Math.abs(dx)) {
        // User intended vertical drag/selection
        drag.active = false;
        return;
      }
      drag.hasDragged = true;
      setIsDraggingMouse(true);
      track.style.scrollSnapType = "none";
      try {
        track.setPointerCapture(e.pointerId);
      } catch {
        // ignore if unavailable
      }
    }

    e.preventDefault();
    track.scrollLeft = drag.startScrollLeft - dx;
  };

  const finishMouseDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragStateRef.current;
    if (!drag.active || e.pointerId !== drag.pointerId) return;
    const track = trackRef.current;
    const dx = e.clientX - drag.startX;
    const wasDragged = drag.hasDragged;
    const startIdx = drag.startIndex;

    drag.active = false;
    drag.pointerId = null;
    drag.hasDragged = false;
    setIsDraggingMouse(false);

    if (track) {
      track.style.scrollSnapType = "x mandatory";
      try {
        if (track.hasPointerCapture(e.pointerId)) {
          track.releasePointerCapture(e.pointerId);
        }
      } catch {
        // ignore
      }

      if (wasDragged) {
        suppressClickRef.current = true;
        window.setTimeout(() => {
          suppressClickRef.current = false;
        }, 60);

        const w = Math.max(1, track.clientWidth);
        const flickThreshold = Math.min(90, w * 0.14);
        let nextIdx = Math.round(track.scrollLeft / w);
        if (dx < -flickThreshold) {
          nextIdx = Math.min(cardOrderRef.current.length - 1, startIdx + 1);
        } else if (dx > flickThreshold) {
          nextIdx = Math.max(0, startIdx - 1);
        }
        scrollToIndex(nextIdx, "smooth");
      }
    }
  };

  const handleClickCapture = (e: React.MouseEvent<HTMLDivElement>) => {
    if (suppressClickRef.current) {
      e.preventDefault();
      e.stopPropagation();
    }
  };

  const handleCarouselKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement | null;
    if (
      target &&
      ["INPUT", "SELECT", "TEXTAREA"].includes(target.tagName)
    ) {
      return;
    }
    if (e.key === "ArrowLeft") {
      e.preventDefault();
      if (activeIndex > 0) scrollToIndex(activeIndex - 1);
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      if (activeIndex < cardOrder.length - 1) scrollToIndex(activeIndex + 1);
    }
  };

  const moveCardInOrder = (index: number, delta: -1 | 1) => {
    const nextIndex = index + delta;
    if (nextIndex < 0 || nextIndex >= cardOrder.length) return;
    const copy = [...cardOrder];
    const [moved] = copy.splice(index, 1);
    copy.splice(nextIndex, 0, moved);
    onChangeOrder(copy);
  };

  const canGoPrev = activeIndex > 0;
  const canGoNext = activeIndex < cardOrder.length - 1;

  return (
    <div
      className="space-y-3.5 outline-none"
      onKeyDown={handleCarouselKeyDown}
      tabIndex={-1}
      aria-roledescription="carousel"
      aria-label={t("dashboard.cardsAria")}
    >
      {/* Carousel Viewport Wrapper with Flanking Desktop Arrows */}
      <div className="relative group">
        <div
          ref={trackRef}
          onScroll={handleTrackScroll}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={finishMouseDrag}
          onPointerCancel={finishMouseDrag}
          onClickCapture={handleClickCapture}
          className={`flex items-start overflow-x-auto snap-x snap-mandatory [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden rounded-3xl ${
            isDraggingMouse ? "cursor-grabbing select-none" : "cursor-grab"
          }`}
        >
          {cardOrder.map((cardId, idx) => {
            const isActive = idx === activeIndex;
            const isNear = Math.abs(idx - activeIndex) <= 1;
            const label = getCardLabel(cardId);
            return (
              <div
                key={cardId}
                role="group"
                aria-roledescription="slide"
                aria-label={t("dashboard.cardSlideAria", {
                  index: idx + 1,
                  total: cardOrder.length,
                  title: label.title,
                })}
                aria-hidden={!isActive}
                className={`w-full shrink-0 snap-center snap-always ${
                  !isActive ? "max-h-[540px] overflow-hidden" : ""
                }`}
              >
                {isNear ? (
                  renderCard(cardId, { isActive, isNear })
                ) : (
                  <div className="min-h-[360px] rounded-3xl bg-white dark:bg-[#16181d] border border-slate-200/90 dark:border-slate-800/90 p-5 sm:p-6 flex flex-col justify-between">
                    <div className="space-y-2">
                      <p className="text-sm font-semibold text-slate-500 dark:text-slate-400">
                        {label.title}
                      </p>
                      <div className="h-9 w-36 rounded-lg bg-slate-100 dark:bg-slate-800/70" />
                    </div>
                    <div className="h-24 rounded-xl bg-slate-50 dark:bg-slate-800/40" />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Bottom Controls: Prev Arrow · Dot Indicators · Next Arrow */}
      <div className="flex items-center justify-between gap-3 pt-1">
        <button
          type="button"
          onClick={() => canGoPrev && scrollToIndex(activeIndex - 1)}
          disabled={!canGoPrev}
          aria-label={t("dashboard.prevCardAria")}
          className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center rounded-2xl bg-white dark:bg-[#16181d] border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-35 disabled:cursor-not-allowed transition-colors cursor-pointer shadow-2xs"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>

        {/* Pagination Dots + Page Counter */}
        <div className="flex flex-col items-center gap-1">
          <div
            className="flex items-center justify-center gap-1 sm:gap-1.5 flex-wrap"
            role="navigation"
            aria-label={t("dashboard.dotsAria")}
          >
            {cardOrder.map((cardId, idx) => {
              const isSelected = idx === activeIndex;
              const label = getCardLabel(cardId);
              return (
                <button
                  key={cardId}
                  type="button"
                  onClick={() => scrollToIndex(idx)}
                  aria-label={t("dashboard.dotAria", {
                    index: idx + 1,
                    title: label.title,
                  })}
                  aria-current={isSelected ? "page" : undefined}
                  className="min-h-[36px] min-w-[22px] sm:min-w-[24px] flex items-center justify-center cursor-pointer group/dot"
                >
                  <span
                    className={`block rounded-full transition-all duration-200 ${
                      isSelected
                        ? "w-5 h-2 bg-slate-900 dark:bg-white"
                        : "w-2 h-2 bg-slate-300 dark:bg-slate-600 group-hover/dot:bg-slate-400 dark:group-hover/dot:bg-slate-500"
                    }`}
                  />
                </button>
              );
            })}
          </div>
          <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400 tabular-nums">
            {t("dashboard.cardCounter", {
              current: activeIndex + 1,
              total: cardOrder.length,
            })}
          </span>
        </div>

        <button
          type="button"
          onClick={() => canGoNext && scrollToIndex(activeIndex + 1)}
          disabled={!canGoNext}
          aria-label={t("dashboard.nextCardAria")}
          className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center rounded-2xl bg-white dark:bg-[#16181d] border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-35 disabled:cursor-not-allowed transition-colors cursor-pointer shadow-2xs"
        >
          <ChevronRight className="w-5 h-5" />
        </button>
      </div>

      {/* Secondary Action: Reorder Cards Control (below cards & pagination) */}
      <div className="flex items-center justify-center pt-0.5">
        <button
          type="button"
          onClick={() => setIsReorderOpen(true)}
          className="min-h-[38px] inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-300 bg-white dark:bg-[#16181d] border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors cursor-pointer whitespace-nowrap shadow-2xs"
          title={t("dashboard.reorderTitle")}
        >
          <ArrowUpDown className="w-3.5 h-3.5" />
          <span>{t("dashboard.reorderBtn")}</span>
        </button>
      </div>

      {/* Reorder Cards Modal (Mobile + Desktop friendly) */}
      {isReorderOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs modal-backdrop-safe animate-in fade-in duration-150"
          role="dialog"
          aria-modal="true"
          aria-labelledby="reorder-cards-title"
          onClick={() => setIsReorderOpen(false)}
        >
          <div
            className="bg-white dark:bg-slate-900 w-full max-w-md rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden flex flex-col modal-panel-safe sm:max-h-[85dvh]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-4 sm:px-5 py-3.5 sm:py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between gap-3 shrink-0">
              <div className="min-w-0 flex-1">
                <h3
                  id="reorder-cards-title"
                  className="text-base font-bold text-slate-900 dark:text-white truncate"
                >
                  {t("dashboard.reorderModalTitle")}
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 break-words">
                  {t("dashboard.reorderModalSubtitle")}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsReorderOpen(false)}
                className="min-h-[40px] min-w-[40px] shrink-0 inline-flex items-center justify-center rounded-full text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                aria-label={t("common.close")}
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-3 overflow-y-auto overflow-x-hidden flex-1 min-h-0 divide-y divide-slate-100 dark:divide-slate-800">
              {cardOrder.map((cardId, idx) => {
                const label = getCardLabel(cardId);
                const isFirst = idx === 0;
                const isLast = idx === cardOrder.length - 1;
                return (
                  <div
                    key={cardId}
                    className="py-2.5 px-2 flex items-center justify-between gap-3"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="w-6 text-xs font-bold text-slate-400 dark:text-slate-500 tabular-nums shrink-0">
                        {String(idx + 1).padStart(2, "0")}.
                      </span>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-slate-900 dark:text-white truncate">
                          {label.title}
                        </p>
                        <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                          {label.category}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        disabled={isFirst}
                        onClick={() => moveCardInOrder(idx, -1)}
                        aria-label={t("dashboard.moveUpAria", { title: label.title })}
                        className="min-h-[40px] min-w-[40px] inline-flex items-center justify-center rounded-xl border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer transition-colors"
                      >
                        <ArrowUp className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        disabled={isLast}
                        onClick={() => moveCardInOrder(idx, 1)}
                        aria-label={t("dashboard.moveDownAria", { title: label.title })}
                        className="min-h-[40px] min-w-[40px] inline-flex items-center justify-center rounded-xl border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer transition-colors"
                      >
                        <ArrowDown className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="px-4 sm:px-5 py-3.5 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2 shrink-0">
              <button
                type="button"
                onClick={() => onChangeOrder([...DEFAULT_DASHBOARD_CARD_ORDER])}
                className="min-h-[40px] inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>{t("dashboard.restoreDefaultOrder")}</span>
              </button>
              <button
                type="button"
                onClick={() => setIsReorderOpen(false)}
                className="min-h-[40px] inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold bg-slate-900 dark:bg-white text-white dark:text-slate-900 hover:opacity-90 transition-opacity cursor-pointer"
              >
                <Check className="w-3.5 h-3.5" />
                <span>{t("common.done")}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
