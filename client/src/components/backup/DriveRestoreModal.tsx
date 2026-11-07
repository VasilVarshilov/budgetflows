import React, { useState, useEffect } from "react";
import {
  X,
  Cloud,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  RefreshCw,
  FileCheck,
  DollarSign,
  Layers,
  PiggyBank,
  Zap,
  Calendar,
  Sliders,
  ShieldCheck,
  AlertOctagon,
} from "lucide-react";
import { useCloudSync } from "@/utils/cloudSyncContext";
import { BackupData } from "@/types";
import { DriveFileInfo } from "@/utils/googleDriveBackup";
import { gatherApplicationData } from "@/utils/backupRestore";

interface DriveRestoreModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export const DriveRestoreModal: React.FC<DriveRestoreModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
}) => {
  const { downloadAndParseCloudBackup, restoreCloudBackup } = useCloudSync();

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [backup, setBackup] = useState<BackupData | null>(null);
  const [fileInfo, setFileInfo] = useState<DriveFileInfo | null>(null);

  const [importMode, setImportMode] = useState<"merge" | "replace">("merge");
  const [confirmReplaceChecked, setConfirmReplaceChecked] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);

  // Current snapshot of local data for comparison
  const [currentSnapshot, setCurrentSnapshot] = useState<BackupData | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    setCurrentSnapshot(gatherApplicationData());
    setIsLoading(true);
    setError(null);
    setBackup(null);
    setFileInfo(null);
    setConfirmReplaceChecked(false);

    downloadAndParseCloudBackup()
      .then((res) => {
        if (res.error) {
          setError(res.error);
        } else if (res.backup && res.fileInfo) {
          setBackup(res.backup);
          setFileInfo(res.fileInfo);
        } else {
          setError("Не бе намерен валиден архив в Google Drive.");
        }
      })
      .catch((err) => {
        setError(err?.message || "Грешка при сваляне на архива.");
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, [isOpen, downloadAndParseCloudBackup]);

  if (!isOpen) return null;

  const handleConfirmRestore = () => {
    if (!backup) return;
    if (importMode === "replace" && !confirmReplaceChecked) return;

    setIsRestoring(true);
    try {
      const res = restoreCloudBackup(backup, importMode);
      if (res.success) {
        onSuccess();
        onClose();
      } else {
        setError(res.message);
      }
    } catch (e: any) {
      setError(e?.message || "Грешка при прилагане на данните.");
    } finally {
      setIsRestoring(false);
    }
  };

  const formatIsoDate = (isoStr?: string) => {
    if (!isoStr) return "Няма информация";
    try {
      const d = new Date(isoStr);
      return d.toLocaleString("bg-BG", {
        dateStyle: "medium",
        timeStyle: "short",
      });
    } catch {
      return isoStr;
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 dark:bg-black/75 backdrop-blur-xs animate-in fade-in">
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 max-w-2xl w-full max-h-[92vh] flex flex-col overflow-hidden animate-in zoom-in-95">
        {/* Header */}
        <div className="p-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-900">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-emerald-100 dark:bg-emerald-950/70 text-emerald-700 dark:text-emerald-300 rounded-xl">
              <Cloud className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-slate-900 dark:text-white text-base sm:text-lg">
                Възстановяване от Google Drive (Restore From Drive)
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Защитен архив: <code>budgetflows-backup.json</code> (appDataFolder)
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-200/50 dark:hover:bg-slate-800 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 sm:p-6 overflow-y-auto space-y-5 flex-1">
          {isLoading && (
            <div className="py-12 flex flex-col items-center justify-center gap-3 text-slate-500 dark:text-slate-400">
              <Loader2 className="w-8 h-8 text-indigo-600 dark:text-indigo-400 animate-spin" />
              <p className="text-sm font-medium">
                Търсене и сваляне на архив от Google Drive...
              </p>
            </div>
          )}

          {error && !isLoading && (
            <div className="p-4 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-200 flex items-start gap-3">
              <AlertOctagon className="w-5 h-5 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
              <div className="flex-1 text-sm font-medium">{error}</div>
            </div>
          )}

          {!isLoading && backup && fileInfo && (
            <>
              {/* Backup Found Metadata Card */}
              <div className="bg-emerald-50/70 dark:bg-emerald-950/30 p-4 rounded-xl border border-emerald-200 dark:border-emerald-800/80 space-y-2">
                <div className="flex items-center gap-2 text-emerald-800 dark:text-emerald-300 font-bold text-xs uppercase tracking-wider">
                  <FileCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                  <span>Намерен е съхранен архив (Backup Found)</span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs pt-1">
                  <div>
                    <div className="text-[11px] text-emerald-700/80 dark:text-emerald-400">
                      Последно обновен
                    </div>
                    <div className="font-bold text-slate-900 dark:text-white">
                      {formatIsoDate(fileInfo.modifiedTime || backup.exportDate)}
                    </div>
                  </div>

                  <div>
                    <div className="text-[11px] text-emerald-700/80 dark:text-emerald-400">
                      Размер на файла
                    </div>
                    <div className="font-bold text-slate-900 dark:text-white">
                      {fileInfo.size || "JSON файл"}
                    </div>
                  </div>

                  <div>
                    <div className="text-[11px] text-emerald-700/80 dark:text-emerald-400">
                      Версия на схемата
                    </div>
                    <div className="font-bold text-slate-900 dark:text-white">
                      v{backup.version || "1.0"}
                    </div>
                  </div>
                </div>
              </div>

              {/* Records Comparison Breakdown */}
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2">
                  Сравнение: Текущи данни в браузъра vs Google Drive
                </h4>
                <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden text-xs">
                  <table className="w-full text-left divide-y divide-slate-200 dark:divide-slate-800">
                    <thead className="bg-slate-50 dark:bg-slate-800/80 text-slate-600 dark:text-slate-300 font-semibold">
                      <tr>
                        <th className="py-2.5 px-3">Модул / Категория</th>
                        <th className="py-2.5 px-3 text-center">Текущо локално</th>
                        <th className="py-2.5 px-3 text-center">В Google Drive</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200">
                      <tr>
                        <td className="py-2.5 px-3 font-medium flex items-center gap-1.5">
                          <DollarSign className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                          <span>Доходи (Income)</span>
                        </td>
                        <td className="py-2.5 px-3 text-center text-slate-500 dark:text-slate-400">
                          {currentSnapshot?.summary.incomeCount ?? 0}
                        </td>
                        <td className="py-2.5 px-3 text-center font-bold text-emerald-600 dark:text-emerald-400">
                          {backup.summary.incomeCount}
                        </td>
                      </tr>

                      <tr>
                        <td className="py-2.5 px-3 font-medium flex items-center gap-1.5">
                          <Layers className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400" />
                          <span>Разходи (Expenses)</span>
                        </td>
                        <td className="py-2.5 px-3 text-center text-slate-500 dark:text-slate-400">
                          {currentSnapshot?.summary.expensesCount ?? 0}
                        </td>
                        <td className="py-2.5 px-3 text-center font-bold text-rose-600 dark:text-rose-400">
                          {backup.summary.expensesCount}
                        </td>
                      </tr>

                      <tr>
                        <td className="py-2.5 px-3 font-medium flex items-center gap-1.5">
                          <PiggyBank className="w-3.5 h-3.5 text-cyan-600 dark:text-cyan-400" />
                          <span>Спестявания (Savings)</span>
                        </td>
                        <td className="py-2.5 px-3 text-center text-slate-500 dark:text-slate-400">
                          {currentSnapshot?.summary.savingsCount ?? 0}
                        </td>
                        <td className="py-2.5 px-3 text-center font-bold text-cyan-600 dark:text-cyan-400">
                          {backup.summary.savingsCount}
                        </td>
                      </tr>

                      <tr>
                        <td className="py-2.5 px-3 font-medium flex items-center gap-1.5">
                          <Zap className="w-3.5 h-3.5 text-amber-500" />
                          <span>Сметки за ток (Electricity History)</span>
                        </td>
                        <td className="py-2.5 px-3 text-center text-slate-500 dark:text-slate-400">
                          {currentSnapshot?.summary.electricityCount ?? 0}
                        </td>
                        <td className="py-2.5 px-3 text-center font-bold text-amber-600 dark:text-amber-400">
                          {backup.summary.electricityCount}
                        </td>
                      </tr>

                      <tr>
                        <td className="py-2.5 px-3 font-medium flex items-center gap-1.5">
                          <Calendar className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                          <span>Обхванати месеци</span>
                        </td>
                        <td className="py-2.5 px-3 text-center text-slate-500 dark:text-slate-400">
                          {currentSnapshot?.summary.monthsCovered.length ?? 0}
                        </td>
                        <td className="py-2.5 px-3 text-center font-bold text-indigo-600 dark:text-indigo-400">
                          {backup.summary.monthsCovered.length}
                        </td>
                      </tr>

                      <tr>
                        <td className="py-2.5 px-3 font-medium flex items-center gap-1.5">
                          <Sliders className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400" />
                          <span>Категории & Бюджети</span>
                        </td>
                        <td className="py-2.5 px-3 text-center text-slate-500 dark:text-slate-400">
                          {(currentSnapshot?.summary.categoriesCount ?? 0) +
                            (currentSnapshot?.summary.budgetsCount ?? 0)}
                        </td>
                        <td className="py-2.5 px-3 text-center font-bold text-purple-600 dark:text-purple-400">
                          {backup.summary.categoriesCount + backup.summary.budgetsCount}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Restore Options: Merge vs Replace */}
              <div className="space-y-3">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Изберете метод на възстановяване:
                </h4>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {/* Merge */}
                  <label
                    onClick={() => setImportMode("merge")}
                    className={`cursor-pointer p-4 rounded-xl border-2 flex flex-col justify-between transition-all ${
                      importMode === "merge"
                        ? "border-indigo-600 bg-indigo-50/50 dark:bg-indigo-950/30 shadow-xs"
                        : "border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 bg-white dark:bg-slate-900"
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-2">
                        <input
                          type="radio"
                          name="driveImportMode"
                          value="merge"
                          checked={importMode === "merge"}
                          onChange={() => setImportMode("merge")}
                          className="text-indigo-600 focus:ring-indigo-500"
                        />
                        <span className="font-bold text-sm text-slate-900 dark:text-white">
                          Обединяване (Merge)
                        </span>
                      </div>
                      <span className="text-[10px] font-semibold bg-indigo-100 dark:bg-indigo-950/80 text-indigo-700 dark:text-indigo-300 px-2 py-0.5 rounded-full">
                        Препоръчително
                      </span>
                    </div>
                    <p className="text-xs text-slate-600 dark:text-slate-300 mt-2">
                      Запазва всички текущи локални записи и добавя липсващите
                      елементи от Google Drive без дублиране.
                    </p>
                  </label>

                  {/* Replace */}
                  <label
                    onClick={() => setImportMode("replace")}
                    className={`cursor-pointer p-4 rounded-xl border-2 flex flex-col justify-between transition-all ${
                      importMode === "replace"
                        ? "border-rose-600 bg-rose-50/40 dark:bg-rose-950/30 shadow-xs"
                        : "border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 bg-white dark:bg-slate-900"
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-2">
                        <input
                          type="radio"
                          name="driveImportMode"
                          value="replace"
                          checked={importMode === "replace"}
                          onChange={() => setImportMode("replace")}
                          className="text-rose-600 focus:ring-rose-500"
                        />
                        <span className="font-bold text-sm text-slate-900 dark:text-white">
                          Пълна замяна (Replace)
                        </span>
                      </div>
                      <span className="text-[10px] font-semibold bg-rose-100 dark:bg-rose-950/80 text-rose-700 dark:text-rose-300 px-2 py-0.5 rounded-full">
                        Презаписване
                      </span>
                    </div>
                    <p className="text-xs text-slate-600 dark:text-slate-300 mt-2">
                      Замества изцяло локалната база данни в браузъра с данните
                      от Google Drive архива.
                    </p>
                  </label>
                </div>
              </div>

              {/* Warning on Replace */}
              {importMode === "replace" && (
                <div className="p-4 rounded-xl bg-red-50 dark:bg-red-950/40 border-2 border-red-200 dark:border-red-900/50 text-red-900 dark:text-red-200 space-y-3 animate-in fade-in">
                  <div className="flex items-start gap-2.5">
                    <AlertTriangle className="w-5 h-5 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
                    <div>
                      <div className="font-bold text-sm">
                        Внимание: Пълната замяна ще презапише текущите локални данни!
                      </div>
                      <p className="text-xs text-red-700 dark:text-red-300 mt-0.5">
                        Системата автоматично ще създаде аварийна резервна копие
                        в localStorage преди замяната.
                      </p>
                    </div>
                  </div>

                  <label className="flex items-center gap-2.5 text-xs font-semibold text-red-900 dark:text-red-200 bg-white/70 dark:bg-slate-900/80 p-2.5 rounded-lg border border-red-200 dark:border-red-900/50 cursor-pointer hover:bg-white dark:hover:bg-slate-900 transition-colors">
                    <input
                      type="checkbox"
                      checked={confirmReplaceChecked}
                      onChange={(e) => setConfirmReplaceChecked(e.target.checked)}
                      className="rounded text-red-600 focus:ring-red-500 w-4 h-4 cursor-pointer"
                    />
                    <span>
                      Потвърждавам, че желая да заменя локалните данни с тези от
                      Google Drive.
                    </span>
                  </label>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="p-5 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 flex flex-col sm:flex-row justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={isRestoring}
            className="px-4 py-2.5 text-slate-600 dark:text-slate-300 hover:text-slate-800 dark:hover:text-white text-sm font-semibold rounded-xl hover:bg-slate-200/50 dark:hover:bg-slate-800 transition-colors cursor-pointer"
          >
            Отказ (Cancel)
          </button>

          {!isLoading && backup && (
            <button
              type="button"
              onClick={handleConfirmRestore}
              disabled={
                isRestoring ||
                (importMode === "replace" && !confirmReplaceChecked)
              }
              className={`inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl font-semibold text-sm shadow-xs transition-all cursor-pointer ${
                importMode === "replace"
                  ? confirmReplaceChecked
                    ? "bg-rose-600 hover:bg-rose-700 text-white shadow-rose-600/30"
                    : "bg-slate-200 dark:bg-slate-800 text-slate-400 dark:text-slate-600 cursor-not-allowed shadow-none"
                  : "bg-indigo-600 hover:bg-indigo-700 text-white shadow-indigo-600/30"
              }`}
            >
              {isRestoring ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Прилагане...</span>
                </>
              ) : importMode === "replace" ? (
                <>
                  <AlertTriangle className="w-4 h-4" />
                  <span>Замени данните (Confirm Replace)</span>
                </>
              ) : (
                <>
                  <RefreshCw className="w-4 h-4" />
                  <span>Обедини данните (Confirm Merge)</span>
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
