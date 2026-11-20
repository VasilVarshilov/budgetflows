import React from "react";

export const APP_NAME = "Budget Force 365";
export const APP_SHORT_NAME = "Budget 365";
export const APP_TAGLINE = "May the Budget Force be with you.";
export const APP_DESCRIPTION =
  "Personal Finance Management powered by smart budgeting, planning and insights.";

export type BrandLogoVariant = "adaptive" | "light" | "dark" | "appIcon";
export type BrandLogoConcept = "compass-axis" | "compass-bearing" | "compass-dial";

interface BrandMarkProps {
  size?: number;
  variant?: BrandLogoVariant;
  concept?: BrandLogoConcept;
  className?: string;
}

function getToneClasses(variant: Exclude<BrandLogoVariant, "appIcon">) {
  if (variant === "light") {
    return {
      north: "fill-[#7C3AED]",
      south: "fill-[#2563EB]",
      body: "fill-[#4F46E5]",
      dial: "fill-[#2563EB]",
    };
  }
  if (variant === "dark") {
    return {
      north: "fill-[#A78BFA]",
      south: "fill-[#60A5FA]",
      body: "fill-[#818CF8]",
      dial: "fill-[#60A5FA]",
    };
  }
  return {
    north: "fill-[#7C3AED] dark:fill-[#A78BFA]",
    south: "fill-[#2563EB] dark:fill-[#60A5FA]",
    body: "fill-[#4F46E5] dark:fill-[#818CF8]",
    dial: "fill-[#2563EB] dark:fill-[#60A5FA]",
  };
}

/**
 * Concept 1 (Recommended): "True North Axis B"
 * Combines a two-tone precision compass needle (North/South axis) with twin
 * architectural geometric arches forming the letter B. Flat, unboxed, crisp down to 16px.
 */
export const BrandLogoConcept1: React.FC<{
  size?: number;
  variant?: BrandLogoVariant;
  className?: string;
}> = ({ size = 40, variant = "adaptive", className = "" }) => {
  if (variant === "appIcon") {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 64 64"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className={`shrink-0 select-none ${className}`}
        aria-hidden="true"
      >
        <circle cx="32" cy="32" r="30" fill="#131636" />
        <circle cx="32" cy="32" r="25.5" stroke="#312E81" strokeWidth="1.5" />
        <path d="M 21.5 11.5 L 26.8 30.4 H 16.2 Z" fill="#A78BFA" />
        <path d="M 21.5 52.5 L 26.8 33.6 H 16.2 Z" fill="#60A5FA" />
        <path
          d="M 29.5 15.5 H 38.5 A 7.75 7.75 0 0 1 38.5 31 H 29.5 V 25.6 H 38 A 2.35 2.35 0 0 0 38 20.9 H 29.5 V 15.5 Z"
          fill="#FFFFFF"
        />
        <path
          d="M 29.5 33 H 40 A 7.75 7.75 0 0 1 40 48.5 H 29.5 V 43.1 H 39.5 A 2.35 2.35 0 0 0 39.5 38.4 H 29.5 V 33 Z"
          fill="#FFFFFF"
        />
      </svg>
    );
  }

  const tones = getToneClasses(variant);

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={`shrink-0 select-none ${className}`}
      aria-hidden="true"
    >
      {/* Compass North Needle Tip */}
      <path d="M 19 6 L 25.5 30 H 12.5 Z" className={tones.north} />
      {/* Compass South Counterweight */}
      <path d="M 19 58 L 25.5 34 H 12.5 Z" className={tones.south} />
      {/* Upper B Arch */}
      <path
        d="M 28.5 11 H 39.5 A 9.75 9.75 0 0 1 39.5 30.5 H 28.5 V 24 H 39 A 3.25 3.25 0 0 0 39 17.5 H 28.5 V 11 Z"
        className={tones.body}
      />
      {/* Lower B Arch */}
      <path
        d="M 28.5 33.5 H 41.5 A 9.75 9.75 0 0 1 41.5 53 H 28.5 V 46.5 H 41 A 3.25 3.25 0 0 0 41 40 H 28.5 V 33.5 Z"
        className={tones.body}
      />
    </svg>
  );
};

/**
 * Concept 2: "Compass Bearing B"
 * Architectural B with a broken North-East upper shoulder pierced by a split two-tone 45° compass needle.
 */
export const BrandLogoConcept2: React.FC<{
  size?: number;
  variant?: Exclude<BrandLogoVariant, "appIcon">;
  className?: string;
}> = ({ size = 40, variant = "adaptive", className = "" }) => {
  const tones = getToneClasses(variant);

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={`shrink-0 select-none ${className}`}
      aria-hidden="true"
    >
      <path
        d="M 14 11 H 21 V 53 H 14 A 3 3 0 0 1 11 50 V 14 A 3 3 0 0 1 14 11 Z"
        className={tones.south}
      />
      <path
        d="M 21 11 H 34.5 A 10 10 0 0 1 40.2 12.8 L 35.1 17.9 H 21 V 11 Z"
        className={tones.body}
      />
      <path
        d="M 21 31 H 38.5 A 11 11 0 0 1 38.5 53 H 21 V 46 H 38 A 4 4 0 0 0 38 38 H 21 V 31 Z"
        className={tones.body}
      />
      <path d="M 25 32 L 53 9 L 33 24 Z" className={tones.north} />
      <path d="M 25 32 L 53 9 L 41 29 Z" className={tones.south} />
    </svg>
  );
};

/**
 * Concept 3: "365° Horizon Dial B"
 * Open 365° circular compass dial framing a crisp geometric B with a North-East directional pointer.
 */
export const BrandLogoConcept3: React.FC<{
  size?: number;
  variant?: Exclude<BrandLogoVariant, "appIcon">;
  className?: string;
}> = ({ size = 40, variant = "adaptive", className = "" }) => {
  const tones = getToneClasses(variant);

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={`shrink-0 select-none ${className}`}
      aria-hidden="true"
    >
      <path
        d="M 47.5 16.5 A 21 21 0 1 0 52.8 34.5 L 46.8 33.8 A 15 15 0 1 1 43.2 20.8 Z"
        className={tones.dial}
      />
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M 23 17 H 33 A 7 7 0 0 1 33 31 H 23 V 17 Z M 27.5 21.5 V 26.5 H 32 A 2.5 2.5 0 0 0 32 21.5 H 27.5 Z"
        className={tones.body}
      />
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M 23 33 H 35 A 7 7 0 0 1 35 47 H 23 V 33 Z M 27.5 37.5 V 42.5 H 34 A 2.5 2.5 0 0 0 34 37.5 H 27.5 Z"
        className={tones.body}
      />
      <path d="M 38 26 L 54 11 L 44 29 L 40 27 Z" className={tones.north} />
    </svg>
  );
};

/**
 * Primary Budget Force 365 Brand Mark (defaults to Recommended Concept 1: "True North Axis B").
 */
export const BrandMark: React.FC<BrandMarkProps> = ({
  size = 40,
  variant = "adaptive",
  concept = "compass-axis",
  className = "",
}) => {
  if (concept === "compass-bearing" && variant !== "appIcon") {
    return <BrandLogoConcept2 size={size} variant={variant} className={className} />;
  }
  if (concept === "compass-dial" && variant !== "appIcon") {
    return <BrandLogoConcept3 size={size} variant={variant} className={className} />;
  }
  return <BrandLogoConcept1 size={size} variant={variant} className={className} />;
};
