import { ElectricityRecord } from "@/types";
import { userStorage, STORAGE_BASE_ELECTRICITY_HISTORY } from "./userStorage";

export const STORAGE_KEY_ELECTRICITY_HISTORY = "HomeBudget_ElectricityHistory";

export const MONTHS_BG_LIST = [
  "Януари",
  "Февруари",
  "Март",
  "Април",
  "Май",
  "Юни",
  "Юли",
  "Август",
  "Септември",
  "Октомври",
  "Ноември",
  "Декември",
];

// Initial realistic seed records so user immediately sees charts and history
const DEFAULT_SEED_RECORDS: ElectricityRecord[] = [
  {
    id: "elec_seed_jul2026",
    createdAt: "2026-07-28T10:00:00.000Z",
    month: "Юли",
    year: "2026",
    periodLabel: "Юли 2026",
    prevT1: 14200.0,
    prevT2: 7850.0,
    previousReading: 22050.0,
    currT1: 14480.0,
    currT2: 8010.0,
    currentReading: 22490.0,
    consT1: 280.0,
    consT2: 160.0,
    consumption: 440.0,
    priceT1: 0.15458,
    priceT2: 0.09226,
    unitPrice: 0.1319,
    costEm1: 58.04,
    em2Remainder: 41.96,
    totalCost: 100.0,
    note: "Летен отчет - климатици",
  },
  {
    id: "elec_seed_aug2026",
    createdAt: "2026-08-27T10:00:00.000Z",
    month: "Август",
    year: "2026",
    periodLabel: "Август 2026",
    prevT1: 14480.0,
    prevT2: 8010.0,
    previousReading: 22490.0,
    currT1: 14795.0,
    currT2: 8195.0,
    currentReading: 22990.0,
    consT1: 315.0,
    consT2: 185.0,
    consumption: 500.0,
    priceT1: 0.15458,
    priceT2: 0.09226,
    unitPrice: 0.1315,
    costEm1: 65.76,
    em2Remainder: 49.24,
    totalCost: 115.0,
    note: "По-висока консумация заради горещините",
  },
  {
    id: "elec_seed_sep2026",
    createdAt: "2026-09-28T10:00:00.000Z",
    month: "Септември",
    year: "2026",
    periodLabel: "Септември 2026",
    prevT1: 14795.0,
    prevT2: 8195.0,
    previousReading: 22990.0,
    currT1: 15060.0,
    currT2: 8345.0,
    currentReading: 23405.0,
    consT1: 265.0,
    consT2: 150.0,
    consumption: 415.0,
    priceT1: 0.15458,
    priceT2: 0.09226,
    unitPrice: 0.1321,
    costEm1: 54.80,
    em2Remainder: 37.20,
    totalCost: 92.0,
    note: "Умерено потребление",
  },
  {
    id: "elec_seed_oct2026",
    createdAt: "2026-10-29T10:00:00.000Z",
    month: "Октомври",
    year: "2026",
    periodLabel: "Октомври 2026",
    prevT1: 15060.0,
    prevT2: 8345.0,
    previousReading: 23405.0,
    currT1: 15350.0,
    currT2: 8520.0,
    currentReading: 23870.0,
    consT1: 290.0,
    consT2: 175.0,
    consumption: 465.0,
    priceT1: 0.15458,
    priceT2: 0.09226,
    unitPrice: 0.1311,
    costEm1: 60.97,
    em2Remainder: 44.03,
    totalCost: 105.0,
    note: "Начало на отоплителния сезон",
  },
];

/**
 * Loads electricity history from account-isolated userStorage.
 * Authenticated accounts start clean with [] (never seeded with shared demo records).
 * Unauthenticated guest workspace keeps seed records only if guest hasn't saved any yet.
 */
export function getStoredElectricityHistory(): ElectricityRecord[] {
  const activeUid = userStorage.getActiveUid();
  try {
    const raw = userStorage.getItem(STORAGE_BASE_ELECTRICITY_HISTORY);
    if (!raw) {
      return activeUid === "guest" ? DEFAULT_SEED_RECORDS : [];
    }
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed;
    }
    return activeUid === "guest" ? DEFAULT_SEED_RECORDS : [];
  } catch (err) {
    console.error("Failed to load electricity history:", err);
    return activeUid === "guest" ? DEFAULT_SEED_RECORDS : [];
  }
}

/**
 * Saves full electricity history array to account-isolated userStorage.
 */
export function saveElectricityHistory(
  records: ElectricityRecord[]
): ElectricityRecord[] {
  try {
    userStorage.setItem(
      STORAGE_BASE_ELECTRICITY_HISTORY,
      JSON.stringify(records)
    );
  } catch (err) {
    console.error("Failed to save electricity history:", err);
  }
  return records;
}

/**
 * Appends or prepends a new electricity bill record to history and saves to localStorage.
 */
export function addElectricityRecord(
  record: ElectricityRecord
): ElectricityRecord[] {
  const current = getStoredElectricityHistory();
  const filtered = current.filter((r) => r.id !== record.id);
  const updated = [record, ...filtered];
  saveElectricityHistory(updated);
  return updated;
}

/**
 * Deletes an electricity record by ID and updates localStorage.
 */
export function deleteElectricityRecord(id: string): ElectricityRecord[] {
  const current = getStoredElectricityHistory();
  const updated = current.filter((r) => r.id !== id);
  saveElectricityHistory(updated);
  return updated;
}
