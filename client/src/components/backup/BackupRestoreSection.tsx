import React, { useState, useEffect, useRef } from "react";
import {
  Download,
  Upload,
  Database,
  FileJson,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Calendar,
  Layers,
  Zap,
  PiggyBank,
  DollarSign,
  Sliders,
  ShieldCheck,
  FolderArchive,
  ArrowRight,
  X,
  FileCheck,
  AlertOctagon,
  Copy,
  Check,
} from "lucide-react";
import {
  exportBackupFile,
  validateAndParseBackupFile,
  applyBackup,
  gatherApplicationData,
  STORAGE_KEY_SETTINGS,
  DEFAULT_SETTINGS,
} from "@/utils/backupRestore";
import { BackupData, AppSettings } from "@/types";

interface BackupRestoreSectionProps {
  onDataRestored?: () => void;
}

export const BackupRestoreSection: React.FC<BackupRestoreSectionProps> = ({
  onDataRestored,
}) => {
  // Current system snapshot
  const [currentSnapshot, setCurrentSnapshot] = useState<BackupData | null>(null);
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);

  // File import state
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedFileName, setSelectedFileName] = useState<string>("");
  const [selectedFileSize, setSelectedFileSize] = useState<string>("");
  const [pendingBackup, setPendingBackup] = useState<BackupData | null>(null);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [importMode, setImportMode] = useState<"merge" | "replace">("merge");
  const [confirmReplaceChecked, setConfirmReplaceChecked] = useState(false);

  // Notifications
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [copiedJson, setCopiedJson] = useState(false);

  // Refresh current data snapshot
  const refreshSnapshot = () => {
    try {
      const data = gatherApplicationData();
      setCurrentSnapshot(data);
      setSettings(data.data.settings);
    } catch (e) {
      console.error("Failed gathering app data snapshot:", e);
    }
  };

  useEffect(() => {
    refreshSnapshot();
  }, []);

  // Handle Export Backup
  const handleExportBackup = () => {
    setErrorMessage(null);
    try {
      const { filename, backup } = exportBackupFile();
      refreshSnapshot();
      setSuccessMessage(
        `Архивът беше изтеглен успешно като "${filename}". Включени са ${backup.summary.expensesCount} разхода, ${backup.summary.savingsCount} спестявания и ${backup.summary.electricityCount} сметки за ток.`
      );
      setTimeout(() => setSuccessMessage(null), 8000);
    } catch (err: any) {
      setErrorMessage(
        "Възникна грешка при експортирането на архива: " +
          (err?.message || "Неизвестна грешка")
      );
    }
  };

  // Handle Copy JSON to clipboard
  const handleCopyJson = () => {
    try {
      const data = gatherApplicationData();
      navigator.clipboard.writeText(JSON.stringify(data, null, 2));
      setCopiedJson(true);
      setTimeout(() => setCopiedJson(false), 2500);
    } catch (e) {
      setErrorMessage("Неуспешно копиране в клипборда.");
    }
  };

  // Handle File Selection
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setErrorMessage(null);
    setSuccessMessage(null);
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const file = files[0];
    setSelectedFileName(file.name);
    setSelectedFileSize((file.size / 1024).toFixed(1) + " KB");

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      const result = validateAndParseBackupFile(content);

      if (!result.isValid || !result.backup) {
        setErrorMessage(
          result.errorMessage ||
            "Файлът не можа да бъде валидиран като съвместим архив."
        );
        if (fileInputRef.current) fileInputRef.current.value = "";
        return;
      }

      setPendingBackup(result.backup);
      setImportMode("merge");
      setConfirmReplaceChecked(false);
      setIsPreviewOpen(true);
    };

    reader.onerror = () => {
      setErrorMessage("Грешка при прочитането на избрания файл.");
    };

    reader.readAsText(file);
  };

  // Execute Import after user confirmation
  const handleConfirmImport = () => {
    if (!pendingBackup) return;

    if (importMode === "replace" && !confirmReplaceChecked) {
      setErrorMessage(
        "Моля, маркирайте отметката за потвърждение на пълната замяна на данните."
      );
      return;
    }

    try {
      const result = applyBackup(pendingBackup, importMode);
      setIsPreviewOpen(false);
      setPendingBackup(null);
      if (fileInputRef.current) fileInputRef.current.value = "";

      refreshSnapshot();

      // Trigger app state update
      if (onDataRestored) {
        onDataRestored();
      }

      setSuccessMessage(result.message);
      setTimeout(() => setSuccessMessage(null), 9000);
    } catch (err: any) {
      setErrorMessage(
        "Грешка при прилагането на архива: " +
          (err?.message || "Неуспешен импорт")
      );
    }
  };

  const formatIsoDate = (isoStr?: string) => {
    if (!isoStr) return "Няма скорошен архив";
    try {
      const d = new Date(isoStr);
      return d.toLocaleString("bg-BG", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return isoStr;
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Banner / Hero */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white rounded-2xl p-6 sm:p-8 shadow-xl relative overflow-hidden">
        <div className="absolute top-0 right-0 -mt-10 -mr-10 w-64 h-64 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2 max-w-2xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/20 text-indigo-300 text-xs font-semibold tracking-wide border border-indigo-400/20">
              <FolderArchive className="w-3.5 h-3.5" />
              <span>СИГУРНОСТ & АРХИВИРАНЕ</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white">
              Архив и Възстановяване (Backup & Restore)
            </h1>
            <p className="text-slate-300 text-sm sm:text-base leading-relaxed">
              Експортирайте всичките си финансови данни в структуриран JSON файл
              или възстановете съществуващ архив с опция за интелигентно
              обединяване или пълна замяна.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row gap-3">
            <button
              onClick={handleExportBackup}
              className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-sm shadow-lg shadow-indigo-600/30 transition-all hover:scale-[1.02] active:scale-[0.98]"
            >
              <Download className="w-4 h-4" />
              <span>Експорт на архив</span>
            </button>
            <button
              onClick={() => fileInputRef.current?.click()}
              className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-white/10 hover:bg-white/20 text-white font-semibold text-sm border border-white/20 backdrop-blur-sm transition-all hover:scale-[1.02] active:scale-[0.98]"
            >
              <Upload className="w-4 h-4" />
              <span>Импорт на архив</span>
            </button>
          </div>
        </div>
      </div>

      {/* Success Notification */}
      {successMessage && (
        <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 flex items-start gap-3 shadow-sm animate-in fade-in slide-in-from-top-2">
          <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
          <div className="flex-1 text-sm font-medium">{successMessage}</div>
          <button
            onClick={() => setSuccessMessage(null)}
            className="text-emerald-500 hover:text-emerald-700"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Error Notification */}
      {errorMessage && (
        <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-red-900 flex items-start gap-3 shadow-sm animate-in fade-in slide-in-from-top-2">
          <AlertOctagon className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
          <div className="flex-1 text-sm font-medium">{errorMessage}</div>
          <button
            onClick={() => setErrorMessage(null)}
            className="text-red-500 hover:text-red-700"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* System Status Metrics */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 sm:gap-4">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <div className="flex items-center gap-2 text-slate-500 text-xs font-medium mb-1">
            <DollarSign className="w-4 h-4 text-emerald-600" />
            <span>Доходи</span>
          </div>
          <div className="text-xl font-bold text-slate-800">
            {currentSnapshot?.summary.incomeCount ?? 0}
          </div>
          <div className="text-[11px] text-slate-400">записа в системата</div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <div className="flex items-center gap-2 text-slate-500 text-xs font-medium mb-1">
            <Layers className="w-4 h-4 text-rose-600" />
            <span>Разходи</span>
          </div>
          <div className="text-xl font-bold text-slate-800">
            {currentSnapshot?.summary.expensesCount ?? 0}
          </div>
          <div className="text-[11px] text-slate-400">фиксирани & текущи</div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <div className="flex items-center gap-2 text-slate-500 text-xs font-medium mb-1">
            <PiggyBank className="w-4 h-4 text-cyan-600" />
            <span>Спестявания</span>
          </div>
          <div className="text-xl font-bold text-slate-800">
            {currentSnapshot?.summary.savingsCount ?? 0}
          </div>
          <div className="text-[11px] text-slate-400">транзакции</div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <div className="flex items-center gap-2 text-slate-500 text-xs font-medium mb-1">
            <Zap className="w-4 h-4 text-amber-500" />
            <span>Сметки Ток</span>
          </div>
          <div className="text-xl font-bold text-slate-800">
            {currentSnapshot?.summary.electricityCount ?? 0}
          </div>
          <div className="text-[11px] text-slate-400">в историята</div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <div className="flex items-center gap-2 text-slate-500 text-xs font-medium mb-1">
            <Calendar className="w-4 h-4 text-indigo-600" />
            <span>Месеци</span>
          </div>
          <div className="text-xl font-bold text-slate-800">
            {currentSnapshot?.summary.monthsCovered.length ?? 0}
          </div>
          <div className="text-[11px] text-slate-400">с въведени данни</div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <div className="flex items-center gap-2 text-slate-500 text-xs font-medium mb-1">
            <ShieldCheck className="w-4 h-4 text-purple-600" />
            <span>Последен архив</span>
          </div>
          <div className="text-xs font-semibold text-slate-700 truncate" title={settings.lastBackupDate}>
            {settings.lastBackupDate ? new Date(settings.lastBackupDate).toLocaleDateString("bg-BG") : "Няма"}
          </div>
          <div className="text-[11px] text-slate-400">
            {settings.lastBackupDate ? new Date(settings.lastBackupDate).toLocaleTimeString("bg-BG", { hour: "2-digit", minute: "2-digit" }) : "препоръчително"}
          </div>
        </div>
      </div>

      {/* Two Column Action Cards: Export & Import */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Export Card */}
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm flex flex-col justify-between">
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-indigo-50 text-indigo-600 rounded-xl">
                <FileJson className="w-6 h-6" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-slate-800">
                  Експорт на пълен архив (Export Backup)
                </h2>
                <p className="text-xs text-slate-500">
                  Изтегляне на всички модули в един структуриран JSON файл
                </p>
              </div>
            </div>

            <p className="text-sm text-slate-600">
              Генерира надежден JSON архив, съдържащ абсолютно всички данни от
              приложението:
            </p>

            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="flex items-center gap-2 p-2 bg-slate-50 rounded-lg text-slate-700">
                <Check className="w-4 h-4 text-emerald-600" />
                <span>Доходи (Income)</span>
              </div>
              <div className="flex items-center gap-2 p-2 bg-slate-50 rounded-lg text-slate-700">
                <Check className="w-4 h-4 text-emerald-600" />
                <span>Разходи (Expenses)</span>
              </div>
              <div className="flex items-center gap-2 p-2 bg-slate-50 rounded-lg text-slate-700">
                <Check className="w-4 h-4 text-emerald-600" />
                <span>Спестявания (Savings)</span>
              </div>
              <div className="flex items-center gap-2 p-2 bg-slate-50 rounded-lg text-slate-700">
                <Check className="w-4 h-4 text-emerald-600" />
                <span>История на тока (Electricity)</span>
              </div>
              <div className="flex items-center gap-2 p-2 bg-slate-50 rounded-lg text-slate-700">
                <Check className="w-4 h-4 text-emerald-600" />
                <span>Категории (Categories)</span>
              </div>
              <div className="flex items-center gap-2 p-2 bg-slate-50 rounded-lg text-slate-700">
                <Check className="w-4 h-4 text-emerald-600" />
                <span>Бюджети & Настройки</span>
              </div>
            </div>
          </div>

          <div className="pt-6 mt-6 border-t border-slate-100 flex flex-col sm:flex-row gap-3">
            <button
              onClick={handleExportBackup}
              className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-medium text-sm shadow-md transition-all"
            >
              <Download className="w-4 h-4" />
              <span>Експорт на архив (Export Backup)</span>
            </button>
            <button
              onClick={handleCopyJson}
              title="Копирай JSON в клипборда"
              className="px-4 py-3 border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-xl font-medium text-sm inline-flex items-center justify-center gap-2 transition-colors"
            >
              {copiedJson ? (
                <>
                  <Check className="w-4 h-4 text-emerald-600" />
                  <span className="text-emerald-600">Копирано</span>
                </>
              ) : (
                <>
                  <Copy className="w-4 h-4 text-slate-500" />
                  <span>Копирай JSON</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Import Card */}
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm flex flex-col justify-between">
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-emerald-50 text-emerald-600 rounded-xl">
                <Upload className="w-6 h-6" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-slate-800">
                  Възстановяване от архив (Import Backup)
                </h2>
                <p className="text-xs text-slate-500">
                  Валидация, предварителен преглед и избор на режим
                </p>
              </div>
            </div>

            <p className="text-sm text-slate-600">
              Заредете съхранен JSON файл с архив. Системата автоматично проверява
              файла и отваря интерактивен прозорец за преглед преди запис:
            </p>

            {/* Hidden real file input */}
            <input
              type="file"
              ref={fileInputRef}
              accept=".json,application/json"
              onChange={handleFileChange}
              className="hidden"
            />

            {/* Drop / Click Box */}
            <div
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed border-slate-300 hover:border-indigo-400 bg-slate-50/70 hover:bg-indigo-50/30 rounded-xl p-5 text-center cursor-pointer transition-all flex flex-col items-center justify-center gap-2 group"
            >
              <div className="p-3 bg-white rounded-full shadow-sm group-hover:scale-110 transition-transform text-indigo-600">
                <Upload className="w-5 h-5" />
              </div>
              <div>
                <span className="text-sm font-semibold text-slate-800 group-hover:text-indigo-600">
                  Кликнете тук за избор на JSON файл
                </span>
                <p className="text-xs text-slate-400 mt-0.5">
                  Поддържа формат BudgetFlows Backup (*.json)
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 text-xs text-slate-500 bg-slate-50 p-2.5 rounded-lg border border-slate-100">
              <ShieldCheck className="w-4 h-4 text-indigo-500 shrink-0" />
              <span>
                Защита от случайна загуба: Преглед на записите преди всяко възстановяване.
              </span>
            </div>
          </div>

          <div className="pt-6 mt-6 border-t border-slate-100">
            <button
              onClick={() => fileInputRef.current?.click()}
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-medium text-sm shadow-md transition-all"
            >
              <Upload className="w-4 h-4" />
              <span>Импорт на архив (Import Backup)</span>
            </button>
          </div>
        </div>
      </div>

      {/* Structure Information Accordion / Card */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-slate-800 font-bold text-base">
            <Database className="w-5 h-5 text-indigo-600" />
            <span>Структура на архива и съвместимост</span>
          </div>
          <span className="text-xs font-semibold px-2.5 py-1 bg-slate-100 text-slate-600 rounded-full">
            JSON Schema v1.0
          </span>
        </div>

        <div className="text-xs text-slate-500 leading-relaxed grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="p-3 bg-slate-50 rounded-xl border border-slate-100 space-y-1">
            <div className="font-semibold text-slate-700 flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5 text-indigo-600" />
              <span>1. Доходи & Разходи</span>
            </div>
            <p>
              Пълна история на месеците, фиксирани разходи (кредит, телефон,
              интернет), променливи разходи и въведени доходи.
            </p>
          </div>

          <div className="p-3 bg-slate-50 rounded-xl border border-slate-100 space-y-1">
            <div className="font-semibold text-slate-700 flex items-center gap-1.5">
              <Zap className="w-3.5 h-3.5 text-amber-500" />
              <span>2. Електроенергия & Спестявания</span>
            </div>
            <p>
              Всички изчислени сметки за ток с показания на електромерите, цени
              на тарифи Т1/Т2 и транзакции на спестовния фонд.
            </p>
          </div>

          <div className="p-3 bg-slate-50 rounded-xl border border-slate-100 space-y-1">
            <div className="font-semibold text-slate-700 flex items-center gap-1.5">
              <Sliders className="w-3.5 h-3.5 text-emerald-600" />
              <span>3. Категории, Бюджети & Настройки</span>
            </div>
            <p>
              Персонализирани категории, месечни лимити за харчене, валута и
              параметри на тарифите по подразбиране.
            </p>
          </div>
        </div>
      </div>

      {/* ========================================================= */}
      {/* PREVIEW & IMPORT MODAL */}
      {/* ========================================================= */}
      {isPreviewOpen && pendingBackup && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-2xl w-full max-h-[90vh] flex flex-col overflow-hidden animate-in zoom-in-95">
            {/* Modal Header */}
            <div className="p-5 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-indigo-100 text-indigo-700 rounded-lg">
                  <FileCheck className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-800 text-base sm:text-lg">
                    Преглед на архив преди импортиране
                  </h3>
                  <p className="text-xs text-slate-500">
                    {selectedFileName} ({selectedFileSize})
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsPreviewOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-200/50"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-5 sm:p-6 overflow-y-auto space-y-6">
              {/* File Metadata Overview */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 bg-indigo-50/60 p-4 rounded-xl border border-indigo-100">
                <div>
                  <div className="text-[11px] text-indigo-600 font-medium">
                    Дата на архива
                  </div>
                  <div className="text-xs font-bold text-slate-800">
                    {formatIsoDate(pendingBackup.exportDate)}
                  </div>
                </div>
                <div>
                  <div className="text-[11px] text-indigo-600 font-medium">
                    Версия на схемата
                  </div>
                  <div className="text-xs font-bold text-slate-800">
                    v{pendingBackup.version || "1.0"}
                  </div>
                </div>
                <div>
                  <div className="text-[11px] text-indigo-600 font-medium">
                    Приложение
                  </div>
                  <div className="text-xs font-bold text-slate-800">
                    {pendingBackup.appName || "BudgetFlows"}
                  </div>
                </div>
              </div>

              {/* Comparison Breakdown Table */}
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">
                  Сравнение на записите (Текущи vs Архив)
                </h4>
                <div className="border border-slate-200 rounded-xl overflow-hidden text-xs">
                  <table className="w-full text-left divide-y divide-slate-200">
                    <thead className="bg-slate-50 text-slate-600 font-semibold">
                      <tr>
                        <th className="py-2.5 px-3">Модул / Категория</th>
                        <th className="py-2.5 px-3 text-center">Текущо в приложението</th>
                        <th className="py-2.5 px-3 text-center">В избрания архив</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 bg-white text-slate-700">
                      <tr>
                        <td className="py-2.5 px-3 font-medium flex items-center gap-1.5">
                          <DollarSign className="w-3.5 h-3.5 text-emerald-600" />
                          <span>Доходи (Income)</span>
                        </td>
                        <td className="py-2.5 px-3 text-center text-slate-500">
                          {currentSnapshot?.summary.incomeCount ?? 0}
                        </td>
                        <td className="py-2.5 px-3 text-center font-bold text-emerald-600">
                          {pendingBackup.summary.incomeCount}
                        </td>
                      </tr>

                      <tr>
                        <td className="py-2.5 px-3 font-medium flex items-center gap-1.5">
                          <Layers className="w-3.5 h-3.5 text-rose-600" />
                          <span>Разходи (Expenses)</span>
                        </td>
                        <td className="py-2.5 px-3 text-center text-slate-500">
                          {currentSnapshot?.summary.expensesCount ?? 0}
                        </td>
                        <td className="py-2.5 px-3 text-center font-bold text-rose-600">
                          {pendingBackup.summary.expensesCount}
                        </td>
                      </tr>

                      <tr>
                        <td className="py-2.5 px-3 font-medium flex items-center gap-1.5">
                          <PiggyBank className="w-3.5 h-3.5 text-cyan-600" />
                          <span>Спестявания (Savings)</span>
                        </td>
                        <td className="py-2.5 px-3 text-center text-slate-500">
                          {currentSnapshot?.summary.savingsCount ?? 0}
                        </td>
                        <td className="py-2.5 px-3 text-center font-bold text-cyan-600">
                          {pendingBackup.summary.savingsCount}
                        </td>
                      </tr>

                      <tr>
                        <td className="py-2.5 px-3 font-medium flex items-center gap-1.5">
                          <Zap className="w-3.5 h-3.5 text-amber-500" />
                          <span>Сметки за ток (Electricity History)</span>
                        </td>
                        <td className="py-2.5 px-3 text-center text-slate-500">
                          {currentSnapshot?.summary.electricityCount ?? 0}
                        </td>
                        <td className="py-2.5 px-3 text-center font-bold text-amber-600">
                          {pendingBackup.summary.electricityCount}
                        </td>
                      </tr>

                      <tr>
                        <td className="py-2.5 px-3 font-medium flex items-center gap-1.5">
                          <Calendar className="w-3.5 h-3.5 text-indigo-600" />
                          <span>Обхванати месеци</span>
                        </td>
                        <td className="py-2.5 px-3 text-center text-slate-500">
                          {currentSnapshot?.summary.monthsCovered.length ?? 0}
                        </td>
                        <td className="py-2.5 px-3 text-center font-bold text-indigo-600">
                          {pendingBackup.summary.monthsCovered.length}
                        </td>
                      </tr>

                      <tr>
                        <td className="py-2.5 px-3 font-medium flex items-center gap-1.5">
                          <Sliders className="w-3.5 h-3.5 text-purple-600" />
                          <span>Категории & Бюджети</span>
                        </td>
                        <td className="py-2.5 px-3 text-center text-slate-500">
                          {(currentSnapshot?.summary.categoriesCount ?? 0) +
                            (currentSnapshot?.summary.budgetsCount ?? 0)}
                        </td>
                        <td className="py-2.5 px-3 text-center font-bold text-purple-600">
                          {pendingBackup.summary.categoriesCount +
                            pendingBackup.summary.budgetsCount}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Mode Selection */}
              <div className="space-y-3">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                  Изберете метод на импортиране:
                </h4>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {/* Merge Option */}
                  <label
                    onClick={() => setImportMode("merge")}
                    className={`cursor-pointer p-4 rounded-xl border-2 flex flex-col justify-between transition-all ${
                      importMode === "merge"
                        ? "border-indigo-600 bg-indigo-50/50 shadow-sm"
                        : "border-slate-200 hover:border-slate-300 bg-white"
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-2">
                        <input
                          type="radio"
                          name="importMode"
                          value="merge"
                          checked={importMode === "merge"}
                          onChange={() => setImportMode("merge")}
                          className="text-indigo-600 focus:ring-indigo-500"
                        />
                        <span className="font-bold text-sm text-slate-800">
                          Обединяване (Merge)
                        </span>
                      </div>
                      <span className="text-[10px] font-semibold bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full">
                        Препоръчително
                      </span>
                    </div>
                    <p className="text-xs text-slate-600 mt-2">
                      Запазва всички текущи записи и добавя само новите или
                      липсващи елементи от архива без дублиране.
                    </p>
                  </label>

                  {/* Replace Option */}
                  <label
                    onClick={() => setImportMode("replace")}
                    className={`cursor-pointer p-4 rounded-xl border-2 flex flex-col justify-between transition-all ${
                      importMode === "replace"
                        ? "border-rose-600 bg-rose-50/40 shadow-sm"
                        : "border-slate-200 hover:border-slate-300 bg-white"
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-2">
                        <input
                          type="radio"
                          name="importMode"
                          value="replace"
                          checked={importMode === "replace"}
                          onChange={() => setImportMode("replace")}
                          className="text-rose-600 focus:ring-rose-500"
                        />
                        <span className="font-bold text-sm text-slate-800">
                          Пълна замяна (Replace)
                        </span>
                      </div>
                      <span className="text-[10px] font-semibold bg-rose-100 text-rose-700 px-2 py-0.5 rounded-full">
                        Презаписване
                      </span>
                    </div>
                    <p className="text-xs text-slate-600 mt-2">
                      Изтрива текущите данни в приложението и ги замества изцяло с
                      данните от архива.
                    </p>
                  </label>
                </div>
              </div>

              {/* Accidental Overwrite Protection Banner */}
              {importMode === "replace" && (
                <div className="p-4 rounded-xl bg-red-50 border-2 border-red-200 text-red-900 space-y-3 animate-in fade-in">
                  <div className="flex items-start gap-2.5">
                    <AlertTriangle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
                    <div>
                      <div className="font-bold text-sm">
                        Внимание: Пълната замяна ще изтрие текущите данни!
                      </div>
                      <p className="text-xs text-red-700 mt-0.5">
                        Всички записи в базата данни на браузъра ще бъдат
                        заменени с тези от файла. За да предотвратим случайна
                        загуба на информация, е необходимо вашето изрично
                        потвърждение.
                      </p>
                    </div>
                  </div>

                  <label className="flex items-center gap-2.5 text-xs font-semibold text-red-900 bg-white/70 p-2.5 rounded-lg border border-red-200 cursor-pointer hover:bg-white transition-colors">
                    <input
                      type="checkbox"
                      checked={confirmReplaceChecked}
                      onChange={(e) =>
                        setConfirmReplaceChecked(e.target.checked)
                      }
                      className="rounded text-red-600 focus:ring-red-500 w-4 h-4"
                    />
                    <span>
                      Потвърждавам, че желая да заменя всички текущи данни с
                      тези от избрания файл.
                    </span>
                  </label>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-5 border-t border-slate-200 bg-slate-50 flex flex-col sm:flex-row justify-end gap-3">
              <button
                type="button"
                onClick={() => setIsPreviewOpen(false)}
                className="px-4 py-2.5 text-slate-600 hover:text-slate-800 text-sm font-semibold rounded-xl hover:bg-slate-200/50 transition-colors"
              >
                Отказ
              </button>

              <button
                type="button"
                onClick={handleConfirmImport}
                disabled={importMode === "replace" && !confirmReplaceChecked}
                className={`inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl font-semibold text-sm shadow-md transition-all ${
                  importMode === "replace"
                    ? confirmReplaceChecked
                      ? "bg-rose-600 hover:bg-rose-700 text-white shadow-rose-600/30"
                      : "bg-slate-200 text-slate-400 cursor-not-allowed shadow-none"
                    : "bg-indigo-600 hover:bg-indigo-700 text-white shadow-indigo-600/30"
                }`}
              >
                {importMode === "replace" ? (
                  <>
                    <AlertTriangle className="w-4 h-4" />
                    <span>Замени и възстанови (Confirm Replace)</span>
                  </>
                ) : (
                  <>
                    <RefreshCw className="w-4 h-4" />
                    <span>Обедини данните (Confirm Merge)</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
