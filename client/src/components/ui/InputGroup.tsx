import React from 'react';

interface InputGroupProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  step?: string;
  placeholder?: string;
  icon?: React.ReactNode;
}

export const InputGroup: React.FC<InputGroupProps> = ({ 
  label, 
  value, 
  onChange, 
  type = "number", 
  step = "any",
  placeholder = "0.00",
  icon
}) => {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-sm font-medium text-slate-700 flex items-center gap-2">
        {icon}
        {label}
      </label>
      <input
        type={type}
        step={step}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all shadow-sm text-slate-900"
      />
    </div>
  );
};
