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
 * Budget Force 365 Brand Emblem:
 * Architectural "B" core monogram framed inside a 365° financial navigation orbit
 * with a north-east directional compass vector, rendered in Indigo-Purple-Blue.
 */
export const BrandMark: React.FC<BrandMarkProps> = ({
  size = 40,
  className = "",
}) => {
  const uid = useId().replace(/:/g, "");
  const bgId = `bf365-bg-${uid}`;
  const ringId = `bf365-ring-${uid}`;

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
          <stop offset="52%" stopColor="#6d28d9" />
          <stop offset="100%" stopColor="#2563eb" />
        </linearGradient>
        <linearGradient
          id={ringId}
          x1="120"
          y1="120"
          x2="392"
          y2="392"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0%" stopColor="#e0e7ff" />
          <stop offset="100%" stopColor="#ffffff" stopOpacity="0.92" />
        </linearGradient>
      </defs>

      {/* Rounded-Square App Emblem */}
      <rect x="16" y="16" width="480" height="480" rx="116" fill={`url(#${bgId})`} />
      <rect
        x="22"
        y="22"
        width="468"
        height="468"
        rx="110"
        stroke="#ffffff"
        strokeOpacity="0.18"
        strokeWidth="4"
      />

      {/* 365 Financial Navigation Orbit Arc */}
      <path
        d="M 358 148 A 144 144 0 1 1 256 112"
        stroke={`url(#${ringId})`}
        strokeWidth="24"
        strokeLinecap="round"
      />

      {/* Directional Compass Pointer */}
      <path d="M 304 106 L 378 118 L 350 186 L 334 142 Z" fill="#ffffff" />

      {/* Subtle Cardinal Calibration Marks */}
      <line
        x1="256"
        y1="82"
        x2="256"
        y2="98"
        stroke="#c7d2fe"
        strokeWidth="10"
        strokeLinecap="round"
      />
      <line
        x1="256"
        y1="414"
        x2="256"
        y2="430"
        stroke="#c7d2fe"
        strokeOpacity="0.7"
        strokeWidth="10"
        strokeLinecap="round"
      />
      <line
        x1="82"
        y1="256"
        x2="98"
        y2="256"
        stroke="#c7d2fe"
        strokeOpacity="0.7"
        strokeWidth="10"
        strokeLinecap="round"
      />

      {/* Geometric 'B' Monogram Core */}
      <path
        d="M 196 176 L 196 336 M 196 176 L 264 176 C 296 176 314 192 314 214 C 314 234 298 248 268 252 L 196 252 M 268 252 C 304 256 322 272 322 296 C 322 320 302 336 268 336 L 196 336"
        stroke="#ffffff"
        strokeWidth="28"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
};
