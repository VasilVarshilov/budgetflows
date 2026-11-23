import React, { useState } from "react";
import { ChevronDown, ChevronUp, ExternalLink, MapPin } from "lucide-react";
import { TransactionLocation } from "@/types";
import { buildGoogleMapsUrl } from "@/utils/locationUtils";
import { useI18n } from "@/i18n";

interface LocationCardProps {
  location: TransactionLocation;
  showHeading?: boolean;
  compact?: boolean;
  defaultShowAddressDetails?: boolean;
  className?: string;
}

export const LocationCard: React.FC<LocationCardProps> = ({
  location,
  showHeading = false,
  compact = false,
  defaultShowAddressDetails = false,
  className = "",
}) => {
  const { t } = useI18n();
  const placeName = (location?.placeName || "").trim();
  const address = (location?.address || "").trim();
  const [detailsExpanded, setDetailsExpanded] = useState<boolean>(false);

  if (!placeName && !address) return null;

  const hasPlaceName = placeName.length > 0;
  const hasDistinctAddress =
    hasPlaceName &&
    address.length > 0 &&
    address.toLowerCase() !== placeName.toLowerCase();
  const mapsUrl = buildGoogleMapsUrl(location);

  return (
    <div className={className}>
      {showHeading && (
        <h4 className="text-xs font-bold text-slate-900 dark:text-white mb-1.5">
          {t("location.sectionLabel")}
        </h4>
      )}

      <div
        className={`flex items-center justify-between gap-3 rounded-xl border border-emerald-200/80 dark:border-emerald-800/70 bg-emerald-50/70 dark:bg-emerald-950/30 ${
          compact ? "px-3 py-2.5" : "px-3.5 py-3 sm:px-4"
        }`}
      >
        <div className="min-w-0 flex-1">
          <span className="block text-[10px] font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
            {hasPlaceName
              ? t("location.cardHeadingLocation")
              : t("location.cardHeadingAddress")}
          </span>

          <p
            className={`font-semibold text-slate-900 dark:text-slate-100 break-words leading-snug mt-0.5 flex items-start gap-1.5 ${
              compact ? "text-xs sm:text-sm" : "text-sm"
            }`}
          >
            {hasPlaceName ? (
              <>
                <span aria-hidden="true" className="shrink-0 leading-snug">
                  📍
                </span>
                <span>{placeName}</span>
              </>
            ) : (
              <span>{address}</span>
            )}
          </p>

          {hasDistinctAddress && defaultShowAddressDetails && (
            <p className="text-xs text-slate-600 dark:text-slate-300 break-words leading-snug mt-0.5">
              {address}
            </p>
          )}

          {hasDistinctAddress && !defaultShowAddressDetails && detailsExpanded && (
            <p className="text-xs text-slate-600 dark:text-slate-300 break-words leading-snug mt-1 pl-0.5">
              {address}
            </p>
          )}

          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
            <a
              href={mapsUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700 dark:text-emerald-400 hover:text-emerald-800 dark:hover:text-emerald-300 hover:underline transition-colors"
            >
              <ExternalLink className="w-3.5 h-3.5 shrink-0" />
              <span>{t("location.openInGoogleMaps")}</span>
            </a>

            {hasDistinctAddress && !defaultShowAddressDetails && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setDetailsExpanded((prev) => !prev);
                }}
                aria-expanded={detailsExpanded}
                className="inline-flex items-center gap-0.5 text-[11px] font-semibold text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white transition-colors cursor-pointer"
              >
                <span>
                  {detailsExpanded
                    ? t("location.hideAddressDetails")
                    : t("location.showAddressDetails")}
                </span>
                {detailsExpanded ? (
                  <ChevronUp className="w-3.5 h-3.5 shrink-0" />
                ) : (
                  <ChevronDown className="w-3.5 h-3.5 shrink-0" />
                )}
              </button>
            )}
          </div>
        </div>

        <div
          className={`shrink-0 rounded-xl bg-white dark:bg-slate-800 border border-emerald-100 dark:border-emerald-900/60 shadow-2xs flex items-center justify-center ${
            compact ? "w-9 h-9" : "w-10 h-10"
          }`}
          aria-hidden="true"
        >
          <MapPin
            className={`text-emerald-600 dark:text-emerald-400 ${
              compact ? "w-4 h-4" : "w-5 h-5"
            }`}
          />
        </div>
      </div>
    </div>
  );
};
