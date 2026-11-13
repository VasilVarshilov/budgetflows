import React, { useState, useEffect } from 'react';
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
} from 'lucide-react';
import { InputGroup } from '@/components/ui/InputGroup';
import { calculateElectricity } from '@/utils/calculations';
import { ElectricityInputs, ElectricityResults, ElectricityRecord } from '@/types';
import { getCurrentMonthBulgarian } from '@/utils/formatting';
import { ElectricityHistoryTab } from './ElectricityHistoryTab';
import {
  getStoredElectricityHistory,
  addElectricityRecord,
  deleteElectricityRecord,
  MONTHS_BG_LIST,
} from '@/utils/electricityStorage';
import {
  userStorage,
  STORAGE_BASE_ELECTRICITY_LAST,
} from '@/utils/userStorage';

interface ElectricityTabProps {
  onAddToExpenses: (em1: number, em2: number) => void;
}

export const ElectricityTab: React.FC<ElectricityTabProps> = ({ onAddToExpenses }) => {
  const [activeSubTab, setActiveSubTab] = useState<'calculator' | 'history'>('calculator');
  const [historyRecords, setHistoryRecords] = useState<ElectricityRecord[]>(() =>
    getStoredElectricityHistory()
  );

  // Month & Year for calculation record
  const currentMonthName = useCurrentMonthName();
  const currentYearStr = new Date().getFullYear().toString();
  const [calcMonth, setCalcMonth] = useState<string>(currentMonthName);
  const [calcYear, setCalcYear] = useState<string>(currentYearStr);
  const [calcNote, setCalcNote] = useState<string>('');

  const loadLastReadings = (): ElectricityInputs => {
    try {
      const saved = userStorage.getItem(STORAGE_BASE_ELECTRICITY_LAST);
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

  const [inputs, setInputs] = useState<ElectricityInputs>(() => loadLastReadings());

  const [lastCalculatedInputs, setLastCalculatedInputs] = useState<ElectricityInputs | null>(null);
  const [showAutoShiftNotice, setShowAutoShiftNotice] = useState(false);
  const [results, setResults] = useState<ElectricityResults | null>(null);
  const [isAdded, setIsAdded] = useState(false);

  // Refresh history & readings on mount, restore, or account switch
  useEffect(() => {
    const reload = () => {
      setHistoryRecords(getStoredElectricityHistory());
      setInputs(loadLastReadings());
      setResults(null);
      setIsAdded(false);
    };
    reload();
    window.addEventListener("homebudget:data-restored", reload);
    window.addEventListener("budgetflows:account-changed", reload);
    return () => {
      window.removeEventListener("homebudget:data-restored", reload);
      window.removeEventListener("budgetflows:account-changed", reload);
    };
  }, []);

  const handleCalculate = () => {
    const res = calculateElectricity(inputs);
    setResults(res);
    setLastCalculatedInputs({ ...inputs });
    setIsAdded(false);

    // If calculation is valid, automatically store every calculated electricity bill into history
    if (res.isValid) {
      const oldT1Num = parseFloat(inputs.oldT1) || 0;
      const oldT2Num = parseFloat(inputs.oldT2) || 0;
      const newT1Num = parseFloat(inputs.newT1) || 0;
      const newT2Num = parseFloat(inputs.newT2) || 0;
      const priceT1Num = parseFloat(inputs.priceT1) || 0;
      const priceT2Num = parseFloat(inputs.priceT2) || 0;
      const invoiceTotalNum =
        parseFloat(inputs.invoiceTotal) || (res.costEm1 + res.em2Remainder);

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

  const handleAddToExpenses = () => {
    if (results && results.isValid) {
      onAddToExpenses(results.costEm1, results.em2Remainder);
      setIsAdded(true);
      setTimeout(() => setIsAdded(false), 3000);
    }
  };

  const handleDownloadCalculations = () => {
    if (!results) return;
    const calcInputs = lastCalculatedInputs || inputs;

    const content = `
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
   Т1 (Дневна) = ${calcInputs.newT1} - ${calcInputs.oldT1} = ${results.consT1.toFixed(3)} kWh
   Т2 (Нощна)  = ${calcInputs.newT2} - ${calcInputs.oldT2} = ${results.consT2.toFixed(3)} kWh
   Общо Електромер 1 = ${results.totalCons.toFixed(3)} kWh

2. Стойност Електромер 1
   (Т1 * Цена) + (Т2 * Цена)
   (${results.consT1.toFixed(3)} * ${calcInputs.priceT1}) + (${results.consT2.toFixed(3)} * ${calcInputs.priceT2})
   = €${results.costEm1.toFixed(2)}

3. Стойност Електромер 2 (Остатък)
   Фактура - Електромер 1
   ${calcInputs.invoiceTotal} - ${results.costEm1.toFixed(2)}
   = €${results.em2Remainder.toFixed(2)}

---------------------------
КРАЙНИ СУМИ:
Сметка Електромер 1: €${results.costEm1.toFixed(2)}
Сметка Електромер 2: €${results.em2Remainder.toFixed(2)}
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
      <div className="flex border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 rounded-xl shadow-sm p-1.5 gap-2 transition-colors">
        <button
          onClick={() => setActiveSubTab('calculator')}
          className={`flex-1 sm:flex-none flex items-center justify-center gap-2 py-2.5 px-5 rounded-lg font-bold text-sm transition-all ${
            activeSubTab === 'calculator'
              ? 'bg-yellow-500 text-slate-950 shadow-sm'
              : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800'
          }`}
        >
          <Calculator className="w-4 h-4" />
          <span>Калкулатор</span>
        </button>

        <button
          onClick={() => setActiveSubTab('history')}
          className={`flex-1 sm:flex-none flex items-center justify-center gap-2 py-2.5 px-5 rounded-lg font-bold text-sm transition-all ${
            activeSubTab === 'history'
              ? 'bg-yellow-500 text-slate-950 shadow-sm'
              : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800'
          }`}
        >
          <History className="w-4 h-4" />
          <span>История на тока</span>
          {historyRecords.length > 0 && (
            <span
              className={`text-xs px-2 py-0.5 rounded-full font-bold ml-1 ${
                activeSubTab === 'history'
                  ? 'bg-slate-950/15 text-slate-950'
                  : 'bg-yellow-100 dark:bg-yellow-950/60 text-yellow-800 dark:text-yellow-300'
              }`}
            >
              {historyRecords.length}
            </span>
          )}
        </button>
      </div>

      {/* Tab 1: Calculator */}
      {activeSubTab === 'calculator' && (
        <div className="bg-white dark:bg-slate-900 p-6 rounded-xl shadow-md border border-yellow-100 dark:border-slate-800 transition-colors">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6 pb-4 border-b border-slate-100 dark:border-slate-800">
            <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
              <Zap className="w-6 h-6 text-yellow-500" />
              Електроенергия Калкулатор
            </h2>
            <button
              onClick={() => setActiveSubTab('history')}
              className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-300 flex items-center gap-1.5 self-start sm:self-auto bg-indigo-50 dark:bg-indigo-950/60 px-3 py-1.5 rounded-lg transition-colors"
            >
              <History className="w-4 h-4" />
              Преглед на историята ({historyRecords.length})
            </button>
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
                  value={inputs.oldT1}
                  onChange={(v) => setInputs((prev) => ({ ...prev, oldT1: v }))}
                />
                <InputGroup
                  label="Ново Т1"
                  value={inputs.newT1}
                  onChange={(v) => setInputs((prev) => ({ ...prev, newT1: v }))}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <InputGroup
                  label="Старо Т2"
                  value={inputs.oldT2}
                  onChange={(v) => setInputs((prev) => ({ ...prev, oldT2: v }))}
                />
                <InputGroup
                  label="Ново Т2"
                  value={inputs.newT2}
                  onChange={(v) => setInputs((prev) => ({ ...prev, newT2: v }))}
                />
              </div>

              <div className="grid grid-cols-2 gap-4 pt-2">
                <InputGroup
                  label="Цена Т1 (Дневна)"
                  value={inputs.priceT1}
                  onChange={(v) => setInputs((prev) => ({ ...prev, priceT1: v }))}
                />
                <InputGroup
                  label="Цена Т2 (Нощна)"
                  value={inputs.priceT2}
                  onChange={(v) => setInputs((prev) => ({ ...prev, priceT2: v }))}
                />
              </div>

              <div className="pt-2">
                <InputGroup
                  label="Обща сума по фактура (€)"
                  value={inputs.invoiceTotal}
                  onChange={(v) => setInputs((prev) => ({ ...prev, invoiceTotal: v }))}
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

              {showAutoShiftNotice && (
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

              {results ? (
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

                  {!results.isValid ? (
                    <div className="text-red-400 bg-red-900/20 p-4 rounded-lg border border-red-800/50 text-sm">
                      {results.errors.map((e, i) => (
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
                          <span className="font-mono font-bold">{results.consT1.toFixed(3)} kWh</span>
                        </div>
                        <div className="flex justify-between items-center">
                          <div className="flex items-center gap-2 text-slate-300">
                            <Moon className="w-4 h-4 text-indigo-400" />
                            <span>Консумация Т2 (нощна):</span>
                          </div>
                          <span className="font-mono font-bold">{results.consT2.toFixed(3)} kWh</span>
                        </div>
                        <div className="flex justify-between items-center pt-2 border-t border-slate-700/50">
                          <div className="flex items-center gap-2 text-white font-medium">
                            <Zap className="w-4 h-4 text-yellow-400" />
                            <span>Общо електромер 1:</span>
                          </div>
                          <span className="font-mono font-bold text-yellow-400">
                            {results.totalCons.toFixed(3)} kWh
                          </span>
                        </div>
                      </div>

                      {/* Cards */}
                      <div className="space-y-3">
                        {/* EM1 Card */}
                        <div className="bg-slate-800/50 border border-slate-700 p-4 rounded-xl flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <Lightbulb className="w-6 h-6 text-yellow-200" />
                            <span className="text-sm font-medium text-slate-200">
                              Сметка електромер 1:
                            </span>
                          </div>
                          <span className="text-2xl font-bold text-white">
                            €{results.costEm1.toFixed(2)}
                          </span>
                        </div>

                        {/* EM2 Card */}
                        <div className="bg-emerald-900/30 border border-emerald-800/50 p-4 rounded-xl flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <Plug className="w-6 h-6 text-emerald-400" />
                            <span className="text-sm font-medium text-emerald-100">
                              Сметка електромер 2:
                            </span>
                          </div>
                          <span className="text-2xl font-bold text-emerald-400">
                            €{results.em2Remainder.toFixed(2)}
                          </span>
                        </div>
                      </div>

                      {/* Invoice Total */}
                      <div className="flex justify-between items-center px-2">
                        <div className="flex items-center gap-2 text-slate-400 text-sm">
                          <FileText className="w-4 h-4" />
                          <span>Обща сума по фактурата:</span>
                        </div>
                        <span className="font-bold text-lg text-white">
                          €{parseFloat(inputs.invoiceTotal || '0').toFixed(2)}
                        </span>
                      </div>

                      {/* Actions */}
                      <div className="space-y-3 mt-auto pt-4">
                        <button
                          onClick={handleAddToExpenses}
                          disabled={isAdded}
                          className={`w-full py-3 rounded-xl font-bold transition-all flex items-center justify-center gap-2 shadow-lg ${
                            isAdded
                              ? 'bg-green-600 text-white transform scale-[0.98]'
                              : 'bg-emerald-600 text-white hover:bg-emerald-500 hover:translate-y-[-1px]'
                          }`}
                        >
                          {isAdded ? (
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
                          className="w-full py-3 bg-slate-800 text-slate-300 border border-slate-700 rounded-xl font-medium hover:bg-slate-700 hover:text-white transition-all flex items-center justify-center gap-2"
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

      {/* Tab 2: Electricity History */}
      {activeSubTab === 'history' && (
        <ElectricityHistoryTab
          records={historyRecords}
          onDeleteRecord={handleDeleteHistoryRecord}
          onSwitchToCalculator={() => setActiveSubTab('calculator')}
        />
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
