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
  Trash2,
  Unlink,
  AlertTriangle,
  X,
  FileText,
  Users,
  KeyRound,
  Eraser,
} from "lucide-react";
import { useCloudSync } from "@/utils/cloudSyncContext";
import {
  formatFirebaseAuthError,
  isUnauthorizedDomainError,
  isAccessDeniedError,
  isRefererBlockedError,
  isOriginMismatchError,
} from "@/utils/googleAuth";
import { getFirebaseConfig } from "@/utils/firebaseConfig";
import { APP_NAME, BrandMark, BrandTagline } from "@/components/brand/BrandLogo";
import { dispatchManualBackupNotification } from "@/utils/notificationsEngine";
import { useI18n } from "@/i18n";
import { getIntlLocale } from "@/i18n/helpers";

interface GoogleAuthCardProps {
  onOpenRestoreModal: () => void;
}

export const GoogleAuthCard: React.FC<GoogleAuthCardProps> = ({
  onOpenRestoreModal,
}) => {
  const { t, language } = useI18n();
  const {
    user,
    storedProfile,
    isAuthenticated,
    isSwitchingAccount,
    hasDriveAccessToken,
    driveSessionStatus,
    isRestoringDriveSession,
    authError,
    isOnline,
    autoBackupEnabled,
    setAutoBackupEnabled,
    syncStatus,
    lastSyncTime,
    localUpdatedAt,
    cloudUpdatedAt,
    lastSyncError,
    cloudBackupInfo,
    isLoadingCloudInfo,
    syncConflict,
    resolveConflictUseLocal,
    resolveConflictRestoreCloud,
    loginWithGoogle,
    switchGoogleAccount,
    reconnectGoogleDrive,
    logoutGoogle,
    clearAccountLocalData,
    backupNow,
    deleteCloudBackup,
    disconnectGoogleDrive,
  } = useCloudSync();

  const [isResolvingConflict, setIsResolvingConflict] = useState(false);

  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [isBackingUp, setIsBackingUp] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showDisconnectModal, setShowDisconnectModal] = useState(false);
  const [showClearLocalModal, setShowClearLocalModal] = useState(false);
  const [isDisconnecting, setIsDisconnecting] = useState(false);

  const [feedback, setFeedback] = useState<{ type: "success" | "error"; text: string } | null>(
    null
  );
  const [unauthorizedDomainError, setUnauthorizedDomainError] = useState(false);
  const [accessDeniedError, setAccessDeniedError] = useState(() =>
    Boolean(authError && isAccessDeniedError(authError))
  );
  const [refererBlockedError, setRefererBlockedError] = useState(() =>
    Boolean(authError && isRefererBlockedError(authError))
  );
  const [originMismatchError, setOriginMismatchError] = useState(() =>
    Boolean(authError && isOriginMismatchError(authError))
  );
  const [copiedDomain, setCopiedDomain] = useState(false);
  const [copiedOrigin, setCopiedOrigin] = useState(false);
  const [copiedJsOrigin, setCopiedJsOrigin] = useState(false);

  const displayUser = user || storedProfile;

  const formatIsoDate = (isoStr?: string | null) => {
    if (!isoStr) return t("backup.neverYet");
    try {
      const d = new Date(isoStr);
      return d.toLocaleString(getIntlLocale(language), {
        dateStyle: "short",
        timeStyle: "short",
      });
    } catch {
      return isoStr;
    }
  };

  const handleLogin = async () => {
    setIsLoggingIn(true);
    setFeedback(null);
    setUnauthorizedDomainError(false);
    setAccessDeniedError(false);
    setRefererBlockedError(false);
    setOriginMismatchError(false);
    try {
      await loginWithGoogle();
      setFeedback({
        type: "success",
        text: t("backup.googleCard.loginSuccess"),
      });
      setTimeout(() => setFeedback(null), 4000);
    } catch (e: any) {
      setUnauthorizedDomainError(isUnauthorizedDomainError(e));
      setAccessDeniedError(isAccessDeniedError(e));
      setRefererBlockedError(isRefererBlockedError(e));
      setOriginMismatchError(isOriginMismatchError(e));
      setFeedback({
        type: "error",
        text: formatFirebaseAuthError(e),
      });
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleSwitchAccount = async () => {
    setIsLoggingIn(true);
    setFeedback(null);
    setUnauthorizedDomainError(false);
    setAccessDeniedError(false);
    setRefererBlockedError(false);
    setOriginMismatchError(false);
    try {
      await switchGoogleAccount();
      setFeedback({
        type: "success",
        text: t("backup.googleCard.switchSuccess"),
      });
      setTimeout(() => setFeedback(null), 4000);
    } catch (e: any) {
      setUnauthorizedDomainError(isUnauthorizedDomainError(e));
      setAccessDeniedError(isAccessDeniedError(e));
      setRefererBlockedError(isRefererBlockedError(e));
      setOriginMismatchError(isOriginMismatchError(e));
      setFeedback({
        type: "error",
        text: formatFirebaseAuthError(e),
      });
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleReconnectDrive = async () => {
    setIsLoggingIn(true);
    setFeedback(null);
    setAccessDeniedError(false);
    setRefererBlockedError(false);
    setOriginMismatchError(false);
    try {
      await reconnectGoogleDrive();
      setFeedback({
        type: "success",
        text: t("backup.googleCard.reconnectSuccess"),
      });
      setTimeout(() => setFeedback(null), 4000);
    } catch (e: any) {
      setAccessDeniedError(isAccessDeniedError(e));
      setRefererBlockedError(isRefererBlockedError(e));
      setOriginMismatchError(isOriginMismatchError(e));
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
        text: t("backup.googleCard.logoutSuccess"),
      });
      setTimeout(() => setFeedback(null), 3000);
    } catch (e: any) {
      setFeedback({
        type: "error",
        text: e?.message || t("backup.googleCard.logoutErr"),
      });
    }
  };

  const handleDisconnect = async () => {
    setIsDisconnecting(true);
    try {
      await disconnectGoogleDrive();
      setShowDisconnectModal(false);
      setFeedback({
        type: "success",
        text: t("backup.googleCard.disconnectSuccess"),
      });
      setTimeout(() => setFeedback(null), 4000);
    } catch (e: any) {
      setFeedback({
        type: "error",
        text: e?.message || t("backup.googleCard.disconnectErr"),
      });
    } finally {
      setIsDisconnecting(false);
    }
  };

  const handleManualBackup = async () => {
    setIsBackingUp(true);
    setFeedback(null);
    try {
      const res = await backupNow();
      if (res.success) {
        setFeedback({ type: "success", text: res.message });
        dispatchManualBackupNotification("manual_backup");
      } else {
        setFeedback({ type: "error", text: res.message });
      }
      setTimeout(() => setFeedback(null), 4500);
    } catch (e: any) {
      setFeedback({
        type: "error",
        text: e?.message || t("backup.googleCard.backupErr"),
      });
    } finally {
      setIsBackingUp(false);
    }
  };

  const handleDeleteCloudBackup = async () => {
    setIsDeleting(true);
    try {
      const res = await deleteCloudBackup();
      if (res.success) {
        setFeedback({
          type: "success",
          text: t("backup.googleCard.deleteSuccess"),
        });
        setShowDeleteModal(false);
      } else {
        setFeedback({
          type: "error",
          text: res.message,
        });
      }
      setTimeout(() => setFeedback(null), 5000);
    } catch (e: any) {
      setFeedback({
        type: "error",
        text: e?.message || t("backup.googleCard.deleteErr"),
      });
    } finally {
      setIsDeleting(false);
    }
  };

  const currentHost =
    typeof window !== "undefined" ? window.location.hostname : "vasilvarshilov.github.io";

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
                {t("backup.googleCard.cardTitle")}
              </h2>
              {isAuthenticated && isRestoringDriveSession && (
                <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-blue-50 dark:bg-blue-950/70 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  <span>{t("backup.googleCard.restoringDriveBadge")}</span>
                </span>
              )}
              {isAuthenticated && !isRestoringDriveSession && hasDriveAccessToken && (
                <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-950/70 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                  <ShieldCheck className="w-3 h-3" />
                  <span>{t("backup.googleCard.driveConnectedBadge")}</span>
                </span>
              )}
              {isAuthenticated && !isRestoringDriveSession && !hasDriveAccessToken && driveSessionStatus === "standby" && (
                <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-950/70 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                  <CheckCircle2 className="w-3 h-3" />
                  <span>{t("backup.googleCard.syncedBadge")}</span>
                </span>
              )}
              {isAuthenticated && !isRestoringDriveSession && !hasDriveAccessToken && driveSessionStatus === "needs_reauth" && (
                <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-amber-50 dark:bg-amber-950/70 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
                  <KeyRound className="w-3 h-3" />
                  <span>{t("backup.googleCard.needsReauthBadge")}</span>
                </span>
              )}
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              {t("backup.googleCard.subtitlePrefix")} <code>appDataFolder</code>{" "}
              {t("backup.googleCard.subtitleSuffix")}
            </p>
          </div>
        </div>

        {/* Sync Status Badge */}
        <div className="flex items-center gap-2">
          {!isOnline && (
            <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-semibold bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
              <WifiOff className="w-3.5 h-3.5" />
              <span>{t("backup.googleCard.offlineBadge")}</span>
            </span>
          )}

          {isOnline && syncStatus === "syncing" && (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800 animate-pulse">
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              <span>{t("backup.googleCard.syncingBadge")}</span>
            </span>
          )}

          {isOnline && syncStatus === "synced" && (
            <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>{t("backup.googleCard.syncedStatusBadge")}</span>
            </span>
          )}

          {isOnline && syncStatus === "failed" && (
            <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-semibold bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800">
              <AlertCircle className="w-3.5 h-3.5" />
              <span>{t("backup.googleCard.errorBadge")}</span>
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
                {t("backup.googleCard.unauthGuide.title")}
              </p>
              <p className="text-slate-600 dark:text-slate-300 mt-0.5 leading-relaxed">
                {t("backup.googleCard.unauthGuide.desc")}
              </p>
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 p-3 rounded-lg border border-amber-200 dark:border-amber-800/80 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
            <div className="truncate">
              <span className="text-[11px] text-slate-500 dark:text-slate-400 block font-medium">
                {t("backup.googleCard.unauthGuide.domainToAdd")}
              </span>
              <code className="font-mono font-bold text-indigo-600 dark:text-indigo-400 text-sm select-all">
                {currentHost}
              </code>
            </div>
            <button
              type="button"
              onClick={() => {
                navigator.clipboard?.writeText(currentHost);
                setCopiedDomain(true);
                setTimeout(() => setCopiedDomain(false), 2500);
              }}
              className="shrink-0 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/80 dark:hover:bg-indigo-900 text-indigo-700 dark:text-indigo-300 text-xs font-semibold transition-colors cursor-pointer"
            >
              <Copy className="w-3.5 h-3.5" />
              <span>
                {copiedDomain
                  ? t("header.copiedShort")
                  : t("backup.googleCard.unauthGuide.copyDomain")}
              </span>
            </button>
          </div>

          <ol className="list-decimal list-inside space-y-1.5 pl-1 text-[11px] text-slate-700 dark:text-slate-300 leading-relaxed">
            <li>
              {t("backup.googleCard.unauthGuide.step1Before")}{" "}
              <a
                href="https://console.firebase.google.com/"
                target="_blank"
                rel="noreferrer"
                className="underline font-semibold text-indigo-600 dark:text-indigo-400 inline-flex items-center gap-0.5"
              >
                <span>Firebase Console</span>
                <ExternalLink className="w-3 h-3" />
              </a>{" "}
              {t("backup.googleCard.unauthGuide.step1After", {
                project: "budget-force-365",
              })}
            </li>
            <li>{t("backup.googleCard.unauthGuide.step2")}</li>
            <li>{t("backup.googleCard.unauthGuide.step3")}</li>
            <li>{t("backup.googleCard.unauthGuide.step4")}</li>
            <li>
              {t("backup.googleCard.unauthGuide.step5", { domain: currentHost })}
            </li>
          </ol>
          <div className="p-2.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 text-[11px] text-emerald-800 dark:text-emerald-300 font-medium">
            {t("backup.googleCard.unauthGuide.tip")}
          </div>
        </div>
      )}

      {/* 403 access_denied / OAuth Consent Screen Testing Mode Guide */}
      {(accessDeniedError || (authError && isAccessDeniedError(authError))) && (
        <div className="p-4 sm:p-5 rounded-xl bg-rose-50/90 dark:bg-rose-950/40 border border-rose-300 dark:border-rose-700/80 text-rose-950 dark:text-rose-200 text-xs space-y-3 animate-in fade-in">
          <div className="flex items-start gap-2.5">
            <AlertTriangle className="w-5 h-5 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
            <div>
              <p className="font-bold text-slate-900 dark:text-white text-sm">
                {t("backup.googleCard.accessDeniedGuide.title")}
              </p>
              <p className="text-slate-600 dark:text-slate-300 mt-0.5 leading-relaxed">
                {t("backup.googleCard.accessDeniedGuide.desc")}
              </p>
            </div>
          </div>

          <ol className="list-decimal list-inside space-y-1.5 pl-1 text-[11px] text-slate-700 dark:text-slate-300 leading-relaxed">
            <li>
              {t("backup.googleCard.accessDeniedGuide.step1Prefix")}{" "}
              <a
                href="https://console.cloud.google.com/auth/audience"
                target="_blank"
                rel="noreferrer"
                className="underline font-semibold text-indigo-600 dark:text-indigo-400 inline-flex items-center gap-0.5"
              >
                <span>Google Cloud Console → Google Auth Platform → Audience</span>
                <ExternalLink className="w-3 h-3" />
              </a>
              .
            </li>
            <li>{t("backup.googleCard.accessDeniedGuide.step2")}</li>
            <li>{t("backup.googleCard.accessDeniedGuide.step3")}</li>
          </ol>
        </div>
      )}

      {/* API Key HTTP Referrer Restriction Guide */}
      {(refererBlockedError || (authError && isRefererBlockedError(authError))) && (
        <div className="p-4 sm:p-5 rounded-xl bg-amber-50/90 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-700/80 text-amber-950 dark:text-amber-200 text-xs space-y-3 animate-in fade-in">
          <div className="flex items-start gap-2.5">
            <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
            <div>
              <p className="font-bold text-slate-900 dark:text-white text-sm">
                {t("backup.googleCard.refererGuide.title")}
              </p>
              <p className="text-slate-600 dark:text-slate-300 mt-0.5 leading-relaxed">
                {t("backup.googleCard.refererGuide.desc")}
              </p>
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 p-3 rounded-lg border border-amber-200 dark:border-amber-800/80 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
            <div className="truncate">
              <span className="text-[11px] text-slate-500 dark:text-slate-400 block font-medium">
                {t("backup.googleCard.refererGuide.patternLabel")}
              </span>
              <code className="font-mono font-bold text-indigo-600 dark:text-indigo-400 text-sm select-all">
                {typeof window !== "undefined" ? `${window.location.origin}/*` : "https://vasilvarshilov.github.io/*"}
              </code>
            </div>
            <button
              type="button"
              onClick={() => {
                const originPattern = typeof window !== "undefined" ? `${window.location.origin}/*` : "https://vasilvarshilov.github.io/*";
                navigator.clipboard?.writeText(originPattern);
                setCopiedOrigin(true);
                setTimeout(() => setCopiedOrigin(false), 2500);
              }}
              className="shrink-0 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/80 dark:hover:bg-indigo-900 text-indigo-700 dark:text-indigo-300 text-xs font-semibold transition-colors cursor-pointer"
            >
              <Copy className="w-3.5 h-3.5" />
              <span>
                {copiedOrigin
                  ? t("header.copiedShort")
                  : t("backup.googleCard.refererGuide.copyOrigin")}
              </span>
            </button>
          </div>

          <ol className="list-decimal list-inside space-y-1.5 pl-1 text-[11px] text-slate-700 dark:text-slate-300 leading-relaxed">
            <li>
              {t("backup.googleCard.refererGuide.step1Prefix")}{" "}
              <a
                href="https://console.cloud.google.com/apis/credentials"
                target="_blank"
                rel="noreferrer"
                className="underline font-semibold text-indigo-600 dark:text-indigo-400 inline-flex items-center gap-0.5"
              >
                <span>Google Cloud Console → APIs &amp; Services → Credentials</span>
                <ExternalLink className="w-3 h-3" />
              </a>
              .
            </li>
            <li>{t("backup.googleCard.refererGuide.step2")}</li>
            <li>{t("backup.googleCard.refererGuide.step3")}</li>
          </ol>
        </div>
      )}

      {/* 400 origin_mismatch Guide */}
      {(originMismatchError || (authError && isOriginMismatchError(authError))) && (
        <div className="p-4 sm:p-5 rounded-xl bg-amber-50/90 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-700/80 text-amber-950 dark:text-amber-200 text-xs space-y-3 animate-in fade-in">
          <div className="flex items-start gap-2.5">
            <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
            <div>
              <p className="font-bold text-slate-900 dark:text-white text-sm">
                {t("backup.googleCard.originGuide.title")}
              </p>
              <p className="text-slate-600 dark:text-slate-300 mt-0.5 leading-relaxed">
                {t("backup.googleCard.originGuide.desc")}
              </p>
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 p-3 rounded-lg border border-amber-200 dark:border-amber-800/80 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
            <div className="truncate space-y-1">
              <div>
                <span className="text-[11px] text-slate-500 dark:text-slate-400 block font-medium">Authorized JavaScript origin:</span>
                <code className="font-mono font-bold text-indigo-600 dark:text-indigo-400 text-sm select-all">
                  {typeof window !== "undefined" ? window.location.origin : "https://vasilvarshilov.github.io"}
                </code>
              </div>
              <div>
                <span className="text-[11px] text-slate-500 dark:text-slate-400 block font-medium">Authorized redirect URI:</span>
                <code className="font-mono text-slate-700 dark:text-slate-300 text-xs select-all">
                  {`https://${getFirebaseConfig().authDomain || "gen-lang-client-0141580200.firebaseapp.com"}/__/auth/handler`}
                </code>
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                const origin = typeof window !== "undefined" ? window.location.origin : "https://vasilvarshilov.github.io";
                navigator.clipboard?.writeText(origin);
                setCopiedJsOrigin(true);
                setTimeout(() => setCopiedJsOrigin(false), 2500);
              }}
              className="shrink-0 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/80 dark:hover:bg-indigo-900 text-indigo-700 dark:text-indigo-300 text-xs font-semibold transition-colors cursor-pointer"
            >
              <Copy className="w-3.5 h-3.5" />
              <span>
                {copiedJsOrigin
                  ? t("header.copiedShort")
                  : t("backup.googleCard.originGuide.copyOriginBtn")}
              </span>
            </button>
          </div>
        </div>
      )}

      {lastSyncError && (
        <div className="p-3 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/80 rounded-xl text-xs text-amber-800 dark:text-amber-200 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
          <span>{t("backup.googleCard.lastSyncErrPrefix", { error: lastSyncError })}</span>
        </div>
      )}

      {/* Body: Connected User Profile OR Official Google Sign-In */}
      {!isAuthenticated ? (
        <div className="bg-slate-50 dark:bg-slate-800/60 rounded-xl p-5 border border-slate-200 dark:border-slate-700/80 flex flex-col sm:flex-row items-center justify-between gap-5">
          <div className="space-y-2 text-center sm:text-left">
            <div className="inline-flex items-center gap-2.5 justify-center sm:justify-start">
              <BrandMark size={32} />
              <div className="text-left">
                <div className="text-sm font-extrabold text-slate-900 dark:text-white leading-tight">
                  {APP_NAME}
                </div>
                <div className="text-[11px]">
                  <BrandTagline />
                </div>
              </div>
            </div>
            <h3 className="font-bold text-slate-800 dark:text-white text-sm sm:text-base">
              {t("backup.googleCard.unauthCardTitle")}
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 max-w-lg leading-relaxed">
              {t("backup.googleCard.unauthCardDesc1")}{" "}
              <code className="text-indigo-600 dark:text-indigo-400 font-mono">appDataFolder</code>{" "}
              {t("backup.googleCard.unauthCardDesc2")}
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
            <span>{t("backup.signInBtn")}</span>
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
                  alt={displayUser.displayName || t("backup.googleCard.googleUserFallback")}
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
                    {displayUser?.displayName || t("backup.googleCard.googleUserFallback")}
                  </h3>
                  <span className="text-[10px] bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 font-semibold px-2 py-0.5 rounded-full border border-indigo-200/50">
                    Google Drive
                  </span>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {displayUser?.email || t("backup.googleCard.noEmail")}
                </p>
              </div>
            </div>

            {/* Actions: Switch Account, Disconnect & Sign Out */}
            <div className="flex items-center gap-2 self-start sm:self-auto flex-wrap">
              <button
                type="button"
                onClick={handleSwitchAccount}
                disabled={isLoggingIn || isSwitchingAccount}
                title={t("backup.googleCard.switchTitle")}
                className="inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold text-indigo-700 dark:text-indigo-300 hover:text-indigo-800 dark:hover:text-indigo-200 bg-indigo-50 hover:bg-indigo-100/80 dark:bg-indigo-950/40 dark:hover:bg-indigo-900/50 border border-indigo-200 dark:border-indigo-800/80 rounded-xl transition-all cursor-pointer disabled:opacity-50"
              >
                <Users className="w-3.5 h-3.5" />
                <span>{t("backup.googleCard.switchBtn")}</span>
              </button>

              <button
                type="button"
                onClick={() => setShowDisconnectModal(true)}
                title={t("backup.googleCard.disconnectTitle")}
                className="inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold text-amber-700 dark:text-amber-300 hover:text-amber-800 dark:hover:text-amber-200 bg-amber-50 hover:bg-amber-100/80 dark:bg-amber-950/40 dark:hover:bg-amber-900/50 border border-amber-200 dark:border-amber-800/80 rounded-xl transition-all cursor-pointer"
              >
                <Unlink className="w-3.5 h-3.5" />
                <span>{t("backup.googleCard.disconnectBtn")}</span>
              </button>

              <button
                type="button"
                onClick={handleLogout}
                className="inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-white dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl transition-all cursor-pointer"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>{t("backup.googleCard.signOutBtn")}</span>
              </button>
            </div>
          </div>

          {/* Silent automatic Drive restoration banner */}
          {isRestoringDriveSession && !hasDriveAccessToken && (
            <div className="p-3.5 rounded-xl bg-blue-50/90 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800/80 flex items-center gap-2.5 text-xs text-blue-900 dark:text-blue-200">
              <Loader2 className="w-4 h-4 text-blue-600 dark:text-blue-400 animate-spin shrink-0" />
              <div>
                <span className="font-bold block">
                  {t("backup.googleCard.restoringSessionTitle")}
                </span>
                <span className="text-[11px] text-blue-700/90 dark:text-blue-300">
                  {t("backup.googleCard.restoringSessionDesc")}
                </span>
              </div>
            </div>
          )}

          {/* Standby status when Google profile is restored cleanly and already synced */}
          {!hasDriveAccessToken && !isRestoringDriveSession && driveSessionStatus === "standby" && (
            <div className="p-3.5 rounded-xl bg-emerald-50/80 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
              <div className="flex items-start gap-2.5 text-emerald-950 dark:text-emerald-200">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                <div>
                  <span className="font-bold block">
                    {t("backup.googleCard.standbyTitle")}
                  </span>
                  <span className="text-[11px] text-emerald-800/90 dark:text-emerald-300">
                    {t("backup.googleCard.standbyDesc")}
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={handleReconnectDrive}
                disabled={isLoggingIn}
                className="shrink-0 inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-white dark:bg-slate-800 hover:bg-emerald-100/60 dark:hover:bg-slate-700 text-emerald-800 dark:text-emerald-200 border border-emerald-200 dark:border-emerald-800 font-semibold text-xs transition-colors cursor-pointer disabled:opacity-50"
              >
                {isLoggingIn ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                <span>{t("backup.googleCard.connectSessionBtn")}</span>
              </button>
            </div>
          )}

          {/* Reconnect prompt shown ONLY when Drive token expired/absent AND local changes need synchronization */}
          {!hasDriveAccessToken && !isRestoringDriveSession && driveSessionStatus === "needs_reauth" && (
            <div className="p-3.5 rounded-xl bg-amber-50/90 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
              <div className="flex items-start gap-2.5 text-amber-950 dark:text-amber-200">
                <KeyRound className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                <div>
                  <span className="font-bold block">
                    {t("backup.googleCard.needsReauthTitle")}
                  </span>
                  <span className="text-[11px] text-amber-900/90 dark:text-amber-300">
                    {t("backup.googleCard.needsReauthDesc")}
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={handleReconnectDrive}
                disabled={isLoggingIn}
                className="shrink-0 inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs shadow-xs transition-colors cursor-pointer disabled:opacity-50"
              >
                {isLoggingIn ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                <span>{t("backup.googleCard.renewAccessBtn")}</span>
              </button>
            </div>
          )}

          {/* Safe Conflict Resolution Banner */}
          {syncConflict && (
            <div className="p-4 rounded-xl bg-amber-50 dark:bg-amber-950/40 border-2 border-amber-300 dark:border-amber-700 text-xs space-y-3">
              <div className="flex items-start gap-2.5">
                <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                <div>
                  <div className="font-bold text-slate-900 dark:text-white text-sm">
                    {syncConflict.reason === "fresh_device"
                      ? t("backup.googleCard.conflictFreshTitle")
                      : syncConflict.reason === "cloud_newer"
                      ? t("backup.googleCard.conflictCloudNewerTitle")
                      : t("backup.googleCard.conflictDivergedTitle")}
                  </div>
                  <p className="text-amber-900/90 dark:text-amber-200 mt-0.5 leading-relaxed">
                    {t("backup.googleCard.conflictDesc")}
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {syncConflict.reason !== "fresh_device" && (
                  <button
                    type="button"
                    disabled={isResolvingConflict}
                    onClick={async () => {
                      setIsResolvingConflict(true);
                      try {
                        const res = await resolveConflictUseLocal();
                        if (res.success) {
                          dispatchManualBackupNotification("manual_backup");
                        }
                        setFeedback({
                          type: res.success ? "success" : "error",
                          text: res.message,
                        });
                      } finally {
                        setIsResolvingConflict(false);
                      }
                    }}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs shadow-xs transition-colors cursor-pointer disabled:opacity-50"
                  >
                    {isResolvingConflict ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <UploadCloud className="w-3.5 h-3.5" />}
                    <span>{t("backup.useLocalBtn")}</span>
                  </button>
                )}

                {syncConflict.cloudBackup && (
                  <button
                    type="button"
                    disabled={isResolvingConflict}
                    onClick={() => {
                      const res = resolveConflictRestoreCloud("merge");
                      if (res.success) {
                        dispatchManualBackupNotification("manual_restore");
                      }
                      setFeedback({
                          type: res.success ? "success" : "error",
                          text: res.message,
                      });
                    }}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs shadow-xs transition-colors cursor-pointer disabled:opacity-50"
                  >
                    <DownloadCloud className="w-3.5 h-3.5" />
                    <span>{t("backup.restoreMergeBtn")}</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={onOpenRestoreModal}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-300 dark:border-slate-600 font-semibold text-xs transition-colors cursor-pointer"
                >
                  <span>{t("backup.previewOptionsBtn")}</span>
                </button>
              </div>
            </div>
          )}

          {/* Cloud Info & Version Timestamps Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 pt-4 border-t border-slate-200/80 dark:border-slate-700/80 text-xs">
            {/* Session Auto Sync Toggle */}
            <div className="p-3 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 flex items-center justify-between gap-2">
              <div>
                <div className="font-bold text-slate-800 dark:text-white flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400 shrink-0" />
                  <span>{t("backup.sessionAutoSyncTitle")}</span>
                </div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 leading-snug">
                  {t("backup.sessionAutoSyncDesc")}
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

            {/* Backup Exists */}
            <div className="p-3 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700">
              <div className="font-bold text-slate-800 dark:text-white flex items-center gap-1.5">
                <Cloud className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                <span>{t("backup.backupExistsLabel")}</span>
              </div>
              <div className="mt-1 flex items-center gap-1.5">
                {isLoadingCloudInfo ? (
                  <span className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-1">
                    <Loader2 className="w-3 h-3 animate-spin" />
                    <span>{t("backup.checkingDrive")}</span>
                  </span>
                ) : cloudBackupInfo && (hasDriveAccessToken || cloudBackupInfo.id) ? (
                  <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 dark:text-emerald-300">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                    <span>
                      {hasDriveAccessToken
                        ? t("backup.availableInAppData")
                        : t("backup.availableLastCheck")}
                    </span>
                  </span>
                ) : lastSyncTime || cloudUpdatedAt ? (
                  <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-700 dark:text-amber-300">
                    <Clock className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                    <span>{t("backup.needsDriveCheck")}</span>
                  </span>
                ) : (
                  <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                    {t("backup.noArchiveCreated")}
                  </span>
                )}
              </div>
            </div>

            {/* File Size */}
            <div className="p-3 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700">
              <div className="font-bold text-slate-800 dark:text-white flex items-center gap-1.5">
                <FileText className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400" />
                <span>{t("backup.fileSizeLabel")}</span>
              </div>
              <p className="text-[11px] text-slate-600 dark:text-slate-300 mt-1 font-medium truncate">
                {isLoadingCloudInfo ? (
                  <span className="text-slate-500 dark:text-slate-400">...</span>
                ) : cloudBackupInfo?.size ? (
                  <span>{cloudBackupInfo.size}</span>
                ) : cloudBackupInfo ? (
                  <span>{t("backup.jsonFileFallback")}</span>
                ) : (
                  <span className="text-slate-500 dark:text-slate-400">-</span>
                )}
              </p>
            </div>

            {/* Last Sync */}
            <div className="p-3 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700">
              <div className="font-bold text-slate-800 dark:text-white flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                <span>{t("backup.lastSyncLabel")}</span>
              </div>
              <p className="text-[11px] text-slate-600 dark:text-slate-300 mt-1 font-medium truncate">
                {formatIsoDate(lastSyncTime)}
              </p>
            </div>

            {/* Local Version Timestamp */}
            <div className="p-3 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700">
              <div className="font-bold text-slate-800 dark:text-white flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                <span>{t("backup.localVersionLabel")}</span>
              </div>
              <p className="text-[11px] text-slate-600 dark:text-slate-300 mt-1 font-medium truncate">
                {formatIsoDate(localUpdatedAt)}
              </p>
            </div>

            {/* Cloud Version Timestamp */}
            <div className="p-3 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700">
              <div className="font-bold text-slate-800 dark:text-white flex items-center gap-1.5">
                <Cloud className="w-3.5 h-3.5 text-sky-600 dark:text-sky-400" />
                <span>{t("backup.cloudVersionLabel")}</span>
              </div>
              <p className="text-[11px] text-slate-600 dark:text-slate-300 mt-1 font-medium truncate">
                {formatIsoDate(cloudUpdatedAt)}
              </p>
            </div>
          </div>

          {/* Action Buttons: Backup Now, Restore From Drive, Delete Cloud Backup */}
          <div className="flex flex-col sm:flex-row items-center gap-3 pt-2">
            <button
              type="button"
              onClick={handleManualBackup}
              disabled={isBackingUp || !isOnline}
              className="w-full sm:w-auto flex-1 min-h-[44px] inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-200 dark:disabled:bg-slate-800 disabled:text-slate-500 dark:disabled:text-slate-400 text-white rounded-xl font-semibold text-sm shadow-xs transition-all cursor-pointer disabled:cursor-not-allowed"
            >
              {isBackingUp ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                <UploadCloud className="w-4 h-4" />
              )}
              <span>{t("backup.backupNowBtn")}</span>
            </button>

            <button
              type="button"
              onClick={onOpenRestoreModal}
              disabled={!isOnline || (!cloudBackupInfo && hasDriveAccessToken)}
              className="w-full sm:w-auto flex-1 min-h-[44px] inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-50 text-slate-800 dark:text-slate-100 rounded-xl font-semibold text-sm border border-slate-200 dark:border-slate-700 shadow-xs transition-all cursor-pointer"
            >
              <DownloadCloud className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              <span>{t("backup.restoreFromDriveBtn")}</span>
            </button>

            <button
              type="button"
              onClick={() => setShowDeleteModal(true)}
              disabled={!isOnline || !cloudBackupInfo || isDeleting}
              title={t("backup.googleCard.deleteTitle")}
              className="w-full sm:w-auto min-h-[44px] inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/40 dark:hover:bg-rose-900/60 disabled:opacity-40 text-rose-700 dark:text-rose-300 rounded-xl font-semibold text-sm border border-rose-200 dark:border-rose-900/80 shadow-xs transition-all cursor-pointer"
            >
              {isDeleting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Trash2 className="w-4 h-4 text-rose-600 dark:text-rose-400" />
              )}
              <span>{t("backup.deleteCloudBtn")}</span>
            </button>

            <button
              type="button"
              onClick={() => setShowClearLocalModal(true)}
              title={t("backup.googleCard.clearLocalTitle")}
              className="w-full sm:w-auto min-h-[44px] inline-flex items-center justify-center gap-2 px-3.5 py-2.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-xl font-semibold text-xs border border-slate-200 dark:border-slate-700 shadow-xs transition-all cursor-pointer"
            >
              <Eraser className="w-4 h-4 text-slate-500 dark:text-slate-400" />
              <span>{t("backup.clearLocalBtn")}</span>
            </button>
          </div>
        </div>
      )}

      {/* Delete Cloud Backup Confirmation Modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 dark:bg-black/75 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 max-w-lg w-full p-6 space-y-4 animate-in zoom-in-95">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-rose-100 dark:bg-rose-950/70 text-rose-700 dark:text-rose-300 rounded-xl">
                  <Trash2 className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 dark:text-white text-base sm:text-lg">
                    {t("backup.deleteModal.title")}
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Google Drive • <code>appDataFolder</code>
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => !isDeleting && setShowDeleteModal(false)}
                disabled={isDeleting}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              {t("backup.deleteModal.question", { appName: APP_NAME })}
            </p>

            {/* Safety Guarantee Callout */}
            <div className="p-3 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 rounded-xl text-xs text-emerald-800 dark:text-emerald-300 flex items-start gap-2.5">
              <ShieldCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
              <div className="leading-relaxed">
                <strong>{t("backup.deleteModal.safetyBold")}</strong>{" "}
                {t("backup.deleteModal.safetySub")}
              </div>
            </div>

            {/* Backup metadata summary */}
            <div className="bg-slate-50 dark:bg-slate-800/60 p-3.5 rounded-xl border border-slate-200 dark:border-slate-700/80 text-xs space-y-2">
              <div className="flex justify-between">
                <span className="text-slate-500 dark:text-slate-400">
                  {t("backup.backupExistsLabel")}:
                </span>
                <span className="font-bold text-emerald-600 dark:text-emerald-400">
                  {cloudBackupInfo
                    ? t("backup.googleCard.deleteModalAvailable")
                    : t("backup.googleCard.deleteModalMissing")}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500 dark:text-slate-400">
                  {t("backup.deleteModal.lastBackupLabel")}
                </span>
                <span className="font-bold text-slate-800 dark:text-white">
                  {formatIsoDate(cloudBackupInfo?.modifiedTime || lastSyncTime)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500 dark:text-slate-400">
                  {t("backup.fileSizeLabel")}:
                </span>
                <span className="font-bold text-slate-800 dark:text-white">
                  {cloudBackupInfo?.size || t("backup.jsonFileFallback")}
                </span>
              </div>
            </div>

            {/* Modal Actions */}
            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowDeleteModal(false)}
                disabled={isDeleting}
                className="px-4 py-2 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors cursor-pointer"
              >
                {t("common.cancel")}
              </button>

              <button
                type="button"
                onClick={handleDeleteCloudBackup}
                disabled={isDeleting}
                className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-rose-600 hover:bg-rose-700 disabled:opacity-60 text-white rounded-xl text-xs font-semibold shadow-xs transition-all cursor-pointer"
              >
                {isDeleting ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>{t("backup.deleteModal.deleting")}</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>{t("backup.deleteModal.confirmBtn")}</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Disconnect Google Drive Confirmation Modal */}
      {showDisconnectModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 dark:bg-black/75 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 max-w-lg w-full p-6 space-y-4 animate-in zoom-in-95">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-amber-100 dark:bg-amber-950/70 text-amber-700 dark:text-amber-300 rounded-xl">
                  <Unlink className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 dark:text-white text-base sm:text-lg">
                    {t("backup.disconnectModal.title")}
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Google Drive
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => !isDisconnecting && setShowDisconnectModal(false)}
                disabled={isDisconnecting}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              {t("backup.disconnectModal.question")}
            </p>

            <ul className="text-xs text-slate-600 dark:text-slate-300 space-y-1.5 list-disc list-inside bg-slate-50 dark:bg-slate-800/60 p-3 rounded-xl border border-slate-200 dark:border-slate-700/80">
              <li>{t("backup.disconnectModal.bullet1")}</li>
              <li>{t("backup.disconnectModal.bullet2")}</li>
              <li>{t("backup.disconnectModal.bullet3")}</li>
              <li className="text-emerald-700 dark:text-emerald-400 font-semibold">
                {t("backup.disconnectModal.bullet4")}
              </li>
            </ul>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowDisconnectModal(false)}
                disabled={isDisconnecting}
                className="px-4 py-2 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors cursor-pointer"
              >
                {t("common.cancel")}
              </button>

              <button
                type="button"
                onClick={handleDisconnect}
                disabled={isDisconnecting}
                className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-amber-600 hover:bg-amber-700 disabled:opacity-60 text-white rounded-xl text-xs font-semibold shadow-xs transition-all cursor-pointer"
              >
                {isDisconnecting ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>{t("backup.disconnectModal.disconnecting")}</span>
                  </>
                ) : (
                  <>
                    <Unlink className="w-3.5 h-3.5" />
                    <span>{t("backup.disconnectModal.confirmBtn")}</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Clear Local Account Data Confirmation Modal */}
      {showClearLocalModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 dark:bg-black/75 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 max-w-md w-full p-6 space-y-4 animate-in zoom-in-95">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-rose-100 dark:bg-rose-950/70 text-rose-700 dark:text-rose-300 rounded-xl">
                  <Eraser className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 dark:text-white text-base">
                    {t("backup.clearLocalModal.title")}
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {t("backup.clearLocalModal.profilePrefix")}{" "}
                    {displayUser?.email || t("backup.clearLocalModal.currentProfile")}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowClearLocalModal(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              {t("backup.clearLocalModal.description")}
            </p>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowClearLocalModal(false)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors cursor-pointer"
              >
                {t("common.cancel")}
              </button>
              <button
                type="button"
                onClick={() => {
                  clearAccountLocalData();
                  setShowClearLocalModal(false);
                  setFeedback({
                    type: "success",
                    text: t("backup.clearLocalModal.successToast"),
                  });
                  setTimeout(() => setFeedback(null), 4000);
                }}
                className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-semibold shadow-xs transition-all cursor-pointer"
              >
                <Eraser className="w-3.5 h-3.5" />
                <span>{t("backup.clearLocalModal.confirmBtn")}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
