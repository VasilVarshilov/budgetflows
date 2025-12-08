import React, { useState, useMemo } from 'react';
import { PieChart, Filter, Calendar, ChevronDown, CreditCard, Zap, Phone, Wifi } from 'lucide-react';
import { MonthlyRecord, ExpenseItem } from '../../types';
import { getHexFromTailwindClass, SYSTEM_CATEGORY_COLORS } from '../../utils/colors';

interface MonthlyReportsTabProps {
  monthlyData: Record<string, MonthlyRecord>;
}

interface ChartSegment {
  name: string;
  value: number;
  color: string;
  percentage: number;
}

const MONTHS_BG = [
  'Януари', 'Февруари', 'Март', 'Април', 'Май', 'Юни',
  'Юли', 'Август', 'Септември', 'Октомври', 'Ноември', 'Декември'
];

// Generate years from 2024 up to current year + 1
const CURRENT_YEAR = new Date().getFullYear();
const YEARS = Array.from({ length: 3 }, (_, i) => (CURRENT_YEAR - 1 + i).toString());

export const MonthlyReportsTab: React.FC<MonthlyReportsTabProps> = ({ monthlyData }) => {
  // Default to current date
  const now = new Date();
  const currentMonthName = now.toLocaleDateString('bg-BG', { month: 'long' });
  const capitalizedMonth = currentMonthName.charAt(0).toUpperCase() + currentMonthName.slice(1);
  
  const [selectedMonth, setSelectedMonth] = useState(capitalizedMonth);
  const [selectedYear, setSelectedYear] = useState(now.getFullYear().toString());

  const recordKey = `${selectedMonth} ${selectedYear}`;
  const record = monthlyData[recordKey];

  // Aggregation Logic
  const chartData = useMemo(() => {
    if (!record || !record.expenses) return [];

    const segments: ChartSegment[] = [];
    const exp = record.expenses;

    // 1. Electricity
    if (exp.saved_em2_eur > 0) {
      segments.push({
        name: 'Ток',
        value: exp.saved_em2_eur,
        color: SYSTEM_CATEGORY_COLORS['Ток'],
        percentage: 0
      });
    }

    // 2. Fixed Expenses
    if (exp.fixed_expenses) {
      if (exp.fixed_expenses.credit_eur > 0) {
        segments.push({
          name: 'Кредит',
          value: exp.fixed_expenses.credit_eur,
          color: SYSTEM_CATEGORY_COLORS['Кредит'],
          percentage: 0
        });
      }
      if (exp.fixed_expenses.phone_eur > 0) {
        segments.push({
          name: 'Телефон',
          value: exp.fixed_expenses.phone_eur,
          color: SYSTEM_CATEGORY_COLORS['Телефон'],
          percentage: 0
        });
      }
      if (exp.fixed_expenses.internet_eur > 0) {
        segments.push({
          name: 'Интернет',
          value: exp.fixed_expenses.internet_eur,
          color: SYSTEM_CATEGORY_COLORS['Интернет'],
          percentage: 0
        });
      }
    }

    // 3. Additional Expenses (Grouped)
    const groupedAdditional: Record<string, { value: number, color: string }> = {};
    
    if (exp.additional_expenses) {
      exp.additional_expenses.forEach((item: ExpenseItem) => {
        if (!groupedAdditional[item.categoryName]) {
          groupedAdditional[item.categoryName] = {
            value: 0,
            color: getHexFromTailwindClass(item.categoryColor)
          };
        }
        groupedAdditional[item.categoryName].value += item.amount;
      });
    }

    Object.entries(groupedAdditional).forEach(([name, data]) => {
      segments.push({
        name,
        value: data.value,
        color: data.color,
        percentage: 0
      });
    });

    // Calculate Percentages
    const total = segments.reduce((sum, s) => sum + s.value, 0);
    if (total > 0) {
      segments.forEach(s => {
        s.percentage = (s.value / total) * 100;
      });
    }

    // Sort by value desc
    return segments.sort((a, b) => b.value - a.value);
  }, [record]);

  const totalExpense = chartData.reduce((sum, item) => sum + item.value, 0);

  // Helper for Donut Chart SVG
  const renderDonutChart = () => {
    if (chartData.length === 0) return null;

    let cumulativePercent = 0;
    const GAP_PERCENT = 1; 
    
    // Improved SVG coordinate system: 100x100
    // Center 50,50. 
    // Radius 40 to leave padding for 12px stroke
    // Circumference = 2 * PI * 40 ≈ 251.327
    const radius = 40;
    const circumference = 2 * Math.PI * radius;

    return (
      <div className="relative w-64 h-64 mx-auto my-6">
        <svg viewBox="0 0 100 100" className="w-full h-full transform -rotate-90">
          {chartData.map((segment, index) => {
            const val = segment.percentage; // 0 to 100
            
            // Calculate stroke dash lengths
            const strokeLength = (val / 100) * circumference;
            // Subtract gap only if there are multiple segments, else full circle
            const gapLength = chartData.length > 1 ? (GAP_PERCENT / 100) * circumference : 0;
            const drawLength = Math.max(0, strokeLength - gapLength);
            
            // Offset logic
            // We need to rotate by the cumulative percentage converted to circumference length
            const offset = -1 * (cumulativePercent / 100) * circumference;
            cumulativePercent += val;

            return (
              <circle
                key={index}
                cx="50"
                cy="50"
                r={radius}
                fill="transparent"
                stroke={segment.color}
                strokeWidth="12"
                strokeDasharray={`${drawLength} ${circumference - drawLength}`}
                strokeDashoffset={offset}
                strokeLinecap="butt"
                className="transition-all duration-500 ease-out hover:opacity-90"
              />
            );
          })}
        </svg>
        {/* Center Text */}
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          <span className="text-xs text-slate-400 font-medium uppercase tracking-wider mb-1">Общо</span>
          <span className="text-2xl font-black text-slate-800 tracking-tight">€{totalExpense.toFixed(2)}</span>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      
      {/* Controls */}
      <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 flex flex-wrap gap-4 items-center justify-between">
        <div className="flex items-center gap-2">
           <div className="p-2 bg-indigo-50 text-indigo-600 rounded-lg">
             <PieChart className="w-5 h-5" />
           </div>
           <h2 className="text-lg font-bold text-slate-800">Месечен отчет</h2>
        </div>
        
        <div className="flex gap-2">
          {/* Month Selector */}
          <div className="relative">
            <select
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="appearance-none bg-slate-50 border border-slate-300 text-slate-700 py-2 pl-4 pr-8 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 font-medium cursor-pointer"
            >
              {MONTHS_BG.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
            <ChevronDown className="w-4 h-4 text-slate-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          </div>

          {/* Year Selector */}
          <div className="relative">
            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(e.target.value)}
              className="appearance-none bg-slate-50 border border-slate-300 text-slate-700 py-2 pl-4 pr-8 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 font-medium cursor-pointer"
            >
              {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
            <ChevronDown className="w-4 h-4 text-slate-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          </div>
        </div>
      </div>

      {/* Main Content */}
      {!record ? (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-12 text-center">
          <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-4">
            <Calendar className="w-8 h-8 text-slate-300" />
          </div>
          <h3 className="text-lg font-medium text-slate-900 mb-2">Няма данни за този период</h3>
          <p className="text-slate-500">
            Няма намерени записи за {selectedMonth} {selectedYear}.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          
          {/* Chart Section */}
          <div className="bg-white p-6 rounded-xl shadow-md border border-slate-200 flex flex-col items-center justify-center min-h-[350px]">
            <h3 className="w-full text-left font-semibold text-slate-700 mb-6 flex items-center gap-2">
              <Filter className="w-4 h-4 text-slate-400" />
              Разпределение
            </h3>
            
            {chartData.length > 0 ? (
              renderDonutChart()
            ) : (
              <div className="h-64 flex items-center justify-center w-full">
                 <p className="text-slate-400">Няма разходи за показване</p>
              </div>
            )}

            {/* Legend / Mini Stats */}
            <div className="flex flex-wrap gap-3 justify-center mt-6">
              {chartData.slice(0, 5).map((item, idx) => (
                <div key={idx} className="flex items-center gap-1.5 text-xs bg-slate-50 px-2 py-1 rounded-md border border-slate-100">
                  <span className="w-2 h-2 rounded-full" style={{ backgroundColor: item.color }} />
                  <span className="text-slate-600 font-bold">{Math.round(item.percentage)}%</span>
                  <span className="text-slate-400 truncate max-w-[80px]">{item.name}</span>
                </div>
              ))}
            </div>
          </div>

          {/* List Section */}
          <div className="bg-white p-6 rounded-xl shadow-md border border-slate-200 flex flex-col">
            <h3 className="font-semibold text-slate-700 mb-6 flex items-center gap-2">
              <CreditCard className="w-4 h-4 text-slate-400" />
              Детайли по категория
            </h3>

            <div className="flex-1 overflow-y-auto pr-2 space-y-4 custom-scrollbar max-h-[400px]">
              {chartData.map((item, idx) => (
                <div key={idx} className="flex items-center justify-between p-3 rounded-lg hover:bg-slate-50 transition-colors border border-transparent hover:border-slate-100 group">
                   <div className="flex items-center gap-3">
                     <div 
                       className="w-10 h-10 rounded-full flex items-center justify-center text-white shadow-sm"
                       style={{ backgroundColor: item.color }}
                     >
                        {/* Icon placeholder logic */}
                        {item.name === 'Ток' ? <Zap className="w-5 h-5" /> :
                         item.name === 'Телефон' ? <Phone className="w-5 h-5" /> :
                         item.name === 'Интернет' ? <Wifi className="w-5 h-5" /> :
                         item.name === 'Кредит' ? <CreditCard className="w-5 h-5" /> :
                         <span className="text-xs font-bold">{item.name.charAt(0)}</span>
                        }
                     </div>
                     <div>
                       <p className="font-medium text-slate-800">{item.name}</p>
                       <div className="flex items-center gap-2">
                          <div className="w-16 h-1 bg-slate-100 rounded-full overflow-hidden">
                             <div className="h-full rounded-full" style={{ width: `${item.percentage}%`, backgroundColor: item.color }} />
                          </div>
                          <p className="text-xs text-slate-400">{item.percentage.toFixed(1)}%</p>
                       </div>
                     </div>
                   </div>
                   <span className="font-bold text-slate-700">€{item.value.toFixed(2)}</span>
                </div>
              ))}
              
              {chartData.length === 0 && (
                <div className="text-center py-8 text-slate-400 italic">
                  Няма записани разходи
                </div>
              )}
            </div>
            
            <div className="mt-6 pt-4 border-t border-slate-100 flex justify-between items-center">
               <span className="text-sm font-medium text-slate-500">Общо разходи</span>
               <span className="text-xl font-bold text-slate-800">€{totalExpense.toFixed(2)}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};