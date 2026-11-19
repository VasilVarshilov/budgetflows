import React, { useMemo, useState, useEffect, useRef } from "react";
import {
  ResponsiveContainer,
  PieChart as RechartsPieChart,
  Pie,
  Cell,
  Tooltip,
} from "recharts";
import { BarChart3, PieChart as PieChartIcon, Info } from "lucide-react";
import {
  CategoryChartInput,
  CategoryChartSegment,
  prepareCategoryChartData,
  getReadableTextColor,
} from "@/utils/colors";

interface CategoryDistributionChartProps {
  items: CategoryChartInput[];
  totalLabel?: string;
  emptyTitle?: string;
  emptyActionLabel?: string;
  onEmptyAction?: () => void;
  compact?: boolean;
  maxBarRows?: number;
  groupThresholdPercent?: number;
  horizontalBarThresholdCount?: number;
}

interface ChartTooltipProps {
  active?: boolean;
  payload?: Array<{ payload: CategoryChartSegment }>;
}

const CategoryChartTooltip: React.FC<ChartTooltipProps> = ({ active, payload }) => {
  if (!active || !payload || payload.length === 0) return null;
  const seg = payload[0].payload;
  return (
    <div className="bg-slate-900 text-white px-3 py-2.5 rounded-xl shadow-lg border border-slate-700/80 text-xs max-w-[230px] z-50">
      <div className="flex items-center justify-between gap-3 font-bold">
        <span className="flex items-center gap-1.5 truncate">
          <span
            className="w-2.5 h-2.5 rounded-full shrink-0"
            style={{ backgroundColor: seg.color }}
          />
          <span className="truncate">{seg.name}</span>
        </span>
        <span className="tabular-nums shrink-0">{seg.percentage.toFixed(1)}%</span>
      </div>
      <div className="text-slate-300 font-semibold tabular-nums mt-1">
        €{seg.value.toFixed(2)}
      </div>
      {seg.groupedItems && seg.groupedItems.length > 0 && (
        <div className="mt-2 pt-1.5 border-t border-slate-700 space-y-0.5 text-[11px] text-slate-300">
          {seg.groupedItems.slice(0, 5).map((sub) => (
            <div key={sub.name} className="flex items-center justify-between gap-2">
              <span className="truncate">{sub.name}</span>
              <span className="tabular-nums shrink-0">
                {sub.percentage.toFixed(1)}% · €{sub.value.toFixed(2)}
              </span>
            </div>
          ))}
          {seg.groupedItems.length > 5 && (
            <div className="text-[10px] text-slate-400">
              + още {seg.groupedItems.length - 5} категории
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Donut Direct-Label Geometry & Collision-Avoidance Helpers
// ---------------------------------------------------------------------------

const RADIAN = Math.PI / 180;

function polarToCartesian(cx: number, cy: number, radius: number, angleDeg: number) {
  const rad = -angleDeg * RADIAN;
  return {
    x: cx + radius * Math.cos(rad),
    y: cy + radius * Math.sin(rad),
  };
}

function formatChartPct(pct: number): string {
  if (Math.abs(pct - Math.round(pct)) < 0.05) {
    return `${Math.round(pct)}%`;
  }
  return `${pct.toFixed(1)}%`;
}

function truncateLabel(text: string, maxChars: number): string {
  const clean = text.trim();
  if (clean.length <= maxChars) return clean;
  if (maxChars <= 2) return clean.slice(0, maxChars);
  return `${clean.slice(0, maxChars - 1)}…`;
}

/**
 * Checks whether angleDeg lies inside [endAngle, startAngle] (clockwise sweep from startAngle down to endAngle).
 */
function isAngleInsideSector(angleDeg: number, startAngle: number, endAngle: number): boolean {
  // Normalize relative to endAngle in [0, 360)
  const span = ((startAngle - endAngle) % 360 + 360) % 360;
  if (span >= 359.5) return true;
  const offset = ((angleDeg - endAngle) % 360 + 360) % 360;
  return offset >= 0 && offset <= span;
}

/**
 * Verifies all 4 corners of a horizontal 2-line label box stay cleanly inside the donut slice arc & ring thickness.
 */
function doesBoxFitInSector(
  lx: number,
  ly: number,
  halfW: number,
  halfH: number,
  cx: number,
  cy: number,
  innerR: number,
  outerR: number,
  startAngle: number,
  endAngle: number
): boolean {
  const corners = [
    { x: lx - halfW, y: ly - halfH },
    { x: lx + halfW, y: ly - halfH },
    { x: lx - halfW, y: ly + halfH },
    { x: lx + halfW, y: ly + halfH },
  ];

  for (const c of corners) {
    const dx = c.x - cx;
    const dy = c.y - cy;
    const dist = Math.hypot(dx, dy);
    if (dist < innerR + 1.5 || dist > outerR - 1.5) {
      return false;
    }
    const cornerAngleDeg = (-Math.atan2(dy, dx)) / RADIAN;
    if (!isAngleInsideSector(cornerAngleDeg, startAngle, endAngle)) {
      return false;
    }
  }
  return true;
}

interface InsideLabelLayout {
  segment: CategoryChartSegment;
  x: number;
  y: number;
  displayName: string;
  pctText: string;
  textColor: string;
}

interface OutsideLabelLayout {
  segment: CategoryChartSegment;
  side: "left" | "right";
  p0: { x: number; y: number };
  p1: { x: number; y: number };
  x2: number;
  y2: number;
  displayName: string;
  pctText: string;
  textAnchor: "start" | "end";
}

interface ComputedDonutLabels {
  inside: InsideLabelLayout[];
  outside: OutsideLabelLayout[];
}

function computeDonutLabels(
  segments: CategoryChartSegment[],
  chartWidth: number,
  chartHeight: number,
  innerRadius: number,
  outerRadius: number,
  paddingAngle: number,
  isMobile: boolean
): ComputedDonutLabels {
  if (segments.length === 0 || chartWidth <= 0 || chartHeight <= 0) {
    return { inside: [], outside: [] };
  }

  const cx = chartWidth / 2;
  const cy = chartHeight / 2;
  const midRadius = (innerRadius + outerRadius) / 2;
  const totalValue = segments.reduce((sum, s) => sum + s.value, 0);
  if (totalValue <= 0) return { inside: [], outside: [] };

  const count = segments.length;
  const effectivePadding = count > 1 ? paddingAngle : 0;
  const realTotalAngle = Math.max(1, 360 - count * effectivePadding);

  interface SectorGeom {
    segment: CategoryChartSegment;
    startAngle: number;
    endAngle: number;
    midAngle: number;
    sweep: number;
  }

  const sectors: SectorGeom[] = [];
  let cursor = 90; // 12 o'clock

  for (const seg of segments) {
    const sweep = realTotalAngle * (seg.value / totalValue);
    const startAngle = cursor;
    const endAngle = cursor - sweep;
    const midAngle = count === 1 ? -90 : startAngle - sweep / 2;
    sectors.push({ segment: seg, startAngle, endAngle, midAngle, sweep });
    cursor = endAngle - effectivePadding;
  }

  const inside: InsideLabelLayout[] = [];
  const candidateOutside: Array<{
    segment: CategoryChartSegment;
    midAngle: number;
    p0: { x: number; y: number };
    p1: { x: number; y: number };
    side: "left" | "right";
  }> = [];

  const minInsidePct = isMobile ? 16 : 11;

  for (const sec of sectors) {
    const { segment, startAngle, endAngle, midAngle, sweep } = sec;
    const pctText = formatChartPct(segment.percentage);

    let placedInside = false;

    if (segment.percentage >= minInsidePct) {
      const maxChars = isMobile ? 11 : 14;
      const candidateNames = [
        truncateLabel(segment.name, maxChars),
        truncateLabel(segment.name, 9),
      ];

      // Try midpoint first, then subtle offsets along wide sectors so horizontal labels avoid 3/9 o'clock pinch
      const angleOffsets =
        sweep >= 110
          ? [0, -18, 18, -36, 36, -54, 54, -72, 72]
          : sweep >= 55
          ? [0, -10, 10]
          : [0];

      outerLoop: for (const nameAttempt of candidateNames) {
        const estWidth = Math.max(nameAttempt.length * (isMobile ? 5.6 : 6.1), pctText.length * 6.5);
        const halfW = estWidth / 2;
        const halfH = isMobile ? 11 : 12.5;

        for (const offset of angleOffsets) {
          const testAngle = midAngle + offset;
          if (!isAngleInsideSector(testAngle, startAngle - 4, endAngle + 4)) {
            continue;
          }
          const pt = polarToCartesian(cx, cy, midRadius, testAngle);
          if (
            doesBoxFitInSector(
              pt.x,
              pt.y,
              halfW,
              halfH,
              cx,
              cy,
              innerRadius,
              outerRadius,
              startAngle,
              endAngle
            )
          ) {
            inside.push({
              segment,
              x: pt.x,
              y: pt.y,
              displayName: nameAttempt,
              pctText,
              textColor: getReadableTextColor(segment.color),
            });
            placedInside = true;
            break outerLoop;
          }
        }
      }
    }

    if (!placedInside) {
      const p0 = polarToCartesian(cx, cy, outerRadius + 2, midAngle);
      const radialOut = isMobile ? 11 : 16;
      const p1 = polarToCartesian(cx, cy, outerRadius + radialOut, midAngle);
      const side: "left" | "right" = p1.x >= cx ? "right" : "left";
      candidateOutside.push({ segment, midAngle, p0, p1, side });
    }
  }

  // Distribute outside labels on left and right sides with collision avoidance
  const minRowGap = isMobile ? 25 : 22;
  const verticalMargin = isMobile ? 16 : 14;
  const topBound = verticalMargin;
  const bottomBound = chartHeight - verticalMargin;
  const maxPerSide = Math.max(1, Math.floor((bottomBound - topBound) / minRowGap) + 1);

  const outside: OutsideLabelLayout[] = [];

  for (const side of ["right", "left"] as const) {
    // Priority Rule: keep highest-value categories if mobile vertical space caps out
    const sideItems = candidateOutside
      .filter((c) => c.side === side)
      .sort((a, b) => b.segment.value - a.segment.value)
      .slice(0, maxPerSide)
      .sort((a, b) => a.p1.y - b.p1.y);

    if (sideItems.length === 0) continue;

    const ys = sideItems.map((item) => Math.max(topBound, Math.min(bottomBound, item.p1.y)));

    // Pass 1: push overlapping labels downward
    for (let i = 1; i < ys.length; i++) {
      if (ys[i] - ys[i - 1] < minRowGap) {
        ys[i] = ys[i - 1] + minRowGap;
      }
    }

    // Pass 2: if bottom overflowed, shift upward cleanly
    if (ys[ys.length - 1] > bottomBound) {
      ys[ys.length - 1] = bottomBound;
      for (let i = ys.length - 2; i >= 0; i--) {
        if (ys[i + 1] - ys[i] < minRowGap) {
          ys[i] = Math.max(topBound, ys[i + 1] - minRowGap);
        }
      }
    }

    const elbowOffset = isMobile ? 18 : 26;
    const baseAnchorX = side === "right" ? cx + outerRadius + elbowOffset : cx - outerRadius - elbowOffset;
    const availableSidePx =
      side === "right"
        ? Math.max(48, chartWidth - baseAnchorX - 6)
        : Math.max(48, baseAnchorX - 6);

    const maxCharsOutside = isMobile
      ? Math.max(7, Math.floor(availableSidePx / 6.2))
      : Math.max(9, Math.floor((availableSidePx - 36) / 6.2));

    sideItems.forEach((item, idx) => {
      const y2 = ys[idx];
      const x2 =
        side === "right"
          ? Math.max(item.p1.x + 8, baseAnchorX)
          : Math.min(item.p1.x - 8, baseAnchorX);

      outside.push({
        segment: item.segment,
        side,
        p0: item.p0,
        p1: item.p1,
        x2,
        y2,
        displayName: truncateLabel(item.segment.name, maxCharsOutside),
        pctText: formatChartPct(item.segment.percentage),
        textAnchor: side === "right" ? "start" : "end",
      });
    });
  }

  return { inside, outside };
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export const CategoryDistributionChart: React.FC<CategoryDistributionChartProps> = ({
  items,
  totalLabel = "Общо",
  emptyTitle = "Няма разходи за този период",
  emptyActionLabel,
  onEmptyAction,
  compact = false,
  groupThresholdPercent = 3,
  horizontalBarThresholdCount = 6,
}) => {
  const prepared = useMemo(
    () =>
      prepareCategoryChartData(items, {
        groupThresholdPercent,
        horizontalBarThresholdCount,
      }),
    [items, groupThresholdPercent, horizontalBarThresholdCount]
  );

  const [viewMode, setViewMode] = useState<"bars" | "donut">(() =>
    prepared.preferHorizontalBars ? "bars" : "donut"
  );

  useEffect(() => {
    setViewMode(prepared.preferHorizontalBars ? "bars" : "donut");
  }, [prepared.preferHorizontalBars]);

  const [showGroupedDetails, setShowGroupedDetails] = useState(false);
  const [hoveredName, setHoveredName] = useState<string | null>(null);

  const outerWrapperRef = useRef<HTMLDivElement | null>(null);
  const donutContainerRef = useRef<HTMLDivElement | null>(null);
  const [wrapperWidth, setWrapperWidth] = useState<number>(520);
  const [donutWidth, setDonutWidth] = useState<number>(480);

  useEffect(() => {
    const outerEl = outerWrapperRef.current;
    if (!outerEl || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        if (entry.contentRect.width > 0) {
          setWrapperWidth(entry.contentRect.width);
        }
      }
    });
    ro.observe(outerEl);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const el = donutContainerRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        if (entry.contentRect.width > 0) {
          setDonutWidth(entry.contentRect.width);
        }
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [viewMode, prepared.segments.length]);

  const useSideBySide = wrapperWidth >= 760;
  const isMobileDonut = donutWidth < 430;

  const donutHeight = isMobileDonut
    ? compact
      ? 230
      : 255
    : compact
    ? 255
    : 280;

  const innerRadius = isMobileDonut ? 34 : 50;
  const outerRadius = isMobileDonut ? 74 : 100;
  const paddingAngle = prepared.segments.length > 1 ? 2 : 0;

  const donutLabels = useMemo(
    () =>
      computeDonutLabels(
        prepared.segments,
        donutWidth,
        donutHeight,
        innerRadius,
        outerRadius,
        paddingAngle,
        isMobileDonut
      ),
    [
      prepared.segments,
      donutWidth,
      donutHeight,
      innerRadius,
      outerRadius,
      paddingAngle,
      isMobileDonut,
    ]
  );

  if (prepared.segments.length === 0) {
    return (
      <div
        ref={outerWrapperRef}
        className={`${
          compact ? "h-[160px]" : "h-[220px]"
        } flex flex-col items-center justify-center text-center p-6 text-slate-500 dark:text-slate-400`}
      >
        <Info className="w-8 h-8 opacity-40 mb-2" />
        <p className="text-sm font-medium">{emptyTitle}</p>
        {emptyActionLabel && onEmptyAction && (
          <button
            type="button"
            onClick={onEmptyAction}
            className="mt-3 text-xs text-indigo-600 dark:text-indigo-400 font-semibold hover:underline cursor-pointer"
          >
            {emptyActionLabel}
          </button>
        )}
      </div>
    );
  }

  const maxSegmentValue = prepared.segments.reduce(
    (max, seg) => Math.max(max, seg.value),
    0
  );
  const othersSegment = prepared.segments.find(
    (seg) => seg.isOthersGroup && seg.groupedItems && seg.groupedItems.length > 0
  );

  const cx = donutWidth / 2;
  const cy = donutHeight / 2;

  return (
    <div ref={outerWrapperRef} className="space-y-3.5 w-full">
      {/* Subtle Adaptive Mode Header & View Switch */}
      <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
        <span className="text-slate-500 dark:text-slate-400 font-medium">
          {prepared.preferHorizontalBars
            ? `${prepared.rawCount} категории · Ранжирани ленти`
            : `${prepared.rawCount} ${prepared.rawCount === 1 ? "категория" : "категории"}`}
          {prepared.hasGroupedSmallCategories && " · Под 3% в „Други“"}
        </span>

        {prepared.segments.length > 1 && (
          <div
            className="inline-flex items-center rounded-lg bg-slate-100 dark:bg-slate-800 p-0.5 border border-slate-200/80 dark:border-slate-700/80"
            role="group"
            aria-label="Режим на визуализация"
          >
            <button
              type="button"
              onClick={() => setViewMode("bars")}
              className={`inline-flex items-center gap-1 px-2 py-1 rounded-md font-semibold transition-colors cursor-pointer ${
                viewMode === "bars"
                  ? "bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-2xs"
                  : "text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200"
              }`}
              title="Хоризонтални ранжирани ленти"
            >
              <BarChart3 className="w-3 h-3" />
              <span>Ленти</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode("donut")}
              className={`inline-flex items-center gap-1 px-2 py-1 rounded-md font-semibold transition-colors cursor-pointer ${
                viewMode === "donut"
                  ? "bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-2xs"
                  : "text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200"
              }`}
              title="Кръгова диаграма"
            >
              <PieChartIcon className="w-3 h-3" />
              <span>Кръгова</span>
            </button>
          </div>
        )}
      </div>

      {/* Main Chart Body */}
      {viewMode === "bars" ? (
        <div
          className={`space-y-2.5 ${
            compact ? "max-h-[260px]" : "max-h-[300px]"
          } overflow-y-auto pr-1 custom-scrollbar`}
        >
          {prepared.segments.map((seg) => {
            const fillWidthPct =
              maxSegmentValue > 0
                ? Math.max(4, (seg.value / maxSegmentValue) * 100)
                : 0;
            return (
              <div key={seg.name} className="space-y-1">
                <div className="flex items-center justify-between gap-2 text-xs">
                  <div className="flex items-center gap-2 min-w-0">
                    <span
                      className="w-2.5 h-2.5 rounded-full shrink-0"
                      style={{ backgroundColor: seg.color }}
                    />
                    <span className="font-semibold text-slate-800 dark:text-slate-200 truncate">
                      {seg.name}
                    </span>
                    {seg.groupedItems && seg.groupedItems.length > 0 && (
                      <span className="text-[10px] font-medium text-slate-500 dark:text-slate-400 shrink-0 tabular-nums">
                        ({seg.groupedItems.length} &lt;3%)
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2.5 shrink-0 tabular-nums">
                    <span className="font-bold text-slate-900 dark:text-white">
                      {seg.percentage.toFixed(1)}%
                    </span>
                    <span className="text-slate-600 dark:text-slate-300 font-medium min-w-[68px] text-right">
                      €{seg.value.toFixed(2)}
                    </span>
                  </div>
                </div>
                <div className="w-full h-2.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{
                      width: `${fillWidthPct}%`,
                      backgroundColor: seg.color,
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div
          className={
            useSideBySide
              ? "flex flex-row items-center gap-5"
              : "flex flex-col gap-4"
          }
        >
          {/* Donut Chart + Direct Labels & Connector Lines */}
          <div
            ref={donutContainerRef}
            className={`relative ${
              useSideBySide ? "w-[55%] shrink-0" : "w-full"
            }`}
            style={{ height: `${donutHeight}px` }}
          >
            <ResponsiveContainer width="100%" height="100%">
              <RechartsPieChart>
                <Pie
                  data={prepared.segments}
                  cx={cx}
                  cy={cy}
                  startAngle={90}
                  endAngle={-270}
                  innerRadius={innerRadius}
                  outerRadius={outerRadius}
                  paddingAngle={paddingAngle}
                  dataKey="value"
                  stroke="none"
                  isAnimationActive={false}
                >
                  {prepared.segments.map((entry) => {
                    const isDimmed =
                      hoveredName !== null && hoveredName !== entry.name;
                    return (
                      <Cell
                        key={entry.name}
                        fill={entry.color}
                        fillOpacity={isDimmed ? 0.35 : 1}
                        onMouseEnter={() => setHoveredName(entry.name)}
                        onMouseLeave={() => setHoveredName(null)}
                      />
                    );
                  })}
                </Pie>
                <Tooltip content={<CategoryChartTooltip />} />
              </RechartsPieChart>
            </ResponsiveContainer>

            {/* SVG Direct Labels & Connector Overlay (pointer-events-none preserves Pie hover/tooltip) */}
            <svg
              width={donutWidth}
              height={donutHeight}
              viewBox={`0 0 ${donutWidth} ${donutHeight}`}
              className="absolute inset-0 pointer-events-none overflow-visible"
              aria-hidden="true"
            >
              {/* Inside Labels for Large Segments */}
              {donutLabels.inside.map((lbl) => (
                <g
                  key={`in-${lbl.segment.name}`}
                  opacity={
                    hoveredName && hoveredName !== lbl.segment.name ? 0.45 : 1
                  }
                >
                  <text
                    x={lbl.x}
                    y={lbl.y - 4.5}
                    textAnchor="middle"
                    dominantBaseline="central"
                    fill={lbl.textColor}
                    style={{
                      fontSize: isMobileDonut ? "10px" : "11px",
                      fontWeight: 700,
                    }}
                  >
                    {lbl.displayName}
                  </text>
                  <text
                    x={lbl.x}
                    y={lbl.y + 8}
                    textAnchor="middle"
                    dominantBaseline="central"
                    fill={lbl.textColor}
                    style={{
                      fontSize: isMobileDonut ? "10.5px" : "11.5px",
                      fontWeight: 800,
                    }}
                  >
                    {lbl.pctText}
                  </text>
                </g>
              ))}

              {/* Outside Callout Labels + Connector Lines for Smaller Segments */}
              {donutLabels.outside.map((lbl) => {
                const isDimmed =
                  hoveredName !== null && hoveredName !== lbl.segment.name;
                const textOffsetX = lbl.side === "right" ? 5 : -5;
                const labelX = lbl.x2 + textOffsetX;

                return (
                  <g
                    key={`out-${lbl.segment.name}`}
                    opacity={isDimmed ? 0.35 : 1}
                  >
                    <circle
                      cx={lbl.p0.x}
                      cy={lbl.p0.y}
                      r={2.5}
                      fill={lbl.segment.color}
                    />
                    <polyline
                      points={`${lbl.p0.x},${lbl.p0.y} ${lbl.p1.x},${lbl.p1.y} ${lbl.x2},${lbl.y2}`}
                      fill="none"
                      stroke={lbl.segment.color}
                      strokeWidth={1.6}
                      strokeOpacity={0.9}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                    {isMobileDonut ? (
                      <>
                        <text
                          x={labelX}
                          y={lbl.y2 - 4}
                          textAnchor={lbl.textAnchor}
                          dominantBaseline="central"
                          className="fill-slate-700 dark:fill-slate-200"
                          style={{ fontSize: "10px", fontWeight: 600 }}
                        >
                          {lbl.displayName}
                        </text>
                        <text
                          x={labelX}
                          y={lbl.y2 + 7.5}
                          textAnchor={lbl.textAnchor}
                          dominantBaseline="central"
                          className="fill-slate-900 dark:fill-white"
                          style={{ fontSize: "10.5px", fontWeight: 800 }}
                        >
                          {lbl.pctText}
                        </text>
                      </>
                    ) : (
                      <text
                        x={labelX}
                        y={lbl.y2}
                        textAnchor={lbl.textAnchor}
                        dominantBaseline="central"
                        style={{ fontSize: "11px" }}
                      >
                        <tspan className="fill-slate-700 dark:fill-slate-200 font-semibold">
                          {lbl.displayName}{" "}
                        </tspan>
                        <tspan className="fill-slate-900 dark:fill-white font-extrabold">
                          {lbl.pctText}
                        </tspan>
                      </text>
                    )}
                  </g>
                );
              })}
            </svg>

            {/* Center Total Overlay */}
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none px-2 text-center">
              <span
                className={`${
                  isMobileDonut ? "text-[9px]" : "text-[10px]"
                } font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400`}
              >
                {totalLabel}
              </span>
              <span
                className={`${
                  isMobileDonut ? "text-xs" : "text-sm sm:text-base"
                } font-extrabold text-slate-900 dark:text-white tabular-nums leading-tight`}
              >
                €{prepared.total.toFixed(2)}
              </span>
            </div>
          </div>

          {/* Ranked Percentage Legend (Always preserved with name, amount & percentage) */}
          <div
            className={
              useSideBySide
                ? "w-[45%] max-h-[260px] overflow-y-auto space-y-2 pr-1 custom-scrollbar"
                : "w-full grid grid-cols-1 sm:grid-cols-2 gap-2"
            }
          >
            {prepared.segments.map((seg) => {
              const isHighlighted = hoveredName === seg.name;
              return (
                <div
                  key={seg.name}
                  onMouseEnter={() => setHoveredName(seg.name)}
                  onMouseLeave={() => setHoveredName(null)}
                  className={`p-1.5 rounded-lg transition-colors space-y-1 cursor-default ${
                    isHighlighted
                      ? "bg-slate-100 dark:bg-slate-800/90"
                      : "hover:bg-slate-50 dark:hover:bg-slate-800/60"
                  }`}
                >
                  <div className="flex items-center justify-between text-xs gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span
                        className="w-2.5 h-2.5 rounded-full shrink-0"
                        style={{ backgroundColor: seg.color }}
                      />
                      <span className="font-semibold text-slate-700 dark:text-slate-200 truncate">
                        {seg.name}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0 tabular-nums">
                      <span className="font-bold text-slate-900 dark:text-white">
                        €{seg.value.toFixed(2)}
                      </span>
                      <span className="text-xs font-bold text-slate-600 dark:text-slate-300 w-11 text-right">
                        {seg.percentage.toFixed(1)}%
                      </span>
                    </div>
                  </div>
                  <div className="w-full h-1.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${Math.max(4, seg.percentage)}%`,
                        backgroundColor: seg.color,
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Optional Disclosure of <3% Small Categories Merged into "Други" */}
      {othersSegment?.groupedItems && othersSegment.groupedItems.length > 0 && (
        <div className="pt-2 border-t border-slate-100 dark:border-slate-800/80 text-[11px] text-slate-500 dark:text-slate-400">
          <button
            type="button"
            onClick={() => setShowGroupedDetails((prev) => !prev)}
            className="font-medium hover:text-slate-800 dark:hover:text-slate-200 transition-colors cursor-pointer"
          >
            {showGroupedDetails
              ? "Скрий състава на „Други“"
              : `„Други“ обединява ${othersSegment.groupedItems.length} категории под 3% — виж детайли`}
          </button>
          {showGroupedDetails && (
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {othersSegment.groupedItems.map((sub) => (
                <span
                  key={sub.name}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-50 dark:bg-slate-800/80 border border-slate-200/70 dark:border-slate-700/70 text-slate-700 dark:text-slate-300 tabular-nums"
                >
                  <span
                    className="w-2 h-2 rounded-full shrink-0"
                    style={{ backgroundColor: sub.color }}
                  />
                  <span>{sub.name}</span>
                  <span className="text-slate-400 dark:text-slate-500">·</span>
                  <span className="font-semibold">{sub.percentage.toFixed(1)}%</span>
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
