import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Zap,
  Calculator,
  Check,
  Sun,
  Moon,
  Lightbulb,
  Plug,
  FileText,
  Download,
  Plus,
  ExternalLink,
  History,
  ArrowRight,
  Calendar,
  PlusCircle,
  X,
} from 'lucide-react';
import { InputGroup } from '@/components/ui/InputGroup';
import {
  calculateElectricity,
  calculateSingleMeterElectricity,
} from '@/utils/calculations';
import { ElectricityInputs, ElectricityResults, ElectricityRecord, MonthlyRecord } from '@/types';
import { getCurrentMonthBulgarian, parseDecimalInput } from '@/utils/formatting';
import { ElectricityHistoryTab } from './ElectricityHistoryTab';
import {
  getStoredElectricityHistory,
  addElectricityRecord,
  deleteElectricityRecord,
  mergeElectricityHistoryWithManualExpenses,
  ELECTRICITY_UPDATED_EVENT,
  MONTHS_BG_LIST,
} from '@/utils/electricityStorage';
import {
  userStorage,
  STORAGE_BASE_ELECTRICITY_LAST,
} from '@/utils/userStorage';
import { getPageScrollTop, smoothScrollToTop } from '@/utils/scrollUtils';

const STORAGE_BASE_ELECTRICITY_SINGLE_LAST = 'ElectricitySingleLastReadings';

interface ManualElectricityExpensePayload {
  amount: number;
  month: string;
  year: string;
  note?: string;
  expenseId: string;
  createdAt: string;
  timestamp: number;
}

interface ElectricityTabProps {
  onAddToExpenses: (em1: number, em2?: number) => void;
  monthlyData?: Record<string, MonthlyRecord>;
  onAddManualElectricityExpense?: (entry: ManualElectricityExpensePayload) => void;
}

type ElectricitySubTab = 'single' | 'double' | 'history';

export const ElectricityTab: React.FC<ElectricityTabProps> = ({
  onAddToExpenses,
  monthlyData,
  onAddManualElectricityExpense,
}) => {
  const [activeSubTab, setActiveSubTab] = useState<ElectricitySubTab>('single');
  const [lastCalcMode, setLastCalcMode] = useState<'single' | 'double'>('single');
  const isFirstSubTabRenderRef = useRef(true);
  const [historyRecords, setHistoryRecords] = useState<ElectricityRecord[]>(() =>
    getStoredElectricityHistory()
  );

  useEffect(() => {
    if (isFirstSubTabRenderRef.current) {
      isFirstSubTabRenderRef.current = false;
      return;
    }
    if (getPageScrollTop() > 24) {
      smoothScrollToTop(190);
    }
  }, [activeSubTab]);

  // Month & Year for calculation record
  const currentMonthName = useCurrentMonthName();
  const currentYearStr = new Date().getFullYear().toString();
  const [calcMonth, setCalcMonth] = useState<string>(currentMonthName);
  const [calcYear, setCalcYear] = useState<string>(currentYearStr);
  const [calcNote, setCalcNote] = useState<string>('');

  const loadLastReadings = (storageKey: string): ElectricityInputs => {
    try {
      const saved = userStorage.getItem(storageKey);
      if (saved) {
        const parsed = JSON.parse(saved);
        return {
          oldT1: parsed.oldT1 ?? '',
          newT1: '',
          oldT2: parsed.oldT2 ?? '',
          newT2: '',
          priceT1: parsed.priceT1 ?? '0.15458',
          priceT2: parsed.priceT2 ?? '0.09226',
          invoiceTotal: parsed.invoiceTotal ?? '',
        };
      }
    } catch (e) {
      console.error("Failed to load last readings", e);
    }
    return {
      oldT1: '',
      newT1: '',
      oldT2: '',
      newT2: '',
      priceT1: '0.15458',
      priceT2: '0.09226',
      invoiceTotal: '',
    };
  };

  // Single-meter calculator state (Default tab: 1 Електромер)
  const [singleInputs, setSingleInputs] = useState<ElectricityInputs>(() =>
    loadLastReadings(STORAGE_BASE_ELECTRICITY_SINGLE_LAST)
  );
  const [singleLastCalculatedInputs, setSingleLastCalculatedInputs] =
    useState<ElectricityInputs | null>(null);
  const [singleShowAutoShiftNotice, setSingleShowAutoShiftNotice] = useState(false);
  const [singleResults, setSingleResults] = useState<ElectricityResults | null>(null);
  const [singleIsAdded, setSingleIsAdded] = useState(false);

  // Two-meter calculator state (2 Електромера - completely preserved)
  const [inputs, setInputs] = useState<ElectricityInputs>(() =>
    loadLastReadings(STORAGE_BASE_ELECTRICITY_LAST)
  );
  const [lastCalculatedInputs, setLastCalculatedInputs] =
    useState<ElectricityInputs | null>(null);
  const [showAutoShiftNotice, setShowAutoShiftNotice] = useState(false);
  const [results, setResults] = useState<ElectricityResults | null>(null);
  const [isAdded, setIsAdded] = useState(false);

  const isSingleMode = activeSubTab === 'single';
  const activeInputs = isSingleMode ? singleInputs : inputs;
  const setActiveInputs = isSingleMode ? setSingleInputs : setInputs;
  const activeLastCalculatedInputs = isSingleMode
    ? singleLastCalculatedInputs
    : lastCalculatedInputs;
  const activeShowAutoShiftNotice = isSingleMode
    ? singleShowAutoShiftNotice
    : showAutoShiftNotice;
  const activeResults = isSingleMode ? singleResults : results;
  const activeIsAdded = isSingleMode ? singleIsAdded : isAdded;

  // Manual Entry Modal State
  const [isManualModalOpen, setIsManualModalOpen] = useState(false);
  const [manualMonth, setManualMonth] = useState<string>(currentMonthName);
  const [manualYear, setManualYear] = useState<string>(currentYearStr);
  const [manualCost, setManualCost] = useState<string>('');
  const [manualConsumption, setManualConsumption] = useState<string>('');
  const [manualNote, setManualNote] = useState<string>('');
  const [manualError, setManualError] = useState<string | null>(null);

  // Refresh history & readings on mount, restore, account switch, or electricity updates
  useEffect(() => {
    const reload = () => {
      setHistoryRecords(getStoredElectricityHistory());
      setSingleInputs(loadLastReadings(STORAGE_BASE_ELECTRICITY_SINGLE_LAST));
      setSingleResults(null);
      setSingleIsAdded(false);
      setInputs(loadLastReadings(STORAGE_BASE_ELECTRICITY_LAST));
      setResults(null);
      setIsAdded(false);
    };
    const reloadHistoryOnly = () => {
      setHistoryRecords(getStoredElectricityHistory());
    };
    reload();
    window.addEventListener("homebudget:data-restored", reload);
    window.addEventListener("budgetflows:account-changed", reload);
    window.addEventListener(ELECTRICITY_UPDATED_EVENT, reloadHistoryOnly);
    return () => {
      window.removeEventListener("homebudget:data-restored", reload);
      window.removeEventListener("budgetflows:account-changed", reload);
      window.removeEventListener(ELECTRICITY_UPDATED_EVENT, reloadHistoryOnly);
    };
  }, []);

  const mergedHistoryRecords = useMemo(() => {
    return mergeElectricityHistoryWithManualExpenses(historyRecords, monthlyData);
  }, [historyRecords, monthlyData]);

  const handleCalculate = () => {
    if (isSingleMode) {
      const res = calculateSingleMeterElectricity(singleInputs);
      setSingleResults(res);
      setSingleLastCalculatedInputs({ ...singleInputs });
      setSingleIsAdded(false);

      if (res.isValid) {
        const oldT1Num = parseDecimalInput(singleInputs.oldT1) || 0;
        const oldT2Num = parseDecimalInput(singleInputs.oldT2) || 0;
        const newT1Num = parseDecimalInput(singleInputs.newT1) || 0;
        const newT2Num = parseDecimalInput(singleInputs.newT2) || 0;
        const priceT1Num = parseDecimalInput(singleInputs.priceT1) || 0;
        const priceT2Num = parseDecimalInput(singleInputs.priceT2) || 0;

        const unitPriceAvg =
          res.totalCons > 0 ? res.costEm1 / res.totalCons : priceT1Num;

        const newRecord: ElectricityRecord = {
          id: `elec_${Date.now()}`,
          createdAt: new Date().toISOString(),
          month: calcMonth,
          year: calcYear,
          periodLabel: `${calcMonth} ${calcYear}`,
          previousReading: oldT1Num + oldT2Num,
          prevT1: oldT1Num,
          prevT2: oldT2Num,
          currentReading: newT1Num + newT2Num,
          currT1: newT1Num,
          currT2: newT2Num,
          consumption: res.totalCons,
          consT1: res.consT1,
          consT2: res.consT2,
          priceT1: priceT1Num,
          priceT2: priceT2Num,
          unitPrice: unitPriceAvg,
          costEm1: res.costEm1,
          em2Remainder: 0,
          totalCost: Number(res.costEm1.toFixed(2)),
          note: calcNote.trim() || undefined,
          meterMode: 'single',
          source: 'calculator',
        };

        const updatedHistory = addElectricityRecord(newRecord);
        setHistoryRecords(updatedHistory);
      }

      if (singleInputs.newT1 || singleInputs.newT2) {
        const nextOldT1 = singleInputs.newT1 || singleInputs.oldT1;
        const nextOldT2 = singleInputs.newT2 || singleInputs.oldT2;

        try {
          userStorage.setItem(
            STORAGE_BASE_ELECTRICITY_SINGLE_LAST,
            JSON.stringify({
              oldT1: nextOldT1,
              oldT2: nextOldT2,
              priceT1: singleInputs.priceT1,
              priceT2: singleInputs.priceT2,
              invoiceTotal: singleInputs.invoiceTotal,
            })
          );
        } catch (e) {
          console.error("Failed to save single-meter last readings", e);
        }

        setSingleInputs((prev) => ({
          ...prev,
          oldT1: nextOldT1,
          newT1: '',
          oldT2: nextOldT2,
          newT2: '',
        }));

        setSingleShowAutoShiftNotice(true);
        setTimeout(() => setSingleShowAutoShiftNotice(false), 8000);
      }
      return;
    }

    const res = calculateElectricity(inputs);
    setResults(res);
    setLastCalculatedInputs({ ...inputs });
    setIsAdded(false);

    // If calculation is valid, automatically store every calculated electricity bill into history
    if (res.isValid) {
      const oldT1Num = parseDecimalInput(inputs.oldT1) || 0;
      const oldT2Num = parseDecimalInput(inputs.oldT2) || 0;
      const newT1Num = parseDecimalInput(inputs.newT1) || 0;
      const newT2Num = parseDecimalInput(inputs.newT2) || 0;
      const priceT1Num = parseDecimalInput(inputs.priceT1) || 0;
      const priceT2Num = parseDecimalInput(inputs.priceT2) || 0;
      const invoiceTotalNum =
        parseDecimalInput(inputs.invoiceTotal) || (res.costEm1 + res.em2Remainder);

      const unitPriceAvg =
        res.totalCons > 0
          ? res.costEm1 / res.totalCons
          : priceT1Num;

      const newRecord: ElectricityRecord = {
        id: `elec_${Date.now()}`,
        createdAt: new Date().toISOString(),
        month: calcMonth,
        year: calcYear,
        periodLabel: `${calcMonth} ${calcYear}`,
        previousReading: oldT1Num + oldT2Num,
        prevT1: oldT1Num,
        prevT2: oldT2Num,
        currentReading: newT1Num + newT2Num,
        currT1: newT1Num,
        currT2: newT2Num,
        consumption: res.totalCons,
        consT1: res.consT1,
        consT2: res.consT2,
        priceT1: priceT1Num,
        priceT2: priceT2Num,
        unitPrice: unitPriceAvg,
        costEm1: res.costEm1,
        em2Remainder: res.em2Remainder,
        totalCost: invoiceTotalNum,
        note: calcNote.trim() || undefined,
        meterMode: "double",
        source: "calculator",
      };

      // Save to localStorage history
      const updatedHistory = addElectricityRecord(newRecord);
      setHistoryRecords(updatedHistory);
    }

    // Save newT1 and newT2 and auto-shift into oldT1 and oldT2 for the next report
    if (inputs.newT1 || inputs.newT2) {
      const nextOldT1 = inputs.newT1 || inputs.oldT1;
      const nextOldT2 = inputs.newT2 || inputs.oldT2;

      try {
        userStorage.setItem(
          STORAGE_BASE_ELECTRICITY_LAST,
          JSON.stringify({
            oldT1: nextOldT1,
            oldT2: nextOldT2,
            priceT1: inputs.priceT1,
            priceT2: inputs.priceT2,
            invoiceTotal: inputs.invoiceTotal,
          })
        );
      } catch (e) {
        console.error("Failed to save last readings", e);
      }

      setInputs((prev) => ({
        ...prev,
        oldT1: nextOldT1,
        newT1: '',
        oldT2: nextOldT2,
        newT2: '',
      }));

      setShowAutoShiftNotice(true);
      setTimeout(() => setShowAutoShiftNotice(false), 8000);
    }
  };

  const handleDeleteHistoryRecord = (id: string) => {
    const updated = deleteElectricityRecord(id);
    setHistoryRecords(updated);
  };

  const handleOpenManualModal = () => {
    setManualMonth(calcMonth || currentMonthName);
    setManualYear(calcYear || currentYearStr);
    setManualCost('');
    setManualConsumption('');
    setManualNote('');
    setManualError(null);
    setIsManualModalOpen(true);
  };

  const handleSaveManualEntry = (e: React.FormEvent) => {
    e.preventDefault();
    const parsedCost = parseDecimalInput(manualCost);
    if (isNaN(parsedCost) || parsedCost <= 0) {
      setManualError('Моля, въведете валидна сума по-голяма от 0.');
      return;
    }

    const parsedCons = manualConsumption.trim()
      ? parseDecimalInput(manualConsumption)
      : 0;
    if (manualConsumption.trim() && (isNaN(parsedCons) || parsedCons < 0)) {
      setManualError('Моля, въведете валидна консумация (kWh) или оставете празно.');
      return;
    }

    const safeCons = isNaN(parsedCons) || parsedCons < 0 ? 0 : parsedCons;
    const safeYear = manualYear.trim() || currentYearStr;
    const nowMs = Date.now();
    const nowIso = new Date(nowMs).toISOString();
    const expenseId = `elec_manual_exp_${nowMs}`;

    const newRecord: ElectricityRecord = {
      id: `elec_exp_${expenseId}`,
      createdAt: nowIso,
      month: manualMonth,
      year: safeYear,
      periodLabel: `${manualMonth} ${safeYear}`,
      previousReading: 0,
      prevT1: 0,
      prevT2: 0,
      currentReading: 0,
      currT1: 0,
      currT2: 0,
      consumption: safeCons,
      consT1: 0,
      consT2: 0,
      priceT1: 0,
      priceT2: 0,
      unitPrice: safeCons > 0 ? parsedCost / safeCons : 0,
      costEm1: 0,
      em2Remainder: 0,
      totalCost: Number(parsedCost.toFixed(2)),
      note: manualNote.trim() || 'Ръчен запис (Ток)',
      source: 'manual',
      sourceExpenseId: expenseId,
    };

    const updatedHistory = addElectricityRecord(newRecord);
    setHistoryRecords(updatedHistory);

    onAddManualElectricityExpense?.({
      amount: Number(parsedCost.toFixed(2)),
      month: manualMonth,
      year: safeYear,
      note: manualNote.trim() || 'Ръчен запис (Ток)',
      expenseId,
      createdAt: nowIso,
      timestamp: nowMs,
    });

    setIsManualModalOpen(false);
    setActiveSubTab('history');
  };

  const handleAddToExpenses = () => {
    if (!activeResults || !activeResults.isValid) return;
    if (isSingleMode) {
      onAddToExpenses(activeResults.costEm1);
      setSingleIsAdded(true);
      setTimeout(() => setSingleIsAdded(false), 3000);
    } else {
      onAddToExpenses(activeResults.costEm1, activeResults.em2Remainder);
      setIsAdded(true);
      setTimeout(() => setIsAdded(false), 3000);
    }
  };

  const handleDownloadCalculations = () => {
    if (!activeResults) return;
    const calcInputs = activeLastCalculatedInputs || activeInputs;

    const content = isSingleMode
      ? `
КАЛКУЛАЦИИ ЗА ЕЛЕКТРОЕНЕРГИЯ (1 ЕЛЕКТРОМЕР)
-------------------------------------------
Дата: ${new Date().toLocaleDateString('bg-BG')}
Период: ${calcMonth} ${calcYear}

ВХОДНИ ДАННИ:
Старо Т1: ${calcInputs.oldT1}
Ново Т1:  ${calcInputs.newT1}
Старо Т2: ${calcInputs.oldT2}
Ново Т2:  ${calcInputs.newT2}

ЦЕНИ (с ДДС):
Дневна тарифа (Т1): €${calcInputs.priceT1} / kWh
Нощна тарифа (Т2):  €${calcInputs.priceT2} / kWh

ИЗЧИСЛЕНИЯ:
1. Консумация
   Т1 (Дневна) = ${calcInputs.newT1} - ${calcInputs.oldT1} = ${activeResults.consT1.toFixed(3)} kWh
   Т2 (Нощна)  = ${calcInputs.newT2} - ${calcInputs.oldT2} = ${activeResults.consT2.toFixed(3)} kWh
   Обща консумация = ${activeResults.totalCons.toFixed(3)} kWh

2. Стойност
   (Т1 * Цена) + (Т2 * Цена)
   (${activeResults.consT1.toFixed(3)} * ${calcInputs.priceT1}) + (${activeResults.consT2.toFixed(3)} * ${calcInputs.priceT2})
   = €${activeResults.costEm1.toFixed(2)}

-------------------------------------------
КРАЙНА СУМА:
Сметка ток: €${activeResults.costEm1.toFixed(2)}
-------------------------------------------
    `.trim()
      : `
КАЛКУЛАЦИИ ЗА ЕЛЕКТРОЕНЕРГИЯ
---------------------------
Дата: ${new Date().toLocaleDateString('bg-BG')}
Период: ${calcMonth} ${calcYear}

ВХОДНИ ДАННИ:
Старо Т1: ${calcInputs.oldT1}
Ново Т1:  ${calcInputs.newT1}
Старо Т2: ${calcInputs.oldT2}
Ново Т2:  ${calcInputs.newT2}

ЦЕНИ (с ДДС):
Дневна тарифа (Т1): €${calcInputs.priceT1} / kWh
Нощна тарифа (Т2):  €${calcInputs.priceT2} / kWh
Обща сума по фактура: €${calcInputs.invoiceTotal}

ИЗЧИСЛЕНИЯ:
1. Консумация
   Т1 (Дневна) = ${calcInputs.newT1} - ${calcInputs.oldT1} = ${activeResults.consT1.toFixed(3)} kWh
   Т2 (Нощна)  = ${calcInputs.newT2} - ${calcInputs.oldT2} = ${activeResults.consT2.toFixed(3)} kWh
   Общо Електромер 1 = ${activeResults.totalCons.toFixed(3)} kWh

2. Стойност Електромер 1
   (Т1 * Цена) + (Т2 * Цена)
   (${activeResults.consT1.toFixed(3)} * ${calcInputs.priceT1}) + (${activeResults.consT2.toFixed(3)} * ${calcInputs.priceT2})
   = €${activeResults.costEm1.toFixed(2)}

3. Стойност Електромер 2 (Остатък)
   Фактура - Електромер 1
   ${calcInputs.invoiceTotal} - ${activeResults.costEm1.toFixed(2)}
   = €${activeResults.em2Remainder.toFixed(2)}

---------------------------
КРАЙНИ СУМИ:
Сметка Електромер 1: €${activeResults.costEm1.toFixed(2)}
Сметка Електромер 2: €${activeResults.em2Remainder.toFixed(2)}
---------------------------
    `.trim();

    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Calculations_${calcMonth}_${calcYear}.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Sub-tab Navigation */}
      <div className="flex flex-wrap border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 rounded-xl shadow-sm p-1.5 gap-2 transition-colors">
        <button
          onClick={() => {
            setActiveSubTab('single');
            setLastCalcMode('single');
          }}
          className={`flex-1 sm:flex-none flex items-center justify-center gap-2 py-2.5 px-4 sm:px-5 rounded-lg font-bold text-xs sm:text-sm transition-all cursor-pointer ${
            activeSubTab === 'single'
              ? 'bg-yellow-500 text-slate-950 shadow-sm'
              : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800'
          }`}
        >
          <Calculator className="w-4 h-4 shrink-0" />
          <span>1 Електромер</span>
        </button>

        <button
          onClick={() => {
            setActiveSubTab('double');
            setLastCalcMode('double');
          }}
          className={`flex-1 sm:flex-none flex items-center justify-center gap-2 py-2.5 px-4 sm:px-5 rounded-lg font-bold text-xs sm:text-sm transition-all cursor-pointer ${
            activeSubTab === 'double'
              ? 'bg-yellow-500 text-slate-950 shadow-sm'
              : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800'
          }`}
        >
          <Calculator className="w-4 h-4 shrink-0" />
          <span>2 Електромера</span>
        </button>

        <button
          onClick={() => setActiveSubTab('history')}
          className={`flex-1 sm:flex-none flex items-center justify-center gap-2 py-2.5 px-4 sm:px-5 rounded-lg font-bold text-xs sm:text-sm transition-all cursor-pointer ${
            activeSubTab === 'history'
              ? 'bg-yellow-500 text-slate-950 shadow-sm'
              : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800'
          }`}
        >
          <History className="w-4 h-4 shrink-0" />
          <span>История на тока</span>
          {mergedHistoryRecords.length > 0 && (
            <span
              className={`text-xs px-2 py-0.5 rounded-full font-bold ml-1 ${
                activeSubTab === 'history'
                  ? 'bg-slate-950/15 text-slate-950'
                  : 'bg-yellow-100 dark:bg-yellow-950/60 text-yellow-800 dark:text-yellow-300'
              }`}
            >
              {mergedHistoryRecords.length}
            </span>
          )}
        </button>
      </div>

      {/* Calculator View: 1 Електромер (default) & 2 Електромера (current calculator preserved) */}
      {(activeSubTab === 'single' || activeSubTab === 'double') && (
        <div className="bg-white dark:bg-slate-900 p-6 rounded-xl shadow-md border border-yellow-100 dark:border-slate-800 transition-colors">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6 pb-4 border-b border-slate-100 dark:border-slate-800">
            <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
              <Zap className="w-6 h-6 text-yellow-500" />
              {isSingleMode
                ? 'Електроенергия Калкулатор — 1 Електромер'
                : 'Електроенергия Калкулатор — 2 Електромера'}
            </h2>
            <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto">
              <button
                type="button"
                onClick={handleOpenManualModal}
                className="text-xs font-semibold text-amber-800 dark:text-amber-200 hover:bg-amber-100 dark:hover:bg-amber-900/60 bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-800 px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <PlusCircle className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                Ръчен запис (без показания)
              </button>
              <button
                onClick={() => setActiveSubTab('history')}
                className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-300 flex items-center gap-1.5 bg-indigo-50 dark:bg-indigo-950/60 px-3 py-1.5 rounded-lg transition-colors cursor-pointer"
              >
                <History className="w-4 h-4" />
                Преглед на историята ({mergedHistoryRecords.length})
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Inputs Column */}
            <div className="space-y-4">
              <div className="flex gap-2 mb-2">
                <a
                  href="https://evn.bg/Home/Electricity.aspx"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 flex items-center justify-center gap-2 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 py-2 rounded-lg text-xs font-bold hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors border border-slate-200 dark:border-slate-700"
                >
                  EVN Цени <ExternalLink className="w-3 h-3" />
                </a>
                <a
                  href="https://onlineplus.evn.bg/account/login?ReturnUrl=%2Fopeninvoices"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 flex items-center justify-center gap-2 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 py-2 rounded-lg text-xs font-bold hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors border border-slate-200 dark:border-slate-700"
                >
                  Проверка сметка <ExternalLink className="w-3 h-3" />
                </a>
              </div>

              {/* Period selection for this calculation */}
              <div className="p-3 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-lg space-y-2">
                <div className="flex items-center gap-1.5 text-xs font-bold text-slate-600 dark:text-slate-300 uppercase tracking-wide">
                  <Calendar className="w-3.5 h-3.5 text-yellow-500" />
                  <span>Период на отчета</span>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1 block">Месец</label>
                    <select
                      value={calcMonth}
                      onChange={(e) => setCalcMonth(e.target.value)}
                      className="w-full text-xs font-semibold bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg px-2.5 py-1.5 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-yellow-500/20"
                    >
                      {MONTHS_BG_LIST.map((m) => (
                        <option key={m} value={m}>
                          {m}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1 block">Година</label>
                    <input
                      type="number"
                      value={calcYear}
                      onChange={(e) => setCalcYear(e.target.value)}
                      className="w-full text-xs font-semibold bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg px-2.5 py-1.5 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-yellow-500/20"
                    />
                  </div>
                </div>
              </div>

              <h3 className="font-semibold text-slate-700 dark:text-slate-200 border-b border-slate-200 dark:border-slate-800 pb-2">Въвеждане на данни</h3>

              <div className="grid grid-cols-2 gap-4">
                <InputGroup
                  label="Старо Т1"
                  value={activeInputs.oldT1}
                  onChange={(v) => setActiveInputs((prev) => ({ ...prev, oldT1: v }))}
                />
                <InputGroup
                  label="Ново Т1"
                  value={activeInputs.newT1}
                  onChange={(v) => setActiveInputs((prev) => ({ ...prev, newT1: v }))}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <InputGroup
                  label="Старо Т2"
                  value={activeInputs.oldT2}
                  onChange={(v) => setActiveInputs((prev) => ({ ...prev, oldT2: v }))}
                />
                <InputGroup
                  label="Ново Т2"
                  value={activeInputs.newT2}
                  onChange={(v) => setActiveInputs((prev) => ({ ...prev, newT2: v }))}
                />
              </div>

              <div className="grid grid-cols-2 gap-4 pt-2">
                <InputGroup
                  label="Цена Т1 (Дневна, €/kWh)"
                  value={activeInputs.priceT1}
                  onChange={(v) => setActiveInputs((prev) => ({ ...prev, priceT1: v }))}
                />
                <InputGroup
                  label="Цена Т2 (Нощна, €/kWh)"
                  value={activeInputs.priceT2}
                  onChange={(v) => setActiveInputs((prev) => ({ ...prev, priceT2: v }))}
                />
              </div>

              <div className="pt-2">
                <InputGroup
                  label="Обща сума по фактура (€)"
                  value={activeInputs.invoiceTotal}
                  onChange={(v) => setActiveInputs((prev) => ({ ...prev, invoiceTotal: v }))}
                  placeholder={isSingleMode ? "по избор" : undefined}
                />
              </div>

              {/* Optional note */}
              <div>
                <label className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1 block">
                  Забележка (по избор)
                </label>
                <input
                  type="text"
                  placeholder="напр. Редовен месечен отчет, климатици..."
                  value={calcNote}
                  onChange={(e) => setCalcNote(e.target.value)}
                  className="w-full text-xs bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 text-slate-700 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-yellow-500/20"
                />
              </div>

              <button
                onClick={handleCalculate}
                className="w-full mt-4 bg-yellow-500 text-slate-950 py-3 rounded-lg font-bold hover:bg-yellow-400 transition-colors flex items-center justify-center gap-2 shadow-sm cursor-pointer"
              >
                <Calculator className="w-5 h-5" />
                Изчисли и запиши в историята
              </button>

              {activeShowAutoShiftNotice && (
                <div className="p-3 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-200 border border-emerald-200 dark:border-emerald-800 rounded-lg text-xs font-medium space-y-2 animate-in fade-in duration-200">
                  <div className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                    <span>
                      Сметката беше изчислена и <strong>автоматично запазена в История на тока</strong>!
                    </span>
                  </div>
                  <div className="flex items-center justify-between pt-1 border-t border-emerald-200/60 dark:border-emerald-800/60">
                    <span className="text-[11px] text-emerald-700 dark:text-emerald-300">
                      Показанията от Ново Т1/Т2 бяха прехвърлени в Старо Т1/Т2.
                    </span>
                    <button
                      onClick={() => setActiveSubTab('history')}
                      className="text-xs font-bold text-emerald-800 dark:text-emerald-300 hover:text-emerald-950 dark:hover:text-emerald-100 underline flex items-center gap-1 cursor-pointer"
                    >
                      Към историята <ArrowRight className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Results Column */}
            <div className="flex flex-col h-full">
              <h3 className="font-semibold text-slate-700 dark:text-slate-200 border-b border-slate-200 dark:border-slate-800 pb-2 mb-4">Резултати</h3>

              {activeResults ? (
                <div className="flex-1 bg-slate-900 rounded-2xl p-6 text-white shadow-xl flex flex-col gap-6">
                  {/* Header */}
                  <div className="flex items-center justify-between border-b border-slate-700 pb-4">
                    <div className="flex items-center gap-2">
                      <Zap className="w-6 h-6 text-yellow-400" />
                      <div>
                        <h3 className="text-lg font-bold text-yellow-400 leading-none">Сметка ТОК</h3>
                        <p className="text-xs text-slate-400 uppercase mt-1">
                          ({calcMonth} {calcYear})
                        </p>
                      </div>
                    </div>
                    <span className="text-xs px-2.5 py-1 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 font-semibold">
                      Записан в история
                    </span>
                  </div>

                  {!activeResults.isValid ? (
                    <div className="text-red-400 bg-red-900/20 p-4 rounded-lg border border-red-800/50 text-sm">
                      {activeResults.errors.map((e, i) => (
                        <p key={i}>• {e}</p>
                      ))}
                    </div>
                  ) : (
                    <>
                      {/* Consumption List */}
                      <div className="space-y-3 text-sm">
                        <div className="flex justify-between items-center">
                          <div className="flex items-center gap-2 text-slate-300">
                            <Sun className="w-4 h-4 text-amber-400" />
                            <span>Консумация Т1 (дневна):</span>
                          </div>
                          <span className="font-mono font-bold">{activeResults.consT1.toFixed(3)} kWh</span>
                        </div>
                        <div className="flex justify-between items-center">
                          <div className="flex items-center gap-2 text-slate-300">
                            <Moon className="w-4 h-4 text-indigo-400" />
                            <span>Консумация Т2 (нощна):</span>
                          </div>
                          <span className="font-mono font-bold">{activeResults.consT2.toFixed(3)} kWh</span>
                        </div>
                        <div className="flex justify-between items-center pt-2 border-t border-slate-700/50">
                          <div className="flex items-center gap-2 text-white font-medium">
                            <Zap className="w-4 h-4 text-yellow-400" />
                            <span>{isSingleMode ? 'Обща консумация:' : 'Общо електромер 1:'}</span>
                          </div>
                          <span className="font-mono font-bold text-yellow-400">
                            {activeResults.totalCons.toFixed(3)} kWh
                          </span>
                        </div>
                      </div>

                      {/* Cards */}
                      <div className="space-y-3">
                        {/* Cost Card (Single meter: Сметка ток / Two meters: Сметка електромер 1) */}
                        <div className="bg-slate-800/50 border border-slate-700 p-4 rounded-xl flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <Lightbulb className="w-6 h-6 text-yellow-200" />
                            <span className="text-sm font-medium text-slate-200">
                              {isSingleMode ? 'Сметка ток:' : 'Сметка електромер 1:'}
                            </span>
                          </div>
                          <span className="text-2xl font-bold text-white">
                            €{activeResults.costEm1.toFixed(2)}
                          </span>
                        </div>

                        {/* EM2 Card (ONLY for 2 meters) */}
                        {!isSingleMode && (
                          <div className="bg-emerald-900/30 border border-emerald-800/50 p-4 rounded-xl flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              <Plug className="w-6 h-6 text-emerald-400" />
                              <span className="text-sm font-medium text-emerald-100">
                                Сметка електромер 2:
                              </span>
                            </div>
                            <span className="text-2xl font-bold text-emerald-400">
                              €{activeResults.em2Remainder.toFixed(2)}
                            </span>
                          </div>
                        )}
                      </div>

                      {/* Invoice Total (ONLY for 2 meters) */}
                      {!isSingleMode && (
                        <div className="flex justify-between items-center px-2">
                          <div className="flex items-center gap-2 text-slate-400 text-sm">
                            <FileText className="w-4 h-4" />
                            <span>Обща сума по фактурата:</span>
                          </div>
                          <span className="font-bold text-lg text-white">
                            €{(parseDecimalInput(inputs.invoiceTotal || '0') || 0).toFixed(2)}
                          </span>
                        </div>
                      )}

                      {/* Actions */}
                      <div className="space-y-3 mt-auto pt-4">
                        <button
                          onClick={handleAddToExpenses}
                          disabled={activeIsAdded}
                          className={`w-full py-3 rounded-xl font-bold transition-all flex items-center justify-center gap-2 shadow-lg cursor-pointer ${
                            activeIsAdded
                              ? 'bg-green-600 text-white transform scale-[0.98]'
                              : 'bg-emerald-600 text-white hover:bg-emerald-500 hover:translate-y-[-1px]'
                          }`}
                        >
                          {activeIsAdded ? (
                            <>
                              <Check className="w-5 h-5" />
                              Добавено към разходи!
                            </>
                          ) : (
                            <>
                              <Plus className="w-5 h-5" />
                              Добави към разходи
                            </>
                          )}
                        </button>

                        <button
                          onClick={handleDownloadCalculations}
                          className="w-full py-3 bg-slate-800 text-slate-300 border border-slate-700 rounded-xl font-medium hover:bg-slate-700 hover:text-white transition-all flex items-center justify-center gap-2 cursor-pointer"
                        >
                          <Download className="w-5 h-5" />
                          Калкулации (.txt)
                        </button>
                      </div>
                    </>
                  )}
                </div>
              ) : (
                <div className="h-full min-h-[400px] bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-700 border-dashed flex flex-col items-center justify-center text-slate-500 dark:text-slate-300 gap-3 px-4">
                  <div className="p-4 bg-white dark:bg-slate-800 rounded-full shadow-sm border border-slate-100 dark:border-slate-700">
                    <Calculator className="w-8 h-8 text-slate-400 dark:text-slate-400" />
                  </div>
                  <p className="text-sm font-medium text-slate-600 dark:text-slate-200">Въведете данни и натиснете Изчисли</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 text-center max-w-xs">
                    Всеки изчислен отчет автоматично ще се запази в историята на тока с пълна статистика.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Tab 3: Electricity History */}
      {activeSubTab === 'history' && (
        <ElectricityHistoryTab
          records={mergedHistoryRecords}
          onDeleteRecord={handleDeleteHistoryRecord}
          onSwitchToCalculator={() => setActiveSubTab(lastCalcMode)}
          onOpenManualEntry={handleOpenManualModal}
        />
      )}

      {/* Manual Electricity Entry Modal */}
      {isManualModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 dark:bg-black/75 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-md w-full shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-amber-50 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 rounded-xl">
                  <Zap className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 dark:text-white text-base">
                    Ръчен запис за ток
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Добавя се към Разходи и История на тока
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsManualModalOpen(false)}
                className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveManualEntry} className="p-5 space-y-4">
              {manualError && (
                <div className="p-3 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 text-xs rounded-xl font-medium">
                  {manualError}
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1 block">
                    Месец
                  </label>
                  <select
                    value={manualMonth}
                    onChange={(e) => setManualMonth(e.target.value)}
                    className="w-full text-sm font-medium bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-slate-800 dark:text-slate-100 outline-none focus:ring-2 focus:ring-yellow-500/30"
                  >
                    {MONTHS_BG_LIST.map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1 block">
                    Година
                  </label>
                  <input
                    type="number"
                    value={manualYear}
                    onChange={(e) => setManualYear(e.target.value)}
                    className="w-full text-sm font-medium bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-slate-800 dark:text-slate-100 outline-none focus:ring-2 focus:ring-yellow-500/30"
                  />
                </div>
              </div>

              <InputGroup
                label="Сума на сметката (€)"
                value={manualCost}
                onChange={(v) => {
                  setManualCost(v);
                  setManualError(null);
                }}
                placeholder="0.00"
              />

              <InputGroup
                label="Консумация kWh (опционално)"
                value={manualConsumption}
                onChange={(v) => {
                  setManualConsumption(v);
                  setManualError(null);
                }}
                placeholder="напр. 320"
              />

              <div>
                <label className="text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1 block">
                  Бележка (опционално)
                </label>
                <input
                  type="text"
                  value={manualNote}
                  onChange={(e) => setManualNote(e.target.value)}
                  placeholder="напр. Месечна фактура EVN"
                  className="w-full text-sm bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2.5 text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-yellow-500/30"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsManualModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl cursor-pointer"
                >
                  Отказ
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-xs font-bold text-slate-950 bg-yellow-500 hover:bg-yellow-400 rounded-xl shadow-xs flex items-center gap-1.5 cursor-pointer"
                >
                  <Check className="w-4 h-4" />
                  Запази в Разходи и История
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

function useCurrentMonthName(): string {
  const [monthName, setMonthName] = useState("Ноември");
  useEffect(() => {
    const raw = getCurrentMonthBulgarian(); // e.g. "Ноември 2026"
    const firstWord = raw.split(" ")[0];
    if (firstWord) {
      setMonthName(firstWord);
    }
  }, []);
  return monthName;
}
