import React, { useState, useEffect, useRef } from "react";
import {
  Download,
  Upload,
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
  X,
  FileCheck,
  AlertOctagon,
  FileSpreadsheet,
  FolderArchive,
} from "lucide-react";
import {
  exportBackupFile,
  validateAndParseBackupFile,
  validateBackupOwnership,
  applyBackup,
  gatherApplicationData,
} from "@/utils/backupRestore";
import { exportExcelWorkbook } from "@/utils/excelExport";
import { useCloudSync } from "@/utils/cloudSyncContext";
import { BackupData } from "@/types";
import { GoogleAuthCard } from "@/components/auth/GoogleAuthCard";
import { DriveRestoreModal } from "@/components/backup/DriveRestoreModal";
import {
  APP_NAME,
  APP_TAGLINE,
  BrandMark,
} from "@/components/brand/BrandLogo";
import { useI18n } from "@/i18n";
import { getIntlLocale } from "@/i18n/helpers";

interface BackupRestoreSectionProps {
  onDataRestored?: () => void;
}

export const BackupRestoreSection: React.FC<BackupRestoreSectionProps> = ({
  onDataRestored,
}) => {
  const { t, language } = useI18n();
  const { user, activeUid } = useCloudSync();

  // Current system snapshot (used inside Import preview comparison table)
  const [currentSnapshot, setCurrentSnapshot] = useState<BackupData | null>(null);

  // File import state
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedFileName, setSelectedFileName] = useState<string>("");
  const [selectedFileSize, setSelectedFileSize] = useState<string>("");
  const [pendingBackup, setPendingBackup] = useState<BackupData | null>(null);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [importMode, setImportMode] = useState<"merge" | "replace">("merge");
  const [confirmReplaceChecked, setConfirmReplaceChecked] = useState(false);
  const [isDriveRestoreOpen, setIsDriveRestoreOpen] = useState(false);

  // Notifications
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const ownerInfo = user ? { uid: user.uid, email: user.email } : undefined;

  const refreshSnapshot = () => {
    try {
      const data = gatherApplicationData(ownerInfo);
      setCurrentSnapshot(data);
    } catch (e) {
      console.error("Failed gathering app data snapshot:", e);
    }
  };

  const handleDriveRestoreSuccess = () => {
    refreshSnapshot();
    setSuccessMessage(t("backup.driveRestoreSuccess"));
    if (onDataRestored) {
      onDataRestored();
    }
  };

  useEffect(() => {
    refreshSnapshot();
  }, [activeUid, user?.uid]);

  useEffect(() => {
    const handleReload = () => refreshSnapshot();
    window.addEventListener("budgetflows:account-changed", handleReload);
    window.addEventListener("homebudget:data-restored", handleReload);
    return () => {
      window.removeEventListener("budgetflows:account-changed", handleReload);
      window.removeEventListener("homebudget:data-restored", handleReload);
    };
  }, [activeUid]);

  // Export Full Backup (JSON)
  const handleExportBackup = () => {
    setErrorMessage(null);
    try {
      const { filename, backup } = exportBackupFile(ownerInfo);
      refreshSnapshot();
      setSuccessMessage(
        t("backup.exportJsonSuccess", {
          filename,
          expenses: backup.summary.expensesCount,
          savings: backup.summary.savingsCount,
          electricity: backup.summary.electricityCount,
        })
      );
      setTimeout(() => setSuccessMessage(null), 8000);
    } catch (err: any) {
      setErrorMessage(
        t("backup.exportJsonErr", {
          error: err?.message || t("backup.unknownErr"),
        })
      );
    }
  };

  // Export Excel Workbook (.xlsx)
  const handleExportExcel = () => {
    setErrorMessage(null);
    try {
      const summary = exportExcelWorkbook(ownerInfo);
      setSuccessMessage(
        t("backup.exportExcelSuccess", {
          filename: summary.filename,
          expenses: summary.expensesCount,
          incomes: summary.incomesCount,
          savings: summary.savingsCount,
          electricity: summary.electricityCount,
        })
      );
      setTimeout(() => setSuccessMessage(null), 8000);
    } catch (err: any) {
      setErrorMessage(
        t("backup.exportExcelErr", {
          error: err?.message || t("backup.unknownErr"),
        })
      );
    }
  };

  // Handle File Selection for Import Backup (JSON)
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
        setErrorMessage(result.errorMessage || t("backup.fileValidationErr"));
        if (fileInputRef.current) fileInputRef.current.value = "";
        return;
      }

      const ownership = validateBackupOwnership(
        result.backup,
        user ? { uid: user.uid, email: user.email } : null
      );
      if (!ownership.allowed) {
        setErrorMessage(ownership.reason || t("backup.fileOwnershipErr"));
        if (fileInputRef.current) fileInputRef.current.value = "";
        return;
      }

      setPendingBackup(result.backup);
      setImportMode("merge");
      setConfirmReplaceChecked(false);
      setIsPreviewOpen(true);
    };

    reader.onerror = () => {
      setErrorMessage(t("backup.fileReadErr"));
    };

    reader.readAsText(file);
  };

  // Execute Import after user confirmation
  const handleConfirmImport = () => {
    if (!pendingBackup) return;

    if (importMode === "replace" && !confirmReplaceChecked) {
      setErrorMessage(t("backup.confirmReplaceCheckboxErr"));
      return;
    }

    try {
      const result = applyBackup(pendingBackup, importMode);
      setIsPreviewOpen(false);
      setPendingBackup(null);
      if (fileInputRef.current) fileInputRef.current.value = "";

      refreshSnapshot();

      if (onDataRestored) {
        onDataRestored();
      }

      setSuccessMessage(result.message);
      setTimeout(() => setSuccessMessage(null), 9000);
    } catch (err: any) {
      setErrorMessage(
        t("backup.applyBackupErr", {
          error: err?.message || t("backup.importFailedFallback"),
        })
      );
    }
  };

  const formatIsoDate = (isoStr?: string) => {
    if (!isoStr) return t("backup.noRecentBackup");
    try {
      const d = new Date(isoStr);
      return d.toLocaleString(getIntlLocale(language), {
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
      {/* Success Notification */}
      {successMessage && (
        <div className="p-4 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-900 dark:text-emerald-200 flex items-start gap-3 shadow-sm animate-in fade-in slide-in-from-top-2">
          <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
          <div className="flex-1 text-sm font-medium">{successMessage}</div>
          <button
            onClick={() => setSuccessMessage(null)}
            className="text-emerald-500 hover:text-emerald-700 dark:hover:text-emerald-300"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Error Notification */}
      {errorMessage && (
        <div className="p-4 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 text-red-900 dark:text-red-200 flex items-start gap-3 shadow-sm animate-in fade-in slide-in-from-top-2">
          <AlertOctagon className="w-5 h-5 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
          <div className="flex-1 text-sm font-medium">{errorMessage}</div>
          <button
            onClick={() => setErrorMessage(null)}
            className="text-red-500 hover:text-red-700 dark:hover:text-red-300"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* 1. Google Drive Backup */}
      <GoogleAuthCard onOpenRestoreModal={() => setIsDriveRestoreOpen(true)} />

      {/* 2. Export Backup & 3. Import Backup */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Export Backup Card */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm flex flex-col justify-between">
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 rounded-xl">
                <FolderArchive className="w-6 h-6" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-slate-800 dark:text-white">
                  {t("backup.exportCardTitle")}
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {t("backup.exportCardSub")}
                </p>
              </div>
            </div>

            <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
              {t("backup.exportCardDesc")}
            </p>

            <div className="space-y-2.5 text-xs text-slate-600 dark:text-slate-300 bg-slate-50 dark:bg-slate-800/60 p-3.5 rounded-xl border border-slate-100 dark:border-slate-700/60">
              <div className="flex items-start gap-2">
                <Download className="w-4 h-4 text-indigo-500 shrink-0 mt-0.5" />
                <span>
                  <strong className="text-slate-800 dark:text-slate-100">{t("backup.jsonBulletBold")}</strong>{" "}
                  {t("backup.jsonBulletDesc")}
                </span>
              </div>
              <div className="flex items-start gap-2">
                <FileSpreadsheet className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                <span>
                  <strong className="text-slate-800 dark:text-slate-100">{t("backup.excelBulletBold")}</strong>{" "}
                  {t("backup.excelBulletDesc1")} <span className="font-medium">BudgetForce365_Export.xlsx</span>{" "}
                  {t("backup.excelBulletDesc2")}
                </span>
              </div>
            </div>
          </div>

          <div className="pt-6 mt-6 border-t border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row gap-3">
            <button
              onClick={handleExportBackup}
              className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-medium text-sm shadow-md transition-all"
            >
              <Download className="w-4 h-4" />
              <span>{t("backup.exportJsonBtn")}</span>
            </button>
            <button
              onClick={handleExportExcel}
              className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-3 border border-emerald-200 dark:border-emerald-800 bg-emerald-50/80 dark:bg-emerald-950/40 hover:bg-emerald-100 dark:hover:bg-emerald-900/50 text-emerald-700 dark:text-emerald-300 rounded-xl font-medium text-sm transition-all"
            >
              <FileSpreadsheet className="w-4 h-4" />
              <span>{t("backup.exportExcelBtn")}</span>
            </button>
          </div>
        </div>

        {/* Import Backup Card */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm flex flex-col justify-between">
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 rounded-xl">
                <Upload className="w-6 h-6" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-slate-800 dark:text-white">
                  {t("backup.importCardTitle")}
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {t("backup.importCardSub")}
                </p>
              </div>
            </div>

            <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
              {t("backup.importCardDesc")}
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
              className="border-2 border-dashed border-slate-300 dark:border-slate-700 hover:border-indigo-400 dark:hover:border-indigo-500 bg-slate-50/70 dark:bg-slate-800/40 hover:bg-indigo-50/30 dark:hover:bg-indigo-950/30 rounded-xl p-5 text-center cursor-pointer transition-all flex flex-col items-center justify-center gap-2 group"
            >
              <div className="p-3 bg-white dark:bg-slate-800 rounded-full shadow-sm group-hover:scale-110 transition-transform text-indigo-600 dark:text-indigo-400">
                <Upload className="w-5 h-5" />
              </div>
              <div>
                <span className="text-sm font-semibold text-slate-800 dark:text-slate-200 group-hover:text-indigo-600 dark:group-hover:text-indigo-400">
                  {t("backup.dropzoneClick")}
                </span>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  {t("backup.dropzoneSupports", { appName: APP_NAME })}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-800/60 p-2.5 rounded-lg border border-slate-100 dark:border-slate-700/60">
              <ShieldCheck className="w-4 h-4 text-indigo-500 shrink-0" />
              <span>{t("backup.importSafetyBanner")}</span>
            </div>
          </div>

          <div className="pt-6 mt-6 border-t border-slate-100 dark:border-slate-800">
            <button
              onClick={() => fileInputRef.current?.click()}
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-medium text-sm shadow-md transition-all"
            >
              <Upload className="w-4 h-4" />
              <span>{t("backup.importJsonBtn")}</span>
            </button>
          </div>
        </div>
      </div>

      {/* ========================================================= */}
      {/* PREVIEW & IMPORT MODAL */}
      {/* ========================================================= */}
      {isPreviewOpen && pendingBackup && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 dark:bg-black/75 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 max-w-2xl w-full max-h-[90vh] flex flex-col overflow-hidden animate-in zoom-in-95">
            {/* Modal Header */}
            <div className="p-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-900">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-indigo-100 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 rounded-lg">
                  <FileCheck className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-800 dark:text-white text-base sm:text-lg">
                    {t("backup.previewModal.title")}
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {selectedFileName} ({selectedFileSize})
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsPreviewOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-200/50 dark:hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-5 sm:p-6 overflow-y-auto space-y-6">
              {/* File Metadata Overview */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-indigo-50/60 dark:bg-indigo-950/30 p-4 rounded-xl border border-indigo-100 dark:border-indigo-900/50">
                <div>
                  <div className="text-[11px] text-indigo-600 dark:text-indigo-400 font-medium">
                    {t("backup.previewModal.backupDate")}
                  </div>
                  <div className="text-xs font-bold text-slate-800 dark:text-slate-100">
                    {formatIsoDate(pendingBackup.exportDate)}
                  </div>
                </div>
                <div>
                  <div className="text-[11px] text-indigo-600 dark:text-indigo-400 font-medium">
                    {t("backup.previewModal.appLabel")}
                  </div>
                  <div className="text-xs font-bold text-slate-800 dark:text-slate-100">
                    {pendingBackup.appName || APP_NAME}
                  </div>
                </div>
              </div>

              {/* Comparison Breakdown Table */}
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2">
                  {t("backup.previewModal.comparisonHeading")}
                </h4>
                <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden text-xs">
                  <table className="w-full text-left divide-y divide-slate-200 dark:divide-slate-800">
                    <thead className="bg-slate-50 dark:bg-slate-800/80 text-slate-600 dark:text-slate-300 font-semibold">
                      <tr>
                        <th className="py-2.5 px-3">{t("backup.previewModal.colModule")}</th>
                        <th className="py-2.5 px-3 text-center">{t("backup.previewModal.colCurrent")}</th>
                        <th className="py-2.5 px-3 text-center">{t("backup.previewModal.colBackup")}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200">
                      <tr>
                        <td className="py-2.5 px-3 font-medium flex items-center gap-1.5">
                          <DollarSign className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                          <span>{t("backup.previewModal.rowIncome")}</span>
                        </td>
                        <td className="py-2.5 px-3 text-center text-slate-500 dark:text-slate-400">
                          {currentSnapshot?.summary.incomeCount ?? 0}
                        </td>
                        <td className="py-2.5 px-3 text-center font-bold text-emerald-600 dark:text-emerald-400">
                          {pendingBackup.summary.incomeCount}
                        </td>
                      </tr>

                      <tr>
                        <td className="py-2.5 px-3 font-medium flex items-center gap-1.5">
                          <Layers className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400" />
                          <span>{t("backup.previewModal.rowExpenses")}</span>
                        </td>
                        <td className="py-2.5 px-3 text-center text-slate-500 dark:text-slate-400">
                          {currentSnapshot?.summary.expensesCount ?? 0}
                        </td>
                        <td className="py-2.5 px-3 text-center font-bold text-rose-600 dark:text-rose-400">
                          {pendingBackup.summary.expensesCount}
                        </td>
                      </tr>

                      <tr>
                        <td className="py-2.5 px-3 font-medium flex items-center gap-1.5">
                          <PiggyBank className="w-3.5 h-3.5 text-cyan-600 dark:text-cyan-400" />
                          <span>{t("backup.previewModal.rowSavings")}</span>
                        </td>
                        <td className="py-2.5 px-3 text-center text-slate-500 dark:text-slate-400">
                          {currentSnapshot?.summary.savingsCount ?? 0}
                        </td>
                        <td className="py-2.5 px-3 text-center font-bold text-cyan-600 dark:text-cyan-400">
                          {pendingBackup.summary.savingsCount}
                        </td>
                      </tr>

                      <tr>
                        <td className="py-2.5 px-3 font-medium flex items-center gap-1.5">
                          <Zap className="w-3.5 h-3.5 text-amber-500" />
                          <span>{t("backup.previewModal.rowElectricity")}</span>
                        </td>
                        <td className="py-2.5 px-3 text-center text-slate-500 dark:text-slate-400">
                          {currentSnapshot?.summary.electricityCount ?? 0}
                        </td>
                        <td className="py-2.5 px-3 text-center font-bold text-amber-600 dark:text-amber-400">
                          {pendingBackup.summary.electricityCount}
                        </td>
                      </tr>

                      <tr>
                        <td className="py-2.5 px-3 font-medium flex items-center gap-1.5">
                          <Calendar className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                          <span>{t("backup.previewModal.rowMonths")}</span>
                        </td>
                        <td className="py-2.5 px-3 text-center text-slate-500 dark:text-slate-400">
                          {currentSnapshot?.summary.monthsCovered.length ?? 0}
                        </td>
                        <td className="py-2.5 px-3 text-center font-bold text-indigo-600 dark:text-indigo-400">
                          {pendingBackup.summary.monthsCovered.length}
                        </td>
                      </tr>

                      <tr>
                        <td className="py-2.5 px-3 font-medium flex items-center gap-1.5">
                          <Sliders className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400" />
                          <span>{t("backup.previewModal.rowCategoriesBudgets")}</span>
                        </td>
                        <td className="py-2.5 px-3 text-center text-slate-500 dark:text-slate-400">
                          {(currentSnapshot?.summary.categoriesCount ?? 0) +
                            (currentSnapshot?.summary.budgetsCount ?? 0)}
                        </td>
                        <td className="py-2.5 px-3 text-center font-bold text-purple-600 dark:text-purple-400">
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
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  {t("backup.previewModal.chooseMethodHeading")}
                </h4>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {/* Merge Option */}
                  <label
                    onClick={() => setImportMode("merge")}
                    className={`cursor-pointer p-4 rounded-xl border-2 flex flex-col justify-between transition-all ${
                      importMode === "merge"
                        ? "border-indigo-600 bg-indigo-50/50 dark:bg-indigo-950/30 shadow-sm"
                        : "border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 bg-white dark:bg-slate-900"
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
                        <span className="font-bold text-sm text-slate-800 dark:text-white">
                          {t("backup.previewModal.mergeTitle")}
                        </span>
                      </div>
                      <span className="text-[10px] font-semibold bg-indigo-100 dark:bg-indigo-950/80 text-indigo-700 dark:text-indigo-300 px-2 py-0.5 rounded-full">
                        {t("backup.previewModal.recommendedBadge")}
                      </span>
                    </div>
                    <p className="text-xs text-slate-600 dark:text-slate-300 mt-2">
                      {t("backup.previewModal.mergeDesc")}
                    </p>
                  </label>

                  {/* Replace Option */}
                  <label
                    onClick={() => setImportMode("replace")}
                    className={`cursor-pointer p-4 rounded-xl border-2 flex flex-col justify-between transition-all ${
                      importMode === "replace"
                        ? "border-rose-600 bg-rose-50/40 dark:bg-rose-950/30 shadow-sm"
                        : "border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 bg-white dark:bg-slate-900"
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
                        <span className="font-bold text-sm text-slate-800 dark:text-white">
                          {t("backup.previewModal.replaceTitle")}
                        </span>
                      </div>
                      <span className="text-[10px] font-semibold bg-rose-100 dark:bg-rose-950/80 text-rose-700 dark:text-rose-300 px-2 py-0.5 rounded-full">
                        {t("backup.previewModal.overwriteBadge")}
                      </span>
                    </div>
                    <p className="text-xs text-slate-600 dark:text-slate-300 mt-2">
                      {t("backup.previewModal.replaceDesc")}
                    </p>
                  </label>
                </div>
              </div>

              {/* Accidental Overwrite Protection Banner */}
              {importMode === "replace" && (
                <div className="p-4 rounded-xl bg-red-50 dark:bg-red-950/40 border-2 border-red-200 dark:border-red-900/50 text-red-900 dark:text-red-200 space-y-3 animate-in fade-in">
                  <div className="flex items-start gap-2.5">
                    <AlertTriangle className="w-5 h-5 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
                    <div>
                      <div className="font-bold text-sm">
                        {t("backup.previewModal.warningTitle")}
                      </div>
                      <p className="text-xs text-red-700 dark:text-red-300 mt-0.5">
                        {t("backup.previewModal.warningDesc")}
                      </p>
                    </div>
                  </div>

                  <label className="flex items-center gap-2.5 text-xs font-semibold text-red-900 dark:text-red-200 bg-white/70 dark:bg-slate-900/80 p-2.5 rounded-lg border border-red-200 dark:border-red-900/50 cursor-pointer hover:bg-white dark:hover:bg-slate-900 transition-colors">
                    <input
                      type="checkbox"
                      checked={confirmReplaceChecked}
                      onChange={(e) =>
                        setConfirmReplaceChecked(e.target.checked)
                      }
                      className="rounded text-red-600 focus:ring-red-500 w-4 h-4"
                    />
                    <span>{t("backup.previewModal.confirmCheckbox")}</span>
                  </label>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-5 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 flex flex-col sm:flex-row justify-end gap-3">
              <button
                type="button"
                onClick={() => setIsPreviewOpen(false)}
                className="px-4 py-2.5 text-slate-600 dark:text-slate-300 hover:text-slate-800 dark:hover:text-white text-sm font-semibold rounded-xl hover:bg-slate-200/50 dark:hover:bg-slate-800 transition-colors"
              >
                {t("common.cancel")}
              </button>

              <button
                type="button"
                onClick={handleConfirmImport}
                disabled={importMode === "replace" && !confirmReplaceChecked}
                className={`inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl font-semibold text-sm shadow-md transition-all ${
                  importMode === "replace"
                    ? confirmReplaceChecked
                      ? "bg-rose-600 hover:bg-rose-700 text-white shadow-rose-600/30"
                      : "bg-slate-200 dark:bg-slate-800 text-slate-500 dark:text-slate-400 cursor-not-allowed shadow-none"
                    : "bg-indigo-600 hover:bg-indigo-700 text-white shadow-indigo-600/30"
                }`}
              >
                {importMode === "replace" ? (
                  <>
                    <AlertTriangle className="w-4 h-4" />
                    <span>{t("backup.previewModal.confirmReplaceBtn")}</span>
                  </>
                ) : (
                  <>
                    <RefreshCw className="w-4 h-4" />
                    <span>{t("backup.previewModal.confirmMergeBtn")}</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Google Drive Restore Modal */}
      <DriveRestoreModal
        isOpen={isDriveRestoreOpen}
        onClose={() => setIsDriveRestoreOpen(false)}
        onSuccess={handleDriveRestoreSuccess}
      />

      {/* About Budget Force 365 Section */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex flex-col sm:flex-row items-center gap-4 text-center sm:text-left">
          <BrandMark size={44} className="shrink-0" />
          <div className="space-y-1">
            <h3 className="text-base font-extrabold text-slate-900 dark:text-white tracking-tight">
              {APP_NAME}
            </h3>
            <p className="text-xs text-slate-600 dark:text-slate-300">
              {t("brand.description")}
            </p>
            <p className="text-xs font-semibold text-indigo-600 dark:text-indigo-400">
              {APP_TAGLINE}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
