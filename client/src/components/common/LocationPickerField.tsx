import React, { useEffect, useRef, useState } from "react";
import {
  Check,
  Loader2,
  MapPin,
  Pencil,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { TransactionLocation } from "@/types";
import {
  LocationSearchSuggestion,
  normalizeLocation,
  searchNominatimAddresses,
} from "@/utils/locationUtils";
import { LocationCard } from "./LocationCard";

interface LocationPickerFieldProps {
  value?: TransactionLocation;
  onChange: (next: TransactionLocation | undefined) => void;
  label?: string;
  compact?: boolean;
}

export const LocationPickerField: React.FC<LocationPickerFieldProps> = ({
  value,
  onChange,
  label = "Локация (по избор)",
  compact = false,
}) => {
  const normalizedValue = normalizeLocation(value);
  const [isEditing, setIsEditing] = useState<boolean>(false);
  const [placeNameInput, setPlaceNameInput] = useState<string>(
    normalizedValue?.placeName || ""
  );
  const [query, setQuery] = useState<string>(normalizedValue?.address || "");
  const [suggestions, setSuggestions] = useState<LocationSearchSuggestion[]>([]);
  const [isSearching, setIsSearching] = useState<boolean>(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState<boolean>(false);

  const abortRef = useRef<AbortController | null>(null);
  const skipNextSearchRef = useRef<boolean>(false);

  // Sync external value resets (e.g., after form reset or switching edited item)
  useEffect(() => {
    if (!isEditing) {
      setPlaceNameInput(normalizedValue?.placeName || "");
      setQuery(normalizedValue?.address || "");
      setSuggestions([]);
      setSearchError(null);
      setHasSearched(false);
    }
  }, [normalizedValue?.placeName, normalizedValue?.address, isEditing]);

  // Debounced OpenStreetMap Nominatim search
  useEffect(() => {
    if (skipNextSearchRef.current) {
      skipNextSearchRef.current = false;
      return;
    }

    const trimmed = query.trim();
    const shouldSearch =
      (isEditing || !normalizedValue) &&
      trimmed.length >= 3 &&
      trimmed !== (normalizedValue?.address || "");

    if (!shouldSearch) {
      abortRef.current?.abort();
      setIsSearching(false);
      if (trimmed.length < 3) {
        setSuggestions([]);
        setHasSearched(false);
        setSearchError(null);
      }
      return;
    }

    const timer = setTimeout(async () => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      setIsSearching(true);
      setSearchError(null);

      try {
        const results = await searchNominatimAddresses(trimmed, controller.signal);
        if (!controller.signal.aborted) {
          setSuggestions(results);
          setHasSearched(true);
          setIsSearching(false);
        }
      } catch (err: unknown) {
        if (err instanceof DOMException && err.name === "AbortError") {
          return;
        }
        if (!controller.signal.aborted) {
          setSuggestions([]);
          setHasSearched(true);
          setIsSearching(false);
          setSearchError(
            "Търсенето е временно недостъпно. Можете да запазите адреса ръчно."
          );
        }
      }
    }, 380);

    return () => {
      clearTimeout(timer);
      abortRef.current?.abort();
    };
  }, [query, isEditing, normalizedValue]);

  const handleSelectSuggestion = (s: LocationSearchSuggestion) => {
    skipNextSearchRef.current = true;
    abortRef.current?.abort();
    const nextLocation: TransactionLocation = {
      ...(s.placeName ? { placeName: s.placeName } : {}),
      address: s.address,
      lat: s.lat,
      lng: s.lng,
    };
    onChange(nextLocation);
    setPlaceNameInput(s.placeName || "");
    setQuery(s.address);
    setSuggestions([]);
    setHasSearched(false);
    setSearchError(null);
    setIsEditing(false);
  };

  const handleApplyManualAddress = () => {
    const trimmedPlace = placeNameInput.trim();
    const trimmedAddress = query.trim();
    if (!trimmedPlace && !trimmedAddress) {
      onChange(undefined);
      setIsEditing(false);
      return;
    }

    const addressUnchanged =
      normalizedValue && trimmedAddress === normalizedValue.address;
    const hasCoords =
      addressUnchanged &&
      typeof normalizedValue.lat === "number" &&
      typeof normalizedValue.lng === "number";

    const next: TransactionLocation = {
      ...(trimmedPlace ? { placeName: trimmedPlace } : {}),
      address: trimmedAddress,
      ...(hasCoords
        ? { lat: normalizedValue.lat, lng: normalizedValue.lng }
        : {}),
    };

    onChange(normalizeLocation(next));
    setSuggestions([]);
    setHasSearched(false);
    setSearchError(null);
    setIsEditing(false);
  };

  const handleRemove = () => {
    abortRef.current?.abort();
    onChange(undefined);
    setPlaceNameInput("");
    setQuery("");
    setSuggestions([]);
    setHasSearched(false);
    setSearchError(null);
    setIsEditing(false);
  };

  const handleStartEdit = () => {
    skipNextSearchRef.current = true;
    setPlaceNameInput(normalizedValue?.placeName || "");
    setQuery(normalizedValue?.address || "");
    setSuggestions([]);
    setHasSearched(false);
    setSearchError(null);
    setIsEditing(true);
  };

  const handleCancelEdit = () => {
    abortRef.current?.abort();
    setPlaceNameInput(normalizedValue?.placeName || "");
    setQuery(normalizedValue?.address || "");
    setSuggestions([]);
    setHasSearched(false);
    setSearchError(null);
    setIsEditing(false);
  };

  const trimmedQuery = query.trim();
  const trimmedPlace = placeNameInput.trim();
  const hasUnsavedManualInput =
    (trimmedQuery.length > 0 || trimmedPlace.length > 0) &&
    (!normalizedValue ||
      trimmedQuery !== normalizedValue.address ||
      trimmedPlace !== (normalizedValue.placeName || "") ||
      isEditing);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <label className="text-xs font-semibold text-slate-600 dark:text-slate-300 flex items-center gap-1.5">
          <MapPin className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
          <span>{label}</span>
        </label>

        {normalizedValue && !isEditing && (
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={handleStartEdit}
              className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-semibold text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/50 transition-colors cursor-pointer"
            >
              <Pencil className="w-3 h-3" />
              <span>Редактирай</span>
            </button>
            <button
              type="button"
              onClick={handleRemove}
              className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-semibold text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/50 transition-colors cursor-pointer"
            >
              <Trash2 className="w-3 h-3" />
              <span>Премахни</span>
            </button>
          </div>
        )}
      </div>

      {/* Preview Card Mode */}
      {normalizedValue && !isEditing ? (
        <LocationCard
          location={normalizedValue}
          compact={compact}
          defaultShowAddressDetails
        />
      ) : (
        /* Search / Edit Mode */
        <div className="space-y-2">
          {(isEditing || normalizedValue?.placeName || placeNameInput.length > 0) && (
            <input
              type="text"
              value={placeNameInput}
              onChange={(e) => setPlaceNameInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  if (trimmedQuery || trimmedPlace) {
                    handleApplyManualAddress();
                  }
                }
              }}
              placeholder="Име на място (по избор, напр. Мол Пловдив)..."
              className={`w-full px-3 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-all ${
                compact ? "py-2 min-h-[38px]" : "py-2 min-h-[40px]"
              }`}
            />
          )}

          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  if (trimmedQuery || trimmedPlace) {
                    handleApplyManualAddress();
                  }
                }
              }}
              placeholder="Търси място или адрес (напр. Мол Пловдив, Lidl Тракия)..."
              className={`w-full pl-9 pr-9 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-all ${
                compact ? "py-2 min-h-[40px]" : "py-2.5 min-h-[44px]"
              }`}
            />
            {isSearching ? (
              <Loader2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 animate-spin absolute right-3 top-1/2 -translate-y-1/2" />
            ) : (
              query && (
                <button
                  type="button"
                  onClick={() => {
                    setQuery("");
                    setSuggestions([]);
                    setHasSearched(false);
                    setSearchError(null);
                  }}
                  aria-label="Изчисти адреса"
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 rounded-md text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )
            )}
          </div>

          {/* OpenStreetMap Nominatim Suggestions List */}
          {suggestions.length > 0 && (
            <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-lg divide-y divide-slate-100 dark:divide-slate-800 max-h-60 overflow-y-auto">
              {suggestions.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => handleSelectSuggestion(s)}
                  className="w-full px-3 py-2.5 text-left flex items-start gap-2.5 hover:bg-emerald-50/70 dark:hover:bg-emerald-950/40 transition-colors cursor-pointer"
                >
                  <MapPin className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                  <div className="min-w-0 flex-1 space-y-0.5">
                    {s.placeName ? (
                      <>
                        <p className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white leading-snug break-words">
                          {s.placeName}
                        </p>
                        {s.streetAddress && (
                          <p className="text-xs text-slate-700 dark:text-slate-300 leading-snug break-words">
                            {s.streetAddress}
                          </p>
                        )}
                        {s.city && (
                          <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400 leading-snug">
                            {s.city}
                          </p>
                        )}
                        {!s.streetAddress && !s.city && s.address && (
                          <p className="text-xs text-slate-600 dark:text-slate-300 leading-snug break-words">
                            {s.address}
                          </p>
                        )}
                      </>
                    ) : (
                      <>
                        <p className="text-xs sm:text-sm font-semibold text-slate-900 dark:text-slate-100 leading-snug break-words">
                          {s.streetAddress || s.address}
                        </p>
                        {s.city &&
                          s.city.toLowerCase() !==
                            (s.streetAddress || s.address).toLowerCase() && (
                            <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400 leading-snug">
                              {s.city}
                            </p>
                          )}
                      </>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}

          {/* Feedback / Manual Apply Actions */}
          {(hasUnsavedManualInput ||
            searchError ||
            (hasSearched && suggestions.length === 0) ||
            isEditing) && (
            <div className="flex flex-wrap items-center justify-between gap-2 pt-0.5">
              <div className="text-[11px] text-slate-500 dark:text-slate-400">
                {searchError
                  ? searchError
                  : hasSearched && suggestions.length === 0
                  ? "Няма точни съвпадения в OpenStreetMap. Можете да използвате въведения текст."
                  : "Изберете резултат от списъка или запазете ръчно въведения."}
              </div>

              <div className="flex items-center gap-1.5 ml-auto">
                {(trimmedQuery || trimmedPlace) && (
                  <button
                    type="button"
                    onClick={handleApplyManualAddress}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap"
                  >
                    <Check className="w-3.5 h-3.5" />
                    <span>Запази</span>
                  </button>
                )}

                {isEditing && (
                  <>
                    <button
                      type="button"
                      onClick={handleRemove}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 hover:bg-rose-100 dark:hover:bg-rose-900/50 text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Премахни</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleCancelEdit}
                      className="px-2.5 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap"
                    >
                      Отказ
                    </button>
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
