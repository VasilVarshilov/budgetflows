export const TAILWIND_COLORS: Record<string, string> = {
  'slate': '#64748b',
  'gray': '#6b7280',
  'zinc': '#71717a',
  'neutral': '#737373',
  'stone': '#78716c',
  'red': '#dc2626',
  'orange': '#f97316',
  'amber': '#f59e0b',
  'yellow': '#eab308',
  'lime': '#65a30d',
  'green': '#16a34a',
  'emerald': '#10b981',
  'teal': '#0d9488',
  'cyan': '#06b6d4',
  'sky': '#0284c7',
  'blue': '#2563eb',
  'indigo': '#4f46e5',
  'violet': '#7c3aed',
  'purple': '#8b5cf6',
  'fuchsia': '#c026d3',
  'pink': '#db2777',
  'rose': '#e11d48',
};

// Fixed semantic hex colors for canonical categories (stable across Dashboard, Reports, AI & Exports)
// Engineered for high perceptual contrast across distinct hue families
export const SYSTEM_CATEGORY_COLORS: Record<string, string> = {
  'Храна': '#16a34a', // Green
  'Транспорт': '#2563eb', // Blue
  'Дом и Бит': '#f97316', // Orange
  'Сметки и битови': '#f97316', // Orange
  'Ресторант': '#dc2626', // Red
  'Ресторанти': '#dc2626', // Red
  'Телефон': '#9333ea', // Purple
  'Интернет': '#06b6d4', // Cyan
  'Ток': '#eab308', // Yellow
  'Вода': '#0d9488', // Teal (distinct from Cyan & Blue)
  'Кредит': '#65a30d', // Lime-Olive (distinct from Red, Orange, Blue, Purple, Cyan)
  'Забавления': '#c026d3', // Fuchsia-Magenta (distinct from Phone Purple & Red)
  'Гориво': '#b45309', // Warm Amber-Bronze (distinct from Red & Orange)
  'Кола': '#475569', // Slate-Steel
  'Кафе': '#d97706', // Amber
  'Здраве': '#10b981', // Emerald-Mint
  'Аптека': '#14b8a6', // Sea-Teal
  'Дрехи': '#ec4899', // Magenta-Pink
  'Козметика': '#f472b6', // Soft Rose
  'Подаръци': '#a855f7', // Violet
  'Образование': '#0284c7', // Deep Sky
  'Домашни любимци': '#f59e0b', // Warm Gold
  'Почистване': '#22c55e', // Bright Green
  'Кино': '#7c3aed', // Deep Violet
  'Фризьор': '#e879f9', // Orchid
  'Такси и услуги': '#facc15', // Sun Yellow
  'Пътуване': '#0ea5e9', // Sky Cyan
  'Наем': '#ea580c', // Deep Orange
  'Заплата': '#16a34a', // Green
  'Бонус': '#eab308', // Yellow
  'Фрийланс': '#2563eb', // Blue
  'Дивиденти': '#9333ea', // Purple
  'Лихви': '#0d9488', // Teal
  'Възстановяване': '#06b6d4', // Cyan
  'Други': '#64748b', // Neutral Slate
  'Други приходи': '#64748b', // Neutral Slate
};

// High-contrast, maximally separated 10-hue palette for custom categories & collision resolution
// Avoids adjacent red/pink-red and blue/blue-purple clusters
export const DISTINCT_CATEGORY_PALETTE: string[] = [
  '#16a34a', // Green
  '#2563eb', // Blue
  '#f97316', // Orange
  '#dc2626', // Red
  '#9333ea', // Purple
  '#06b6d4', // Cyan
  '#eab308', // Yellow
  '#65a30d', // Lime
  '#0d9488', // Teal
  '#c026d3', // Fuchsia
];

const KEYWORD_COLOR_RULES: { keywords: string[]; color: string }[] = [
  { keywords: ['храна', 'супермаркет', 'магазин', 'бакалия', 'lidl', 'kaufland', 'billa', 'grocer', 'food'], color: '#16a34a' },
  { keywords: ['транспорт', 'метро', 'автобус', 'влак', 'transport'], color: '#2563eb' },
  { keywords: ['дом', 'бит', 'жилище', 'наем', 'сметк', 'home', 'rent', 'utilities'], color: '#f97316' },
  { keywords: ['ресторант', 'пица', 'доставка', 'glovo', 'takeaway', 'restaurant'], color: '#dc2626' },
  { keywords: ['телефон', 'phone', 'a1', 'yettel', 'vivacom'], color: '#9333ea' },
  { keywords: ['интернет', 'wifi', 'net', 'internet'], color: '#06b6d4' },
  { keywords: ['ток', 'електро', 'electric'], color: '#eab308' },
  { keywords: ['вода', 'вик', 'water'], color: '#0d9488' },
  { keywords: ['кредит', 'заем', 'банка', 'ипотека', 'credit', 'loan'], color: '#65a30d' },
  { keywords: ['забавлен', 'развлечен', 'игри', 'гейминг', 'хоби', 'кино', 'entertain', 'hobby'], color: '#c026d3' },
  { keywords: ['гориво', 'бензин', 'дизел', 'fuel'], color: '#b45309' },
  { keywords: ['здраве', 'лекар', 'аптека', 'болница', 'health', 'pharmacy'], color: '#10b981' },
  { keywords: ['дрехи', 'обувки', 'мода', 'clothes'], color: '#ec4899' },
  { keywords: ['подаръ', 'gift'], color: '#a855f7' },
  { keywords: ['образован', 'курс', 'книг', 'education'], color: '#0284c7' },
  { keywords: ['пътуван', 'почивк', 'хотел', 'самолет', 'travel'], color: '#0ea5e9' },
  { keywords: ['други', 'other'], color: '#64748b' },
];

function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace('#', '');
  const full = clean.length === 3
    ? clean.split('').map((c) => c + c).join('')
    : clean.padEnd(6, '0').slice(0, 6);
  const num = parseInt(full, 16);
  return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
}

/**
 * Redmean perceptual RGB distance between two hex colors (0..~765).
 */
function perceptualColorDistance(hexA: string, hexB: string): number {
  const [r1, g1, b1] = hexToRgb(hexA);
  const [r2, g2, b2] = hexToRgb(hexB);
  const rMean = (r1 + r2) / 2;
  const dr = r1 - r2;
  const dg = g1 - g2;
  const db = b1 - b2;
  return Math.sqrt(
    (2 + rMean / 256) * dr * dr +
    4 * dg * dg +
    (2 + (255 - rMean) / 256) * db * db
  );
}

/**
 * Returns crisp foreground text color (#ffffff or #0f172a) for labels placed directly over a slice hex color.
 */
export function getReadableTextColor(hex: string): string {
  const [r, g, b] = hexToRgb(hex);
  const toLinear = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  const lum = 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
  return lum > 0.34 ? '#0f172a' : '#ffffff';
}

export const getHexFromTailwindClass = (colorClass?: string): string => {
  if (!colorClass) return '#64748b';
  const match = colorClass.match(/(?:text|bg)-([a-z]+)-/);
  if (match && match[1] && TAILWIND_COLORS[match[1]]) {
    return TAILWIND_COLORS[match[1]];
  }
  return '#64748b';
};

/**
 * Deterministic category color resolver.
 * Guarantees the same category always gets the same visual color across
 * Dashboard, Reports, AI Analysis visual summaries, and Exports.
 */
export function getCategoryColor(categoryName: string, fallbackColorClass?: string): string {
  const trimmed = (categoryName || '').trim();
  if (!trimmed) return '#64748b';

  // 1. Exact canonical match (case-sensitive, then case-insensitive)
  if (SYSTEM_CATEGORY_COLORS[trimmed]) {
    return SYSTEM_CATEGORY_COLORS[trimmed];
  }
  const lower = trimmed.toLowerCase();
  for (const [key, hex] of Object.entries(SYSTEM_CATEGORY_COLORS)) {
    if (key.toLowerCase() === lower) {
      return hex;
    }
  }

  // 2. Semantic keyword rule
  for (const rule of KEYWORD_COLOR_RULES) {
    if (rule.keywords.some((kw) => lower.includes(kw))) {
      return rule.color;
    }
  }

  // 3. Explicit non-generic Tailwind badge color if meaningful
  if (fallbackColorClass) {
    const match = fallbackColorClass.match(/(?:text|bg)-([a-z]+)-/);
    if (match && match[1] && match[1] !== 'slate' && match[1] !== 'gray' && match[1] !== 'zinc' && TAILWIND_COLORS[match[1]]) {
      return TAILWIND_COLORS[match[1]];
    }
  }

  // 4. Stable FNV-1a style hash into distinct categorical palette
  let hash = 2166136261;
  for (let i = 0; i < lower.length; i++) {
    hash ^= lower.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  const index = (hash >>> 0) % DISTINCT_CATEGORY_PALETTE.length;
  return DISTINCT_CATEGORY_PALETTE[index];
}

export interface CategoryChartInput {
  name: string;
  value: number;
  colorClass?: string;
}

export interface CategoryChartGroupedDetail {
  name: string;
  value: number;
  percentage: number;
  color: string;
}

export interface CategoryChartSegment {
  name: string;
  value: number;
  percentage: number;
  color: string;
  isOthersGroup?: boolean;
  groupedItems?: CategoryChartGroupedDetail[];
}

export interface PreparedCategoryChartData {
  segments: CategoryChartSegment[];
  rawCount: number;
  total: number;
  hasGroupedSmallCategories: boolean;
  preferHorizontalBars: boolean;
}

function hasExplicitCanonicalMapping(name: string): boolean {
  const lower = name.trim().toLowerCase();
  if (Object.keys(SYSTEM_CATEGORY_COLORS).some((k) => k.toLowerCase() === lower)) {
    return true;
  }
  return KEYWORD_COLOR_RULES.some((rule) => rule.keywords.some((kw) => lower.includes(kw)));
}

/**
 * Normalizes category totals, assigns deterministic colors, merges categories below
 * `groupThresholdPercent` (default 3%) into "Други", avoids adjacent/overlapping similar shades,
 * and determines whether horizontal ranked bars should be used (> 6 categories).
 */
export function prepareCategoryChartData(
  items: CategoryChartInput[],
  options?: { groupThresholdPercent?: number; horizontalBarThresholdCount?: number }
): PreparedCategoryChartData {
  const groupThresholdPercent = options?.groupThresholdPercent ?? 3;
  const horizontalBarThresholdCount = options?.horizontalBarThresholdCount ?? 6;

  // Deduplicate by trimmed category name
  const mergedMap = new Map<string, { name: string; value: number; colorClass?: string }>();
  for (const item of items) {
    const val = Number(item.value) || 0;
    if (val <= 0) continue;
    const displayName = (item.name || 'Други').trim() || 'Други';
    const key = displayName.toLowerCase();
    const existing = mergedMap.get(key);
    if (existing) {
      existing.value += val;
      if (!existing.colorClass && item.colorClass) {
        existing.colorClass = item.colorClass;
      }
    } else {
      mergedMap.set(key, {
        name: displayName,
        value: val,
        colorClass: item.colorClass,
      });
    }
  }

  const normalized = Array.from(mergedMap.values())
    .map((entry) => ({
      name: entry.name,
      value: parseFloat(entry.value.toFixed(2)),
      color: getCategoryColor(entry.name, entry.colorClass),
    }))
    .sort((a, b) => b.value - a.value);

  const total = parseFloat(
    normalized.reduce((sum, s) => sum + s.value, 0).toFixed(2)
  );
  const rawCount = normalized.length;

  if (total <= 0 || rawCount === 0) {
    return {
      segments: [],
      rawCount: 0,
      total: 0,
      hasGroupedSmallCategories: false,
      preferHorizontalBars: false,
    };
  }

  const withPct: CategoryChartSegment[] = normalized.map((s) => ({
    name: s.name,
    value: s.value,
    percentage: parseFloat(((s.value / total) * 100).toFixed(1)),
    color: s.color,
  }));

  // Group small categories (< 3%) into "Други"
  const majorSegments: CategoryChartSegment[] = [];
  const smallSegments: CategoryChartGroupedDetail[] = [];
  let existingOthersSegment: CategoryChartSegment | null = null;

  for (const seg of withPct) {
    const isNamedOthers = seg.name.trim().toLowerCase() === 'други';
    if (isNamedOthers) {
      existingOthersSegment = seg;
      continue;
    }
    if (seg.percentage < groupThresholdPercent && withPct.length > 2) {
      smallSegments.push({
        name: seg.name,
        value: seg.value,
        percentage: seg.percentage,
        color: seg.color,
      });
    } else {
      majorSegments.push(seg);
    }
  }

  const finalSegments: CategoryChartSegment[] = [...majorSegments];

  if (smallSegments.length > 0 || existingOthersSegment) {
    const othersBaseValue = existingOthersSegment ? existingOthersSegment.value : 0;
    const smallSum = smallSegments.reduce((s, x) => s + x.value, 0);
    const combinedValue = parseFloat((othersBaseValue + smallSum).toFixed(2));
    const combinedPct = parseFloat(((combinedValue / total) * 100).toFixed(1));

    const groupedList: CategoryChartGroupedDetail[] = [...smallSegments];
    if (existingOthersSegment && smallSegments.length > 0) {
      groupedList.unshift({
        name: existingOthersSegment.name,
        value: existingOthersSegment.value,
        percentage: existingOthersSegment.percentage,
        color: existingOthersSegment.color,
      });
    }

    finalSegments.push({
      name: 'Други',
      value: combinedValue,
      percentage: combinedPct,
      color: SYSTEM_CATEGORY_COLORS['Други'],
      isOthersGroup: smallSegments.length > 0,
      groupedItems: smallSegments.length > 0 ? groupedList : undefined,
    });
  }

  // Keep largest first, with "Други" at bottom
  finalSegments.sort((a, b) => {
    if (a.isOthersGroup && !b.isOthersGroup) return 1;
    if (!a.isOthersGroup && b.isOthersGroup) return -1;
    return b.value - a.value;
  });

  // Deconflict duplicate or overly similar colors within the same chart while preserving canonical locks
  const assignedColors: string[] = [];
  const deconflictedSegments = finalSegments.map((seg) => {
    const tooCloseToExisting = assignedColors.some(
      (used) => perceptualColorDistance(seg.color, used) < 75
    );
    const exactDuplicate = assignedColors.some(
      (used) => used.toLowerCase() === seg.color.toLowerCase()
    );

    const isLockedPrimary = !seg.isOthersGroup && hasExplicitCanonicalMapping(seg.name);

    if (!exactDuplicate && (!tooCloseToExisting || isLockedPrimary)) {
      assignedColors.push(seg.color);
      return seg;
    }

    // Pick palette color that maximizes minimum perceptual distance from all already-used colors
    let bestColor = seg.color;
    let bestMinDist = -1;
    for (const candidate of DISTINCT_CATEGORY_PALETTE) {
      if (assignedColors.some((u) => u.toLowerCase() === candidate.toLowerCase())) {
        continue;
      }
      const minDist = assignedColors.length === 0
        ? Infinity
        : Math.min(...assignedColors.map((u) => perceptualColorDistance(candidate, u)));
      if (minDist > bestMinDist) {
        bestMinDist = minDist;
        bestColor = candidate;
      }
    }

    assignedColors.push(bestColor);
    return { ...seg, color: bestColor };
  });

  const preferHorizontalBars = deconflictedSegments.length > horizontalBarThresholdCount;

  return {
    segments: deconflictedSegments,
    rawCount,
    total,
    hasGroupedSmallCategories: smallSegments.length > 0,
    preferHorizontalBars,
  };
}
