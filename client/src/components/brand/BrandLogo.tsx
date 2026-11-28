import React from "react";
import brandLogoPng from "@/assets/budget-force-365-logo.png";

export const APP_NAME = "Budget Force 365";
export const APP_SHORT_NAME = "Budget 365";
export const APP_TAGLINE = "Track. Save. Grow.";
export const APP_DESCRIPTION =
  "Personal Finance Management powered by smart budgeting, planning and insights.";
export const APP_PRODUCTION_URL = "https://vasilvarshilov.github.io/budgetflows/";

/**
 * Core Budget Force 365 brand accent palette aligned with the tagline and footer actions:
 * - Track. / About the app: Neutral Fintech Slate  (#64748B light / #94A3B8 dark)
 * - Save.  / Support Me:    Warm Fintech Gold      (#D97706 light / #FCD34D dark)
 * - Grow.  / Share:         Modern Fintech Sky Blue(#0284C7 light / #38BDF8 dark)
 */
export const BRAND_ACCENT_COLORS = {
  track: {
    name: "Fintech Neutral Slate",
    lightHex: "#64748B",
    darkHex: "#94A3B8",
  },
  save: {
    name: "Fintech Amber Gold",
    lightHex: "#D97706",
    darkHex: "#FCD34D",
  },
  grow: {
    name: "Fintech Sky Blue",
    lightHex: "#0284C7",
    darkHex: "#38BDF8",
  },
} as const;

export type BrandLogoVariant = "adaptive" | "light" | "dark" | "appIcon";
export type BrandLogoDetail = "auto" | "full" | "compact";

interface BrandMarkProps {
  size?: number;
  variant?: BrandLogoVariant;
  detail?: BrandLogoDetail;
  className?: string;
}

const SIZE_CLASSES: Record<number, string> = {
  16: "w-4 h-4",
  24: "w-6 h-6",
  28: "w-7 h-7",
  30: "w-[30px] h-[30px]",
  32: "w-8 h-8",
  36: "w-9 h-9",
  40: "w-10 h-10",
  44: "w-11 h-11",
  48: "w-12 h-12",
  52: "w-[52px] h-[52px]",
  64: "w-16 h-16",
  84: "w-[84px] h-[84px]",
  96: "w-24 h-24",
  120: "w-[120px] h-[120px]",
};

/**
 * Budget Force 365 Brand Mark
 * Uses the approved rounded-square app icon PNG (deep royal-navy rounded square, compact white BF monogram,
 * and integrated cyan growth arrow inside F) with adaptive dark/light surface framing.
 */
export const BrandMark: React.FC<BrandMarkProps> = ({
  size = 40,
  variant = "adaptive",
  className = "",
}) => {
  const isDarkSurface = variant === "dark";
  const isLightSurface = variant === "light";
  const isAppIcon = variant === "appIcon";

  const ringClass = isAppIcon
    ? ""
    : isDarkSurface
    ? "ring-1 ring-sky-400/35"
    : isLightSurface
    ? "ring-1 ring-blue-950/15"
    : "ring-1 ring-blue-950/15 dark:ring-sky-400/35";

  const hasCustomSizeClass = /\bw-\S+/.test(className);
  const sizeClass = hasCustomSizeClass ? "" : SIZE_CLASSES[size] ?? "w-10 h-10";

  return (
    <img
      src={brandLogoPng}
      width={size}
      height={size}
      alt=""
      aria-hidden="true"
      decoding="async"
      className={`${sizeClass} rounded-[26%] object-contain shrink-0 select-none ${ringClass} ${className}`.trim()}
    />
  );
};

/**
 * Refined Brand Tagline:
 * - Track. = Neutral Slate (matches "За приложението")
 * - Save.  = Gold/Yellow (matches "Подкрепи ме")
 * - Grow.  = Light Blue (matches "Сподели")
 * Pass `uniform` to render all three words in the single neutral Track. color (used in the header).
 */
export const BrandTagline: React.FC<{
  className?: string;
  onDarkBanner?: boolean;
  uniform?: boolean;
}> = ({ className = "", onDarkBanner = false, uniform = false }) => {
  const trackColor = onDarkBanner
    ? "text-slate-200"
    : "text-slate-500 dark:text-slate-400";
  const saveColor = uniform
    ? trackColor
    : onDarkBanner
    ? "text-amber-300"
    : "text-amber-600 dark:text-amber-300";
  const growColor = uniform
    ? trackColor
    : onDarkBanner
    ? "text-sky-300"
    : "text-sky-600 dark:text-sky-400";

  return (
    <span className={`inline-flex items-center gap-1 font-medium tracking-wide whitespace-nowrap ${className}`.trim()}>
      <span className={trackColor}>Track.</span>
      <span className={saveColor}>Save.</span>
      <span className={growColor}>Grow.</span>
    </span>
  );
};

/**
 * Header Logo Lockup: Rounded-square BF↗ PNG Logo + "Budget Force 365" + subtle uniform-color "Track. Save. Grow." subtitle.
 */
export const BrandHeaderLockup: React.FC<{
  className?: string;
  showText?: boolean;
}> = ({ className = "", showText = true }) => {
  return (
    <div className={`inline-flex items-center gap-2 sm:gap-2.5 shrink-0 min-w-0 ${className}`}>
      <BrandMark size={32} className="w-7 h-7 sm:w-8 sm:h-8 shrink-0" />
      {showText && (
        <div className="flex flex-col leading-none min-w-0">
          <span className="font-extrabold text-[13px] min-[390px]:text-[14px] sm:text-[17px] leading-[1.1] tracking-tight text-slate-900 dark:text-white whitespace-nowrap">
            Budget Force{" "}
            <span className="text-sky-600 dark:text-sky-400">365</span>
          </span>
          <BrandTagline
            uniform
            className="mt-0.5 text-[9.5px] min-[390px]:text-[10px] sm:text-[11px] leading-none tracking-[0.03em] opacity-90"
          />
        </div>
      )}
    </div>
  );
};

/**
 * Splash Screen Lockup: Rounded-square BF↗ PNG Logo + "Budget Force 365" + "Track. Save. Grow.".
 */
export const BrandSplashLockup: React.FC<{
  statusMessage?: React.ReactNode;
}> = ({ statusMessage }) => {
  return (
    <div className="relative flex flex-col items-center text-center gap-5 max-w-sm animate-in fade-in duration-300">
      <BrandMark size={120} />
      <div className="space-y-2">
        <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white">
          Budget Force{" "}
          <span className="text-sky-600 dark:text-sky-400">365</span>
        </h1>
        <p className="text-xs sm:text-sm">
          <BrandTagline />
        </p>
      </div>
      {statusMessage}
    </div>
  );
};
