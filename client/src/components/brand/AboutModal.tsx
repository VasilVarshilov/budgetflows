import React, { useState } from "react";
import { Check, Coffee, Copy, Mail, Share2, X } from "lucide-react";
import {
  APP_NAME,
  APP_PRODUCTION_URL,
  APP_TAGLINE,
  BrandMark,
  BrandTagline,
} from "./BrandLogo";
import { useI18n } from "@/i18n";

interface AboutModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenSupport?: () => void;
}

export const AboutModal: React.FC<AboutModalProps> = ({ isOpen, onClose, onOpenSupport }) => {
  const [shareCopied, setShareCopied] = useState(false);
  const [emailCopied, setEmailCopied] = useState(false);
  const { t } = useI18n();

  if (!isOpen) return null;

  const tagline = APP_TAGLINE;
  const feedbackEmail = t("brand.feedbackEmail");

  const handleCopyEmail = async () => {
    try {
      if (typeof navigator !== "undefined" && navigator.clipboard && feedbackEmail) {
        await navigator.clipboard.writeText(feedbackEmail);
        setEmailCopied(true);
        setTimeout(() => setEmailCopied(false), 2500);
      }
    } catch {
      // Ignore clipboard permission errors
    }
  };

  const handleShareApp = async () => {
    const shareUrl = APP_PRODUCTION_URL;
    const shareData = {
      title: APP_NAME,
      text: `${APP_NAME} — ${tagline}`,
      url: shareUrl,
    };

    try {
      if (typeof navigator !== "undefined" && navigator.share) {
        await navigator.share(shareData);
        return;
      }
    } catch {
      // User dismissed native share or fallback to clipboard
    }

    try {
      if (typeof navigator !== "undefined" && navigator.clipboard && shareUrl) {
        await navigator.clipboard.writeText(`${APP_NAME} — ${tagline}\n${shareUrl}`);
        setShareCopied(true);
        setTimeout(() => setShareCopied(false), 3000);
      }
    } catch {
      // Ignore clipboard permission errors
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 dark:bg-black/75 backdrop-blur-xs animate-in fade-in"
      role="dialog"
      aria-modal="true"
      aria-label={t("brand.aboutAria", { appName: APP_NAME })}
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 max-w-md w-full max-h-[90vh] flex flex-col overflow-hidden animate-in zoom-in-95"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between shrink-0">
          <h3 className="text-sm font-bold text-slate-900 dark:text-white">
            {t("brand.aboutTitle")}
          </h3>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("common.close")}
            className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 sm:p-6 text-center space-y-4 overflow-y-auto min-w-0">
          <div className="flex justify-center">
            <BrandMark size={84} detail="full" />
          </div>

          <div className="space-y-1">
            <h4 className="text-xl font-extrabold tracking-tight text-slate-900 dark:text-white">
              Budget Force <span className="text-sky-600 dark:text-sky-400">365</span>
            </h4>
            <p className="text-sm">
              <BrandTagline />
            </p>
          </div>

          {/* Description */}
          <div className="space-y-2 text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
            <p>{t("brand.aboutDescription")}</p>
          </div>

          {/* Bug Reports & Feature Requests */}
          <div className="rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80 p-4 text-left space-y-3">
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-xs font-bold text-slate-900 dark:text-white">
                <Mail className="w-4 h-4 text-sky-600 dark:text-sky-400 shrink-0" />
                <span>{t("brand.feedbackTitle")}</span>
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                {t("brand.feedbackLine1")}
              </p>
            </div>

            {/* Compact copyable single-line email card */}
            <div className="flex items-center justify-between gap-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700/90 px-3 py-2">
              <span className="text-[11px] sm:text-xs font-mono font-medium text-slate-700 dark:text-slate-200 whitespace-nowrap overflow-x-auto select-all min-w-0">
                {feedbackEmail}
              </span>
              <button
                type="button"
                onClick={handleCopyEmail}
                aria-label={t("brand.copyEmailAria")}
                title={t("brand.copyEmailAria")}
                className="inline-flex items-center gap-1 shrink-0 min-h-[28px] px-2 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-[11px] font-semibold text-slate-700 dark:text-slate-200 transition-colors cursor-pointer"
              >
                {emailCopied ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                    <span className="text-emerald-700 dark:text-emerald-300">
                      {t("brand.emailCopied")}
                    </span>
                  </>
                ) : (
                  <Copy className="w-3.5 h-3.5 shrink-0" />
                )}
              </button>
            </div>

            {/* Clear Send Email CTA */}
            <a
              href={`mailto:${feedbackEmail}`}
              className="w-full min-h-[42px] inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-sky-600 hover:bg-sky-700 dark:bg-sky-500 dark:hover:bg-sky-400 text-white dark:text-slate-950 text-xs font-bold shadow-xs transition-colors cursor-pointer"
            >
              <Mail className="w-4 h-4 shrink-0" />
              <span>{t("brand.sendEmailBtn")}</span>
            </a>
          </div>

          {/* Two Primary Actions: [ Подкрепи ме ] [ Сподели ] */}
          <div className="pt-1 space-y-2.5">
            <div className="grid grid-cols-2 gap-2.5">
              {onOpenSupport && (
                <button
                  type="button"
                  onClick={onOpenSupport}
                  className="min-h-[44px] inline-flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl bg-amber-400 hover:bg-amber-300 dark:bg-amber-400 dark:hover:bg-amber-300 text-slate-950 text-xs font-bold shadow-xs transition-colors cursor-pointer whitespace-nowrap"
                >
                  <Coffee className="w-4 h-4 shrink-0" />
                  <span>{t("brand.supportMenu")}</span>
                </button>
              )}
              <button
                type="button"
                onClick={handleShareApp}
                className={`${
                  onOpenSupport ? "" : "col-span-2"
                } min-h-[44px] inline-flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl bg-sky-500 hover:bg-sky-600 dark:bg-sky-500 dark:hover:bg-sky-400 text-white dark:text-slate-950 text-xs font-bold shadow-xs transition-colors cursor-pointer whitespace-nowrap`}
              >
                {shareCopied ? (
                  <>
                    <Check className="w-4 h-4 shrink-0" />
                    <span>{t("brand.linkCopied")}</span>
                  </>
                ) : (
                  <>
                    <Share2 className="w-4 h-4 shrink-0" />
                    <span>{t("brand.share")}</span>
                  </>
                )}
              </button>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="w-full min-h-[40px] inline-flex items-center justify-center px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-semibold transition-colors cursor-pointer"
            >
              {t("common.close")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
