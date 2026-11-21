import React from "react";

export const APP_NAME = "Budget Force 365";
export const APP_SHORT_NAME = "Budget 365";
export const APP_TAGLINE = "May the Budget Force be with you.";
export const APP_DESCRIPTION =
  "Personal Finance Management powered by smart budgeting, planning and insights.";

export type BrandLogoVariant = "adaptive" | "light" | "dark" | "appIcon";
export type BrandLogoDetail = "auto" | "full" | "compact";
export type BrandLogoConcept = "chronometer" | "dual-ring" | "apex-bearing";

interface BrandMarkProps {
  size?: number;
  variant?: BrandLogoVariant;
  detail?: BrandLogoDetail;
  concept?: BrandLogoConcept;
  className?: string;
}

interface TonePalette {
  dialBg: string;
  dialRing: string;
  dialAccent: string;
  ringOuter: string;
  ringInner: string;
  brassLit: string;
  brassShadow: string;
  coreBg: string;
  coreRim: string;
  bfText: string;
  arrowTip: string;
  arrowTail: string;
  cardinalText: string;
}

function getToneClasses(variant: BrandLogoVariant): TonePalette {
  if (variant === "dark" || variant === "appIcon") {
    return {
      dialBg: "fill-[#0E173D]",
      dialRing: "fill-[#312E81]",
      dialAccent: "fill-[#4C1D95]",
      ringOuter: "fill-[#E3B556]",
      ringInner: "fill-[#8F5D1B]",
      brassLit: "fill-[#F7D47E]",
      brassShadow: "fill-[#A96F24]",
      coreBg: "fill-[#0A1232]",
      coreRim: "fill-[#F0C468]",
      bfText: "fill-[#F8FAFC]",
      arrowTip: "fill-[#38BDF8]",
      arrowTail: "fill-[#2563EB]",
      cardinalText: "fill-[#E3B556]",
    };
  }
  if (variant === "light") {
    return {
      dialBg: "fill-[#EEF2FF]",
      dialRing: "fill-[#C7D2FE]",
      dialAccent: "fill-[#DDD6FE]",
      ringOuter: "fill-[#B9801F]",
      ringInner: "fill-[#7D4E10]",
      brassLit: "fill-[#DCA135]",
      brassShadow: "fill-[#8D5915]",
      coreBg: "fill-[#141C4B]",
      coreRim: "fill-[#D49B35]",
      bfText: "fill-[#FFFFFF]",
      arrowTip: "fill-[#0EA5E9]",
      arrowTail: "fill-[#2563EB]",
      cardinalText: "fill-[#8D5915]",
    };
  }
  return {
    dialBg: "fill-[#EEF2FF] dark:fill-[#0E173D]",
    dialRing: "fill-[#C7D2FE] dark:fill-[#312E81]",
    dialAccent: "fill-[#DDD6FE] dark:fill-[#4C1D95]",
    ringOuter: "fill-[#B9801F] dark:fill-[#E3B556]",
    ringInner: "fill-[#7D4E10] dark:fill-[#8F5D1B]",
    brassLit: "fill-[#DCA135] dark:fill-[#F7D47E]",
    brassShadow: "fill-[#8D5915] dark:fill-[#A96F24]",
    coreBg: "fill-[#141C4B] dark:fill-[#0A1232]",
    coreRim: "fill-[#D49B35] dark:fill-[#F0C468]",
    bfText: "fill-[#FFFFFF] dark:fill-[#F8FAFC]",
    arrowTip: "fill-[#0EA5E9] dark:fill-[#38BDF8]",
    arrowTail: "fill-[#2563EB] dark:fill-[#2563EB]",
    cardinalText: "fill-[#8D5915] dark:fill-[#E3B556]",
  };
}

/** Precision circular ring path (cx=50, cy=50) */
function makeRingPath(rOut: number, rIn: number, cx = 50, cy = 50): string {
  const K = 0.5522847498;
  const cCW = (r: number) =>
    `M ${cx} ${cy - r} C ${cx + r * K} ${cy - r} ${cx + r} ${cy - r * K} ${cx + r} ${cy} C ${cx + r} ${cy + r * K} ${cx + r * K} ${cy + r} ${cx} ${cy + r} C ${cx - r * K} ${cy + r} ${cx - r} ${cy + r * K} ${cx - r} ${cy} C ${cx - r} ${cy - r * K} ${cx - r * K} ${cy - r} ${cx} ${cy - r} Z`;
  const cCCW = (r: number) =>
    `M ${cx} ${cy - r} C ${cx - r * K} ${cy - r} ${cx - r} ${cy - r * K} ${cx - r} ${cy} C ${cx - r} ${cy + r * K} ${cx - r * K} ${cy + r} ${cx} ${cy + r} C ${cx + r * K} ${cy + r} ${cx + r} ${cy + r * K} ${cx + r} ${cy} C ${cx + r} ${cy - r * K} ${cx + r * K} ${cy - r} ${cx} ${cy - r} Z`;
  return `${cCW(rOut)} ${cCCW(rIn)}`;
}

const COMPACT_OUTER_RING = makeRingPath(36.5, 32.8);
const COMPACT_INNER_BEZEL = makeRingPath(32.8, 31.6);
const DIAL_TRACK_RING = makeRingPath(26.0, 24.8);
const CORE_RIM_RING = makeRingPath(14.8, 12.9);

const BF_LETTER_B =
  "M 42.6 44.8 H 46.8 C 48.6 44.8 49.6 45.7 49.6 47.3 C 49.6 48.4 49.0 49.2 48.1 49.6 C 49.2 50.0 49.9 51.0 49.9 52.4 C 49.9 54.2 48.7 55.2 46.9 55.2 H 42.6 Z M 44.5 46.4 V 49.0 H 46.5 C 47.4 49.0 47.8 48.5 47.8 47.7 C 47.8 46.9 47.4 46.4 46.5 46.4 Z M 44.5 50.6 V 53.6 H 46.7 C 47.7 53.6 48.2 53.0 48.2 52.1 C 48.2 51.2 47.7 50.6 46.7 50.6 Z";

const BF_LETTER_F =
  "M 51.4 44.8 H 57.4 V 46.5 H 53.3 V 49.1 H 56.8 V 50.8 H 53.3 V 55.2 H 51.4 Z";

/**
 * Concept 1 (Recommended): "Chronometer Meridian"
 * Prioritizes a refined 4-point Brass & Deep-Navy luxury compass rose, frames a restrained,
 * legible BF core in the center, and launches an integrated Bright Blue NE growth arrow (↗)
 * seamlessly along the upper-right perimeter of the core bezel.
 */
export const BrandLogoConcept1: React.FC<{
  size?: number;
  variant?: BrandLogoVariant;
  detail?: BrandLogoDetail;
  className?: string;
}> = ({ size = 40, variant = "adaptive", detail = "auto", className = "" }) => {
  const tones = getToneClasses(variant);
  const showFull = detail === "full" || (detail === "auto" && size >= 72);
  const tipDist = showFull ? 40.5 : 46.5;
  const isAppIcon = variant === "appIcon";

  return (
    <svg
      width={size}
      height={size}
      viewBox={showFull ? "-4 -4 108 108" : "0 0 100 100"}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={`shrink-0 select-none ${className}`}
      aria-hidden="true"
    >
      {isAppIcon && <circle cx="50" cy="50" r="49" fill="#081029" />}

      {/* Compass Dial Face + Indigo Concentric Bearing Track */}
      <circle cx="50" cy="50" r={showFull ? 32.5 : 34.0} className={tones.dialBg} />
      <path d={DIAL_TRACK_RING} className={tones.dialRing} />

      {/* Two-Tone Brass Compass Bezel Ring */}
      <path
        d={showFull ? makeRingPath(34.5, 31.2) : COMPACT_OUTER_RING}
        className={tones.ringOuter}
      />
      <path
        d={showFull ? makeRingPath(31.2, 30.1) : COMPACT_INNER_BEZEL}
        className={tones.ringInner}
      />

      {/* Subtle Cardinal Degree Ticks on Full Detail */}
      {showFull && (
        <g className={tones.ringOuter} opacity="0.65">
          <rect x="49.3" y="18.2" width="1.4" height="2.4" rx="0.7" />
          <rect x="49.3" y="79.4" width="1.4" height="2.4" rx="0.7" />
          <rect x="18.2" y="49.3" width="2.4" height="1.4" rx="0.7" />
          <rect x="79.4" y="49.3" width="2.4" height="1.4" rx="0.7" />
        </g>
      )}

      {/* 4 Primary Faceted Compass Points (N, S, W, E) */}
      {/* North */}
      <path d={`M 50 ${50 - tipDist} L 50 36 L 44.8 36 Z`} className={tones.brassLit} />
      <path d={`M 50 ${50 - tipDist} L 55.2 36 L 50 36 Z`} className={tones.brassShadow} />
      {/* South */}
      <path d={`M 50 ${50 + tipDist} L 50 64 L 44.8 64 Z`} className={tones.brassShadow} />
      <path d={`M 50 ${50 + tipDist} L 55.2 64 L 50 64 Z`} className={tones.brassLit} />
      {/* West */}
      <path d={`M ${50 - tipDist} 50 L 36 50 L 36 44.8 Z`} className={tones.brassLit} />
      <path d={`M ${50 - tipDist} 50 L 36 55.2 L 36 50 Z`} className={tones.brassShadow} />
      {/* East */}
      <path d={`M ${50 + tipDist} 50 L 64 50 L 64 44.8 Z`} className={tones.brassLit} />
      <path d={`M ${50 + tipDist} 50 L 64 55.2 L 64 50 Z`} className={tones.brassShadow} />

      {/* Central Deep-Navy Core + Brass Rim */}
      <circle cx="50" cy="50" r="13.8" className={tones.coreBg} />
      <path d={CORE_RIM_RING} className={tones.coreRim} />

      {/* Integrated Bright Blue Growth Arrow (↗) hugging NE core rim smoothly */}
      <path
        d="M 54.0 64.2 C 63.4 61.2 65.4 50.0 62.6 41.2 L 60.4 39.2 C 62.8 48.2 61.0 58.6 52.8 62.6 Z"
        className={tones.arrowTail}
      />
      <path
        d="M 58.6 40.1 L 69.8 28.9 L 66.9 26.0 L 78.6 21.4 L 74.0 33.1 L 71.1 30.2 L 60.6 42.1 Z"
        className={tones.arrowTip}
      />

      {/* Restrained BF Core Letters */}
      <path d={BF_LETTER_B} fillRule="evenodd" className={tones.bfText} />
      <path d={BF_LETTER_F} className={tones.bfText} />

      {/* Primary Cardinal Directions (N, E, S, W) at full / splash scale */}
      {showFull && (
        <g
          className={tones.cardinalText}
          fontFamily="Plus Jakarta Sans, DM Sans, system-ui, sans-serif"
          fontWeight="700"
          fontSize="7.4"
          textAnchor="middle"
        >
          <text x="50" y="5.5">N</text>
          <text x="50" y="99.6">S</text>
          <text x="3.2" y="52.6">W</text>
          <text x="96.8" y="52.6">E</text>
        </g>
      )}
    </svg>
  );
};

/**
 * Concept 2: "Navigator Dual-Ring"
 * Concentric twin Brass & Indigo-Purple navigation bezel with perimeter N/E/S/W spires,
 * centered BF medallion, and a clean NE growth shaft emerging from the inner bezel.
 */
export const BrandLogoConcept2: React.FC<{
  size?: number;
  variant?: BrandLogoVariant;
  className?: string;
}> = ({ size = 40, variant = "adaptive", className = "" }) => {
  const tones = getToneClasses(variant);

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={`shrink-0 select-none ${className}`}
      aria-hidden="true"
    >
      <circle cx="50" cy="50" r="40" className={tones.dialBg} />
      <path d={makeRingPath(41.5, 38.5)} className={tones.ringOuter} />
      <path d={makeRingPath(34.5, 32.8)} className={tones.dialRing} />

      {/* 4 Perimeter Cardinal Spires */}
      <path d="M 50 4 L 54.2 14 H 45.8 Z" className={tones.brassLit} />
      <path d="M 50 96 L 54.2 86 H 45.8 Z" className={tones.brassShadow} />
      <path d="M 4 50 L 14 45.8 V 54.2 Z" className={tones.brassLit} />
      <path d="M 96 50 L 86 45.8 V 54.2 Z" className={tones.brassShadow} />

      {/* Center Core */}
      <circle cx="50" cy="50" r="15.5" className={tones.coreBg} />
      <path d={makeRingPath(16.6, 14.6)} className={tones.coreRim} />

      {/* Integrated Growth Arrow */}
      <path
        d="M 59.8 38.4 L 72.5 25.7 L 69.2 22.4 L 82.0 18.0 L 77.6 30.8 L 74.3 27.5 L 61.6 40.2 Z"
        className={tones.arrowTip}
      />

      <path d={BF_LETTER_B} fillRule="evenodd" className={tones.bfText} />
      <path d={BF_LETTER_F} className={tones.bfText} />
    </svg>
  );
};

/**
 * Concept 3: "Apex Bearing"
 * Open 270° Brass navigation bezel broken toward North-East, framed by 4 minimal diamond
 * compass needles, an Indigo-Purple BF center core, and a Bright Blue NE growth vector.
 */
export const BrandLogoConcept3: React.FC<{
  size?: number;
  variant?: BrandLogoVariant;
  className?: string;
}> = ({ size = 40, variant = "adaptive", className = "" }) => {
  const tones = getToneClasses(variant);

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={`shrink-0 select-none ${className}`}
      aria-hidden="true"
    >
      <circle cx="50" cy="50" r="33" className={tones.dialBg} />
      {/* Open 270° Brass Bezel opening at NE */}
      <path
        d="M 76.5 52.0 A 26.6 26.6 0 1 1 48.0 23.5 L 48.0 19.3 A 30.8 30.8 0 1 0 80.7 52.0 Z"
        className={tones.ringOuter}
      />

      {/* 4 Diamond Cardinal Points */}
      <path d="M 50 5 L 53.5 21 H 46.5 Z" className={tones.brassLit} />
      <path d="M 50 95 L 53.5 79 H 46.5 Z" className={tones.brassShadow} />
      <path d="M 5 50 L 21 46.5 V 53.5 Z" className={tones.brassLit} />
      <path d="M 95 50 L 79 46.5 V 53.5 Z" className={tones.brassShadow} />

      <circle cx="50" cy="50" r="14.5" className={tones.coreBg} />
      <path d={makeRingPath(15.6, 13.7)} className={tones.coreRim} />

      {/* Growth Arrow bridging the NE opening */}
      <path
        d="M 59.2 38.8 L 72.2 25.8 L 68.8 22.4 L 82.8 17.2 L 77.6 31.2 L 74.2 27.8 L 61.2 40.8 Z"
        className={tones.arrowTip}
      />

      <path d={BF_LETTER_B} fillRule="evenodd" className={tones.bfText} />
      <path d={BF_LETTER_F} className={tones.bfText} />
    </svg>
  );
};

/**
 * Primary Budget Force 365 Brand Mark (defaults to Recommended Concept 1: "Chronometer Meridian").
 */
export const BrandMark: React.FC<BrandMarkProps> = ({
  size = 40,
  variant = "adaptive",
  detail = "auto",
  concept = "chronometer",
  className = "",
}) => {
  if (concept === "dual-ring") {
    return <BrandLogoConcept2 size={size} variant={variant} className={className} />;
  }
  if (concept === "apex-bearing") {
    return <BrandLogoConcept3 size={size} variant={variant} className={className} />;
  }
  return (
    <BrandLogoConcept1
      size={size}
      variant={variant}
      detail={detail}
      className={className}
    />
  );
};

/**
 * Compact horizontal lockup for the application header: Compass BF Mark + "Budget Force 365".
 */
export const BrandHeaderLockup: React.FC<{
  className?: string;
  showText?: boolean;
}> = ({ className = "", showText = true }) => {
  return (
    <div className={`inline-flex items-center gap-2 sm:gap-2.5 min-w-0 ${className}`}>
      <BrandMark size={34} detail="compact" className="sm:w-9 sm:h-9 shrink-0" />
      {showText && (
        <span className="font-extrabold text-[15px] sm:text-lg tracking-tight text-slate-900 dark:text-white truncate">
          Budget Force{" "}
          <span className="text-sky-600 dark:text-sky-400">365</span>
        </span>
      )}
    </div>
  );
};

/**
 * Luxury explorer splash screen lockup featuring the full N/E/S/W compass emblem,
 * wordmark, and brass-ruled tagline.
 */
export const BrandSplashLockup: React.FC<{
  statusMessage?: React.ReactNode;
}> = ({ statusMessage }) => {
  return (
    <div className="relative flex flex-col items-center text-center gap-5 max-w-sm animate-in fade-in duration-300">
      <BrandMark
        size={132}
        detail="full"
        className="drop-shadow-[0_10px_28px_rgba(37,99,235,0.22)]"
      />
      <div className="space-y-2">
        <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white">
          Budget Force{" "}
          <span className="text-sky-600 dark:text-sky-400">365</span>
        </h1>
        <div className="flex items-center justify-center gap-2.5">
          <span
            aria-hidden="true"
            className="h-px w-6 sm:w-8 bg-amber-600/60 dark:bg-amber-400/60"
          />
          <p className="text-xs sm:text-sm font-medium tracking-wide text-amber-700 dark:text-amber-300">
            {APP_TAGLINE}
          </p>
          <span
            aria-hidden="true"
            className="h-px w-6 sm:w-8 bg-amber-600/60 dark:bg-amber-400/60"
          />
        </div>
      </div>
      {statusMessage}
    </div>
  );
};
