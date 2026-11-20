import { ElectricityRecord } from "@/types";
import {
  getElectricityMeterTypeLabel,
  resolveElectricityMeterMode,
} from "./electricityStorage";

export interface ElectricityFilterInfo {
  selectedYear: string; // "all" or "2026"
  selectedMonth: string; // "all" or "Ноември"
  meterTypeFilter?: "all" | "single" | "double";
}

export function getElectricityMeterFilterLabel(
  meterTypeFilter?: "all" | "single" | "double"
): string {
  if (meterTypeFilter === "single") return "1 Електромер";
  if (meterTypeFilter === "double") return "2 Електромера";
  return "Всички";
}

export function getElectricityFilterLabel(filter: ElectricityFilterInfo): string {
  if (filter.selectedYear === "all" && filter.selectedMonth === "all") {
    return "Всички периоди";
  }
  if (filter.selectedYear !== "all" && filter.selectedMonth === "all") {
    return `Година ${filter.selectedYear}`;
  }
  if (filter.selectedYear === "all" && filter.selectedMonth !== "all") {
    return `Всички години - ${filter.selectedMonth}`;
  }
  return `${filter.selectedMonth} ${filter.selectedYear}`;
}

/**
 * Generates and downloads a clean, beautifully formatted TXT report of electricity history.
 */
export function exportElectricityHistoryToTxt(
  records: ElectricityRecord[],
  filter: ElectricityFilterInfo
) {
  const periodLabel = getElectricityFilterLabel(filter);
  const meterFilterLabel = getElectricityMeterFilterLabel(filter.meterTypeFilter);
  const now = new Date();
  const dateFormatted = now.toLocaleDateString("bg-BG", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
  const timeFormatted = now.toLocaleTimeString("bg-BG", {
    hour: "2-digit",
    minute: "2-digit",
  });

  const totalRecords = records.length;
  const totalConsumption = records.reduce((sum, r) => sum + r.consumption, 0);
  const totalConsT1 = records.reduce((sum, r) => sum + r.consT1, 0);
  const totalConsT2 = records.reduce((sum, r) => sum + r.consT2, 0);
  const totalCost = records.reduce((sum, r) => sum + r.totalCost, 0);

  const singleRecords = records.filter(
    (r) => resolveElectricityMeterMode(r) === "single"
  );
  const doubleRecords = records.filter(
    (r) => resolveElectricityMeterMode(r) === "double"
  );
  const totalSingleCost = singleRecords.reduce((sum, r) => sum + r.totalCost, 0);
  const totalDoubleEm1 = doubleRecords.reduce((sum, r) => sum + r.costEm1, 0);
  const totalDoubleEm2 = doubleRecords.reduce((sum, r) => sum + r.em2Remainder, 0);

  const recordsWithConsumption = records.filter((r) => r.consumption > 0);
  const costForMeasured = recordsWithConsumption.reduce(
    (sum, r) => sum + r.totalCost,
    0
  );
  const avgConsumption =
    recordsWithConsumption.length > 0
      ? totalConsumption / recordsWithConsumption.length
      : 0;
  const avgCost = totalRecords > 0 ? totalCost / totalRecords : 0;
  const avgUnitPrice =
    totalConsumption > 0 ? costForMeasured / totalConsumption : 0;

  const costSummaryLines: string[] =
    doubleRecords.length > 0 && singleRecords.length === 0
      ? [
          `• Общ разход (Фактури):       €${totalCost.toFixed(2)}`,
          `    - Електромер 1:           €${totalDoubleEm1.toFixed(2)}`,
          `    - Електромер 2 (Остатък): €${totalDoubleEm2.toFixed(2)}`,
        ]
      : singleRecords.length > 0 && doubleRecords.length === 0
      ? [`• Общ разход (1 Електромер):  €${totalCost.toFixed(2)}`]
      : [
          `• Общ разход:                 €${totalCost.toFixed(2)}`,
          ...(singleRecords.length > 0
            ? [`    - 1 Електромер (${singleRecords.length}):     €${totalSingleCost.toFixed(2)}`]
            : []),
          ...(doubleRecords.length > 0
            ? [
                `    - 2 Електромера (${doubleRecords.length}):    ЕМ 1: €${totalDoubleEm1.toFixed(2)} | ЕМ 2: €${totalDoubleEm2.toFixed(2)}`,
              ]
            : []),
        ];

  const lines: string[] = [
    "=======================================================================",
    "                BUDGET FORCE 365 - ИСТОРИЯ НА ТОКА                     ",
    "               ОТЧЕТ И АНАЛИЗ НА РАЗХОДИТЕ ЗА ЕЛЕКТРОЕНЕРГИЯ           ",
    "=======================================================================",
    `Период:              ${periodLabel}`,
    `Тип калкулатор:      ${meterFilterLabel}`,
    `Дата на генериране:  ${dateFormatted} г., ${timeFormatted} ч.`,
    `Общ брой отчети:     ${totalRecords}`,
    "-----------------------------------------------------------------------",
    "ОБОБЩЕНА СТАТИСТИКА ЗА ПЕРИОДА",
    "-----------------------------------------------------------------------",
    `• Общо потребление:           ${totalConsumption.toFixed(3)} kWh`,
    `    - Дневна тарифа (Т1):     ${totalConsT1.toFixed(3)} kWh (${
      totalConsumption > 0 ? ((totalConsT1 / totalConsumption) * 100).toFixed(1) : 0
    }%)`,
    `    - Нощна тарифа (Т2):      ${totalConsT2.toFixed(3)} kWh (${
      totalConsumption > 0 ? ((totalConsT2 / totalConsumption) * 100).toFixed(1) : 0
    }%)`,
    ...costSummaryLines,
    `• Средно потребление/отчет:   ${avgConsumption.toFixed(3)} kWh`,
    `• Средна сметка/отчет:        €${avgCost.toFixed(2)}`,
    `• Средна цена за kWh:         €${avgUnitPrice.toFixed(4)} / kWh`,
    "-----------------------------------------------------------------------",
    "ПОДРОБЕН ОПИС НА ВСИЧКИ ОТЧЕТИ",
    "-----------------------------------------------------------------------",
  ];

  if (records.length === 0) {
    lines.push("Няма намерени записи за избрания период.");
  } else {
    records.forEach((r, idx) => {
      const mode = resolveElectricityMeterMode(r);
      const typeLabel = getElectricityMeterTypeLabel(r);
      lines.push(`Отчет #${idx + 1} - Период: ${r.periodLabel} [${typeLabel}]`);
      lines.push(`  • Тип:              ${typeLabel}`);
      if (mode !== "manual") {
        lines.push(`  • Старо показание:  Т1: ${r.prevT1.toFixed(1)} | Т2: ${r.prevT2.toFixed(1)} | Общо: ${r.previousReading.toFixed(1)}`);
        lines.push(`  • Ново показание:   Т1: ${r.currT1.toFixed(1)} | Т2: ${r.currT2.toFixed(1)} | Общо: ${r.currentReading.toFixed(1)}`);
        lines.push(`  • Потребление:      Т1: ${r.consT1.toFixed(3)} kWh | Т2: ${r.consT2.toFixed(3)} kWh | Общо: ${r.consumption.toFixed(3)} kWh`);
        lines.push(`  • Единична цена:    Т1: €${r.priceT1.toFixed(5)}/kWh | Т2: €${r.priceT2.toFixed(5)}/kWh | Средна: €${r.unitPrice.toFixed(4)}/kWh`);
        if (mode === "single") {
          lines.push(`  • Сметка ток:       €${r.costEm1.toFixed(2)}`);
        } else {
          lines.push(`  • Стойност ЕМ 1:    €${r.costEm1.toFixed(2)}`);
          lines.push(`  • Стойност ЕМ 2:    €${r.em2Remainder.toFixed(2)}`);
          lines.push(`  • Обща фактура:     €${r.totalCost.toFixed(2)}`);
        }
      } else {
        if (r.consumption > 0) {
          lines.push(`  • Потребление:      ${r.consumption.toFixed(3)} kWh`);
        }
        lines.push(`  • Сума:             €${r.totalCost.toFixed(2)}`);
      }
      if (r.note) {
        lines.push(`  • Забележка:        ${r.note}`);
      }
      lines.push("-----------------------------------------------------------------------");
    });
  }

  lines.push("Бележка: Всички суми и тарифи са в EUR (€).");
  lines.push("Генерирано автоматично от Budget Force 365 • May the Budget Force be with you.");
  lines.push("=======================================================================");

  const content = lines.join("\n");
  const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  const safePeriod = periodLabel.replace(/[\s/\\:]+/g, "_");
  const safeType =
    filter.meterTypeFilter && filter.meterTypeFilter !== "all"
      ? `_${filter.meterTypeFilter}`
      : "";
  link.download = `BudgetForce365_Electricity_History_${safePeriod}${safeType}.txt`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Generates and downloads a high-resolution PNG image report using HTML5 Canvas.
 */
export async function exportElectricityHistoryToPng(
  records: ElectricityRecord[],
  filter: ElectricityFilterInfo
) {
  const periodLabel = getElectricityFilterLabel(filter);
  const meterFilterLabel = getElectricityMeterFilterLabel(filter.meterTypeFilter);
  const now = new Date();
  const dateFormatted = now.toLocaleDateString("bg-BG", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });

  const totalRecords = records.length;
  const totalConsumption = records.reduce((sum, r) => sum + r.consumption, 0);
  const totalConsT1 = records.reduce((sum, r) => sum + r.consT1, 0);
  const totalConsT2 = records.reduce((sum, r) => sum + r.consT2, 0);
  const totalCost = records.reduce((sum, r) => sum + r.totalCost, 0);
  const avgCost = totalRecords > 0 ? totalCost / totalRecords : 0;
  const recordsWithConsumption = records.filter((r) => r.consumption > 0);
  const costForMeasured = recordsWithConsumption.reduce(
    (sum, r) => sum + r.totalCost,
    0
  );
  const avgUnitPrice =
    totalConsumption > 0 ? costForMeasured / totalConsumption : 0;

  const width = 1220;
  const tableRowsCount = Math.max(records.length, 1);
  const height = 400 + tableRowsCount * 44 + 100;

  const canvas = document.createElement("canvas");
  canvas.width = width * 2;
  canvas.height = height * 2;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  ctx.scale(2, 2);

  // Background
  ctx.fillStyle = "#f8fafc";
  ctx.fillRect(0, 0, width, height);

  // Header banner
  const headerGrad = ctx.createLinearGradient(0, 0, width, 0);
  headerGrad.addColorStop(0, "#0f172a");
  headerGrad.addColorStop(1, "#1e293b");
  ctx.fillStyle = headerGrad;
  ctx.fillRect(0, 0, width, 120);

  // Accent line
  ctx.fillStyle = "#eab308";
  ctx.fillRect(0, 117, width, 3);

  // Title & Subtitle
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 22px sans-serif";
  ctx.fillText("⚡ BUDGET FORCE 365 • ИСТОРИЯ НА ЕЛЕКТРОЕНЕРГИЯ", 40, 50);

  ctx.fillStyle = "#94a3b8";
  ctx.font = "14px sans-serif";
  ctx.fillText(
    `Период: ${periodLabel} • Тип: ${meterFilterLabel} • Генериран: ${dateFormatted}`,
    40,
    80
  );

  // 4 KPI Cards
  const kpiY = 145;
  const kpiW = (width - 80 - 3 * 16) / 4;
  const kpiH = 90;

  const kpis = [
    { title: "ОБЩО ПОТРЕБЛЕНИЕ", val: `${totalConsumption.toFixed(1)} kWh`, sub: `Т1: ${totalConsT1.toFixed(0)} | Т2: ${totalConsT2.toFixed(0)}`, color: "#b45309" },
    { title: "ОБЩ РАЗХОД", val: `€${totalCost.toFixed(2)}`, sub: `${totalRecords} отчета (EUR)`, color: "#047857" },
    { title: "СРЕДНА СМЕТКА", val: `€${avgCost.toFixed(2)}`, sub: "Средно на отчет (EUR)", color: "#4338ca" },
    { title: "СРЕДНА ЦЕНА / KWH", val: `€${avgUnitPrice.toFixed(4)}/kWh`, sub: "Ефективна цена (€/kWh)", color: "#0369a1" },
  ];

  kpis.forEach((kpi, i) => {
    const x = 40 + i * (kpiW + 16);
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.roundRect(x, kpiY, kpiW, kpiH, 10);
    ctx.fill();

    ctx.strokeStyle = "#e2e8f0";
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.fillStyle = "#64748b";
    ctx.font = "bold 11px sans-serif";
    ctx.fillText(kpi.title, x + 16, kpiY + 24);

    ctx.fillStyle = kpi.color;
    ctx.font = "bold 20px sans-serif";
    ctx.fillText(kpi.val, x + 16, kpiY + 52);

    ctx.fillStyle = "#94a3b8";
    ctx.font = "11px sans-serif";
    ctx.fillText(kpi.sub, x + 16, kpiY + 74);
  });

  // Table
  const tableY = 260;
  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.roundRect(40, tableY, width - 80, tableRowsCount * 44 + 48, 10);
  ctx.fill();
  ctx.strokeStyle = "#e2e8f0";
  ctx.stroke();

  // Table header
  ctx.fillStyle = "#0f172a";
  ctx.beginPath();
  ctx.roundRect(40, tableY, width - 80, 42, [10, 10, 0, 0]);
  ctx.fill();

  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 12px sans-serif";
  ctx.fillText("ПЕРИОД", 56, tableY + 26);
  ctx.fillText("ТИП", 195, tableY + 26);
  ctx.fillText("СТАРО ПОК.", 330, tableY + 26);
  ctx.fillText("НОВО ПОК.", 455, tableY + 26);
  ctx.fillText("ПОТРЕБЛЕНИЕ", 585, tableY + 26);
  ctx.fillText("ЕД. ЦЕНА", 740, tableY + 26);
  ctx.fillText("ЕМ 1 (€)", 865, tableY + 26);
  ctx.fillText("ЕМ 2 (€)", 975, tableY + 26);
  ctx.fillText("ОБЩО (€)", 1080, tableY + 26);

  // Table rows
  records.forEach((r, idx) => {
    const mode = resolveElectricityMeterMode(r);
    const typeLabel = getElectricityMeterTypeLabel(r);
    const isManual = mode === "manual";
    const rowY = tableY + 42 + idx * 44;
    if (idx % 2 === 1) {
      ctx.fillStyle = "#f8fafc";
      ctx.fillRect(41, rowY, width - 82, 44);
    }
    ctx.strokeStyle = "#f1f5f9";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(40, rowY + 44);
    ctx.lineTo(width - 40, rowY + 44);
    ctx.stroke();

    ctx.fillStyle = "#0f172a";
    ctx.font = "bold 13px sans-serif";
    ctx.fillText(r.periodLabel, 56, rowY + 27);

    ctx.fillStyle =
      mode === "single" ? "#b45309" : mode === "double" ? "#4338ca" : "#64748b";
    ctx.font = "bold 11px sans-serif";
    ctx.fillText(typeLabel, 195, rowY + 27);

    ctx.fillStyle = "#475569";
    ctx.font = "12px monospace";
    ctx.fillText(isManual ? "—" : `${r.previousReading.toFixed(1)}`, 330, rowY + 27);
    ctx.fillText(isManual ? "—" : `${r.currentReading.toFixed(1)}`, 455, rowY + 27);

    ctx.fillStyle = "#b45309";
    ctx.font = "bold 12px sans-serif";
    ctx.fillText(r.consumption > 0 ? `${r.consumption.toFixed(2)} kWh` : "—", 585, rowY + 27);

    ctx.fillStyle = "#64748b";
    ctx.font = "12px sans-serif";
    ctx.fillText(r.unitPrice > 0 ? `€${r.unitPrice.toFixed(4)}` : "—", 740, rowY + 27);

    ctx.fillStyle = "#1e293b";
    ctx.fillText(isManual ? "—" : `€${r.costEm1.toFixed(2)}`, 865, rowY + 27);

    ctx.fillStyle = mode === "double" ? "#047857" : "#94a3b8";
    ctx.fillText(mode === "double" ? `€${r.em2Remainder.toFixed(2)}` : "—", 975, rowY + 27);

    ctx.fillStyle = "#0f172a";
    ctx.font = "bold 13px sans-serif";
    ctx.fillText(`€${r.totalCost.toFixed(2)}`, 1080, rowY + 27);
  });

  // Footer
  ctx.fillStyle = "#94a3b8";
  ctx.font = "12px sans-serif";
  ctx.fillText(
    `Budget Force 365 • May the Budget Force be with you. • Общо ${totalRecords} записа`,
    40,
    height - 30
  );

  const safePeriod = periodLabel.replace(/[\s/\\:]+/g, "_");
  const safeType =
    filter.meterTypeFilter && filter.meterTypeFilter !== "all"
      ? `_${filter.meterTypeFilter}`
      : "";
  const dataUrl = canvas.toDataURL("image/png");
  const link = document.createElement("a");
  link.href = dataUrl;
  link.download = `BudgetForce365_Electricity_Report_${safePeriod}${safeType}.png`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
