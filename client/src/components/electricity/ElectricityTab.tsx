import React, { useState } from 'react';
import { Zap, Calculator, Check, Sun, Moon, Lightbulb, Plug, FileText, Download, Plus, ExternalLink } from 'lucide-react';
import { InputGroup } from '@/components/ui/InputGroup';
import { calculateElectricity } from '@/utils/calculations';
import { ElectricityInputs, ElectricityResults } from '@/types';
import { getCurrentMonthBulgarian } from '@/utils/formatting';

interface ElectricityTabProps {
  onAddToExpenses: (em1: number, em2: number) => void;
}

const STORAGE_KEY_LAST_READINGS = "HomeBudget_ElectricityLastReadings";

export const ElectricityTab: React.FC<ElectricityTabProps> = ({ onAddToExpenses }) => {
  const [inputs, setInputs] = useState<ElectricityInputs>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_LAST_READINGS);
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
      invoiceTotal: ''
    };
  });

  const [lastCalculatedInputs, setLastCalculatedInputs] = useState<ElectricityInputs | null>(null);
  const [showAutoShiftNotice, setShowAutoShiftNotice] = useState(false);
  const [results, setResults] = useState<ElectricityResults | null>(null);
  const [isAdded, setIsAdded] = useState(false);

  const handleCalculate = () => {
    const res = calculateElectricity(inputs);
    setResults(res);
    setLastCalculatedInputs({ ...inputs });
    setIsAdded(false);

    // Save newT1 and newT2 and auto-shift into oldT1 and oldT2 for the next report
    if (inputs.newT1 || inputs.newT2) {
      const nextOldT1 = inputs.newT1 || inputs.oldT1;
      const nextOldT2 = inputs.newT2 || inputs.oldT2;

      try {
        localStorage.setItem(
          STORAGE_KEY_LAST_READINGS,
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
      setTimeout(() => setShowAutoShiftNotice(false), 5000);
    }
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
Месец: ${getCurrentMonthBulgarian()}

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
    link.download = `Calculations_${getCurrentMonthBulgarian().replace(/\s/g, '_')}.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="bg-white p-6 rounded-xl shadow-md border border-yellow-100">
        <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2 mb-6">
          <Zap className="w-6 h-6 text-yellow-500" />
          Електроенергия Калкулатор
        </h2>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          
          {/* Inputs Column */}
          <div className="space-y-4">
             <div className="flex gap-2 mb-4">
                <a 
                  href="https://evn.bg/Home/Electricity.aspx" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="flex-1 flex items-center justify-center gap-2 bg-slate-100 text-slate-700 py-2 rounded-lg text-xs font-bold hover:bg-slate-200 transition-colors border border-slate-200"
                >
                  EVN Цени <ExternalLink className="w-3 h-3" />
                </a>
                <a 
                  href="https://onlineplus.evn.bg/account/login?ReturnUrl=%2Fopeninvoices" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="flex-1 flex items-center justify-center gap-2 bg-slate-100 text-slate-700 py-2 rounded-lg text-xs font-bold hover:bg-slate-200 transition-colors border border-slate-200"
                >
                  Проверка сметка <ExternalLink className="w-3 h-3" />
                </a>
             </div>

             <h3 className="font-semibold text-slate-700 border-b pb-2">Въвеждане на данни</h3>
             
             <div className="grid grid-cols-2 gap-4">
               <InputGroup label="Старо Т1" value={inputs.oldT1} onChange={v => setInputs(prev => ({...prev, oldT1: v}))} />
               <InputGroup label="Ново Т1" value={inputs.newT1} onChange={v => setInputs(prev => ({...prev, newT1: v}))} />
             </div>

             <div className="grid grid-cols-2 gap-4">
               <InputGroup label="Старо Т2" value={inputs.oldT2} onChange={v => setInputs(prev => ({...prev, oldT2: v}))} />
               <InputGroup label="Ново Т2" value={inputs.newT2} onChange={v => setInputs(prev => ({...prev, newT2: v}))} />
             </div>

             <div className="grid grid-cols-2 gap-4 pt-2">
               <InputGroup label="Цена Т1 (Дневна)" value={inputs.priceT1} onChange={v => setInputs(prev => ({...prev, priceT1: v}))} />
               <InputGroup label="Цена Т2 (Нощна)" value={inputs.priceT2} onChange={v => setInputs(prev => ({...prev, priceT2: v}))} />
             </div>

             <div className="pt-2">
               <InputGroup label="Обща сума по фактура (€)" value={inputs.invoiceTotal} onChange={v => setInputs(prev => ({...prev, invoiceTotal: v}))} />
             </div>

             <button 
               onClick={handleCalculate}
               className="w-full mt-4 bg-yellow-500 text-white py-3 rounded-lg font-bold hover:bg-yellow-600 transition-colors flex items-center justify-center gap-2 shadow-sm"
             >
               <Calculator className="w-5 h-5" />
               Изчисли
             </button>

             {showAutoShiftNotice && (
               <div className="p-3 bg-emerald-50 text-emerald-800 border border-emerald-200 rounded-lg text-xs font-medium flex items-center gap-2 animate-in fade-in duration-200">
                 <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                 <span>Показанията от Ново Т1 и Ново Т2 бяха прехвърлени в Старо Т1 и Старо Т2 за следващия отчет.</span>
               </div>
             )}
          </div>

          {/* Results Column */}
          <div className="flex flex-col h-full">
            <h3 className="font-semibold text-slate-700 border-b pb-2 mb-4">Резултати</h3>
            
            {results ? (
               <div className="flex-1 bg-slate-900 rounded-2xl p-6 text-white shadow-xl flex flex-col gap-6">
                  
                  {/* Header */}
                  <div className="flex items-center gap-2 border-b border-slate-700 pb-4">
                    <Zap className="w-6 h-6 text-yellow-400" />
                    <div>
                      <h3 className="text-lg font-bold text-yellow-400 leading-none">Сметка ТОК</h3>
                      <p className="text-xs text-slate-400 uppercase mt-1">({getCurrentMonthBulgarian()})</p>
                    </div>
                  </div>

                  {!results.isValid ? (
                    <div className="text-red-400 bg-red-900/20 p-4 rounded-lg border border-red-800/50 text-sm">
                      {results.errors.map((e, i) => <p key={i}>• {e}</p>)}
                    </div>
                  ) : (
                    <>
                      {/* Consumption List */}
                      <div className="space-y-3 text-sm">
                        <div className="flex justify-between items-center">
                          <div className="flex items-center gap-2 text-slate-300">
                            <Sun className="w-4 h-4" />
                            <span>Консумация Т1 (дневна):</span>
                          </div>
                          <span className="font-mono font-bold">{results.consT1.toFixed(3)} kWh</span>
                        </div>
                        <div className="flex justify-between items-center">
                          <div className="flex items-center gap-2 text-slate-300">
                            <Moon className="w-4 h-4" />
                            <span>Консумация Т2 (нощна):</span>
                          </div>
                          <span className="font-mono font-bold">{results.consT2.toFixed(3)} kWh</span>
                        </div>
                        <div className="flex justify-between items-center pt-2 border-t border-slate-700/50">
                          <div className="flex items-center gap-2 text-white font-medium">
                            <Zap className="w-4 h-4" />
                            <span>Общо електромер 1:</span>
                          </div>
                          <span className="font-mono font-bold text-white">{results.totalCons.toFixed(3)} kWh</span>
                        </div>
                      </div>

                      {/* Cards */}
                      <div className="space-y-3">
                        {/* EM1 Card */}
                        <div className="bg-slate-800/50 border border-slate-700 p-4 rounded-xl flex items-center justify-between">
                           <div className="flex items-center gap-3">
                             <Lightbulb className="w-6 h-6 text-yellow-200" />
                             <span className="text-sm font-medium text-slate-200">Сметка електромер 1:</span>
                           </div>
                           <span className="text-2xl font-bold text-white">€{results.costEm1.toFixed(2)}</span>
                        </div>

                        {/* EM2 Card */}
                        <div className="bg-emerald-900/30 border border-emerald-800/50 p-4 rounded-xl flex items-center justify-between">
                           <div className="flex items-center gap-3">
                             <Plug className="w-6 h-6 text-emerald-400" />
                             <span className="text-sm font-medium text-emerald-100">Сметка електромер 2:</span>
                           </div>
                           <span className="text-2xl font-bold text-emerald-400">€{results.em2Remainder.toFixed(2)}</span>
                        </div>
                      </div>

                      {/* Invoice Total */}
                      <div className="flex justify-between items-center px-2">
                        <div className="flex items-center gap-2 text-slate-400 text-sm">
                          <FileText className="w-4 h-4" />
                          <span>Обща сума по фактурата:</span>
                        </div>
                        <span className="font-bold text-lg text-white">€{parseFloat(inputs.invoiceTotal || '0').toFixed(2)}</span>
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
                              Добавено!
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
                          Калкулации
                        </button>
                      </div>
                    </>
                  )}
               </div>
            ) : (
              <div className="h-full min-h-[400px] bg-slate-50 rounded-xl border border-slate-200 border-dashed flex flex-col items-center justify-center text-slate-400 gap-3">
                 <div className="p-4 bg-white rounded-full shadow-sm">
                    <Calculator className="w-8 h-8 text-slate-300" />
                 </div>
                 <p className="text-sm font-medium">Въведете данни и натиснете Изчисли</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
