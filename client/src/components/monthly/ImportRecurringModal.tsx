import React, { useState, useMemo } from "react";
import {
  Repeat,
  Calendar,
  AlertCircle,
  CheckCircle2,
  X,
  ArrowRight,
  ShieldCheck,
  Info,
  DollarSign,
  Layers,
  ChevronDown,
} from "lucide-react";
import { MonthlyRecord, ExpenseItem } from "@/types";

interface ImportRecurringModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentMonth: string;
  existingFixedExpenses: ExpenseItem[];
  existingVariableExpenses: ExpenseItem[];
  allMonthlyData: Record<string, MonthlyRecord>;
  onConfirmImport: (importedItems: {
    fixed: ExpenseItem[];
    variable: ExpenseItem[];
  }) => void;
}

const MONTHS_BG = [
  "Януари",
  "Февруари",
  "Март",
  "Април",
  "Май",
  "Юни",
  "Юли",
  "Август",
  "Септември",
  "Октомври",
  "Ноември",
  "Декември",
];

// Helper to determine previous month key
export function getPreviousMonthKey(monthStr: string): string {
  if (!monthStr) return "";
  const parts = monthStr.trim().split(" ");
  const name = parts[0];
  const year = parts[1] ? parseInt(parts[1], 10) : new Date().getFullYear();
  const idx = MONTHS_BG.indexOf(name);
  if (idx > 0) {
    return `${MONTHS_BG[idx - 1]} ${year}`;
  } else if (idx === 0) {
    return `${MONTHS_BG[11]} ${year - 1}`;
  }
  return "";
}

interface SelectableItem {
  item: ExpenseItem;
  sourceType: "fixed" | "variable";
  isDuplicate: boolean;
  duplicateReason?: string;
  selected: boolean;
}

export const ImportRecurringModal: React.FC<ImportRecurringModalProps> = ({
  isOpen,
  onClose,
  currentMonth,
  existingFixedExpenses,
  existingVariableExpenses,
  allMonthlyData,
  onConfirmImport,
}) => {
  // Determine default source month
  const defaultPrevMonth = useMemo(
    () => getPreviousMonthKey(currentMonth),
    [currentMonth],
  );

  // Available source months from stored data + defaultPrevMonth
  const availableMonths = useMemo(() => {
    const keys = new Set<string>();
    if (defaultPrevMonth) keys.add(defaultPrevMonth);
    Object.keys(allMonthlyData || {}).forEach((k) => {
      if (k !== currentMonth) keys.add(k);
    });
    return Array.from(keys);
  }, [allMonthlyData, currentMonth, defaultPrevMonth]);

  const [selectedSourceMonth, setSelectedSourceMonth] = useState<string>(
    defaultPrevMonth || (availableMonths[0] ?? ""),
  );

  // Items from source month
  const rawSourceItems = useMemo(() => {
    if (!selectedSourceMonth) return { fixed: [], variable: [] };

    // Check exact key or without year
    let record = allMonthlyData?.[selectedSourceMonth];
    if (!record) {
      const bareMonth = selectedSourceMonth.split(" ")[0];
      record = allMonthlyData?.[bareMonth];
    }

    if (!record || !record.expenses) {
      return { fixed: [], variable: [] };
    }

    const fixed: ExpenseItem[] = [];
    const variable: ExpenseItem[] = [];

    // Parse fixed
    if (Array.isArray(record.expenses.fixed_expenses)) {
      record.expenses.fixed_expenses.forEach((item) => {
        // Items in fixed expenses are recurring by nature or marked isRecurring
        if (item.isRecurring !== false) {
          fixed.push({ ...item, isRecurring: true });
        }
      });
    } else if (record.expenses.fixed_expenses) {
      // Legacy format
      const leg = record.expenses.fixed_expenses as any;
      if (leg.credit_eur) {
        fixed.push({
          id: `legacy_credit_${Date.now()}`,
          categoryId: "credit",
          categoryName: "Кредит",
          categoryIcon: "CreditCard",
          categoryColor: "bg-blue-100 text-blue-600",
          amount: leg.credit_eur,
          date: new Date().toISOString(),
          isRecurring: true,
        });
      }
      if (leg.phone_eur) {
        fixed.push({
          id: `legacy_phone_${Date.now()}`,
          categoryId: "phone",
          categoryName: "Телефон",
          categoryIcon: "Phone",
          categoryColor: "bg-indigo-100 text-indigo-600",
          amount: leg.phone_eur,
          date: new Date().toISOString(),
          isRecurring: true,
        });
      }
      if (leg.internet_eur) {
        fixed.push({
          id: `legacy_internet_${Date.now()}`,
          categoryId: "internet",
          categoryName: "Интернет",
          categoryIcon: "Wifi",
          categoryColor: "bg-cyan-100 text-cyan-600",
          amount: leg.internet_eur,
          date: new Date().toISOString(),
          isRecurring: true,
        });
      }
    }

    // Parse variable expenses: only those marked with isRecurring === true
    if (Array.isArray(record.expenses.additional_expenses)) {
      record.expenses.additional_expenses.forEach((item) => {
        if (item.isRecurring === true) {
          variable.push(item);
        }
      });
    }

    return { fixed, variable };
  }, [allMonthlyData, selectedSourceMonth]);

  // Existing names in current month for duplicate prevention
  const existingNamesSet = useMemo(() => {
    const set = new Set<string>();
    existingFixedExpenses.forEach((e) =>
      set.add(e.categoryName.trim().toLowerCase()),
    );
    existingVariableExpenses.forEach((e) =>
      set.add(e.categoryName.trim().toLowerCase()),
    );
    return set;
  }, [existingFixedExpenses, existingVariableExpenses]);

  // Combined selectable items with duplicate detection
  const [itemsSelection, setItemsSelection] = useState<Record<string, boolean>>(
    {},
  );

  // Initialize selection when source changes
  const candidateItems = useMemo<SelectableItem[]>(() => {
    const list: SelectableItem[] = [];

    // Fixed items
    rawSourceItems.fixed.forEach((item) => {
      const isDup = existingNamesSet.has(item.categoryName.trim().toLowerCase());
      list.push({
        item,
        sourceType: "fixed",
        isDuplicate: isDup,
        duplicateReason: isDup
          ? "Вече е добавен в текущия месец"
          : undefined,
        selected: !isDup,
      });
    });

    // Variable items
    rawSourceItems.variable.forEach((item) => {
      const isDup = existingNamesSet.has(item.categoryName.trim().toLowerCase());
      list.push({
        item,
        sourceType: "variable",
        isDuplicate: isDup,
        duplicateReason: isDup
          ? "Вече е добавен в текущия месец"
          : undefined,
        selected: !isDup,
      });
    });

    return list;
  }, [rawSourceItems, existingNamesSet]);

  // Synchronize itemsSelection with candidates
  React.useEffect(() => {
    const initial: Record<string, boolean> = {};
    candidateItems.forEach((c) => {
      initial[c.item.id] = !c.isDuplicate;
    });
    setItemsSelection(initial);
  }, [candidateItems]);

  const toggleItemSelection = (id: string, isDuplicate: boolean) => {
    if (isDuplicate) return;
    setItemsSelection((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  const selectAllValid = () => {
    const updated: Record<string, boolean> = {};
    candidateItems.forEach((c) => {
      if (!c.isDuplicate) updated[c.item.id] = true;
    });
    setItemsSelection(updated);
  };

  const deselectAll = () => {
    setItemsSelection({});
  };

  const selectedItems = useMemo(() => {
    return candidateItems.filter(
      (c) => !c.isDuplicate && itemsSelection[c.item.id],
    );
  }, [candidateItems, itemsSelection]);

  const totalAmountToImport = useMemo(() => {
    return selectedItems.reduce((acc, c) => acc + c.item.amount, 0);
  }, [selectedItems]);

  const duplicatesCount = useMemo(() => {
    return candidateItems.filter((c) => c.isDuplicate).length;
  }, [candidateItems]);

  // Confirmation state
  const [showConfirmNotice, setShowConfirmNotice] = useState(false);

  const handleExecuteImport = () => {
    if (selectedItems.length === 0) return;

    const newFixed: ExpenseItem[] = [];
    const newVariable: ExpenseItem[] = [];

    const nowIso = new Date().toISOString();

    selectedItems.forEach((c) => {
      const clonedItem: ExpenseItem = {
        ...c.item,
        id: `${c.sourceType}_rec_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        date: nowIso,
        isRecurring: true,
      };

      if (c.sourceType === "fixed") {
        newFixed.push(clonedItem);
      } else {
        newVariable.push(clonedItem);
      }
    });

    onConfirmImport({ fixed: newFixed, variable: newVariable });
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-gradient-to-r from-indigo-50/60 to-white">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-600 text-white flex items-center justify-center shadow-sm">
              <Repeat className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-800">
                Импортиране на периодични разходи
              </h3>
              <p className="text-xs text-slate-500">
                Копиране на повтарящи се разходи от предходен месец
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 overflow-y-auto space-y-5 flex-1">
          {/* Source and Target Month Selector */}
          <div className="bg-slate-50 p-4 rounded-xl border border-slate-200/80 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-sm">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Източник:
                </span>
                <div className="relative">
                  <select
                    value={selectedSourceMonth}
                    onChange={(e) => setSelectedSourceMonth(e.target.value)}
                    className="appearance-none bg-white border border-slate-300 rounded-lg pl-3 pr-8 py-1.5 text-sm font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-sm"
                  >
                    {availableMonths.map((m) => (
                      <option key={m} value={m}>
                        {m} {m === defaultPrevMonth ? "(Предходен)" : ""}
                      </option>
                    ))}
                    {availableMonths.length === 0 && (
                      <option value="">Няма налични предходни месеци</option>
                    )}
                  </select>
                  <ChevronDown className="w-4 h-4 text-slate-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                </div>
              </div>

              <div className="flex items-center gap-2">
                <ArrowRight className="w-4 h-4 text-indigo-500 hidden sm:block" />
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Целеви месец:
                </span>
                <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-indigo-100 text-indigo-800 font-bold rounded-lg text-xs">
                  <Calendar className="w-3.5 h-3.5" />
                  {currentMonth}
                </span>
              </div>
            </div>

            <div className="text-xs text-slate-500 flex items-center gap-1.5">
              <Info className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
              <span>
                Примери за периодични разходи: Наем, Интернет, Мобилен план, Застраховка, Абонаменти.
              </span>
            </div>
          </div>

          {/* Duplicates Warning Banner if any duplicates detected */}
          {duplicatesCount > 0 && (
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl flex items-start gap-3">
              <ShieldCheck className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
              <div className="text-xs text-amber-800 space-y-0.5">
                <p className="font-semibold">
                  Предотвратяване на дублиране
                </p>
                <p>
                  {duplicatesCount === 1
                    ? "1 разход вече съществува в текущия месец и е изключен автоматично, за да не бъде дублиран."
                    : `${duplicatesCount} разхода вече съществуват в текущия месец и са изключени автоматично.`}
                </p>
              </div>
            </div>
          )}

          {/* Recurring Items List */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs font-medium text-slate-500 px-1">
              <span>
                Намерени периодични разходи ({candidateItems.length})
              </span>
              {candidateItems.length > 0 && (
                <div className="flex items-center gap-2">
                  <button
                    onClick={selectAllValid}
                    className="text-indigo-600 hover:text-indigo-800 hover:underline"
                  >
                    Избери всички нови
                  </button>
                  <span>•</span>
                  <button
                    onClick={deselectAll}
                    className="text-slate-500 hover:text-slate-700 hover:underline"
                  >
                    Изчисти
                  </button>
                </div>
              )}
            </div>

            {candidateItems.length === 0 ? (
              <div className="py-10 text-center bg-slate-50 rounded-xl border border-dashed border-slate-200 text-slate-400 text-sm">
                <Repeat className="w-8 h-8 mx-auto mb-2 text-slate-300" />
                <p className="font-medium text-slate-600">
                  Няма намерени периодични разходи в {selectedSourceMonth || "избрания месец"}
                </p>
                <p className="text-xs text-slate-400 mt-1">
                  Маркирайте разходи с чекбокса „Периодичен разход“ при въвеждане, за да се копират лесно всеки месец.
                </p>
              </div>
            ) : (
              <div className="space-y-2 max-h-[320px] overflow-y-auto pr-1">
                {candidateItems.map((c) => {
                  const isChecked = !!itemsSelection[c.item.id] && !c.isDuplicate;

                  return (
                    <div
                      key={c.item.id}
                      onClick={() => toggleItemSelection(c.item.id, c.isDuplicate)}
                      className={`p-3.5 rounded-xl border transition-all flex items-center justify-between ${
                        c.isDuplicate
                          ? "bg-slate-50/70 border-slate-200 opacity-60 cursor-not-allowed"
                          : isChecked
                            ? "bg-indigo-50/40 border-indigo-200 hover:border-indigo-300 cursor-pointer shadow-sm"
                            : "bg-white border-slate-200 hover:border-slate-300 cursor-pointer"
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          disabled={c.isDuplicate}
                          onChange={() => {}} // handled by parent div
                          className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 cursor-pointer disabled:cursor-not-allowed"
                        />
                        <div
                          className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold ${c.item.categoryColor || "bg-indigo-100 text-indigo-600"}`}
                        >
                          <Repeat className="w-4 h-4" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-slate-800 text-sm">
                              {c.item.categoryName}
                            </span>
                            <span className="text-[10px] font-medium uppercase px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">
                              {c.sourceType === "fixed"
                                ? "Фиксиран"
                                : "Допълнителен"}
                            </span>
                          </div>
                          {c.isDuplicate ? (
                            <span className="text-xs font-medium text-amber-600 flex items-center gap-1 mt-0.5">
                              <AlertCircle className="w-3 h-3" />
                              {c.duplicateReason}
                            </span>
                          ) : c.item.note ? (
                            <span className="text-xs text-slate-400 block mt-0.5 italic">
                              {c.item.note}
                            </span>
                          ) : (
                            <span className="text-[11px] text-slate-400 block mt-0.5">
                              Готов за импортиране
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="text-right">
                        <span className="font-bold text-slate-800 text-sm">
                          €{c.item.amount.toFixed(2)}
                        </span>
                        {c.isDuplicate ? (
                          <span className="block text-[10px] text-slate-400">
                            Пропуснат
                          </span>
                        ) : (
                          <span className="block text-[10px] text-indigo-600 font-medium">
                            Периодичен
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Import Summary Confirmation Box */}
          {selectedItems.length > 0 && (
            <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center justify-between animate-in fade-in">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center">
                  <CheckCircle2 className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-xs font-bold text-emerald-900">
                    Готови за импортиране: {selectedItems.length}{" "}
                    {selectedItems.length === 1 ? "разход" : "разхода"}
                  </p>
                  <p className="text-xs text-emerald-700">
                    Разходите ще бъдат добавени към месец {currentMonth}
                  </p>
                </div>
              </div>
              <div className="text-right">
                <span className="text-xs text-emerald-700 uppercase font-semibold block">
                  Общо
                </span>
                <span className="text-lg font-bold text-emerald-900">
                  €{totalAmountToImport.toFixed(2)}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex items-center justify-between">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-800 hover:bg-slate-200/60 rounded-xl transition-colors"
          >
            Отказ
          </button>

          <button
            onClick={handleExecuteImport}
            disabled={selectedItems.length === 0}
            className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-semibold hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-sm"
          >
            <Repeat className="w-4 h-4" />
            <span>
              Потвърди и импортирай ({selectedItems.length})
            </span>
          </button>
        </div>
      </div>
    </div>
  );
};
