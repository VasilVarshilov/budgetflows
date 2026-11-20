import React, { useId } from "react";

export const APP_NAME = "Budget Force 365";
export const APP_SHORT_NAME = "Budget 365";
export const APP_TAGLINE = "May the Budget Force be with you.";
export const APP_DESCRIPTION =
  "Personal Finance Management powered by smart budgeting, planning and insights.";

interface BrandMarkProps {
  size?: number;
  className?: string;
}

/**
 * Budget Force 365 Brand Mark:
 * Minimalist, flat fintech monogram ("B") crafted from three precision geometric
 * forms on an Indigo–Purple–Blue gradient squircle. Designed for razor-sharp
 * legibility from 16px favicons to full-bleed splash screens.
 */
export const BrandMark: React.FC<BrandMarkProps> = ({
  size = 40,
  className = "",
}) => {
  const uid = useId().replace(/:/g, "");
  const bgId = `bf365-bg-${uid}`;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 512 512"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={`shrink-0 select-none ${className}`}
      aria-hidden="true"
    >
      <defs>
        <linearGradient
          id={bgId}
          x1="48"
          y1="32"
          x2="464"
          y2="480"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0%" stopColor="#4f46e5" />
          <stop offset="52%" stopColor="#7c3aed" />
          <stop offset="100%" stopColor="#2563eb" />
        </linearGradient>
      </defs>

      {/* Flat Modern Fintech Squircle Tile */}
      <rect x="16" y="16" width="480" height="480" rx="120" fill={`url(#${bgId})`} />

      {/* Left Vertical Anchor Pillar */}
      <rect x="146" y="132" width="58" height="248" rx="18" fill="#ffffff" />

      {/* Upper Momentum Wing */}
      <path
        d="M 244 132 H 297 A 55 55 0 0 1 297 242 H 244 A 14 14 0 0 1 230 228 V 146 A 14 14 0 0 1 244 132 Z"
        fill="#ffffff"
        fillOpacity="0.78"
      />

      {/* Lower Foundation Wing */}
      <path
        d="M 244 270 H 315 A 55 55 0 0 1 315 380 H 244 A 14 14 0 0 1 230 366 V 284 A 14 14 0 0 1 244 270 Z"
        fill="#ffffff"
      />
    </svg>
  );
};
