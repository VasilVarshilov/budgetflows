import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  Banknote,
  ChevronLeft,
  ChevronRight,
  Lightbulb,
  PiggyBank,
  TrendingUp,
  Wallet,
  Zap,
} from "lucide-react";
import { FinancialInsight, InsightPriority } from "@/utils/aiAnalysisEngine";
import { useI18n } from "@/i18n";

interface AiInsightsCarouselProps {
  insights: FinancialInsight[];
  filterKey: string;
}

const INTERACTIVE_DRAG_EXCLUDE_SELECTOR =
  'button, a, input, select, textarea, label, [role="button"], [role="switch"], [data-no-drag="true"]';

export const AiInsightsCarousel: React.FC<AiInsightsCarouselProps> = ({
  insights,
  filterKey,
}) => {
  const { t } = useI18n();
  const [activeIndex, setActiveIndex] = useState(0);
  const [isDraggingMouse, setIsDraggingMouse] = useState(false);

  const trackRef = useRef<HTMLDivElement | null>(null);
  const activeIndexRef = useRef(activeIndex);
  activeIndexRef.current = activeIndex;
  const totalCards = insights.length;

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

  // Reset to first card cleanly whenever active filter changes
  useEffect(() => {
    setActiveIndex(0);
    programmaticTargetRef.current = null;
    const track = trackRef.current;
    if (track) {
      track.scrollLeft = 0;
    }
  }, [filterKey]);

  // Clamp index if insights count shrinks
  useEffect(() => {
    if (totalCards > 0 && activeIndex >= totalCards) {
      setActiveIndex(totalCards - 1);
    }
  }, [totalCards, activeIndex]);

  const scrollToIndex = useCallback(
    (targetIdx: number, behavior: ScrollBehavior = "smooth") => {
      const track = trackRef.current;
      if (totalCards === 0) return;
      const clamped = Math.max(0, Math.min(totalCards - 1, targetIdx));
      setActiveIndex(clamped);
      if (!track) return;
      const width = track.clientWidth;
      if (width <= 0) return;

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
    [totalCards]
  );

  useLayoutEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    const width = track.clientWidth;
    if (width > 0 && !dragStateRef.current.active) {
      const expectedLeft = activeIndex * width;
      if (
        Math.abs(track.scrollLeft - expectedLeft) > 2 &&
        programmaticTargetRef.current === null
      ) {
        track.scrollLeft = expectedLeft;
      }
    }
  }, [activeIndex, totalCards]);

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

  const handleTrackScroll = useCallback(() => {
    if (dragStateRef.current.active || totalCards <= 0) return;
    const track = trackRef.current;
    if (!track) return;
    const width = track.clientWidth;
    if (width <= 0) return;

    const currentIdx = Math.max(
      0,
      Math.min(totalCards - 1, Math.round(track.scrollLeft / width))
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

    if (currentIdx !== activeIndexRef.current) {
      setActiveIndex(currentIdx);
    }

    scrollSyncTimerRef.current = window.setTimeout(() => {
      if (!trackRef.current || dragStateRef.current.active) return;
      const w = trackRef.current.clientWidth;
      if (w <= 0) return;
      const settledIdx = Math.max(
        0,
        Math.min(totalCards - 1, Math.round(trackRef.current.scrollLeft / w))
      );
      if (settledIdx !== activeIndexRef.current) {
        setActiveIndex(settledIdx);
      }
    }, 90);
  }, [totalCards]);

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType !== "mouse" || e.button !== 0 || totalCards <= 1) return;
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
        drag.active = false;
        return;
      }
      drag.hasDragged = true;
      setIsDraggingMouse(true);
      track.style.scrollSnapType = "none";
      try {
        track.setPointerCapture(e.pointerId);
      } catch {
        // ignore
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
          nextIdx = Math.min(totalCards - 1, startIdx + 1);
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
    if (target && ["INPUT", "SELECT", "TEXTAREA"].includes(target.tagName)) {
      return;
    }
    if (e.key === "ArrowLeft") {
      e.preventDefault();
      if (activeIndex > 0) scrollToIndex(activeIndex - 1);
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      if (activeIndex < totalCards - 1) scrollToIndex(activeIndex + 1);
    }
  };

  const getPriorityBadge = (priority: InsightPriority) => {
    switch (priority) {
      case "high":
        return {
          label: t("ai.priorityHigh"),
          className:
            "bg-rose-50 dark:bg-rose-950/70 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-800",
          dot: "bg-rose-500",
        };
      case "opportunity":
        return {
          label: t("ai.priorityOpportunity"),
          className:
            "bg-indigo-50 dark:bg-indigo-950/70 text-indigo-700 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800",
          dot: "bg-indigo-500",
        };
      case "medium":
        return {
          label: t("ai.priorityMedium"),
          className:
            "bg-amber-50 dark:bg-amber-950/70 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800",
          dot: "bg-amber-500",
        };
      case "low":
      default:
        return {
          label: t("ai.priorityLow"),
          className:
            "bg-emerald-50 dark:bg-emerald-950/70 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800",
          dot: "bg-emerald-500",
        };
    }
  };

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case "income":
        return <Banknote className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />;
      case "spending":
        return <Wallet className="w-5 h-5 text-rose-600 dark:text-rose-400" />;
      case "savings":
        return <PiggyBank className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />;
      case "electricity":
        return <Zap className="w-5 h-5 text-yellow-600 dark:text-yellow-400" />;
      case "trend":
      default:
        return <TrendingUp className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />;
    }
  };

  const safeActiveIndex = Math.max(0, Math.min(totalCards - 1, activeIndex));
  const canGoPrev = safeActiveIndex > 0;
  const canGoNext = safeActiveIndex < totalCards - 1;

  return (
    <div
      className="space-y-3 outline-none"
      onKeyDown={handleCarouselKeyDown}
      tabIndex={-1}
      aria-roledescription="carousel"
      aria-label={t("ai.carouselAria")}
    >
      {/* Horizontal Snap Swipe Track */}
      <div
        ref={trackRef}
        onScroll={handleTrackScroll}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={finishMouseDrag}
        onPointerCancel={finishMouseDrag}
        onClickCapture={handleClickCapture}
        className={`flex items-stretch overflow-x-auto snap-x snap-mandatory [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden rounded-2xl ${
          totalCards > 1
            ? isDraggingMouse
              ? "cursor-grabbing select-none"
              : "cursor-grab"
            : ""
        }`}
      >
        {insights.map((insight, idx) => {
          const priorityBadge = getPriorityBadge(insight.priority);
          const isActive = idx === safeActiveIndex;

          return (
            <div
              key={insight.id}
              role="group"
              aria-roledescription="slide"
              aria-label={t("ai.slideAria", {
                index: idx + 1,
                total: totalCards,
                title: insight.title,
              })}
              aria-hidden={!isActive}
              className="w-full shrink-0 snap-center snap-always p-0.5 flex"
            >
              <div
                className={`w-full min-w-0 overflow-hidden bg-white dark:bg-slate-900 rounded-2xl border p-4 sm:p-6 shadow-2xs hover:shadow-md transition-all flex flex-col justify-between ${
                  insight.priority === "high"
                    ? "border-rose-200/90 dark:border-rose-900/60"
                    : insight.priority === "opportunity"
                    ? "border-indigo-200/90 dark:border-indigo-900/60"
                    : "border-slate-200/80 dark:border-slate-800"
                }`}
              >
                <div className="min-w-0">
                  {/* Card Header */}
                  <div className="flex flex-wrap items-start justify-between gap-2.5 min-w-0">
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <div className="w-10 h-10 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-700 flex items-center justify-center shrink-0">
                        {getCategoryIcon(insight.category)}
                      </div>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-1.5 min-w-0">
                          <span
                            className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold border max-w-full break-words ${priorityBadge.className}`}
                          >
                            <span
                              className={`w-1.5 h-1.5 rounded-full shrink-0 ${priorityBadge.dot}`}
                            />
                            <span className="break-words">{priorityBadge.label}</span>
                          </span>

                          {insight.isTopRecommendation && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800 max-w-full break-words">
                              {t("ai.topTipBadge")}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Metric Chip */}
                    {insight.metricValue && (
                      <div className="text-left sm:text-right min-w-0 max-w-full">
                        <span className="text-[10px] text-slate-500 dark:text-slate-400 uppercase tracking-wider block break-words">
                          {insight.metricLabel || t("ai.valueFallbackLabel")}
                        </span>
                        <span className="text-sm font-black text-slate-900 dark:text-white break-words block">
                          {insight.metricValue}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Title & Description */}
                  <div className="mt-3.5 space-y-1.5 min-w-0">
                    <h3 className="font-bold text-slate-900 dark:text-white text-base leading-snug break-words">
                      {insight.title}
                    </h3>
                    <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed break-words">
                      {insight.description}
                    </p>
                  </div>

                  {/* Impact Tag (if any) */}
                  {insight.impact && (
                    <div className="mt-3.5 inline-flex items-center gap-1.5 bg-emerald-50 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border border-emerald-200/80 dark:border-emerald-800 px-2.5 py-1 rounded-lg text-xs font-bold max-w-full whitespace-normal break-words">
                      <Lightbulb className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                      <span className="break-words min-w-0">{insight.impact}</span>
                    </div>
                  )}
                </div>

                {/* Actionable Advice Footer */}
                <div className="mt-4 pt-3.5 border-t border-slate-100 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/60 -mx-4 sm:-mx-6 -mb-4 sm:-mb-6 p-4 rounded-b-2xl min-w-0">
                  <div className="flex flex-wrap sm:flex-nowrap items-start gap-1.5 sm:gap-2 text-xs text-slate-700 dark:text-slate-200 min-w-0">
                    <span className="font-bold text-indigo-600 dark:text-indigo-400 shrink-0 mt-0.5">
                      {t("ai.recommendationPrefix")}
                    </span>
                    <p className="font-medium text-slate-700 dark:text-slate-200 leading-relaxed break-words min-w-0 flex-1">
                      {insight.actionableTip}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Bottom Controls: Prev Arrow · Page Dots + Counter · Next Arrow */}
      {totalCards > 1 && (
        <div className="flex items-center justify-between gap-3 pt-0.5">
          <button
            type="button"
            onClick={() => canGoPrev && scrollToIndex(safeActiveIndex - 1)}
            disabled={!canGoPrev}
            aria-label={t("ai.prevCardAria")}
            className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center rounded-2xl bg-white dark:bg-[#16181d] border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-35 disabled:cursor-not-allowed transition-colors cursor-pointer shadow-2xs"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>

          <div className="flex flex-col items-center gap-0.5 min-w-0">
            <div
              className="flex items-center justify-center gap-1 sm:gap-1.5 flex-wrap"
              role="navigation"
              aria-label={t("ai.dotsAria")}
            >
              {insights.map((insight, idx) => {
                const isSelected = idx === safeActiveIndex;
                return (
                  <button
                    key={insight.id}
                    type="button"
                    onClick={() => scrollToIndex(idx)}
                    aria-label={t("ai.dotAria", {
                      index: idx + 1,
                      title: insight.title,
                    })}
                    aria-current={isSelected ? "page" : undefined}
                    className="min-h-[36px] min-w-[20px] sm:min-w-[24px] flex items-center justify-center cursor-pointer group/dot"
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
              {t("ai.cardCounter", {
                current: safeActiveIndex + 1,
                total: totalCards,
              })}
            </span>
          </div>

          <button
            type="button"
            onClick={() => canGoNext && scrollToIndex(safeActiveIndex + 1)}
            disabled={!canGoNext}
            aria-label={t("ai.nextCardAria")}
            className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center rounded-2xl bg-white dark:bg-[#16181d] border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-35 disabled:cursor-not-allowed transition-colors cursor-pointer shadow-2xs"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>
      )}
    </div>
  );
};
