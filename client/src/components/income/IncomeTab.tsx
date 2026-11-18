import React, { useState, useEffect, useMemo } from "react";
import {
  Plus,
  Pencil,
  Trash2,
  Calendar,
  ChevronLeft,
  ChevronRight,
  Repeat,
  CheckCircle2,
  X,
  Banknote,
  Clock,
  Pause,
  Play,
  SkipForward,
  Tag,
} from "lucide-react";
import {
  ExpenseCategory,
  IncomeItem,
  MonthlyRecord,
  RecurrenceFrequency,
  RecurringIncomeTemplate,
  RepeatFrequency,
} from "@/types";
import { CategoryPicker } from "@/components/ui/CategoryPicker";
import {
  RecurrenceCompletionRows,
  CompletionSwitch,
} from "@/components/ui/RecurrenceCompletionRows";
import {
  isRecordCompleted,
  toggleRecordCompletion,
} from "@/utils/expenseStatus";
import {
  formatRepeatLabel,
  isRepeatingFrequency,
  markRecurrenceDismissed,
  normalizeRepeatValue,
  resolveItemRepeat,
} from "@/utils/recurrenceEngine";
import {
  AVAILABLE_ICONS_MAP,
  loadStoredIncomeCategories,
  getCategoryBadgeClasses,
} from "@/utils/categoryStorage";
import {
  loadRecurringIncomes,
  saveRecurringIncomes,
  getDueExpectedIncomes,
  getMonthKeyFromDate,
  formatRecurrenceSchedule,
  toLocalYyyyMmDd,
  WEEKDAYS_BG,
} from "@/utils/incomeStorage";
import { MONTHS_BG } from "@/utils/comparisonStorage";
import {
  IncomeFilterToolbar,
  IncomeFiltersState,
  DEFAULT_INCOME_FILTERS,
} from "./IncomeFilterToolbar";
import {
  sanitizeDecimalInput,
  parseDecimalInput,
  compareExpensesChronologically,
} from "@/utils/formatting";

const ICON_MAP: Record<string, React.ElementType> = AVAILABLE_ICONS_MAP;

interface IncomeTabProps {
  currentMonth: string;
  allMonthlyData: Record<string, MonthlyRecord>;
  onMonthChange: (newMonth: string) => void;
  onSaveIncomesForMonth: (monthKey: string, incomes: IncomeItem[]) => void;
  onTriggerSync?: () => void;
}

interface FlattenedIncomeEntry {
  item: IncomeItem;
  monthKey: string;
}

export const IncomeTab: React.FC<IncomeTabProps> = ({
  currentMonth,
  allMonthlyData,
  onMonthChange,
  onSaveIncomesForMonth,
  onTriggerSync,
}) => {
  const [incomeCategories, setIncomeCategories] = useState<ExpenseCategory[]>(
    () => loadStoredIncomeCategories()
  );
  const [recurringTemplates, setRecurringTemplates] = useState<
    RecurringIncomeTemplate[]
  >(() => loadRecurringIncomes());

  const [filters, setFilters] = useState<IncomeFiltersState>(
    DEFAULT_INCOME_FILTERS
  );

  // Form Modal State (Add / Edit Income)
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState<FlattenedIncomeEntry | null>(
    null
  );
  const [formAmount, setFormAmount] = useState("");
  const [formCategory, setFormCategory] = useState<ExpenseCategory | null>(
    () => incomeCategories[0] || null
  );
  const [formDate, setFormDate] = useState(() => toLocalYyyyMmDd(new Date()));
  const [formNote, setFormNote] = useState("");
  const [formFrequency, setFormFrequency] =
    useState<RecurrenceFrequency>("monthly");
  const [formDayOfMonth, setFormDayOfMonth] = useState<number>(
    () => new Date().getDate()
  );
  const [formDayOfWeek, setFormDayOfWeek] = useState<number>(
    () => new Date().getDay()
  );
  const [formScheduleOnly, setFormScheduleOnly] = useState(false);
  const [formRepeat, setFormRepeat] = useState<RepeatFrequency>("never");
  const [formCompleted, setFormCompleted] = useState<boolean>(true);
  const [formIsGenerated, setFormIsGenerated] = useState<boolean>(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Category Picker Modal State
  const [showCategoryPicker, setShowCategoryPicker] = useState(false);

  // Recurring Templates Drawer / Panel State
  const [showRecurringPanel, setShowRecurringPanel] = useState(false);
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(
    null
  );

  // Delete confirmation state
  const [pendingDeleteEntry, setPendingDeleteEntry] =
    useState<FlattenedIncomeEntry | null>(null);

  // Feedback toast
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setFeedbackMessage(msg);
    setTimeout(() => {
      setFeedbackMessage((prev) => (prev === msg ? null : prev));
    }, 3500);
  };

  // Sync on restore event (backup / Google Drive restore)
  useEffect(() => {
    const handleRestored = () => {
      setIncomeCategories(loadStoredIncomeCategories());
      setRecurringTemplates(loadRecurringIncomes());
    };
    window.addEventListener("homebudget:data-restored", handleRestored);
    return () => {
      window.removeEventListener("homebudget:data-restored", handleRestored);
    };
  }, []);

  // Active month navigation helpers
  const shiftMonth = (delta: number) => {
    const parts = currentMonth.trim().split(" ");
    const mIdx = MONTHS_BG.indexOf(parts[0]);
    const year = parseInt(parts[1], 10) || new Date().getFullYear();
    if (mIdx === -1) return;

    let nextIdx = mIdx + delta;
    let nextYear = year;
    if (nextIdx < 0) {
      nextIdx = 11;
      nextYear -= 1;
    } else if (nextIdx > 11) {
      nextIdx = 0;
      nextYear += 1;
    }
    onMonthChange(`${MONTHS_BG[nextIdx]} ${nextYear}`);
  };

  // Due / Expected Incomes computed from recurring templates
  const dueExpectedIncomes = useMemo(() => {
    return getDueExpectedIncomes(recurringTemplates);
  }, [recurringTemplates]);

  // Available months & years across records
  const { availableMonths, availableYears } = useMemo(() => {
    const monthKeys = Object.keys(allMonthlyData);
    const yearsSet = new Set<string>();
    yearsSet.add(new Date().getFullYear().toString());
    monthKeys.forEach((k) => {
      const parts = k.trim().split(" ");
      if (parts[1] && /^\d{4}$/.test(parts[1])) {
        yearsSet.add(parts[1]);
      }
    });
    if (!monthKeys.includes(currentMonth)) {
      monthKeys.push(currentMonth);
    }

    monthKeys.sort((a, b) => {
      const [ma, ya] = a.split(" ");
      const [mb, yb] = b.split(" ");
      const scoreA =
        (parseInt(ya, 10) || 0) * 12 + Math.max(0, MONTHS_BG.indexOf(ma));
      const scoreB =
        (parseInt(yb, 10) || 0) * 12 + Math.max(0, MONTHS_BG.indexOf(mb));
      return scoreB - scoreA;
    });

    return {
      availableMonths: monthKeys,
      availableYears: Array.from(yearsSet).sort((a, b) => Number(b) - Number(a)),
    };
  }, [allMonthlyData, currentMonth]);

  // Flatten all income items across MonthlyRecords
  const allFlattenedIncomes = useMemo<FlattenedIncomeEntry[]>(() => {
    const entries: FlattenedIncomeEntry[] = [];
    Object.entries(allMonthlyData).forEach(([monthKey, record]) => {
      if (record && Array.isArray(record.incomes)) {
        record.incomes.forEach((item) => {
          entries.push({ item, monthKey });
        });
      }
    });
    return entries;
  }, [allMonthlyData]);

  // Total income for the currently viewed month (realized vs upcoming, Fixed vs Additional)
  const {
    currentMonthTotal,
    currentMonthUpcomingTotal,
    currentMonthFixedTotal,
    currentMonthFixedUpcoming,
    currentMonthAdditionalTotal,
    currentMonthAdditionalUpcoming,
  } = useMemo(() => {
    const rec = allMonthlyData[currentMonth];
    if (!rec || !Array.isArray(rec.incomes)) {
      return {
        currentMonthTotal: 0,
        currentMonthUpcomingTotal: 0,
        currentMonthFixedTotal: 0,
        currentMonthFixedUpcoming: 0,
        currentMonthAdditionalTotal: 0,
        currentMonthAdditionalUpcoming: 0,
      };
    }
    let realized = 0;
    let upcoming = 0;
    let fixedRealized = 0;
    let fixedUpcoming = 0;
    let additionalRealized = 0;
    let additionalUpcoming = 0;

    rec.incomes.forEach((i) => {
      const amt = Number(i.amount) || 0;
      const isFixed = isRepeatingFrequency(i.repeat);
      if (isRecordCompleted(i)) {
        realized += amt;
        if (isFixed) fixedRealized += amt;
        else additionalRealized += amt;
      } else {
        upcoming += amt;
        if (isFixed) fixedUpcoming += amt;
        else additionalUpcoming += amt;
      }
    });
    return {
      currentMonthTotal: realized,
      currentMonthUpcomingTotal: upcoming,
      currentMonthFixedTotal: fixedRealized,
      currentMonthFixedUpcoming: fixedUpcoming,
      currentMonthAdditionalTotal: additionalRealized,
      currentMonthAdditionalUpcoming: additionalUpcoming,
    };
  }, [allMonthlyData, currentMonth]);

  // Filtered & sorted list
  const filteredEntries = useMemo(() => {
    const search = filters.searchTerm.trim().toLowerCase();
    const minVal =
      filters.minAmount !== "" ? parseDecimalInput(filters.minAmount) : null;
    const maxVal =
      filters.maxAmount !== "" ? parseDecimalInput(filters.maxAmount) : null;

    const list = allFlattenedIncomes.filter(({ item, monthKey }) => {
      // Period filter
      if (filters.monthFilter === "current") {
        if (monthKey !== currentMonth) return false;
      } else if (filters.monthFilter.startsWith("year:")) {
        const targetYear = filters.monthFilter.replace("year:", "");
        const itemDate = new Date(item.date);
        const monthYear = monthKey.split(" ")[1];
        const matchesYear =
          (!isNaN(itemDate.getTime()) &&
            itemDate.getFullYear().toString() === targetYear) ||
          monthYear === targetYear;
        if (!matchesYear) return false;
      } else if (filters.monthFilter === "custom") {
        const itemDate = new Date(item.date);
        if (filters.startDate) {
          const start = new Date(filters.startDate + "T00:00:00");
          if (itemDate < start) return false;
        }
        if (filters.endDate) {
          const end = new Date(filters.endDate + "T23:59:59");
          if (itemDate > end) return false;
        }
      } else if (filters.monthFilter !== "all") {
        if (monthKey !== filters.monthFilter) return false;
      }

      // Category filter
      if (filters.categoryId !== "all") {
        if (item.categoryId !== filters.categoryId) return false;
      }

      // Amount bounds
      if (minVal !== null && !isNaN(minVal) && item.amount < minVal) {
        return false;
      }
      if (maxVal !== null && !isNaN(maxVal) && item.amount > maxVal) {
        return false;
      }

      // Search (note, categoryName, amount)
      if (search) {
        const noteMatch = (item.note || "").toLowerCase().includes(search);
        const catMatch = (item.categoryName || "")
          .toLowerCase()
          .includes(search);
        const amtMatch = item.amount.toFixed(2).includes(search);
        if (!noteMatch && !catMatch && !amtMatch) return false;
      }

      // Status filter
      if (filters.statusFilter === "completed" && !isRecordCompleted(item)) {
        return false;
      }
      if (filters.statusFilter === "planned" && isRecordCompleted(item)) {
        return false;
      }

      // Type filter (Fixed = Repeat != never vs Additional = Repeat == never)
      const isFixed = isRepeatingFrequency(item.repeat);
      if (filters.typeFilter === "fixed" && !isFixed) {
        return false;
      }
      if (filters.typeFilter === "additional" && isFixed) {
        return false;
      }

      return true;
    });

    const indexedList = list.map((entry, idx) => ({ entry, idx }));
    indexedList.sort((a, b) => {
      if (filters.sortBy === "highest") {
        return (
          b.entry.item.amount - a.entry.item.amount ||
          compareExpensesChronologically(a.entry.item, b.entry.item, "desc", a.idx, b.idx)
        );
      }
      if (filters.sortBy === "lowest") {
        return (
          a.entry.item.amount - b.entry.item.amount ||
          compareExpensesChronologically(a.entry.item, b.entry.item, "desc", a.idx, b.idx)
        );
      }
      return compareExpensesChronologically(
        a.entry.item,
        b.entry.item,
        filters.sortBy === "oldest" ? "asc" : "desc",
        a.idx,
        b.idx
      );
    });

    return indexedList.map(({ entry }) => entry);
  }, [allFlattenedIncomes, filters, currentMonth]);

  const { filteredTotalSum, filteredUpcomingSum } = useMemo(() => {
    let realized = 0;
    let upcoming = 0;
    filteredEntries.forEach(({ item }) => {
      const amt = Number(item.amount) || 0;
      if (isRecordCompleted(item)) {
        realized += amt;
      } else {
        upcoming += amt;
      }
    });
    return { filteredTotalSum: realized, filteredUpcomingSum: upcoming };
  }, [filteredEntries]);

  const {
    filteredFixedEntries,
    filteredAdditionalEntries,
    fixedRealizedSum,
    fixedUpcomingSum,
    additionalRealizedSum,
    additionalUpcomingSum,
  } = useMemo(() => {
    const fixedList: FlattenedIncomeEntry[] = [];
    const addList: FlattenedIncomeEntry[] = [];
    let fRealized = 0;
    let fUpcoming = 0;
    let aRealized = 0;
    let aUpcoming = 0;

    filteredEntries.forEach((entry) => {
      const amt = Number(entry.item.amount) || 0;
      const done = isRecordCompleted(entry.item);
      if (isRepeatingFrequency(entry.item.repeat)) {
        fixedList.push(entry);
        if (done) fRealized += amt;
        else fUpcoming += amt;
      } else {
        addList.push(entry);
        if (done) aRealized += amt;
        else aUpcoming += amt;
      }
    });

    return {
      filteredFixedEntries: fixedList,
      filteredAdditionalEntries: addList,
      fixedRealizedSum: fRealized,
      fixedUpcomingSum: fUpcoming,
      additionalRealizedSum: aRealized,
      additionalUpcomingSum: aUpcoming,
    };
  }, [filteredEntries]);

  // --- Handlers: Open Add / Edit Form ---
  const handleOpenAddModal = (
    scheduleTemplateOnly = false,
    defaultRepeat: RepeatFrequency = "never"
  ) => {
    setEditingEntry(null);
    setEditingTemplateId(null);
    setFormAmount("");
    setFormCategory(incomeCategories[0] || null);
    setFormDate(toLocalYyyyMmDd(new Date()));
    setFormNote("");
    setFormFrequency("monthly");
    setFormDayOfMonth(new Date().getDate());
    setFormDayOfWeek(new Date().getDay());
    setFormScheduleOnly(scheduleTemplateOnly);
    setFormRepeat(defaultRepeat);
    setFormCompleted(true);
    setFormIsGenerated(false);
    setFormError(null);
    setIsFormOpen(true);
  };

  const handleOpenEditEntry = (entry: FlattenedIncomeEntry) => {
    setEditingEntry(entry);
    setEditingTemplateId(null);
    setFormAmount(entry.item.amount.toString());
    const matchedCat =
      incomeCategories.find((c) => c.id === entry.item.categoryId) || {
        id: entry.item.categoryId,
        name: entry.item.categoryName,
        iconName: entry.item.categoryIcon || "Wallet",
        colorClass: entry.item.categoryColor || "bg-emerald-100 text-emerald-600",
      };
    setFormCategory(matchedCat);
    const parsedDate = new Date(entry.item.date);
    setFormDate(
      !isNaN(parsedDate.getTime())
        ? toLocalYyyyMmDd(parsedDate)
        : toLocalYyyyMmDd(new Date())
    );
    setFormNote(entry.item.note || "");
    setFormFrequency(entry.item.frequency || "monthly");
    setFormDayOfMonth(
      !isNaN(parsedDate.getTime()) ? parsedDate.getDate() : new Date().getDate()
    );
    setFormDayOfWeek(
      !isNaN(parsedDate.getTime()) ? parsedDate.getDay() : new Date().getDay()
    );
    setFormScheduleOnly(false);
    setFormRepeat(resolveItemRepeat(entry.item));
    setFormCompleted(isRecordCompleted(entry.item));
    setFormIsGenerated(Boolean(entry.item.recurrenceSourceId));
    setFormError(null);
    setIsFormOpen(true);
  };

  const handleOpenEditTemplate = (tpl: RecurringIncomeTemplate) => {
    setEditingEntry(null);
    setEditingTemplateId(tpl.id);
    setFormAmount(tpl.amount.toString());
    const matchedCat =
      incomeCategories.find((c) => c.id === tpl.categoryId) || {
        id: tpl.categoryId,
        name: tpl.categoryName,
        iconName: tpl.categoryIcon || "Wallet",
        colorClass: tpl.categoryColor || "bg-emerald-100 text-emerald-600",
      };
    setFormCategory(matchedCat);
    setFormDate(tpl.startDate || toLocalYyyyMmDd(new Date()));
    setFormNote(tpl.note || "");
    setFormFrequency(tpl.frequency);
    setFormDayOfMonth(tpl.dayOfMonth || 1);
    setFormDayOfWeek(typeof tpl.dayOfWeek === "number" ? tpl.dayOfWeek : 1);
    setFormScheduleOnly(true);
    setFormRepeat("never");
    setFormCompleted(true);
    setFormIsGenerated(false);
    setFormError(null);
    setIsFormOpen(true);
  };

  // --- Save Income / Template ---
  const handleSaveForm = (e: React.FormEvent) => {
    e.preventDefault();
    const numericAmount = parseDecimalInput(formAmount);
    if (isNaN(numericAmount) || numericAmount <= 0) {
      setFormError("Моля, въведете валидна сума по-голяма от 0.");
      return;
    }
    if (!formCategory) {
      setFormError("Моля, изберете категория.");
      return;
    }

    const safeDateStr = formDate || toLocalYyyyMmDd(new Date());
    const selectedDateObj = new Date(safeDateStr + "T12:00:00");

    // Case A: Editing an existing Recurring Template
    if (editingTemplateId) {
      const updatedTemplates = recurringTemplates.map((tpl) => {
        if (tpl.id !== editingTemplateId) return tpl;
        return {
          ...tpl,
          categoryId: formCategory.id,
          categoryName: formCategory.name,
          categoryIcon: formCategory.iconName,
          categoryColor: formCategory.colorClass,
          amount: parseFloat(numericAmount.toFixed(2)),
          note: formNote.trim(),
          frequency: formFrequency,
          dayOfMonth:
            formFrequency === "weekly" ? undefined : Number(formDayOfMonth) || 1,
          monthOfYear:
            formFrequency === "yearly" ? selectedDateObj.getMonth() : undefined,
          dayOfWeek:
            formFrequency === "weekly" ? Number(formDayOfWeek) : undefined,
          startDate: safeDateStr,
        };
      });
      setRecurringTemplates(updatedTemplates);
      saveRecurringIncomes(updatedTemplates);
      onTriggerSync?.();
      setIsFormOpen(false);
      showToast("Повтарящият се шаблон беше обновен.");
      return;
    }

    // Case B: Editing an existing IncomeItem (Repeat acts as Single Source of Truth for Fixed vs Additional)
    if (editingEntry) {
      const targetMonthKey = getMonthKeyFromDate(selectedDateObj);
      const nowIso = new Date().toISOString();
      const effectiveRepeat = normalizeRepeatValue(formRepeat);
      const isFixed = isRepeatingFrequency(effectiveRepeat);
      const updatedItem: IncomeItem = {
        ...editingEntry.item,
        categoryId: formCategory.id,
        categoryName: formCategory.name,
        categoryIcon: formCategory.iconName,
        categoryColor: formCategory.colorClass,
        amount: parseFloat(numericAmount.toFixed(2)),
        note: formNote.trim(),
        date: selectedDateObj.toISOString(),
        repeat: effectiveRepeat,
        isRecurring: isFixed,
        isFixedItem: isFixed,
        completed: formCompleted,
        status: formCompleted ? "completed" : "planned",
        completedAt: formCompleted ? editingEntry.item.completedAt || nowIso : undefined,
        type: "income",
      };

      if (targetMonthKey === editingEntry.monthKey) {
        const existingList = allMonthlyData[targetMonthKey]?.incomes || [];
        const updatedList = existingList.map((i) =>
          i.id === editingEntry.item.id ? updatedItem : i
        );
        onSaveIncomesForMonth(targetMonthKey, updatedList);
      } else {
        // Move to new month
        const oldList = (
          allMonthlyData[editingEntry.monthKey]?.incomes || []
        ).filter((i) => i.id !== editingEntry.item.id);
        onSaveIncomesForMonth(editingEntry.monthKey, oldList);

        const newMonthList = allMonthlyData[targetMonthKey]?.incomes || [];
        onSaveIncomesForMonth(targetMonthKey, [...newMonthList, updatedItem]);
      }

      onTriggerSync?.();
      setIsFormOpen(false);
      showToast("Приходът беше обновен.");
      return;
    }

    // Case C1: Creating a legacy Recurring Income Template (via Templates panel -> "Нов шаблон")
    if (formScheduleOnly) {
      const templateId = `rec_inc_${Date.now()}`;
      const newTemplate: RecurringIncomeTemplate = {
        id: templateId,
        categoryId: formCategory.id,
        categoryName: formCategory.name,
        categoryIcon: formCategory.iconName,
        categoryColor: formCategory.colorClass,
        amount: parseFloat(numericAmount.toFixed(2)),
        note: formNote.trim(),
        frequency: formFrequency,
        dayOfMonth:
          formFrequency === "weekly" ? undefined : Number(formDayOfMonth) || 1,
        monthOfYear:
          formFrequency === "yearly" ? selectedDateObj.getMonth() : undefined,
        dayOfWeek:
          formFrequency === "weekly" ? Number(formDayOfWeek) : undefined,
        startDate: safeDateStr,
        active: true,
        createdAt: new Date().toISOString(),
        handledOccurrences: {},
      };

      const updatedTemplates = [...recurringTemplates, newTemplate];
      setRecurringTemplates(updatedTemplates);
      saveRecurringIncomes(updatedTemplates);
      onTriggerSync?.();
      setIsFormOpen(false);
      showToast(
        "Повтарящият се шаблон е създаден и ще се появи в „Очаквани приходи“ на датата на падеж."
      );
      return;
    }

    // Case C2: Creating a new IncomeItem with universal Repeat + Изпълнено switch
    const targetMonthKey = getMonthKeyFromDate(selectedDateObj);
    const nowMs = Date.now();
    const nowIso = new Date(nowMs).toISOString();
    const effectiveRepeat = normalizeRepeatValue(formRepeat);
    const isFixed = isRepeatingFrequency(effectiveRepeat);
    const newIncome: IncomeItem = {
      id: `inc_${nowMs}_${Math.random().toString(36).substring(2, 6)}`,
      categoryId: formCategory.id,
      categoryName: formCategory.name,
      categoryIcon: formCategory.iconName,
      categoryColor: formCategory.colorClass,
      amount: parseFloat(numericAmount.toFixed(2)),
      note: formNote.trim(),
      date: selectedDateObj.toISOString(),
      createdAt: nowIso,
      timestamp: nowMs,
      type: "income",
      repeat: effectiveRepeat,
      isRecurring: isFixed,
      isFixedItem: isFixed,
      completed: formCompleted,
      status: formCompleted ? "completed" : "planned",
      completedAt: formCompleted ? nowIso : undefined,
    };
    const existingList = allMonthlyData[targetMonthKey]?.incomes || [];
    onSaveIncomesForMonth(targetMonthKey, [...existingList, newIncome]);
    onTriggerSync?.();

    setIsFormOpen(false);
    showToast(
      formCompleted
        ? isFixed
          ? "Фиксираният приход беше добавен успешно."
          : "Приходът беше добавен успешно."
        : "Предстоящият приход беше добавен."
    );
  };

  // --- Confirm Expected Income (creates real IncomeItem + marks cycle confirmed) ---
  const handleConfirmExpectedIncome = (
    template: RecurringIncomeTemplate,
    occurrenceKey: string,
    dueDateIso: string
  ) => {
    const dueDateObj = new Date(dueDateIso + "T12:00:00");
    const targetMonthKey = getMonthKeyFromDate(dueDateObj);

    const nowMs = Date.now();
    const nowIso = new Date(nowMs).toISOString();
    const templateRepeat = normalizeRepeatValue(template.frequency);
    const confirmedIncome: IncomeItem = {
      id: `inc_${nowMs}_${Math.random().toString(36).substring(2, 6)}`,
      categoryId: template.categoryId,
      categoryName: template.categoryName,
      categoryIcon: template.categoryIcon,
      categoryColor: template.categoryColor,
      amount: template.amount,
      note: template.note || "",
      date: dueDateObj.toISOString(),
      createdAt: nowIso,
      timestamp: nowMs,
      type: "income",
      isRecurring: true,
      isFixedItem: true,
      frequency: template.frequency,
      recurringTemplateId: template.id,
      recurrenceSourceId: template.id,
      recurrenceOccurrenceKey: occurrenceKey,
      repeat: templateRepeat !== "never" ? templateRepeat : "monthly",
      completed: true,
      status: "completed",
      completedAt: nowIso,
    };

    const existingList = allMonthlyData[targetMonthKey]?.incomes || [];
    onSaveIncomesForMonth(targetMonthKey, [...existingList, confirmedIncome]);

    const updatedTemplates = recurringTemplates.map((tpl) => {
      if (tpl.id !== template.id) return tpl;
      return {
        ...tpl,
        handledOccurrences: {
          ...(tpl.handledOccurrences || {}),
          [occurrenceKey]: "confirmed" as const,
        },
      };
    });

    setRecurringTemplates(updatedTemplates);
    saveRecurringIncomes(updatedTemplates);
    onTriggerSync?.();
    showToast(
      `Потвърден приход: ${template.categoryName} (+€${template.amount.toFixed(2)}) за ${targetMonthKey}.`
    );
  };

  // --- Skip Expected Income (marks cycle skipped, no IncomeItem created) ---
  const handleSkipExpectedIncome = (
    template: RecurringIncomeTemplate,
    occurrenceKey: string
  ) => {
    const updatedTemplates = recurringTemplates.map((tpl) => {
      if (tpl.id !== template.id) return tpl;
      return {
        ...tpl,
        handledOccurrences: {
          ...(tpl.handledOccurrences || {}),
          [occurrenceKey]: "skipped" as const,
        },
      };
    });

    setRecurringTemplates(updatedTemplates);
    saveRecurringIncomes(updatedTemplates);
    onTriggerSync?.();
    showToast(`Пропуснат очакван приход: ${template.categoryName}.`);
  };

  // --- Toggle Completion Status on an Income Entry ---
  const handleToggleIncomeCompletion = (
    entry: FlattenedIncomeEntry,
    nextCompleted: boolean
  ) => {
    const existingList = allMonthlyData[entry.monthKey]?.incomes || [];
    const updatedList = existingList.map((i) =>
      i.id === entry.item.id ? toggleRecordCompletion(i, nextCompleted) : i
    );
    onSaveIncomesForMonth(entry.monthKey, updatedList);
    onTriggerSync?.();
  };

  // --- Delete Income Entry ---
  const handleConfirmDeleteEntry = () => {
    if (!pendingDeleteEntry) return;
    const { item, monthKey } = pendingDeleteEntry;
    if (item.recurrenceSourceId && item.recurrenceOccurrenceKey) {
      markRecurrenceDismissed(item.recurrenceSourceId, item.recurrenceOccurrenceKey);
    }
    const existingList = allMonthlyData[monthKey]?.incomes || [];
    const updatedList = existingList.filter((i) => i.id !== item.id);
    onSaveIncomesForMonth(monthKey, updatedList);
    setPendingDeleteEntry(null);
    showToast("Приходът беше изтрит.");
  };

  // --- Toggle / Delete Recurring Template ---
  const handleToggleTemplateActive = (templateId: string) => {
    const updated = recurringTemplates.map((t) =>
      t.id === templateId ? { ...t, active: !t.active } : t
    );
    setRecurringTemplates(updated);
    saveRecurringIncomes(updated);
    onTriggerSync?.();
  };

  const handleDeleteTemplate = (templateId: string) => {
    const updated = recurringTemplates.filter((t) => t.id !== templateId);
    setRecurringTemplates(updated);
    saveRecurringIncomes(updated);
    onTriggerSync?.();
    showToast("Повтарящият се шаблон беше изтрит.");
  };

  const renderCategoryIcon = (iconName: string, className = "w-5 h-5") => {
    const IconComp = ICON_MAP[iconName] || Banknote;
    return <IconComp className={className} />;
  };

  const activeTemplatesCount = recurringTemplates.filter((t) => t.active).length;

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {/* Top Header & Period Summary */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/90 dark:border-slate-800 shadow-xs p-4 sm:p-6 transition-colors">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2.5">
              <div className="w-10 h-10 rounded-xl bg-emerald-50 dark:bg-emerald-950/70 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
                <Banknote className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-slate-900 dark:text-white tracking-tight">
                  Приходи
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Всички постъпления, повтарящи се приходи и очаквани плащания
                </p>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {/* Month Switcher */}
            <div className="flex items-center bg-slate-100 dark:bg-slate-800 rounded-xl p-1 border border-slate-200/70 dark:border-slate-700/70">
              <button
                type="button"
                onClick={() => shiftMonth(-1)}
                className="min-h-[38px] min-w-[38px] flex items-center justify-center rounded-lg text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-700 transition-colors cursor-pointer"
                title="Предишен месец"
                aria-label="Предишен месец"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="px-3 text-xs sm:text-sm font-semibold text-slate-800 dark:text-slate-100 whitespace-nowrap min-w-[125px] text-center">
                {currentMonth}
              </span>
              <button
                type="button"
                onClick={() => shiftMonth(1)}
                className="min-h-[38px] min-w-[38px] flex items-center justify-center rounded-lg text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-700 transition-colors cursor-pointer"
                title="Следващ месец"
                aria-label="Следващ месец"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>

            {/* Recurring Templates Button */}
            <button
              type="button"
              onClick={() => setShowRecurringPanel((prev) => !prev)}
              className={`min-h-[44px] sm:min-h-[40px] flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold border transition-colors cursor-pointer whitespace-nowrap ${
                showRecurringPanel
                  ? "bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800"
                  : "bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700"
              }`}
            >
              <Repeat className="w-4 h-4" />
              <span>Повтарящи се ({activeTemplatesCount})</span>
            </button>

            {/* Primary Add Income Button */}
            <button
              type="button"
              onClick={() => handleOpenAddModal(false)}
              className="min-h-[44px] sm:min-h-[40px] flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs sm:text-sm font-semibold transition-colors shadow-xs cursor-pointer whitespace-nowrap"
            >
              <Plus className="w-4 h-4" />
              <span>Добави приход</span>
            </button>
          </div>
        </div>

        {/* Period Total Summary Strip */}
        <div className="mt-5 pt-4 border-t border-slate-100 dark:border-slate-800 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div>
            <span className="text-xs text-slate-500 dark:text-slate-400 block">
              Реализирани приходи ({currentMonth})
            </span>
            <span className="text-2xl font-black text-emerald-600 dark:text-emerald-400 tabular-nums">
              +€{currentMonthTotal.toFixed(2)}
            </span>
            {currentMonthUpcomingTotal > 0 && (
              <span className="text-xs font-semibold text-amber-700 dark:text-amber-300 block tabular-nums mt-0.5">
                Очаквани: +€{currentMonthUpcomingTotal.toFixed(2)}
              </span>
            )}
          </div>
          <div>
            <span className="text-xs text-slate-500 dark:text-slate-400 block">
              Фиксирани приходи
            </span>
            <span className="text-xl font-bold text-indigo-700 dark:text-indigo-300 tabular-nums">
              +€{currentMonthFixedTotal.toFixed(2)}
            </span>
            {currentMonthFixedUpcoming > 0 && (
              <span className="text-xs font-semibold text-amber-700 dark:text-amber-300 block tabular-nums mt-0.5">
                Предстоящи: +€{currentMonthFixedUpcoming.toFixed(2)}
              </span>
            )}
          </div>
          <div>
            <span className="text-xs text-slate-500 dark:text-slate-400 block">
              Допълнителни приходи
            </span>
            <span className="text-xl font-bold text-slate-900 dark:text-white tabular-nums">
              +€{currentMonthAdditionalTotal.toFixed(2)}
            </span>
            {currentMonthAdditionalUpcoming > 0 && (
              <span className="text-xs font-semibold text-amber-700 dark:text-amber-300 block tabular-nums mt-0.5">
                Предстоящи: +€{currentMonthAdditionalUpcoming.toFixed(2)}
              </span>
            )}
          </div>
          <div>
            <span className="text-xs text-slate-500 dark:text-slate-400 block">
              Шаблони / за потвърждение
            </span>
            <span className="text-xl font-bold text-slate-900 dark:text-white tabular-nums">
              {dueExpectedIncomes.length}{" "}
              <span className="text-xs font-normal text-slate-500 dark:text-slate-400">
                ({activeTemplatesCount} шаблона)
              </span>
            </span>
          </div>
        </div>
      </div>

      {/* Toast Feedback */}
      {feedbackMessage && (
        <div className="p-3.5 bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200 rounded-xl text-xs sm:text-sm font-medium flex items-center justify-between gap-2 animate-in fade-in">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
            <span>{feedbackMessage}</span>
          </div>
          <button
            type="button"
            onClick={() => setFeedbackMessage(null)}
            className="text-emerald-600 dark:text-emerald-400 hover:opacity-75 p-1 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Expected Income Banner / Confirmation Section */}
      {dueExpectedIncomes.length > 0 && (
        <section
          aria-label="Очаквани приходи"
          className="bg-emerald-50/60 dark:bg-emerald-950/25 rounded-2xl border border-emerald-200 dark:border-emerald-800/80 p-4 sm:p-5 space-y-3"
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-emerald-100 dark:bg-emerald-900/70 text-emerald-700 dark:text-emerald-300 flex items-center justify-center shrink-0">
                <Clock className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-slate-900 dark:text-white text-sm sm:text-base">
                  Очаквани приходи ({dueExpectedIncomes.length})
                </h3>
                <p className="text-xs text-slate-600 dark:text-slate-300">
                  Потвърдете получените суми, за да се отразят в приходите и баланса ви.
                </p>
              </div>
            </div>
          </div>

          <div className="divide-y divide-emerald-200/70 dark:divide-emerald-800/60 bg-white dark:bg-slate-900 rounded-xl border border-emerald-200/80 dark:border-emerald-800/70">
            {dueExpectedIncomes.map(
              ({ template, occurrenceKey, dueDateIso, scheduleLabel }) => (
                <div
                  key={`${template.id}_${occurrenceKey}`}
                  className="p-3.5 sm:p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${getCategoryBadgeClasses(template.categoryColor)}`}
                    >
                      {renderCategoryIcon(template.categoryIcon)}
                    </div>
                    <div className="min-w-0">
                      <p className="font-semibold text-slate-900 dark:text-white text-sm truncate">
                        {template.categoryName}
                      </p>
                      <div className="flex flex-wrap items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                        <span>
                          Падеж:{" "}
                          {new Date(dueDateIso + "T12:00:00").toLocaleDateString(
                            "bg-BG"
                          )}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span>{scheduleLabel}</span>
                        {template.note && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span className="truncate">{template.note}</span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center justify-between sm:justify-end gap-2.5 shrink-0">
                    <span className="text-base font-bold text-emerald-600 dark:text-emerald-400 tabular-nums mr-1">
                      +€{template.amount.toFixed(2)}
                    </span>

                    <button
                      type="button"
                      onClick={() =>
                        handleConfirmExpectedIncome(
                          template,
                          occurrenceKey,
                          dueDateIso
                        )
                      }
                      className="min-h-[44px] sm:min-h-[38px] flex items-center gap-1.5 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap"
                    >
                      <CheckCircle2 className="w-4 h-4" />
                      <span>Потвърди получен</span>
                    </button>

                    <button
                      type="button"
                      onClick={() =>
                        handleSkipExpectedIncome(template, occurrenceKey)
                      }
                      className="min-h-[44px] sm:min-h-[38px] flex items-center gap-1 px-3 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap"
                    >
                      <SkipForward className="w-3.5 h-3.5" />
                      <span>Пропусни</span>
                    </button>
                  </div>
                </div>
              )
            )}
          </div>
        </section>
      )}

      {/* Recurring Templates Management Panel */}
      {showRecurringPanel && (
        <section className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs p-4 sm:p-5 space-y-4 animate-in fade-in duration-150">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-100 dark:border-slate-800">
            <div>
              <h3 className="font-bold text-slate-900 dark:text-white text-sm sm:text-base">
                Повтарящи се шаблони за приходи
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                При настъпване на датата шаблонът се появява като „Очакван приход“ за потвърждение.
              </p>
            </div>
            <button
              type="button"
              onClick={() => handleOpenAddModal(true)}
              className="min-h-[40px] flex items-center justify-center gap-1.5 px-3.5 py-2 bg-indigo-50 dark:bg-indigo-950/60 hover:bg-indigo-100 dark:hover:bg-indigo-900/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 rounded-xl text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Нов шаблон</span>
            </button>
          </div>

          {recurringTemplates.length === 0 ? (
            <div className="text-center py-6 text-slate-500 dark:text-slate-400 text-xs">
              Все още нямате настроени повтарящи се приходи (напр. Заплата, Пенсия, Наем).
            </div>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {recurringTemplates.map((tpl) => (
                <div
                  key={tpl.id}
                  className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                        tpl.active ? getCategoryBadgeClasses(tpl.categoryColor) : "bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400"
                      }`}
                    >
                      {renderCategoryIcon(tpl.categoryIcon, "w-4 h-4")}
                    </div>
                    <div className="min-w-0">
                      <p
                        className={`font-semibold text-sm truncate ${
                          tpl.active
                            ? "text-slate-900 dark:text-white"
                            : "text-slate-500 dark:text-slate-400 line-through"
                        }`}
                      >
                        {tpl.categoryName}
                      </p>
                      <div className="flex flex-wrap items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                        <span>{formatRecurrenceSchedule(tpl)}</span>
                        <span aria-hidden="true">·</span>
                        <span>{tpl.active ? "Активен" : "На пауза"}</span>
                        {tpl.note && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span className="truncate">{tpl.note}</span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between sm:justify-end gap-2 shrink-0">
                    <span className="font-bold text-sm text-emerald-600 dark:text-emerald-400 tabular-nums mr-2">
                      +€{tpl.amount.toFixed(2)}
                    </span>

                    <button
                      type="button"
                      onClick={() => handleToggleTemplateActive(tpl.id)}
                      className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                      title={tpl.active ? "Сложи на пауза" : "Активирай"}
                      aria-label={tpl.active ? "Сложи на пауза" : "Активирай"}
                    >
                      {tpl.active ? (
                        <Pause className="w-4 h-4" />
                      ) : (
                        <Play className="w-4 h-4" />
                      )}
                    </button>

                    <button
                      type="button"
                      onClick={() => handleOpenEditTemplate(tpl)}
                      className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                      title="Редактирай шаблон"
                      aria-label="Редактирай шаблон"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>

                    <button
                      type="button"
                      onClick={() => handleDeleteTemplate(tpl.id)}
                      className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-lg border border-slate-200 dark:border-slate-700 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors cursor-pointer"
                      title="Изтрий шаблон"
                      aria-label="Изтрий шаблон"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {/* Search, Filters & Sort Toolbar */}
      <IncomeFilterToolbar
        filters={filters}
        onChangeFilters={setFilters}
        availableMonths={availableMonths}
        availableYears={availableYears}
        currentMonth={currentMonth}
        categories={incomeCategories}
        totalResultsCount={filteredEntries.length}
        totalFilteredSum={filteredTotalSum}
        totalFilteredUpcomingSum={filteredUpcomingSum}
      />

      {/* Fixed vs Additional Incomes Sections (mirroring Expenses layout) */}
      <div
        className={
          filters.typeFilter === "fixed" || filters.typeFilter === "additional"
            ? "space-y-6"
            : "grid grid-cols-1 lg:grid-cols-2 gap-6"
        }
      >
        {/* Left Column: Fixed Incomes (Repeat !== "never") */}
        {filters.typeFilter !== "additional" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-slate-700 dark:text-slate-200 flex items-center gap-2">
                  <Repeat className="w-4 h-4 text-indigo-500" />
                  Фиксирани приходи
                </h3>
                <span className="text-xs bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 px-2 py-0.5 rounded-full font-medium tabular-nums">
                  {filteredFixedEntries.length}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <div className="text-right">
                  <span className="text-sm font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">
                    +€{fixedRealizedSum.toFixed(2)}
                  </span>
                  {fixedUpcomingSum > 0 && (
                    <span className="block text-[10px] font-semibold text-amber-600 dark:text-amber-400 tabular-nums">
                      Предстоящи: +€{fixedUpcomingSum.toFixed(2)}
                    </span>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => handleOpenAddModal(false, "monthly")}
                  className="p-1.5 bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 rounded-md hover:bg-indigo-100 dark:hover:bg-indigo-900/60 transition-colors shadow-sm cursor-pointer"
                  title="Добави фиксиран приход"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>
            </div>

            {filteredFixedEntries.length === 0 ? (
              <div className="bg-white dark:bg-slate-900 rounded-2xl border border-dashed border-slate-200 dark:border-slate-800 p-8 text-center">
                <p className="text-sm font-medium text-slate-500 dark:text-slate-400 mb-3">
                  Няма фиксирани приходи за избраните критерии
                </p>
                <button
                  type="button"
                  onClick={() => handleOpenAddModal(false, "monthly")}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 rounded-xl text-xs font-semibold hover:bg-indigo-100 dark:hover:bg-indigo-900/60 transition-colors cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Добави фиксиран приход</span>
                </button>
              </div>
            ) : (
              <div className="space-y-2.5">
                {filteredFixedEntries.map((entry) => {
                  const { item, monthKey } = entry;
                  const formattedDate = item.date
                    ? new Date(item.date).toLocaleDateString("bg-BG")
                    : monthKey;
                  const isCompleted = isRecordCompleted(item);

                  return (
                    <div
                      key={`${monthKey}_${item.id}`}
                      className={`rounded-2xl border p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition-colors ${
                        isCompleted
                          ? "bg-white dark:bg-slate-900 border-slate-200/85 dark:border-slate-800 hover:border-indigo-200 dark:hover:border-indigo-800/80"
                          : "bg-amber-50/40 dark:bg-amber-950/20 border-amber-300/80 dark:border-amber-800/70"
                      }`}
                    >
                      <div className="flex items-start sm:items-center gap-3.5 min-w-0">
                        <div
                          className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${getCategoryBadgeClasses(
                            item.categoryColor || "bg-emerald-100 text-emerald-600"
                          )}`}
                        >
                          {renderCategoryIcon(item.categoryIcon, "w-4 h-4")}
                        </div>

                        <div className="min-w-0 space-y-0.5">
                          <div className="flex items-center gap-2 min-w-0 flex-wrap">
                            <span className="font-bold text-slate-900 dark:text-white text-sm truncate">
                              {item.categoryName}
                            </span>
                            {!isCompleted && (
                              <span className="inline-flex items-center gap-1 text-[10px] font-semibold bg-amber-100 dark:bg-amber-950/80 text-amber-800 dark:text-amber-300 px-2 py-0.5 rounded-full border border-amber-200 dark:border-amber-800">
                                <Clock className="w-2.5 h-2.5 text-amber-600 dark:text-amber-400" />
                                Предстоящ
                              </span>
                            )}
                            <span className="inline-flex items-center gap-1 text-[10px] font-semibold bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 px-2 py-0.5 rounded-full border border-indigo-200/80 dark:border-indigo-800">
                              <Repeat className="w-2.5 h-2.5 text-indigo-600 dark:text-indigo-400" />
                              {formatRepeatLabel(item.repeat)}
                            </span>
                          </div>

                          <div className="flex flex-wrap items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                            <span>{formattedDate}</span>
                            {filters.monthFilter !== "current" && (
                              <>
                                <span aria-hidden="true">·</span>
                                <span>{monthKey}</span>
                              </>
                            )}
                            <span aria-hidden="true">·</span>
                            <span>Фиксиран</span>
                          </div>

                          {item.note && (
                            <p className="text-xs text-slate-600 dark:text-slate-300 pt-0.5 break-words">
                              {item.note}
                            </p>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center justify-between sm:justify-end gap-2 sm:gap-2.5 pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-100 dark:border-slate-800 shrink-0">
                        <span
                          className={`text-base sm:text-lg font-extrabold tabular-nums ${
                            isCompleted
                              ? "text-emerald-600 dark:text-emerald-400"
                              : "text-amber-700 dark:text-amber-300"
                          }`}
                        >
                          +€{Number(item.amount).toFixed(2)}
                        </span>

                        <div className="flex items-center gap-1">
                          <CompletionSwitch
                            checked={isCompleted}
                            onChange={(val) => handleToggleIncomeCompletion(entry, val)}
                            ariaLabel={`Изпълнено за ${item.categoryName}`}
                            size="sm"
                          />
                          <button
                            type="button"
                            onClick={() => handleOpenEditEntry(entry)}
                            className="min-h-[40px] min-w-[40px] sm:min-h-[34px] sm:min-w-[34px] flex items-center justify-center rounded-xl text-slate-500 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/50 transition-colors cursor-pointer"
                            title="Редактирай приход"
                            aria-label="Редактирай приход"
                          >
                            <Pencil className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setPendingDeleteEntry(entry)}
                            className="min-h-[40px] min-w-[40px] sm:min-h-[34px] sm:min-w-[34px] flex items-center justify-center rounded-xl text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/50 transition-colors cursor-pointer"
                            title="Изтрий приход"
                            aria-label="Изтрий приход"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Right Column: Additional Incomes (Repeat === "never") */}
        {filters.typeFilter !== "fixed" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-slate-700 dark:text-slate-200 flex items-center gap-2">
                  <Banknote className="w-4 h-4 text-emerald-500" />
                  Допълнителни приходи
                </h3>
                <span className="text-xs bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 px-2 py-0.5 rounded-full font-medium tabular-nums">
                  {filteredAdditionalEntries.length}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <div className="text-right">
                  <span className="text-sm font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">
                    +€{additionalRealizedSum.toFixed(2)}
                  </span>
                  {additionalUpcomingSum > 0 && (
                    <span className="block text-[10px] font-semibold text-amber-600 dark:text-amber-400 tabular-nums">
                      Предстоящи: +€{additionalUpcomingSum.toFixed(2)}
                    </span>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => handleOpenAddModal(false, "never")}
                  className="p-1.5 bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 rounded-md hover:bg-emerald-100 dark:hover:bg-emerald-900/60 transition-colors shadow-sm cursor-pointer"
                  title="Добави допълнителен приход"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>
            </div>

            {filteredAdditionalEntries.length === 0 ? (
              <div className="bg-white dark:bg-slate-900 rounded-2xl border border-dashed border-slate-200 dark:border-slate-800 p-8 text-center">
                <p className="text-sm font-medium text-slate-500 dark:text-slate-400 mb-3">
                  Няма допълнителни приходи за избраните критерии
                </p>
                <button
                  type="button"
                  onClick={() => handleOpenAddModal(false, "never")}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 rounded-xl text-xs font-semibold hover:bg-emerald-100 dark:hover:bg-emerald-900/60 transition-colors cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Добави приход</span>
                </button>
              </div>
            ) : (
              <div className="space-y-2.5">
                {filteredAdditionalEntries.map((entry) => {
                  const { item, monthKey } = entry;
                  const formattedDate = item.date
                    ? new Date(item.date).toLocaleDateString("bg-BG")
                    : monthKey;
                  const isCompleted = isRecordCompleted(item);

                  return (
                    <div
                      key={`${monthKey}_${item.id}`}
                      className={`rounded-2xl border p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition-colors ${
                        isCompleted
                          ? "bg-white dark:bg-slate-900 border-slate-200/85 dark:border-slate-800 hover:border-emerald-200 dark:hover:border-emerald-800/80"
                          : "bg-amber-50/40 dark:bg-amber-950/20 border-amber-300/80 dark:border-amber-800/70"
                      }`}
                    >
                      <div className="flex items-start sm:items-center gap-3.5 min-w-0">
                        <div
                          className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${getCategoryBadgeClasses(
                            item.categoryColor || "bg-emerald-100 text-emerald-600"
                          )}`}
                        >
                          {renderCategoryIcon(item.categoryIcon, "w-4 h-4")}
                        </div>

                        <div className="min-w-0 space-y-0.5">
                          <div className="flex items-center gap-2 min-w-0 flex-wrap">
                            <span className="font-bold text-slate-900 dark:text-white text-sm truncate">
                              {item.categoryName}
                            </span>
                            {!isCompleted && (
                              <span className="inline-flex items-center gap-1 text-[10px] font-semibold bg-amber-100 dark:bg-amber-950/80 text-amber-800 dark:text-amber-300 px-2 py-0.5 rounded-full border border-amber-200 dark:border-amber-800">
                                <Clock className="w-2.5 h-2.5 text-amber-600 dark:text-amber-400" />
                                Предстоящ
                              </span>
                            )}
                          </div>

                          <div className="flex flex-wrap items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                            <span>{formattedDate}</span>
                            {filters.monthFilter !== "current" && (
                              <>
                                <span aria-hidden="true">·</span>
                                <span>{monthKey}</span>
                              </>
                            )}
                            <span aria-hidden="true">·</span>
                            <span>Допълнителен</span>
                          </div>

                          {item.note && (
                            <p className="text-xs text-slate-600 dark:text-slate-300 pt-0.5 break-words">
                              {item.note}
                            </p>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center justify-between sm:justify-end gap-2 sm:gap-2.5 pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-100 dark:border-slate-800 shrink-0">
                        <span
                          className={`text-base sm:text-lg font-extrabold tabular-nums ${
                            isCompleted
                              ? "text-emerald-600 dark:text-emerald-400"
                              : "text-amber-700 dark:text-amber-300"
                          }`}
                        >
                          +€{Number(item.amount).toFixed(2)}
                        </span>

                        <div className="flex items-center gap-1">
                          <CompletionSwitch
                            checked={isCompleted}
                            onChange={(val) => handleToggleIncomeCompletion(entry, val)}
                            ariaLabel={`Изпълнено за ${item.categoryName}`}
                            size="sm"
                          />

                          <button
                            type="button"
                            onClick={() => handleOpenEditEntry(entry)}
                            className="min-h-[40px] min-w-[40px] sm:min-h-[34px] sm:min-w-[34px] flex items-center justify-center rounded-xl text-slate-500 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/50 transition-colors cursor-pointer"
                            title="Редактирай приход"
                            aria-label="Редактирай приход"
                          >
                            <Pencil className="w-4 h-4" />
                          </button>

                          <button
                            type="button"
                            onClick={() => setPendingDeleteEntry(entry)}
                            className="min-h-[40px] min-w-[40px] sm:min-h-[34px] sm:min-w-[34px] flex items-center justify-center rounded-xl text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/50 transition-colors cursor-pointer"
                            title="Изтрий приход"
                            aria-label="Изтрий приход"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Add / Edit Income Modal */}
      {isFormOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 dark:bg-black/80 backdrop-blur-xs p-2 sm:p-4 animate-in fade-in duration-150">
          <div
            className="bg-white dark:bg-slate-900 w-full max-w-lg rounded-2xl sm:rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col max-h-[92vh]"
            role="dialog"
            aria-modal="true"
            aria-labelledby="income-modal-title"
          >
            {/* Modal Header */}
            <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
              <h3
                id="income-modal-title"
                className="text-base sm:text-lg font-bold text-slate-900 dark:text-white"
              >
                {editingTemplateId
                  ? "Редакция на повтарящ се шаблон"
                  : editingEntry
                  ? "Редактирай приход"
                  : "Добави приход"}
              </h3>
              <button
                type="button"
                onClick={() => setIsFormOpen(false)}
                className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                aria-label="Затвори"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Form Body */}
            <form
              onSubmit={handleSaveForm}
              className="p-5 space-y-4 overflow-y-auto"
            >
              {formError && (
                <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 text-xs font-medium text-rose-700 dark:text-rose-300">
                  {formError}
                </div>
              )}

              {/* Amount */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                  Сума (€)
                </label>
                <input
                  type="text"
                  inputMode="decimal"
                  required
                  autoFocus
                  value={formAmount}
                  onChange={(e) => {
                    setFormAmount(sanitizeDecimalInput(e.target.value));
                    setFormError(null);
                  }}
                  placeholder="0.00"
                  className="w-full px-3.5 py-2.5 min-h-[44px] bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-base font-bold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500 tabular-nums"
                />
              </div>

              {/* Category Picker */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Категория
                  </label>
                  <button
                    type="button"
                    onClick={() => setShowCategoryPicker(true)}
                    className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 hover:underline cursor-pointer"
                  >
                    + Управление / Нова категория
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => setShowCategoryPicker(true)}
                  className="w-full min-h-[44px] flex items-center justify-between px-3.5 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl hover:border-emerald-400 transition-colors cursor-pointer text-left"
                >
                  {formCategory ? (
                    <span className="flex items-center gap-2.5 text-sm font-medium text-slate-800 dark:text-slate-100">
                      <span
                        className={`w-7 h-7 rounded-lg flex items-center justify-center ${getCategoryBadgeClasses(formCategory.colorClass)}`}
                      >
                        {renderCategoryIcon(formCategory.iconName, "w-4 h-4")}
                      </span>
                      <span>{formCategory.name}</span>
                    </span>
                  ) : (
                    <span className="text-sm text-slate-500 dark:text-slate-400">
                      Избери категория...
                    </span>
                  )}
                  <Tag className="w-4 h-4 text-slate-400" />
                </button>

                {/* Quick category chips for 1-tap selection */}
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {incomeCategories.slice(0, 9).map((cat) => {
                    const isSelected = formCategory?.id === cat.id;
                    return (
                      <button
                        key={cat.id}
                        type="button"
                        onClick={() => setFormCategory(cat)}
                        className={`px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-colors cursor-pointer whitespace-nowrap ${
                          isSelected
                            ? "bg-emerald-600 text-white border-emerald-600"
                            : "bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700"
                        }`}
                      >
                        {cat.name}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Date */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                  <span className="inline-flex items-center gap-1">
                    <Calendar className="w-3.5 h-3.5 text-slate-400" />
                    <span>
                      {editingTemplateId ? "Начална дата на шаблона" : "Дата"}
                    </span>
                  </span>
                </label>
                <input
                  type="date"
                  required
                  value={formDate}
                  onChange={(e) => {
                    const val = e.target.value;
                    setFormDate(val);
                    const d = new Date(val + "T12:00:00");
                    if (!isNaN(d.getTime())) {
                      setFormDayOfMonth(d.getDate());
                      setFormDayOfWeek(d.getDay());
                    }
                  }}
                  className="w-full px-3.5 py-2.5 min-h-[44px] bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              {/* Note */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                  Бележка
                </label>
                <input
                  type="text"
                  value={formNote}
                  onChange={(e) => setFormNote(e.target.value)}
                  placeholder="Напр. Месечна заплата, дивидент, наем..."
                  className="w-full px-3.5 py-2.5 min-h-[44px] bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              {/* Universal Repeat & Completion Controls (for regular Add / Edit Income) */}
              {(editingEntry || (!editingTemplateId && !formScheduleOnly)) && (
                <RecurrenceCompletionRows
                  repeat={formRepeat}
                  onRepeatChange={setFormRepeat}
                  completed={formCompleted}
                  onCompletedChange={setFormCompleted}
                  completedHint={
                    formIsGenerated
                      ? "Автоматично генериран повтарящ се приход"
                      : undefined
                  }
                />
              )}

              {/* Legacy Recurring Template Options (only when adding/editing a Template directly) */}
              {!editingEntry && (editingTemplateId || formScheduleOnly) && (
                <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 space-y-3">
                  <div className="flex items-center gap-1.5 text-sm font-semibold text-slate-800 dark:text-slate-100">
                    <Repeat className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                    <span>Настройки на повтарящ се шаблон</span>
                  </div>

                  <div className="space-y-3 pt-2 border-t border-slate-200/80 dark:border-slate-700">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-500 dark:text-slate-400 mb-1">
                          Честота
                        </label>
                        <select
                          value={formFrequency}
                          onChange={(e) =>
                            setFormFrequency(
                              e.target.value as RecurrenceFrequency
                            )
                          }
                          className="w-full px-3 py-2 min-h-[40px] bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg text-xs font-semibold text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                        >
                          <option value="monthly">Месечен (Monthly)</option>
                          <option value="weekly">Седмичен (Weekly)</option>
                          <option value="yearly">Годишен (Yearly)</option>
                        </select>
                      </div>

                      {formFrequency === "weekly" ? (
                        <div>
                          <label className="block text-[11px] font-semibold text-slate-500 dark:text-slate-400 mb-1">
                            Ден от седмицата
                          </label>
                          <select
                            value={formDayOfWeek}
                            onChange={(e) =>
                              setFormDayOfWeek(Number(e.target.value))
                            }
                            className="w-full px-3 py-2 min-h-[40px] bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg text-xs font-semibold text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                          >
                            {WEEKDAYS_BG.map((dayName, idx) => (
                              <option key={dayName} value={idx}>
                                {dayName}
                              </option>
                            ))}
                          </select>
                        </div>
                      ) : (
                        <div>
                          <label className="block text-[11px] font-semibold text-slate-500 dark:text-slate-400 mb-1">
                            Ден от месеца (1–31)
                          </label>
                          <input
                            type="number"
                            min={1}
                            max={31}
                            value={formDayOfMonth}
                            onChange={(e) =>
                              setFormDayOfMonth(
                                Math.min(
                                  31,
                                  Math.max(1, Number(e.target.value) || 1)
                                )
                              )
                            }
                            className="w-full px-3 py-2 min-h-[40px] bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg text-xs font-semibold text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500 tabular-nums"
                          />
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Actions */}
              <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsFormOpen(false)}
                  className="min-h-[44px] px-4 py-2 rounded-xl text-sm font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                >
                  Отказ
                </button>
                <button
                  type="submit"
                  className="min-h-[44px] px-5 py-2 rounded-xl text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 transition-colors shadow-xs cursor-pointer"
                >
                  {editingTemplateId
                    ? "Запази шаблон"
                    : editingEntry
                    ? "Запази промените"
                    : "Запази приход"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {pendingDeleteEntry && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 dark:bg-black/80 backdrop-blur-xs p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-sm w-full p-5 shadow-2xl border border-slate-200 dark:border-slate-800 space-y-4">
            <h3 className="text-base font-bold text-slate-900 dark:text-white">
              Изтриване на приход?
            </h3>
            <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300">
              Сигурни ли сте, че искате да изтриете{" "}
              <strong>{pendingDeleteEntry.item.categoryName}</strong> за{" "}
              <strong className="text-emerald-600 dark:text-emerald-400 tabular-nums">
                +€{pendingDeleteEntry.item.amount.toFixed(2)}
              </strong>
              ?
            </p>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setPendingDeleteEntry(null)}
                className="min-h-[40px] px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              >
                Отказ
              </button>
              <button
                type="button"
                onClick={handleConfirmDeleteEntry}
                className="min-h-[40px] px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold text-white bg-rose-600 hover:bg-rose-700 cursor-pointer"
              >
                Изтрий
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Category Picker Modal (Income Mode) */}
      {showCategoryPicker && (
        <CategoryPicker
          mode="income"
          categories={incomeCategories}
          onSelect={(cat) => {
            setFormCategory(cat);
            setShowCategoryPicker(false);
          }}
          onClose={() => setShowCategoryPicker(false)}
          onCategoriesChanged={(updated) => setIncomeCategories(updated)}
        />
      )}
    </div>
  );
};
