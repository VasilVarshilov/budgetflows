import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  TrendingUp,
  TrendingDown,
  Minus,
  ArrowUpRight,
  Zap,
  ArrowDownLeft,
  PiggyBank,
  Layers,
  Info,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import {
  MonthComparisonData,
  MetricComparison,
} from "@/utils/comparisonStorage";
import {
  formatLocalizedMonthYear,
  localizeComparisonMetricName,
  useI18n,
} from "@/i18n";

interface MonthToMonthComparisonProps {
  comparisonData: MonthComparisonData;
  title?: string;
  subtitle?: string;
  compact?: boolean;
  layout?: "swipe" | "grid";
}

const INTERACTIVE_DRAG_EXCLUDE_SELECTOR =
  'button, a, input, select, textarea, label, [role="button"], [role="switch"], [data-no-drag="true"]';

export const MonthToMonthComparison: React.FC<MonthToMonthComparisonProps> = ({
  comparisonData,
  title,
  subtitle,
  layout = "swipe",
}) => {
  const { t, language } = useI18n();
  const {
    currentMonthLabel,
    previousMonthLabel,
    hasPreviousData,
    income,
    expenses,
    savings,
    electricity,
  } = comparisonData;
  const localizedCurrentMonth = formatLocalizedMonthYear(currentMonthLabel, language);
  const localizedPreviousMonth = formatLocalizedMonthYear(previousMonthLabel, language);
  const resolvedTitle = title ?? t("comparison.title");

  const metricCards: Array<{
    key: "income" | "expenses" | "savings" | "electricity";
    metric: MetricComparison;
    icon: React.ReactNode;
  }> = [
    {
      key: "income",
      metric: income,
      icon: <ArrowDownLeft className="w-4 h-4" />,
    },
    {
      key: "expenses",
      metric: expenses,
      icon: <ArrowUpRight className="w-4 h-4" />,
    },
    {
      key: "savings",
      metric: savings,
      icon: <PiggyBank className="w-4 h-4" />,
    },
    {
      key: "electricity",
      metric: electricity,
      icon: <Zap className="w-4 h-4" />,
    },
  ];

  // Default card: index 0 (Income Comparison)
  const [activeIndex, setActiveIndex] = useState(0);
  const [isDraggingMouse, setIsDraggingMouse] = useState(false);

  const trackRef = useRef<HTMLDivElement | null>(null);
  const activeIndexRef = useRef(activeIndex);
  activeIndexRef.current = activeIndex;
  const totalCards = metricCards.length;

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
    if (layout !== "swipe") return;
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
  }, [activeIndex, layout]);

  useEffect(() => {
    if (layout !== "swipe") return;
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
  }, [layout]);

  const handleTrackScroll = useCallback(() => {
    if (dragStateRef.current.active) return;
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

  const renderMetricCard = (
    metric: MetricComparison,
    icon: React.ReactNode,
    metricType: "income" | "expenses" | "savings" | "electricity"
  ) => {
    const isImprovement = metric.trend === "improvement";
    const isNegative = metric.trend === "negative";
    const isNeutral = metric.trend === "neutral";

    // Colors:
    // Green = Improvement
    // Red = Negative Trend
    const badgeBg = isImprovement
      ? "bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800"
      : isNegative
      ? "bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-800"
      : "bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700";

    const badgeDot = isImprovement
      ? "bg-emerald-500"
      : isNegative
      ? "bg-rose-500"
      : "bg-slate-400 dark:bg-slate-500";

    const indicatorTextColor = isImprovement
      ? "text-emerald-700 dark:text-emerald-400 font-bold"
      : isNegative
      ? "text-rose-700 dark:text-rose-400 font-bold"
      : "text-slate-600 dark:text-slate-400 font-medium";

    const iconWrapperBg =
      metricType === "income"
        ? "bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400"
        : metricType === "expenses"
        ? "bg-rose-50 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400"
        : metricType === "savings"
        ? "bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400"
        : "bg-yellow-50 dark:bg-yellow-950/60 text-yellow-600 dark:text-yellow-400";

    const diffIsPositive = metric.difference > 0;
    const diffIsNegative = metric.difference < 0;

    return (
      <div
        key={metric.name}
        className={`bg-white dark:bg-slate-900 rounded-2xl border p-4 sm:p-5 shadow-2xs hover:shadow-md transition-all flex flex-col justify-between h-full ${
          isImprovement
            ? "border-emerald-100/90 dark:border-emerald-900/60 hover:border-emerald-200 dark:hover:border-emerald-700"
            : isNegative
            ? "border-rose-100/90 dark:border-rose-900/60 hover:border-rose-200 dark:hover:border-rose-700"
            : "border-slate-200/80 dark:border-slate-800"
        }`}
      >
        <div>
          {/* Card Header: Icon, Name, and Status Badge */}
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2.5 min-w-0">
              <div
                className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${iconWrapperBg}`}
              >
                {icon}
              </div>
              <div className="min-w-0">
                <h4 className="font-bold text-slate-900 dark:text-white text-sm truncate">
                  {localizeComparisonMetricName(metric.name, language)}
                </h4>
                <span className="text-[11px] text-slate-500 dark:text-slate-400 block truncate">
                  {t("comparison.vsPreviousShort", { curr: localizedCurrentMonth })}
                </span>
              </div>
            </div>

            {/* Percentage Badge with Visual Indicator */}
            <div
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold border shadow-2xs shrink-0 ${badgeBg}`}
            >
              {diffIsPositive && (
                <TrendingUp className="w-3.5 h-3.5 shrink-0 stroke-[2.5]" />
              )}
              {diffIsNegative && (
                <TrendingDown className="w-3.5 h-3.5 shrink-0 stroke-[2.5]" />
              )}
              {!diffIsPositive && !diffIsNegative && (
                <Minus className="w-3.5 h-3.5 shrink-0" />
              )}
              <span>{metric.formattedPercentage}</span>
            </div>
          </div>

          {/* Current vs Previous Values */}
          <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
            <div className="bg-slate-50/80 dark:bg-slate-800/60 p-2.5 rounded-xl border border-slate-100 dark:border-slate-700/60">
              <span className="text-slate-500 dark:text-slate-400 block text-[11px] font-medium">
                {t("comparison.current", { month: localizedCurrentMonth })}
              </span>
              <span className="font-black text-slate-900 dark:text-white text-base tabular-nums">
                €{metric.currentValue.toFixed(2)}
              </span>
            </div>

            <div className="bg-slate-50/80 dark:bg-slate-800/60 p-2.5 rounded-xl border border-slate-100 dark:border-slate-700/60">
              <span className="text-slate-500 dark:text-slate-400 block text-[11px] font-medium">
                {t("comparison.previous", { month: localizedPreviousMonth })}
              </span>
              <span className="font-bold text-slate-700 dark:text-slate-300 text-base tabular-nums">
                €{metric.previousValue.toFixed(2)}
              </span>
            </div>
          </div>
        </div>

        {/* Bottom Trend Analysis Bar */}
        <div className="mt-3.5 pt-2.5 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs gap-2">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className={`w-2 h-2 rounded-full shrink-0 ${badgeDot}`} />
            <span className={`${indicatorTextColor} truncate`}>
              {isImprovement && t("comparison.improved")}
              {isNegative && t("comparison.worsened")}
              {isNeutral && t("comparison.noChange")}
            </span>
          </div>

          <span className="text-slate-500 dark:text-slate-400 font-semibold text-[11px] tabular-nums shrink-0">
            {metric.difference >= 0 ? "+" : ""}€
            {metric.difference.toFixed(2)}
          </span>
        </div>
      </div>
    );
  };

  const canGoPrev = activeIndex > 0;
  const canGoNext = activeIndex < totalCards - 1;

  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 p-4 sm:p-5 shadow-xs space-y-4 transition-colors">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3.5 border-b border-slate-100 dark:border-slate-800">
        <div className="flex items-center gap-2.5">
          <div className="p-2 bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 rounded-xl shrink-0">
            <Layers className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-bold text-slate-800 dark:text-slate-100 text-base">
              {resolvedTitle}
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              {subtitle ||
                t("comparison.subtitleTemplate", {
                  curr: localizedCurrentMonth,
                  prev: localizedPreviousMonth,
                })}
            </p>
          </div>
        </div>

        {/* Legend Indicator */}
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="inline-flex items-center gap-1 font-semibold text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/60 px-2 py-0.5 rounded-md border border-emerald-200 dark:border-emerald-800">
            <span className="w-2 h-2 rounded-full bg-emerald-500" />
            {t("comparison.greenLegend")}
          </span>
          <span className="inline-flex items-center gap-1 font-semibold text-rose-700 dark:text-rose-300 bg-rose-50 dark:bg-rose-950/60 px-2 py-0.5 rounded-md border border-rose-200 dark:border-rose-800">
            <span className="w-2 h-2 rounded-full bg-rose-500" />
            {t("comparison.redLegend")}
          </span>
        </div>
      </div>

      {/* Notice if no previous month data */}
      {!hasPreviousData && (
        <div className="flex items-center gap-2 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 p-2.5 rounded-xl text-xs text-amber-800 dark:text-amber-200">
          <Info className="w-4 h-4 shrink-0 text-amber-600 dark:text-amber-400" />
          <span>
            {t("comparison.missingPrevNotice", { prev: localizedPreviousMonth })}
          </span>
        </div>
      )}

      {layout === "grid" ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {metricCards.map((card) =>
            renderMetricCard(card.metric, card.icon, card.key)
          )}
        </div>
      ) : (
        <div
          className="space-y-3 outline-none"
          onKeyDown={handleCarouselKeyDown}
          tabIndex={-1}
          aria-roledescription="carousel"
          aria-label={t("comparison.carouselAria")}
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
              isDraggingMouse ? "cursor-grabbing select-none" : "cursor-grab"
            }`}
          >
            {metricCards.map((card, idx) => {
              const isActive = idx === activeIndex;
              const metricTitle = localizeComparisonMetricName(
                card.metric.name,
                language
              );
              return (
                <div
                  key={card.key}
                  role="group"
                  aria-roledescription="slide"
                  aria-label={t("comparison.slideAria", {
                    index: idx + 1,
                    total: totalCards,
                    title: metricTitle,
                  })}
                  aria-hidden={!isActive}
                  className="w-full shrink-0 snap-center snap-always p-0.5"
                >
                  {renderMetricCard(card.metric, card.icon, card.key)}
                </div>
              );
            })}
          </div>

          {/* Bottom Controls: Prev Arrow · Page Dots + Counter · Next Arrow */}
          <div className="flex items-center justify-between gap-3 pt-0.5">
            <button
              type="button"
              onClick={() => canGoPrev && scrollToIndex(activeIndex - 1)}
              disabled={!canGoPrev}
              aria-label={t("comparison.prevCardAria")}
              className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center rounded-2xl bg-white dark:bg-[#16181d] border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-35 disabled:cursor-not-allowed transition-colors cursor-pointer shadow-2xs"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>

            <div className="flex flex-col items-center gap-0.5">
              <div
                className="flex items-center justify-center gap-1 sm:gap-1.5"
                role="navigation"
                aria-label={t("comparison.dotsAria")}
              >
                {metricCards.map((card, idx) => {
                  const isSelected = idx === activeIndex;
                  const metricTitle = localizeComparisonMetricName(
                    card.metric.name,
                    language
                  );
                  return (
                    <button
                      key={card.key}
                      type="button"
                      onClick={() => scrollToIndex(idx)}
                      aria-label={t("comparison.dotAria", {
                        index: idx + 1,
                        title: metricTitle,
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
                {t("comparison.cardCounter", {
                  current: activeIndex + 1,
                  total: totalCards,
                })}
              </span>
            </div>

            <button
              type="button"
              onClick={() => canGoNext && scrollToIndex(activeIndex + 1)}
              disabled={!canGoNext}
              aria-label={t("comparison.nextCardAria")}
              className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center rounded-2xl bg-white dark:bg-[#16181d] border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-35 disabled:cursor-not-allowed transition-colors cursor-pointer shadow-2xs"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
