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
      coreRim: "fill-[#E8BA5D]",
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
      coreRim: "fill-[#C98E2B]",
      bfText: "fill-[#141C4B]",
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
    coreRim: "fill-[#C98E2B] dark:fill-[#E8BA5D]",
    bfText: "fill-[#141C4B] dark:fill-[#F8FAFC]",
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
const CORE_HAIRLINE_RING = makeRingPath(11.8, 11.1);

/* BF scaled ~0.85x around (50, 50) so the compass dominates visual hierarchy */
const BF_LETTER_B =
  "M 43.7 45.6 H 47.3 C 48.8 45.6 49.7 46.3 49.7 47.7 C 49.7 48.6 49.2 49.3 48.4 49.7 C 49.3 50.0 49.9 50.9 49.9 52.0 C 49.9 53.6 48.9 54.4 47.4 54.4 H 43.7 Z M 45.3 46.9 V 49.2 H 47.0 C 47.8 49.2 48.1 48.7 48.1 48.0 C 48.1 47.3 47.8 46.9 47.0 46.9 Z M 45.3 50.5 V 53.1 H 47.2 C 48.0 53.1 48.5 52.6 48.5 51.8 C 48.5 51.0 48.0 50.5 47.2 50.5 Z";

const BF_LETTER_F =
  "M 51.2 45.6 H 56.3 V 47.0 H 52.8 V 49.2 H 55.8 V 50.7 H 52.8 V 54.4 H 51.2 Z";

/**
 * Concept 1 (Recommended): "Chronometer Meridian"
 * Prioritizes a refined 4-point Brass & Deep-Navy luxury compass rose whose arms flow
 * directly into a hairline gold center ring around a restrained BF core, with a clean
 * two-tone Bright Blue NE growth arrow (↗) emerging directly from the NE hub shoulder.
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

      {/* Unified Compass Dial Face (no isolating concentric dark-blue rings) */}
      <circle cx="50" cy="50" r={showFull ? 32.5 : 34.0} className={tones.dialBg} />

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

      {/* 4 Primary Faceted Compass Points (N, S, W, E) extending cleanly to the central hairline hub */}
      {/* North */}
      <path d={`M 50 ${50 - tipDist} L 50 38.6 L 46.1 38.6 Z`} className={tones.brassLit} />
      <path d={`M 50 ${50 - tipDist} L 53.9 38.6 L 50 38.6 Z`} className={tones.brassShadow} />
      {/* South */}
      <path d={`M 50 ${50 + tipDist} L 50 61.4 L 46.1 61.4 Z`} className={tones.brassShadow} />
      <path d={`M 50 ${50 + tipDist} L 53.9 61.4 L 50 61.4 Z`} className={tones.brassLit} />
      {/* West */}
      <path d={`M ${50 - tipDist} 50 L 38.6 50 L 38.6 46.1 Z`} className={tones.brassLit} />
      <path d={`M ${50 - tipDist} 50 L 38.6 53.9 L 38.6 50 Z`} className={tones.brassShadow} />
      {/* East */}
      <path d={`M ${50 + tipDist} 50 L 61.4 50 L 61.4 46.1 Z`} className={tones.brassLit} />
      <path d={`M ${50 + tipDist} 50 L 61.4 53.9 L 61.4 50 Z`} className={tones.brassShadow} />

      {/* Integrated Two-Tone Bright Blue Growth Arrow (↗) emerging cleanly from the NE hub */}
      <path
        d="M 57.3 41.1 L 70.1 28.3 L 66.9 25.1 L 79.0 21.0 L 58.1 41.9 Z"
        className={tones.arrowTip}
      />
      <path
        d="M 58.1 41.9 L 79.0 21.0 L 74.9 33.1 L 71.7 29.9 L 58.9 42.7 Z"
        className={tones.arrowTail}
      />

      {/* Thin Metallic Gold Hub Ring unifying the 4 compass arms with the BF center */}
      <path d={CORE_HAIRLINE_RING} className={tones.coreRim} />

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
 * Twin Brass navigation bezel with perimeter N/E/S/W spires, integrated hairline gold hub,
 * restrained BF core, and a two-tone NE growth shaft emerging from the inner hub.
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
      <path d={makeRingPath(34.5, 33.6)} className={tones.ringInner} />

      {/* 4 Perimeter Cardinal Spires */}
      <path d="M 50 4 L 54.2 14 H 45.8 Z" className={tones.brassLit} />
      <path d="M 50 96 L 54.2 86 H 45.8 Z" className={tones.brassShadow} />
      <path d="M 4 50 L 14 45.8 V 54.2 Z" className={tones.brassLit} />
      <path d="M 96 50 L 86 45.8 V 54.2 Z" className={tones.brassShadow} />

      {/* Integrated Two-Tone Growth Arrow */}
      <path
        d="M 57.6 40.8 L 72.1 26.3 L 68.8 23.0 L 82.0 18.0 L 58.4 41.6 Z"
        className={tones.arrowTip}
      />
      <path
        d="M 58.4 41.6 L 82.0 18.0 L 77.0 31.2 L 73.7 27.9 L 59.2 42.4 Z"
        className={tones.arrowTail}
      />

      {/* Thin Metallic Gold Hub Ring */}
      <path d={makeRingPath(12.2, 11.4)} className={tones.coreRim} />

      <path d={BF_LETTER_B} fillRule="evenodd" className={tones.bfText} />
      <path d={BF_LETTER_F} className={tones.bfText} />
    </svg>
  );
};

/**
 * Concept 3: "Apex Bearing"
 * Open 270° Brass navigation bezel broken toward North-East, framed by 4 minimal diamond
 * compass needles, an integrated hairline gold hub for BF, and a Bright Blue NE growth vector.
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

      {/* Growth Arrow bridging the NE opening */}
      <path
        d="M 57.6 40.8 L 72.1 26.3 L 68.7 22.9 L 82.8 17.2 L 58.4 41.6 Z"
        className={tones.arrowTip}
      />
      <path
        d="M 58.4 41.6 L 82.8 17.2 L 77.1 31.3 L 73.7 27.9 L 59.2 42.4 Z"
        className={tones.arrowTail}
      />

      <path d={makeRingPath(12.2, 11.4)} className={tones.coreRim} />

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
