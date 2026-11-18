import React, { useEffect } from "react";
import { Trash2 } from "lucide-react";

interface ConfirmDeleteDialogProps {
  isOpen: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  title?: string;
  message?: string;
  detailLabel?: string;
  confirmLabel?: string;
  cancelLabel?: string;
}

export const ConfirmDeleteDialog: React.FC<ConfirmDeleteDialogProps> = ({
  isOpen,
  onConfirm,
  onCancel,
  title = "Потвърждение",
  message = "Сигурни ли сте, че искате да изтриете този запис?",
  detailLabel,
  confirmLabel = "Изтрий",
  cancelLabel = "Отказ",
}) => {
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onCancel();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onCancel]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 dark:bg-black/80 backdrop-blur-xs p-4 animate-in fade-in duration-150"
      onClick={onCancel}
    >
      <div
        className="bg-white dark:bg-slate-900 w-full max-w-sm rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden p-5 space-y-4 animate-in zoom-in-95 duration-200 transition-colors"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-delete-title"
        aria-describedby="confirm-delete-message"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="w-12 h-12 rounded-full bg-rose-100 dark:bg-rose-950/80 text-rose-600 dark:text-rose-400 flex items-center justify-center mx-auto">
          <Trash2 className="w-6 h-6" />
        </div>

        <div className="text-center space-y-1.5">
          <h4
            id="confirm-delete-title"
            className="font-bold text-slate-900 dark:text-white text-base"
          >
            {title}
          </h4>
          <p
            id="confirm-delete-message"
            className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 leading-relaxed"
          >
            {message}
          </p>
          {detailLabel && (
            <p className="text-xs font-semibold text-slate-800 dark:text-slate-100 bg-slate-100 dark:bg-slate-800/80 px-3 py-1.5 rounded-lg inline-block max-w-full truncate">
              {detailLabel}
            </p>
          )}
        </div>

        <div className="flex gap-2.5 pt-2">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 min-h-[44px] py-2.5 text-xs sm:text-sm font-semibold text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-xl transition-colors cursor-pointer"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="flex-1 min-h-[44px] py-2.5 text-xs sm:text-sm font-semibold text-white bg-rose-600 hover:bg-rose-700 rounded-xl transition-colors shadow-sm active:scale-95 cursor-pointer"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};
