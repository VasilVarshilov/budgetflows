import React, { useEffect, useRef, useState } from "react";
import { Check, Globe } from "lucide-react";
import { useI18n } from "@/i18n";

export const LanguageSwitcher: React.FC = () => {
  const { language, setLanguage, options, t } = useI18n();
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  const activeOption =
    options.find((opt) => opt.code === language) ?? options[0];

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        aria-label={t("language.switchLanguageAria")}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        title={`${t("language.label")}: ${activeOption.nativeName}`}
        className="flex h-9 items-center gap-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2.5 text-xs font-semibold text-slate-700 dark:text-slate-200 shadow-xs hover:bg-slate-50 dark:hover:bg-slate-700/80 transition-colors cursor-pointer"
      >
        <Globe className="h-4 w-4 text-slate-600 dark:text-slate-300 shrink-0" />
        <span className="hidden sm:inline uppercase tracking-wide">
          {activeOption.code}
        </span>
      </button>

      {isOpen && (
        <div
          role="menu"
          aria-label={t("language.menuTitle")}
          className="absolute right-0 top-full mt-2 w-52 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-xl py-1.5 z-50 animate-in fade-in zoom-in-95 duration-150"
        >
          <div className="px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500 border-b border-slate-100 dark:border-slate-800">
            {t("language.menuTitle")}
          </div>
          <div className="py-1">
            {options.map((option) => {
              const isSelected = option.code === language;
              return (
                <button
                  key={option.code}
                  type="button"
                  role="menuitemradio"
                  aria-checked={isSelected}
                  onClick={() => {
                    setLanguage(option.code);
                    setIsOpen(false);
                  }}
                  className={`w-full flex items-center justify-between px-3 py-2 text-sm transition-colors cursor-pointer ${
                    isSelected
                      ? "bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300 font-semibold"
                      : "text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800/80"
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <span className="text-base leading-none" aria-hidden="true">
                      {option.flag}
                    </span>
                    <span className="font-bold uppercase tracking-wide text-xs opacity-80">
                      {option.code}
                    </span>
                    <span className="text-slate-400 dark:text-slate-500">—</span>
                    <span>{option.nativeName}</span>
                  </span>
                  {isSelected && (
                    <Check className="h-4 w-4 text-blue-600 dark:text-blue-400 shrink-0" />
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
