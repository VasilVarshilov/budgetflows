import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  DEFAULT_LANGUAGE,
  LANGUAGE_OPTIONS,
  LANGUAGE_STORAGE_KEY,
  type SupportedLanguage,
} from "./types";
import {
  getCurrentLanguage,
  getIntlLocale,
  isSupportedLanguage,
  setStoredLanguage,
  t as translateKey,
  translateMonthName,
  formatLocalizedMonthYear,
  translateElectricityPeriodLabel,
  formatShortMonthIndex,
  formatFullMonthIndex,
  translateWeekday,
  getMonFirstWeekdaysShort,
  translateCategoryName,
  translateGoalName,
  translateBudgetName,
  translateColorLabel,
  localizeComparisonMetricName,
  getLocalizedMeterType,
  translateElectricityNote,
  formatLocalizedDate,
  formatLocalizedDateTime,
  localizeNotification,
  pluralizeUnit,
} from "./helpers";

export * from "./types";
export * from "./helpers";

interface I18nContextValue {
  language: SupportedLanguage;
  setLanguage: (lang: SupportedLanguage) => void;
  locale: string;
  options: typeof LANGUAGE_OPTIONS;
  t: (key: string, params?: Record<string, string | number>) => string;
}

const I18nContext = createContext<I18nContextValue | null>(null);

export const I18nProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [language, setLanguageState] = useState<SupportedLanguage>(() =>
    getCurrentLanguage()
  );

  useEffect(() => {
    setStoredLanguage(language);
  }, [language]);

  useEffect(() => {
    const handleStorage = (e: StorageEvent) => {
      if (e.key === LANGUAGE_STORAGE_KEY && isSupportedLanguage(e.newValue)) {
        setLanguageState(e.newValue);
      }
    };
    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, []);

  const setLanguage = useCallback((nextLang: SupportedLanguage) => {
    if (!isSupportedLanguage(nextLang)) return;
    setStoredLanguage(nextLang);
    setLanguageState(nextLang);
  }, []);

  const t = useCallback(
    (key: string, params?: Record<string, string | number>) =>
      translateKey(key, params, language),
    [language]
  );

  const locale = useMemo(() => getIntlLocale(language), [language]);

  const value = useMemo<I18nContextValue>(
    () => ({
      language,
      setLanguage,
      locale,
      options: LANGUAGE_OPTIONS,
      t,
    }),
    [language, setLanguage, locale, t]
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
};

export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (ctx) return ctx;
  const fallbackLang = DEFAULT_LANGUAGE;
  return {
    language: fallbackLang,
    setLanguage: setStoredLanguage,
    locale: getIntlLocale(fallbackLang),
    options: LANGUAGE_OPTIONS,
    t: (key: string, params?: Record<string, string | number>) =>
      translateKey(key, params, fallbackLang),
  };
}

export {
  translateMonthName,
  formatLocalizedMonthYear,
  translateElectricityPeriodLabel,
  formatShortMonthIndex,
  formatFullMonthIndex,
  translateWeekday,
  getMonFirstWeekdaysShort,
  translateCategoryName,
  translateGoalName,
  translateBudgetName,
  translateColorLabel,
  localizeComparisonMetricName,
  getLocalizedMeterType,
  translateElectricityNote,
  formatLocalizedDate,
  formatLocalizedDateTime,
  localizeNotification,
  pluralizeUnit,
};
