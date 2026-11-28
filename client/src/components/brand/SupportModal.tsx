import React, { useEffect, useState } from "react";
import { Coffee, ExternalLink, Heart, QrCode, X, ZoomIn } from "lucide-react";
import { BrandMark, BrandTagline } from "./BrandLogo";
import { useI18n } from "@/i18n";
import revolutQrSrc from "../../../../public/assets/aistudio/IMG_5580_82bfe87f.jpeg";

export const REVOLUT_SUPPORT_URL = "https://revolut.me/vasilvarshilov";

interface SupportModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const SupportModal: React.FC<SupportModalProps> = ({ isOpen, onClose }) => {
  const { t } = useI18n();
  const [isQrEnlarged, setIsQrEnlarged] = useState(false);

  useEffect(() => {
    if (!isOpen) {
      setIsQrEnlarged(false);
      return;
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (isQrEnlarged) {
          setIsQrEnlarged(false);
        } else {
          onClose();
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, isQrEnlarged, onClose]);

  if (!isOpen) return null;

  return (
    <>
      <div
        className="fixed inset-0 z-50 flex items-center justify-center modal-backdrop-safe bg-slate-900/65 dark:bg-black/75 backdrop-blur-xs animate-in fade-in"
        role="dialog"
        aria-modal="true"
        aria-label={t("brand.support.dialogAria")}
        onClick={onClose}
      >
        <div
          className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 max-w-md w-full modal-panel-safe sm:max-h-[90dvh] flex flex-col overflow-hidden animate-in zoom-in-95"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="px-4 sm:px-5 py-3.5 sm:py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between gap-3 bg-gradient-to-r from-[#0A1E57] via-[#123285] to-[#1B46B5] text-white shrink-0">
            <div className="flex items-center gap-3 min-w-0 flex-1">
              <div className="w-9 h-9 rounded-xl bg-amber-400/15 border border-amber-300/30 flex items-center justify-center text-amber-300 shrink-0">
                <Coffee className="w-4 h-4" />
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="text-sm sm:text-base font-bold text-white truncate">
                  {t("brand.support.title")}
                </h3>
                <p className="text-[11px] text-slate-300 truncate">
                  {t("brand.support.subtitle")}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label={t("common.close")}
              className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl text-slate-300 hover:text-white hover:bg-white/10 transition-colors cursor-pointer shrink-0"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Body */}
          <div className="p-4 sm:p-6 overflow-y-auto overflow-x-hidden flex-1 min-h-0 space-y-4 min-w-0">
            {/* Brand Identity Strip */}
            <div className="flex items-center gap-3 pb-3 border-b border-slate-100 dark:border-slate-800">
              <BrandMark size={44} detail="compact" className="shrink-0" />
              <div className="min-w-0">
                <div className="text-base font-extrabold tracking-tight text-slate-900 dark:text-white">
                  Budget Force <span className="text-sky-600 dark:text-sky-400">365</span>
                </div>
                <p className="text-xs">
                  <BrandTagline />
                </p>
              </div>
            </div>

            {/* Personal Message */}
            <div className="space-y-2 text-xs sm:text-sm text-slate-700 dark:text-slate-200 leading-relaxed">
              <p>{t("brand.support.body1")}</p>
              <p>{t("brand.support.body2")}</p>
            </div>

            {/* Appreciation Box */}
            <div className="flex items-start gap-2.5 rounded-xl bg-amber-50/90 dark:bg-amber-950/35 border border-amber-200/80 dark:border-amber-800/60 px-3.5 py-2.5 text-[11.5px] sm:text-xs text-amber-900 dark:text-amber-200">
              <Heart className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
              <span className="font-medium leading-relaxed">
                {t("brand.support.appreciation")}
              </span>
            </div>

            {/* Revolut CTA + QR Card */}
            <div className="rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80 p-4 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                    {t("brand.support.revolutTitle")}
                  </p>
                  <p className="text-sm font-bold text-slate-900 dark:text-white font-mono">
                    {t("brand.support.revolutHandle")}
                  </p>
                </div>
                <a
                  href={REVOLUT_SUPPORT_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="min-h-[42px] inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 text-xs font-bold shadow-xs transition-colors shrink-0"
                >
                  <span>{t("brand.support.revolutBtn")}</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              </div>

              {/* Scannable QR Code with Tap-to-Zoom */}
              <div className="pt-3 border-t border-slate-200/70 dark:border-slate-700/70 flex flex-col items-center text-center space-y-2.5">
                <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800 dark:text-slate-100">
                  <QrCode className="w-3.5 h-3.5 text-amber-600 dark:text-amber-300" />
                  <span>{t("brand.support.qrTitle")}</span>
                </div>

                <button
                  type="button"
                  onClick={() => setIsQrEnlarged(true)}
                  aria-label={t("brand.support.qrTapToZoom")}
                  title={t("brand.support.qrTapToZoom")}
                  className="group relative rounded-2xl p-2 bg-[#1c1f26] border border-slate-300 dark:border-slate-600 shadow-sm hover:shadow-md hover:border-indigo-400 transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
                >
                  <img
                    src={revolutQrSrc}
                    alt={t("brand.support.qrAlt")}
                    className="w-44 h-44 sm:w-48 sm:h-48 object-contain rounded-xl select-none"
                  />
                  <span className="mt-2 inline-flex items-center justify-center gap-1 text-[11px] font-semibold text-slate-200 group-hover:text-sky-300 transition-colors">
                    <ZoomIn className="w-3.5 h-3.5" />
                    <span>{t("brand.support.qrTapToZoom")}</span>
                  </span>
                </button>

                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  {t("brand.support.qrSubtitle")}
                </p>
              </div>
            </div>

            {/* Sign-off */}
            <div className="pt-1 text-center space-y-0.5 text-xs sm:text-sm">
              <p className="font-bold text-amber-600 dark:text-amber-300">
                {t("brand.support.signoffThanks")}
              </p>
              <p className="text-slate-600 dark:text-slate-300">
                {t("brand.support.signoffRegards")}{" "}
                <span className="font-semibold text-slate-900 dark:text-white">
                  {t("brand.support.authorName")}
                </span>
              </p>
            </div>
          </div>

          {/* Footer */}
          <div className="px-5 py-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-end bg-slate-50/70 dark:bg-slate-900/90 shrink-0">
            <button
              type="button"
              onClick={onClose}
              className="min-h-[40px] inline-flex items-center justify-center px-4 py-2 rounded-xl bg-slate-200/80 hover:bg-slate-300/80 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-semibold transition-colors cursor-pointer"
            >
              {t("common.close")}
            </button>
          </div>
        </div>
      </div>

      {/* Enlarged QR Code Lightbox */}
      {isQrEnlarged && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center modal-backdrop-safe bg-black/85 backdrop-blur-sm animate-in fade-in"
          role="dialog"
          aria-modal="true"
          aria-label={t("brand.support.qrZoomAria")}
          onClick={() => setIsQrEnlarged(false)}
        >
          <div
            className="relative bg-[#1c1f26] border border-slate-700 rounded-3xl p-4 sm:p-6 max-w-sm w-full modal-panel-safe overflow-y-auto overflow-x-hidden flex flex-col items-center gap-3 shadow-2xl animate-in zoom-in-95"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setIsQrEnlarged(false)}
              aria-label={t("common.close")}
              className="self-end shrink-0 min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl text-slate-300 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
            <img
              src={revolutQrSrc}
              alt={t("brand.support.qrAlt")}
              className="w-full max-w-[300px] aspect-square object-contain rounded-2xl select-none"
            />
            <div className="text-center space-y-1 pb-1">
              <p className="text-sm font-bold text-white font-mono">
                {t("brand.support.revolutHandle")}
              </p>
              <p className="text-xs text-slate-300">
                {t("brand.support.qrTitle")}
              </p>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
