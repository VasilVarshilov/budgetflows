import React, { useState } from "react";
import { Check, Share2, X } from "lucide-react";
import {
  APP_DESCRIPTION,
  APP_NAME,
  APP_TAGLINE,
  BrandMark,
} from "./BrandLogo";

interface AboutModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const AboutModal: React.FC<AboutModalProps> = ({ isOpen, onClose }) => {
  const [shareCopied, setShareCopied] = useState(false);

  if (!isOpen) return null;

  const handleShareApp = async () => {
    const shareUrl =
      typeof window !== "undefined" ? window.location.origin : "";
    const shareData = {
      title: APP_NAME,
      text: `${APP_NAME} — ${APP_TAGLINE}`,
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
        await navigator.clipboard.writeText(`${APP_NAME} — ${APP_TAGLINE}\n${shareUrl}`);
        setShareCopied(true);
        setTimeout(() => setShareCopied(false), 3000);
      }
    } catch {
      // Ignore clipboard permission errors
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 dark:bg-black/75 backdrop-blur-xs animate-in fade-in"
      role="dialog"
      aria-modal="true"
      aria-label={`За ${APP_NAME}`}
    >
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 max-w-md w-full overflow-hidden animate-in zoom-in-95">
        <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <h3 className="text-sm font-bold text-slate-900 dark:text-white">
            За приложението
          </h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Затвори"
            className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 text-center space-y-4">
          <div className="flex justify-center">
            <BrandMark size={64} />
          </div>

          <div className="space-y-1.5">
            <h4 className="text-xl font-extrabold tracking-tight text-slate-900 dark:text-white">
              {APP_NAME}
            </h4>
            <p className="text-sm font-semibold text-indigo-600 dark:text-indigo-400">
              {APP_TAGLINE}
            </p>
          </div>

          <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
            {APP_DESCRIPTION}
          </p>

          <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-2.5">
            <button
              type="button"
              onClick={handleShareApp}
              className="w-full sm:w-auto min-h-[42px] inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold transition-colors cursor-pointer"
            >
              {shareCopied ? (
                <>
                  <Check className="w-4 h-4" />
                  <span>Линкът е копиран!</span>
                </>
              ) : (
                <>
                  <Share2 className="w-4 h-4" />
                  <span>Сподели {APP_NAME}</span>
                </>
              )}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="w-full sm:w-auto min-h-[42px] inline-flex items-center justify-center px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-semibold transition-colors cursor-pointer"
            >
              Затвори
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
