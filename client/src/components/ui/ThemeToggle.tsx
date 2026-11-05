import React, { useState, useRef, useEffect } from "react";
import { Sun, Moon, Laptop, Check } from "lucide-react";
import { useTheme, Theme } from "@/utils/themeContext";

export const ThemeToggle: React.FC = () => {
  const { theme, resolvedTheme, isDark, setTheme, toggleTheme } = useTheme();
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div className="relative" ref={menuRef}>
      {/* Quick Toggle Button */}
      <button
        onClick={() => setIsOpen((prev) => !prev)}
        className="p-2 rounded-xl text-slate-500 hover:text-slate-800 hover:bg-slate-100 dark:text-slate-400 dark:hover:text-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer border border-transparent hover:border-slate-200 dark:hover:border-slate-700"
        title={`Тема: ${
          theme === "system"
            ? "Системна"
            : theme === "dark"
            ? "Тъмна"
            : "Светла"
        }`}
        aria-label="Смяна на тема"
        aria-expanded={isOpen}
      >
        {isDark ? (
          <Moon className="w-4 h-4 text-indigo-400" />
        ) : (
          <Sun className="w-4 h-4 text-amber-500" />
        )}
      </button>

      {/* Dropdown Options */}
      {isOpen && (
        <div className="absolute right-0 mt-2 w-44 bg-white dark:bg-slate-900 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-800 py-1.5 z-50 animate-in fade-in zoom-in-95 duration-150">
          <button
            onClick={() => {
              setTheme("light");
              setIsOpen(false);
            }}
            className={`w-full flex items-center justify-between px-3 py-2 text-xs font-medium transition-colors ${
              theme === "light"
                ? "bg-indigo-50 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-400 font-semibold"
                : "text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/70"
            }`}
          >
            <div className="flex items-center gap-2">
              <Sun className="w-3.5 h-3.5 text-amber-500" />
              <span>Светла тема</span>
            </div>
            {theme === "light" && <Check className="w-3.5 h-3.5" />}
          </button>

          <button
            onClick={() => {
              setTheme("dark");
              setIsOpen(false);
            }}
            className={`w-full flex items-center justify-between px-3 py-2 text-xs font-medium transition-colors ${
              theme === "dark"
                ? "bg-indigo-50 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-400 font-semibold"
                : "text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/70"
            }`}
          >
            <div className="flex items-center gap-2">
              <Moon className="w-3.5 h-3.5 text-indigo-400" />
              <span>Тъмна тема</span>
            </div>
            {theme === "dark" && <Check className="w-3.5 h-3.5" />}
          </button>

          <button
            onClick={() => {
              setTheme("system");
              setIsOpen(false);
            }}
            className={`w-full flex items-center justify-between px-3 py-2 text-xs font-medium transition-colors ${
              theme === "system"
                ? "bg-indigo-50 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-400 font-semibold"
                : "text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/70"
            }`}
          >
            <div className="flex items-center gap-2">
              <Laptop className="w-3.5 h-3.5 text-slate-400" />
              <span>Системна ({resolvedTheme === "dark" ? "тъмна" : "светла"})</span>
            </div>
            {theme === "system" && <Check className="w-3.5 h-3.5" />}
          </button>
        </div>
      )}
    </div>
  );
};
