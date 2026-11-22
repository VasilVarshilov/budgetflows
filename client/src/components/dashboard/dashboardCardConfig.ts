import { userStorage } from "@/utils/userStorage";

export type DashboardCardId =
  | "overview"
  | "spending"
  | "upcoming"
  | "income"
  | "budget"
  | "savings"
  | "electricity"
  | "ai-insights";

export interface DashboardCardMeta {
  id: DashboardCardId;
  title: string;
  category: string;
  supportsChartToggle?: boolean;
}

export const DASHBOARD_CARDS_META: Record<DashboardCardId, DashboardCardMeta> = {
  overview: {
    id: "overview",
    title: "Общ преглед",
    category: "Баланс и потоци",
    supportsChartToggle: true,
  },
  spending: {
    id: "spending",
    title: "Преглед на разходите",
    category: "Разходи",
    supportsChartToggle: true,
  },
  upcoming: {
    id: "upcoming",
    title: "Предстоящи разходи",
    category: "Планирани плащания",
    supportsChartToggle: false,
  },
  income: {
    id: "income",
    title: "Преглед на приходите",
    category: "Приходи",
    supportsChartToggle: true,
  },
  budget: {
    id: "budget",
    title: "Статус на бюджета",
    category: "Бюджетен контрол",
    supportsChartToggle: false,
  },
  savings: {
    id: "savings",
    title: "Спестявания",
    category: "Фонд и цели",
    supportsChartToggle: true,
  },
  electricity: {
    id: "electricity",
    title: "Електроенергия",
    category: "Комунални разходи",
    supportsChartToggle: true,
  },
  "ai-insights": {
    id: "ai-insights",
    title: "AI Инсайти",
    category: "Интелигентни наблюдения",
    supportsChartToggle: false,
  },
};

export const DEFAULT_DASHBOARD_CARD_ORDER: DashboardCardId[] = [
  "overview",
  "spending",
  "upcoming",
  "income",
  "budget",
  "savings",
  "electricity",
  "ai-insights",
];

const STORAGE_BASE_CARD_ORDER = "DashboardCardOrder";

export function isDashboardCardId(value: unknown): value is DashboardCardId {
  return (
    typeof value === "string" &&
    (DEFAULT_DASHBOARD_CARD_ORDER as string[]).includes(value)
  );
}

export function normalizeDashboardCardOrder(raw: unknown): DashboardCardId[] {
  if (!Array.isArray(raw)) {
    return [...DEFAULT_DASHBOARD_CARD_ORDER];
  }
  const seen = new Set<DashboardCardId>();
  const valid: DashboardCardId[] = [];
  for (const item of raw) {
    if (isDashboardCardId(item) && !seen.has(item)) {
      seen.add(item);
      valid.push(item);
    }
  }
  for (const fallbackId of DEFAULT_DASHBOARD_CARD_ORDER) {
    if (!seen.has(fallbackId)) {
      seen.add(fallbackId);
      valid.push(fallbackId);
    }
  }
  return valid;
}

export function loadDashboardCardOrder(): DashboardCardId[] {
  const saved = userStorage.getJSON<unknown>(
    STORAGE_BASE_CARD_ORDER,
    DEFAULT_DASHBOARD_CARD_ORDER
  );
  return normalizeDashboardCardOrder(saved);
}

export function saveDashboardCardOrder(order: DashboardCardId[]): DashboardCardId[] {
  const normalized = normalizeDashboardCardOrder(order);
  userStorage.setJSON(STORAGE_BASE_CARD_ORDER, normalized);
  return normalized;
}
