import React, { useState } from "react";
import {
  Cloud,
  CheckCircle2,
  RefreshCw,
  AlertCircle,
  LogOut,
  UploadCloud,
  DownloadCloud,
  WifiOff,
  Clock,
  Sparkles,
  ShieldCheck,
  Loader2,
  User as UserIcon,
  Copy,
  ExternalLink,
} from "lucide-react";
import { useCloudSync } from "@/utils/cloudSyncContext";
import {
  formatFirebaseAuthError,
  isUnauthorizedDomainError,
} from "@/utils/googleAuth";

interface GoogleAuthCardProps {
  onOpenRestoreModal: () => void;
}

export const GoogleAuthCard: React.FC<GoogleAuthCardProps> = ({
  onOpenRestoreModal,
}) => {
  const {
    user,
    storedProfile,
    isAuthenticated,
    isOnline,
    autoBackupEnabled,
    setAutoBackupEnabled,
    syncStatus,
    lastSyncTime,
    lastSyncError,
    cloudBackupInfo,
    isLoadingCloudInfo,
    loginWithGoogle,
    logoutGoogle,
    backupNow,
  } = useCloudSync();

  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [isBackingUp, setIsBackingUp] = useState(false);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; text: string } | null>(
    null
  );
  const [unauthorizedDomainError, setUnauthorizedDomainError] = useState(false);
  const [copiedDomain, setCopiedDomain] = useState(false);

  const displayUser = user || storedProfile;

  const handleLogin = async () => {
    setIsLoggingIn(true);
    setFeedback(null);
    setUnauthorizedDomainError(false);
    try {
      await loginWithGoogle();
      setFeedback({
        type: "success",
        text: "Успешно свързване с вашия Google акаунт и Google Drive!",
      });
      setTimeout(() => setFeedback(null), 4000);
    } catch (e: any) {
      const isUnauth = isUnauthorizedDomainError(e);
      setUnauthorizedDomainError(isUnauth);
      setFeedback({
        type: "error",
        text: formatFirebaseAuthError(e),
      });
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleLogout = async () => {
    try {
      await logoutGoogle();
      setFeedback({
        type: "success",
        text: "Успешно излязохте от профила.",
      });
      setTimeout(() => setFeedback(null), 3000);
    } catch (e: any) {
      setFeedback({
        type: "error",
        text: e?.message || "Грешка при изход.",
      });
    }
  };

  const handleManualBackup = async () => {
    setIsBackingUp(true);
    setFeedback(null);
    try {
      const res = await backupNow();
      if (res.success) {
        setFeedback({ type: "success", text: res.message });
      } else {
        setFeedback({ type: "error", text: res.message });
      }
      setTimeout(() => setFeedback(null), 4500);
    } catch (e: any) {
      setFeedback({
        type: "error",
        text: e?.message || "Грешка при архивиране в Google Drive.",
      });
    } finally {
      setIsBackingUp(false);
    }
  };

  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm space-y-6">
      {/* Card Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-slate-100 dark:border-slate-800">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-gradient-to-br from-indigo-500 to-indigo-700 text-white rounded-xl shadow-xs">
            <Cloud className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                Облачен архив (Google Drive Cloud Backup)
              </h2>
              {isAuthenticated && (
                <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-950/70 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                  <ShieldCheck className="w-3 h-3" />
                  <span>Свързан</span>
                </span>
              )}
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Синхронизация в защитена папка <code>appDataFolder</code> без замърсяване на основния ви Drive
            </p>
          </div>
        </div>

        {/* Sync Status Badge */}
        <div className="flex items-center gap-2">
          {!isOnline && (
            <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-semibold bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
              <WifiOff className="w-3.5 h-3.5" />
              <span>Офлайн режим</span>
            </span>
          )}

          {isOnline && syncStatus === "syncing" && (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800 animate-pulse">
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              <span>⏳ Синхронизиране...</span>
            </span>
          )}

          {isOnline && syncStatus === "synced" && (
            <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>✅ Синхронизирано</span>
            </span>
          )}

          {isOnline && syncStatus === "failed" && (
            <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-semibold bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800">
              <AlertCircle className="w-3.5 h-3.5" />
              <span>❌ Грешка</span>
            </span>
          )}
        </div>
      </div>

      {/* Feedback Alert */}
      {feedback && (
        <div
          className={`p-4 rounded-xl text-xs font-semibold flex items-start gap-2.5 animate-in fade-in ${
            feedback.type === "success"
              ? "bg-emerald-50 dark:bg-emerald-950/50 text-emerald-800 dark:text-emerald-200 border border-emerald-200 dark:border-emerald-800"
              : "bg-rose-50 dark:bg-rose-950/50 text-rose-800 dark:text-rose-200 border border-rose-200 dark:border-rose-800"
          }`}
        >
          {feedback.type === "success" ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
          ) : (
            <AlertCircle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
          )}
          <div className="flex-1">{feedback.text}</div>
        </div>
      )}

      {/* Unauthorized Domain Resolution Guide */}
      {unauthorizedDomainError && (
        <div className="p-4 sm:p-5 rounded-xl bg-amber-50/90 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-700/80 text-amber-950 dark:text-amber-200 text-xs space-y-3.5 animate-in fade-in">
          <div className="flex items-start gap-2.5">
            <AlertCircle className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
            <div>
              <p className="font-bold text-slate-900 dark:text-white text-sm">
                Как да оправите грешката с неоторизирания домейн във Firebase:
              </p>
              <p className="text-slate-600 dark:text-slate-300 mt-0.5 leading-relaxed">
                За защита от фишинг Firebase изисква всеки домейн, на който се ползва вход с Google, да бъде предварително вписан в списъка с позволени домейни.
              </p>
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 p-3 rounded-lg border border-amber-200 dark:border-amber-800/80 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
            <div className="truncate">
              <span className="text-[11px] text-slate-500 dark:text-slate-400 block font-medium">Домейн за добавяне:</span>
              <code className="font-mono font-bold text-indigo-600 dark:text-indigo-400 text-sm select-all">
                {typeof window !== "undefined" ? window.location.hostname : "vasilvarshilov.github.io"}
              </code>
            </div>
            <button
              type="button"
              onClick={() => {
                const domain = typeof window !== "undefined" ? window.location.hostname : "vasilvarshilov.github.io";
                navigator.clipboard?.writeText(domain);
                setCopiedDomain(true);
                setTimeout(() => setCopiedDomain(false), 2500);
              }}
              className="shrink-0 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/80 dark:hover:bg-indigo-900 text-indigo-700 dark:text-indigo-300 text-xs font-semibold transition-colors cursor-pointer"
            >
              <Copy className="w-3.5 h-3.5" />
              <span>{copiedDomain ? "Копирано!" : "Копирай домейна"}</span>
            </button>
          </div>

          <ol className="list-decimal list-inside space-y-1.5 pl-1 text-[11px] text-slate-700 dark:text-slate-300 leading-relaxed">
            <li>
              Отворете{" "}
              <a
                href="https://console.firebase.google.com/"
                target="_blank"
                rel="noreferrer"
                className="underline font-semibold text-indigo-600 dark:text-indigo-400 inline-flex items-center gap-0.5"
              >
                <span>Firebase Console</span>
                <ExternalLink className="w-3 h-3" />
              </a>{" "}
              и изберете проекта си (напр. <code>budgetflows</code>).
            </li>
            <li>
              В лявото меню отворете <strong>Build &gt; Authentication</strong>.
            </li>
            <li>
              Изберете таб <strong>Settings (Настройки)</strong> най-горе.
            </li>
            <li>
              Превъртете надолу до раздела <strong>Authorized domains (Оторизирани домейни)</strong>.
            </li>
            <li>
              Натиснете <strong>Add domain</strong>, поставете <code>{typeof window !== "undefined" ? window.location.hostname : "vasilvarshilov.github.io"}</code> и натиснете <strong>Add</strong>.
            </li>
          </ol>
          <div className="p-2.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 text-[11px] text-emerald-800 dark:text-emerald-300 font-medium">
            💡 След като запазите домейна във Firebase, <strong>не се налага да правите нов билд</strong> — презаредете страницата в телефона/браузъра си и входът с Google ще сработи веднага!
          </div>
        </div>
      )}

      {lastSyncError && (
        <div className="p-3 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/80 rounded-xl text-xs text-amber-800 dark:text-amber-200 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
          <span>Последна грешка при синхронизация: {lastSyncError}</span>
        </div>
      )}

      {/* Body: Connected User Profile OR Official Google Sign-In */}
      {!isAuthenticated ? (
        <div className="bg-slate-50 dark:bg-slate-800/60 rounded-xl p-5 border border-slate-200 dark:border-slate-700/80 flex flex-col sm:flex-row items-center justify-between gap-5">
          <div className="space-y-1 text-center sm:text-left">
            <h3 className="font-bold text-slate-800 dark:text-white text-sm sm:text-base">
              Влезте с Google, за да активирате автоматично облачно архивиране
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 max-w-lg leading-relaxed">
              Вашите данни се съхраняват в личния ви Google Drive в изолираната папка{" "}
              <code className="text-indigo-600 dark:text-indigo-400 font-mono">appDataFolder</code>.
              Файловете са видими само за приложението и не заемат място в основния ви списък с документи.
            </p>
          </div>

          {/* Official Google Sign-In Button */}
          <button
            type="button"
            onClick={handleLogin}
            disabled={isLoggingIn}
            className="shrink-0 flex items-center justify-center gap-3 px-5 py-3 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-100 font-semibold text-sm rounded-xl border border-slate-300 dark:border-slate-600 shadow-xs hover:shadow-sm transition-all cursor-pointer active:scale-98"
          >
            {isLoggingIn ? (
              <Loader2 className="w-5 h-5 text-indigo-600 animate-spin" />
            ) : (
              <svg className="w-5 h-5" viewBox="0 0 48 48">
                <path
                  fill="#EA4335"
                  d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
                />
                <path
                  fill="#4285F4"
                  d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
                />
                <path
                  fill="#FBBC05"
                  d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
                />
                <path
                  fill="#34A853"
                  d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
                />
                <path fill="none" d="M0 0h48v48H0z" />
              </svg>
            )}
            <span>Вход с Google (Sign in with Google)</span>
          </button>
        </div>
      ) : (
        /* Connected Profile Card */
        <div className="bg-slate-50 dark:bg-slate-800/50 rounded-xl p-5 border border-slate-200 dark:border-slate-700/80 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            {/* User Details */}
            <div className="flex items-center gap-3.5">
              {displayUser?.photoURL ? (
                <img
                  src={displayUser.photoURL}
                  alt={displayUser.displayName || "Google User"}
                  className="w-12 h-12 rounded-full border-2 border-indigo-500/30 object-cover shadow-xs"
                />
              ) : (
                <div className="w-12 h-12 rounded-full bg-indigo-100 dark:bg-indigo-950/80 text-indigo-700 dark:text-indigo-300 flex items-center justify-center font-bold text-lg border border-indigo-200 dark:border-indigo-800">
                  <UserIcon className="w-6 h-6" />
                </div>
              )}
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-bold text-slate-900 dark:text-white text-base">
                    {displayUser?.displayName || "Потребител на Google"}
                  </h3>
                  <span className="text-[10px] bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 font-semibold px-2 py-0.5 rounded-full border border-indigo-200/50">
                    Google Drive
                  </span>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {displayUser?.email || "Няма имейл"}
                </p>
              </div>
            </div>

            {/* Sign Out Button */}
            <button
              type="button"
              onClick={handleLogout}
              className="inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-white dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl transition-all cursor-pointer self-start sm:self-auto"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Изход (Sign out)</span>
            </button>
          </div>

          {/* Cloud Info & Auto Backup Toggle Grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-4 border-t border-slate-200/80 dark:border-slate-700/80 text-xs">
            {/* Auto Backup Toggle */}
            <div className="p-3 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 flex items-center justify-between">
              <div>
                <div className="font-bold text-slate-800 dark:text-white flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                  <span>Автоматичен архив</span>
                </div>
                <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5">
                  Синхронизиране при промяна
                </p>
              </div>

              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={autoBackupEnabled}
                  onChange={(e) => setAutoBackupEnabled(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer dark:bg-slate-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"></div>
              </label>
            </div>

            {/* Last Sync Timestamp */}
            <div className="p-3 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700">
              <div className="font-bold text-slate-800 dark:text-white flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400" />
                <span>Последна синхронизация</span>
              </div>
              <p className="text-[11px] text-slate-600 dark:text-slate-300 mt-1 font-medium">
                {lastSyncTime
                  ? new Date(lastSyncTime).toLocaleString("bg-BG", {
                      dateStyle: "short",
                      timeStyle: "short",
                    })
                  : "Все още няма"}
              </p>
            </div>

            {/* Backup Status in Drive */}
            <div className="p-3 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700">
              <div className="font-bold text-slate-800 dark:text-white flex items-center gap-1.5">
                <Cloud className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                <span>Архив в Google Drive</span>
              </div>
              <p className="text-[11px] text-slate-600 dark:text-slate-300 mt-1 font-medium truncate">
                {isLoadingCloudInfo ? (
                  <span className="text-slate-400">Проверка...</span>
                ) : cloudBackupInfo ? (
                  <span>
                    Наличен ({cloudBackupInfo.size || "JSON"})
                  </span>
                ) : (
                  <span className="text-slate-400">Не е създаден</span>
                )}
              </p>
            </div>
          </div>

          {/* Action Buttons: Backup Now & Restore From Drive */}
          <div className="flex flex-col sm:flex-row items-center gap-3 pt-2">
            <button
              type="button"
              onClick={handleManualBackup}
              disabled={isBackingUp || !isOnline}
              className="w-full sm:w-auto flex-1 min-h-[44px] inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 dark:disabled:bg-slate-800 text-white rounded-xl font-semibold text-sm shadow-xs transition-all cursor-pointer"
            >
              {isBackingUp ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                <UploadCloud className="w-4 h-4" />
              )}
              <span>Архивирай сега (Backup Now)</span>
            </button>

            <button
              type="button"
              onClick={onOpenRestoreModal}
              disabled={!isOnline}
              className="w-full sm:w-auto flex-1 min-h-[44px] inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-50 text-slate-800 dark:text-slate-100 rounded-xl font-semibold text-sm border border-slate-200 dark:border-slate-700 shadow-xs transition-all cursor-pointer"
            >
              <DownloadCloud className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              <span>Възстанови от Drive (Restore From Drive)</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
