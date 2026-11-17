import React from "react";
import { Repeat, Hourglass, ChevronRight } from "lucide-react";
import { RepeatFrequency } from "@/types";
import { REPEAT_OPTIONS } from "@/utils/recurrenceEngine";

interface CompletionSwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  ariaLabel: string;
  disabled?: boolean;
  size?: "sm" | "md";
}

export const CompletionSwitch: React.FC<CompletionSwitchProps> = ({
  checked,
  onChange,
  ariaLabel,
  disabled = false,
  size = "md",
}) => {
  const isSmall = size === "sm";

  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={() => !disabled && onChange(!checked)}
      className={`relative inline-flex shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-1 dark:focus-visible:ring-offset-slate-900 disabled:opacity-50 disabled:cursor-not-allowed ${
        isSmall ? "h-5 w-9" : "h-7 w-12"
      } ${
        checked
          ? "bg-emerald-500 dark:bg-emerald-500"
          : "bg-slate-300 dark:bg-slate-600"
      }`}
    >
      <span
        aria-hidden="true"
        className={`pointer-events-none inline-block transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${
          isSmall ? "h-4 w-4" : "h-6 w-6"
        } ${
          checked
            ? isSmall
              ? "translate-x-4"
              : "translate-x-5"
            : "translate-x-0"
        }`}
      />
    </button>
  );
};

interface RecurrenceCompletionRowsProps {
  repeat: RepeatFrequency;
  onRepeatChange: (repeat: RepeatFrequency) => void;
  completed: boolean;
  onCompletedChange: (completed: boolean) => void;
  hideRepeatRow?: boolean;
  disabled?: boolean;
  completedHint?: string;
}

export const RecurrenceCompletionRows: React.FC<RecurrenceCompletionRowsProps> = ({
  repeat,
  onRepeatChange,
  completed,
  onCompletedChange,
  hideRepeatRow = false,
  disabled = false,
  completedHint,
}) => {
  return (
    <div className="rounded-xl bg-slate-50/90 dark:bg-slate-800/75 border border-slate-200/80 dark:border-slate-700/80 divide-y divide-slate-200/80 dark:divide-slate-700/70 overflow-hidden">
      {!hideRepeatRow && (
        <div className="flex items-center justify-between gap-3 px-3.5 py-2.5 min-h-[48px]">
          <div className="flex items-center gap-3 min-w-0">
            <span className="w-8 h-8 rounded-lg bg-indigo-500 text-white flex items-center justify-center shrink-0 shadow-2xs">
              <Repeat className="w-4 h-4" />
            </span>
            <span className="text-sm font-medium text-slate-800 dark:text-slate-100">
              Повторение
            </span>
          </div>

          <div className="relative flex items-center shrink-0">
            <select
              aria-label="Повторение"
              disabled={disabled}
              value={repeat}
              onChange={(e) => onRepeatChange(e.target.value as RepeatFrequency)}
              className="appearance-none bg-transparent pr-5 pl-2 py-1 text-right text-sm font-medium text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white focus:outline-none cursor-pointer disabled:opacity-50"
            >
              {REPEAT_OPTIONS.map((opt) => (
                <option
                  key={opt.value}
                  value={opt.value}
                  className="bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                >
                  {opt.labelBg}
                </option>
              ))}
            </select>
            <ChevronRight className="w-4 h-4 text-slate-400 dark:text-slate-500 absolute right-0 pointer-events-none" />
          </div>
        </div>
      )}

      <div className="flex items-center justify-between gap-3 px-3.5 py-2.5 min-h-[48px]">
        <div className="flex items-center gap-3 min-w-0">
          <span className="w-8 h-8 rounded-lg bg-purple-500 text-white flex items-center justify-center shrink-0 shadow-2xs">
            <Hourglass className="w-4 h-4" />
          </span>
          <div className="min-w-0">
            <span className="text-sm font-medium text-slate-800 dark:text-slate-100 block leading-tight">
              Изпълнено
            </span>
            <span className="text-[11px] text-slate-500 dark:text-slate-400 block leading-tight mt-0.5">
              {completedHint ||
                (completed
                  ? "Включва се в суми, отчети и баланс"
                  : "Предстоящ запис — изключен от отчетите")}
            </span>
          </div>
        </div>

        <CompletionSwitch
          checked={completed}
          onChange={onCompletedChange}
          ariaLabel="Изпълнено"
          disabled={disabled}
        />
      </div>
    </div>
  );
};
