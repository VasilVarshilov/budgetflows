export const TAILWIND_COLORS: Record<string, string> = {
  'slate': '#64748b',
  'gray': '#6b7280',
  'zinc': '#71717a',
  'neutral': '#737373',
  'stone': '#78716c',
  'red': '#ef4444',
  'orange': '#f97316',
  'amber': '#f59e0b',
  'yellow': '#eab308',
  'lime': '#84cc16',
  'green': '#22c55e',
  'emerald': '#10b981',
  'teal': '#14b8a6',
  'cyan': '#06b6d4',
  'sky': '#0ea5e9',
  'blue': '#3b82f6',
  'indigo': '#6366f1',
  'violet': '#8b5cf6',
  'purple': '#a855f7',
  'fuchsia': '#d946ef',
  'pink': '#ec4899',
  'rose': '#f43f5e',
};

// Fixed colors for system categories
export const SYSTEM_CATEGORY_COLORS: Record<string, string> = {
  'Ток': '#eab308', // yellow-500
  'Кредит': '#3b82f6', // blue-500
  'Телефон': '#6366f1', // indigo-500
  'Интернет': '#06b6d4', // cyan-500
};

export const getHexFromTailwindClass = (colorClass: string): string => {
  // Extract color name from class like "text-red-500" or "bg-red-100"
  // We prioritize the color name.
  const match = colorClass.match(/(?:text|bg)-([a-z]+)-/);
  if (match && match[1] && TAILWIND_COLORS[match[1]]) {
    return TAILWIND_COLORS[match[1]];
  }
  return '#94a3b8'; // default slate-400
};