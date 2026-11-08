import React from 'react';

interface InputGroupProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  step?: string;
  placeholder?: string;
  icon?: React.ReactNode;
  inputMode?: "decimal" | "numeric" | "text" | "email" | "search" | "tel" | "url" | "none";
}

export const InputGroup: React.FC<InputGroupProps> = ({ 
  label, 
  value, 
  onChange, 
  type = "number", 
  step = "any",
  placeholder = "0.00",
  icon,
  inputMode,
}) => {
  const resolvedInputMode = inputMode || (type === "number" ? "decimal" : undefined);

  return (
    <div className="flex flex-col gap-1.5 w-full">
      <label className="text-xs sm:text-sm font-medium text-slate-700 dark:text-slate-300 flex items-center gap-2">
        {icon}
        <span>{label}</span>
      </label>
      <input
        type={type}
        step={step}
        inputMode={resolvedInputMode}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full min-h-[44px] px-3.5 py-2.5 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:focus:ring-indigo-400 focus:border-transparent transition-all shadow-2xs text-base sm:text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500"
      />
    </div>
  );
};
