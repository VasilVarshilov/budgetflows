import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
} from "react";
import { User } from "firebase/auth";
import {
  initGoogleAuth,
  signInWithGoogle,
  signOutGoogle,
  getGoogleAccessToken,
  ensureGoogleAccessToken,
  clearStoredOAuthToken,
  formatFirebaseAuthError,
  toUserProfile,
  StoredUserProfile,
} from "./googleAuth";
import {
  findDriveBackup,
  uploadDriveBackup,
  downloadDriveBackup,
  deleteDriveBackup,
  DriveFileInfo,
} from "./googleDriveBackup";
import {
  gatherApplicationData,
  validateAndParseBackupFile,
  validateBackupOwnership,
  applyBackup,
} from "./backupRestore";
import {
  userStorage,
  STORAGE_BASE_AUTO_BACKUP,
  STORAGE_BASE_LAST_SYNC,
  STORAGE_BASE_DISMISSED_RESTORE_PROMPT,
} from "./userStorage";
import { BackupData } from "@/types";

export type SyncStatus = "idle" | "syncing" | "synced" | "failed" | "offline";

export interface PendingRestoreOffer {
  fileInfo: DriveFileInfo;
  uid: string;
}

interface CloudSyncContextType {
  user: User | null;
  storedProfile: StoredUserProfile | null;
  activeUid: string;
  isAuthenticated: boolean;
  isAuthLoading: boolean;
  isSwitchingAccount: boolean;
  hasDriveAccessToken: boolean;
  authError: any | null;
  isOnline: boolean;
  autoBackupEnabled: boolean;
  setAutoBackupEnabled: (enabled: boolean) => void;
  syncStatus: SyncStatus;
  lastSyncTime: string | null;
  lastSyncError: string | null;
  cloudBackupInfo: DriveFileInfo | null;
  isLoadingCloudInfo: boolean;
  pendingRestoreOffer: PendingRestoreOffer | null;
  dismissRestoreOffer: () => void;
  loginWithGoogle: () => Promise<void>;
  switchGoogleAccount: () => Promise<void>;
  reconnectGoogleDrive: () => Promise<void>;
  logoutGoogle: () => Promise<void>;
  clearAccountLocalData: () => void;
  backupNow: () => Promise<{ success: boolean; message: string }>;
  deleteCloudBackup: () => Promise<{ success: boolean; message: string }>;
  disconnectGoogleDrive: () => Promise<void>;
  fetchCloudBackupDetails: () => Promise<DriveFileInfo | null>;
  downloadAndParseCloudBackup: () => Promise<{
    backup: BackupData | null;
    rawText: string | null;
    fileInfo: DriveFileInfo | null;
    error?: string;
  }>;
  restoreCloudBackup: (
    backup: BackupData,
    mode: "merge" | "replace"
  ) => { success: boolean; message: string };
  triggerAutoSync: () => void;
}

const CloudSyncContext = createContext<CloudSyncContextType | undefined>(
  undefined
);

export const CloudSyncProvider: React.FC<{
  children: React.ReactNode;
  onDataRestored?: () => void;
}> = ({ children, onDataRestored }) => {
  const [user, setUser] = useState<User | null>(null);
  const [activeUid, setActiveUid] = useState<string>("guest");
  const [isAuthLoading, setIsAuthLoading] = useState<boolean>(true);
  const [isSwitchingAccount, setIsSwitchingAccount] = useState<boolean>(false);
  const [hasDriveAccessToken, setHasDriveAccessToken] = useState<boolean>(false);
  const [authError, setAuthError] = useState<any | null>(null);

  const [isOnline, setIsOnline] = useState<boolean>(() =>
    typeof navigator !== "undefined" ? navigator.onLine : true
  );
  const [autoBackupEnabled, setAutoBackupEnabledState] = useState<boolean>(true);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>("idle");
  const [lastSyncTime, setLastSyncTime] = useState<string | null>(null);
  const [lastSyncError, setLastSyncError] = useState<string | null>(null);
  const [cloudBackupInfo, setCloudBackupInfo] = useState<DriveFileInfo | null>(
    null
  );
  const [isLoadingCloudInfo, setIsLoadingCloudInfo] = useState(false);
  const [pendingRestoreOffer, setPendingRestoreOffer] =
    useState<PendingRestoreOffer | null>(null);

  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasPendingSyncRef = useRef<boolean>(false);
  const authUidRef = useRef<string>("guest");
  const userRef = useRef<User | null>(null);
  const checkedRestoreOfferForUidRef = useRef<string | null>(null);

  const clearPendingAutoSync = useCallback(() => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
    hasPendingSyncRef.current = false;
  }, []);

  const readUserSyncPreferences = useCallback((uid: string) => {
    const autoRaw = userStorage.getItem(STORAGE_BASE_AUTO_BACKUP, uid);
    setAutoBackupEnabledState(autoRaw === null ? true : autoRaw === "true");
    const lastSync = userStorage.getItem(STORAGE_BASE_LAST_SYNC, uid);
    setLastSyncTime(lastSync);
  }, []);

  const refreshDriveBackupCheck = useCallback(
    async (targetUser: User, tokenOverride?: string | null): Promise<DriveFileInfo | null> => {
      const expectedUid = targetUser.uid;
      const token =
        tokenOverride || (await getGoogleAccessToken(expectedUid));
      if (authUidRef.current !== expectedUid) return null;

      setHasDriveAccessToken(Boolean(token));
      if (!token) {
        setCloudBackupInfo(null);
        return null;
      }

      try {
        setIsLoadingCloudInfo(true);
        const info = await findDriveBackup(token);
        if (authUidRef.current !== expectedUid) return null;

        setCloudBackupInfo(info);

        // Fresh-device / multi-device restore detection:
        // If this account has a backup in Google Drive and local storage for this UID is empty,
        // offer immediate restore unless dismissed for this user.
        if (
          info &&
          userStorage.isEmpty(expectedUid) &&
          !userStorage.getItem(STORAGE_BASE_DISMISSED_RESTORE_PROMPT, expectedUid) &&
          checkedRestoreOfferForUidRef.current !== expectedUid
        ) {
          checkedRestoreOfferForUidRef.current = expectedUid;
          setPendingRestoreOffer({
            fileInfo: info,
            uid: expectedUid,
          });
        }

        return info;
      } catch (e: any) {
        const errMsg = e?.message || "";
        if (errMsg.includes("Сесията с Google изтече") || errMsg.includes("401")) {
          clearStoredOAuthToken();
          if (authUidRef.current === expectedUid) {
            setHasDriveAccessToken(false);
          }
        }
        console.warn("Could not fetch cloud backup info:", e);
        return null;
      } finally {
        if (authUidRef.current === expectedUid) {
          setIsLoadingCloudInfo(false);
        }
      }
    },
    []
  );

  // Auth observer: synchronizes userStorage namespace strictly with Firebase UID
  useEffect(() => {
    const unsubscribe = initGoogleAuth(
      (currentUser, token) => {
        const nextUid = currentUser?.uid || "guest";
        const accountChanged = authUidRef.current !== nextUid;

        if (accountChanged) {
          clearPendingAutoSync();
          setCloudBackupInfo(null);
          setLastSyncError(null);
          setPendingRestoreOffer(null);
          setSyncStatus("idle");
          checkedRestoreOfferForUidRef.current = null;
        }

        authUidRef.current = nextUid;
        userRef.current = currentUser;

        // Switch isolated storage namespace before exposing ready state to UI
        userStorage.setActiveUid(currentUser?.uid || null);
        setActiveUid(nextUid);
        setUser(currentUser);
        setHasDriveAccessToken(Boolean(token));
        readUserSyncPreferences(nextUid);
        setIsAuthLoading(false);

        if (currentUser && token && (typeof navigator === "undefined" || navigator.onLine)) {
          refreshDriveBackupCheck(currentUser, token);
        }
      },
      (err) => {
        setAuthError(err);
        setIsAuthLoading(false);
      }
    );

    return () => {
      clearPendingAutoSync();
      unsubscribe();
    };
  }, [clearPendingAutoSync, readUserSyncPreferences, refreshDriveBackupCheck]);

  const setAutoBackupEnabled = useCallback((enabled: boolean) => {
    setAutoBackupEnabledState(enabled);
    userStorage.setItem(STORAGE_BASE_AUTO_BACKUP, String(enabled), authUidRef.current);
  }, []);

  const fetchCloudBackupDetails = useCallback(async (): Promise<DriveFileInfo | null> => {
    const currentUser = userRef.current;
    if (!currentUser) {
      setCloudBackupInfo(null);
      return null;
    }
    return refreshDriveBackupCheck(currentUser);
  }, [refreshDriveBackupCheck]);

  // Core backup execution
  const executeBackup = useCallback(
    async (isAutomatic = false): Promise<{ success: boolean; message: string }> => {
      let activeUser = userRef.current;
      let expectedUid = activeUser?.uid;
      let token = expectedUid ? await getGoogleAccessToken(expectedUid) : null;

      // If token is missing and this is a manual backup, acquire interactively
      if (!token && !isAutomatic) {
        try {
          token = await ensureGoogleAccessToken(true, expectedUid);
          // Re-read current auth user in case interactive login switched/signed in a user
          const latestClientUser = userRef.current;
          if (latestClientUser) {
            activeUser = latestClientUser;
            expectedUid = latestClientUser.uid;
          }
          setHasDriveAccessToken(Boolean(token));
        } catch (authErr: any) {
          console.warn("Could not obtain Google token interactively:", authErr);
          const formatted = formatFirebaseAuthError(authErr);
          setAuthError(authErr);
          setSyncStatus("failed");
          setLastSyncError(formatted);
          return {
            success: false,
            message: formatted,
          };
        }
      }

      if (!token || !activeUser || !expectedUid) {
        if (!isAutomatic) {
          setSyncStatus("failed");
          setLastSyncError("Няма активна Google сесия или изтекъл токен. Моля, влезте отново.");
        }
        return {
          success: false,
          message: "Няма активна сесия за Google Drive. Натиснете вход/поднови достъпа.",
        };
      }

      // Guard: Never auto-overwrite an existing Drive backup from an empty device before restore
      if (isAutomatic && userStorage.isEmpty(expectedUid) && cloudBackupInfo) {
        return {
          success: false,
          message: "Автоматичното архивиране е отложено, докато не възстановите наличния облачен архив.",
        };
      }

      if (typeof navigator !== "undefined" && !navigator.onLine) {
        hasPendingSyncRef.current = true;
        setSyncStatus("offline");
        return {
          success: false,
          message: "Няма интернет връзка. Промените ще се синхронизират автоматично при връщане онлайн.",
        };
      }

      try {
        setSyncStatus("syncing");
        setLastSyncError(null);

        const currentData = gatherApplicationData({
          uid: activeUser.uid,
          email: activeUser.email,
        });
        const result = await uploadDriveBackup(token, currentData);

        if (authUidRef.current !== expectedUid) {
          return {
            success: false,
            message: "Профилът бе сменен по време на синхронизацията.",
          };
        }

        const nowIso = new Date().toISOString();
        setSyncStatus("synced");
        setLastSyncTime(nowIso);
        userStorage.setItem(STORAGE_BASE_LAST_SYNC, nowIso, expectedUid);

        await refreshDriveBackupCheck(activeUser, token);

        return {
          success: true,
          message: result.message || "Архивът бе записан успешно в Google Drive.",
        };
      } catch (err: any) {
        console.error("Backup to Google Drive failed:", err);
        const errMsg = err?.message || "Неуспешен запис в Google Drive.";
        const isAuthError =
          errMsg.includes("Сесията с Google изтече") ||
          errMsg.includes("401") ||
          errMsg.includes("invalid_grant");

        if (isAuthError) {
          clearStoredOAuthToken();
          if (authUidRef.current === expectedUid) {
            setHasDriveAccessToken(false);
          }

          if (!isAutomatic) {
            try {
              const freshToken = await ensureGoogleAccessToken(true, expectedUid);
              const refreshedUser = userRef.current;
              if (freshToken && refreshedUser && refreshedUser.uid === expectedUid) {
                setHasDriveAccessToken(true);
                const currentData = gatherApplicationData({
                  uid: refreshedUser.uid,
                  email: refreshedUser.email,
                });
                const retryResult = await uploadDriveBackup(freshToken, currentData);
                if (authUidRef.current === expectedUid) {
                  const nowIso = new Date().toISOString();
                  setSyncStatus("synced");
                  setLastSyncTime(nowIso);
                  userStorage.setItem(STORAGE_BASE_LAST_SYNC, nowIso, expectedUid);
                  await refreshDriveBackupCheck(refreshedUser, freshToken);
                }
                return {
                  success: true,
                  message: retryResult.message || "Архивът бе записан успешно в Google Drive.",
                };
              }
            } catch (retryErr: any) {
              console.warn("Retry after token refresh failed:", retryErr);
            }
          }
        }

        if (authUidRef.current === expectedUid) {
          setSyncStatus("failed");
          setLastSyncError(errMsg);
        }
        return {
          success: false,
          message: errMsg,
        };
      }
    },
    [cloudBackupInfo, refreshDriveBackupCheck]
  );

  // Trigger manual backup
  const backupNow = useCallback(async () => {
    return executeBackup(false);
  }, [executeBackup]);

  // Trigger debounced auto sync
  const triggerAutoSync = useCallback(() => {
    const currentUser = userRef.current;
    if (!autoBackupEnabled || !currentUser) return;
    if (!hasDriveAccessToken) return;

    if (typeof navigator !== "undefined" && !navigator.onLine) {
      hasPendingSyncRef.current = true;
      setSyncStatus("offline");
      return;
    }

    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    const scheduledForUid = currentUser.uid;
    setSyncStatus("syncing");

    debounceTimerRef.current = setTimeout(() => {
      if (authUidRef.current !== scheduledForUid) return;
      executeBackup(true);
    }, 3500);
  }, [autoBackupEnabled, hasDriveAccessToken, executeBackup]);

  // Online / Offline listeners
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      if (hasPendingSyncRef.current && autoBackupEnabled && userRef.current) {
        hasPendingSyncRef.current = false;
        triggerAutoSync();
      }
    };
    const handleOffline = () => {
      setIsOnline(false);
      setSyncStatus("offline");
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [autoBackupEnabled, triggerAutoSync]);

  // Download and parse cloud backup for preview modal (with strict ownership validation)
  const downloadAndParseCloudBackup = useCallback(async () => {
    let activeUser = userRef.current;
    let token = activeUser ? await getGoogleAccessToken(activeUser.uid) : null;

    if (!token) {
      try {
        token = await ensureGoogleAccessToken(true, activeUser?.uid);
        activeUser = userRef.current;
        setHasDriveAccessToken(Boolean(token));
      } catch (authErr: any) {
        return {
          backup: null,
          rawText: null,
          fileInfo: null,
          error: formatFirebaseAuthError(authErr) || "Няма активна Google сесия. Влезте с Google профила си.",
        };
      }
    }

    if (!token || !activeUser) {
      return {
        backup: null,
        rawText: null,
        fileInfo: null,
        error: "Няма активна Google сесия.",
      };
    }

    const expectedUid = activeUser.uid;

    try {
      const fileInfo = await findDriveBackup(token);
      if (authUidRef.current !== expectedUid) {
        return {
          backup: null,
          rawText: null,
          fileInfo: null,
          error: "Профилът бе сменен по време на заявката.",
        };
      }

      if (!fileInfo) {
        return {
          backup: null,
          rawText: null,
          fileInfo: null,
          error: "В Google Drive не бе намерен съхранен архив (budgetflows-backup.json).",
        };
      }

      const rawText = await downloadDriveBackup(token, fileInfo.id);
      if (authUidRef.current !== expectedUid) {
        return {
          backup: null,
          rawText: null,
          fileInfo: null,
          error: "Профилът бе сменен по време на свалянето.",
        };
      }

      const validation = validateAndParseBackupFile(rawText);
      if (!validation.isValid || !validation.backup) {
        return {
          backup: null,
          rawText,
          fileInfo,
          error: validation.errorMessage || "Архивният файл е повреден или невалиден.",
        };
      }

      // Strictly verify that this backup belongs to the active user account
      const ownership = validateBackupOwnership(validation.backup, {
        uid: activeUser.uid,
        email: activeUser.email,
      });
      if (!ownership.allowed) {
        return {
          backup: null,
          rawText: null,
          fileInfo,
          error: ownership.reason || "Архивът принадлежи на друг акаунт.",
        };
      }

      return {
        backup: validation.backup,
        rawText,
        fileInfo,
      };
    } catch (e: any) {
      const errMsg = e?.message || "";
      if (errMsg.includes("Сесията с Google изтече") || errMsg.includes("401")) {
        clearStoredOAuthToken();
        setHasDriveAccessToken(false);
      }
      return {
        backup: null,
        rawText: null,
        fileInfo: null,
        error: errMsg || "Грешка при сваляне на архива от Google Drive.",
      };
    }
  }, []);

  // Restore cloud backup safely inside the active user's isolated namespace
  const restoreCloudBackup = useCallback(
    (
      backup: BackupData,
      mode: "merge" | "replace"
    ): { success: boolean; message: string } => {
      try {
        const currentUser = userRef.current;
        const ownership = validateBackupOwnership(
          backup,
          currentUser ? { uid: currentUser.uid, email: currentUser.email } : null
        );
        if (!ownership.allowed) {
          return {
            success: false,
            message: ownership.reason || "Архивът принадлежи на друг акаунт.",
          };
        }

        // Data safety: create an account-isolated emergency pre-restore snapshot
        try {
          const preRestoreSnapshot = gatherApplicationData(
            currentUser ? { uid: currentUser.uid, email: currentUser.email } : undefined
          );
          userStorage.savePreRestoreSnapshot(preRestoreSnapshot, currentUser?.uid);
        } catch (e) {
          console.warn("Could not save emergency pre-restore snapshot:", e);
        }

        const res = applyBackup(backup, mode);

        setPendingRestoreOffer(null);
        if (currentUser?.uid) {
          userStorage.removeItem(
            STORAGE_BASE_DISMISSED_RESTORE_PROMPT,
            currentUser.uid
          );
        }

        if (onDataRestored) {
          onDataRestored();
        }
        window.dispatchEvent(new CustomEvent("homebudget:data-restored"));

        return {
          success: true,
          message: res.message || "Данните бяха успешно възстановени.",
        };
      } catch (err: any) {
        return {
          success: false,
          message: err?.message || "Възникна грешка при възстановяване на данните.",
        };
      }
    },
    [onDataRestored]
  );

  const performInteractiveGoogleLogin = useCallback(async () => {
    clearPendingAutoSync();
    setIsSwitchingAccount(true);
    setAuthError(null);
    setSyncStatus("idle");
    setLastSyncError(null);

    try {
      const res = await signInWithGoogle();
      const nextUid = res.user.uid;

      if (authUidRef.current !== nextUid) {
        setCloudBackupInfo(null);
        setPendingRestoreOffer(null);
        checkedRestoreOfferForUidRef.current = null;
      }

      authUidRef.current = nextUid;
      userRef.current = res.user;
      userStorage.setActiveUid(nextUid);
      setActiveUid(nextUid);
      setUser(res.user);
      setHasDriveAccessToken(true);
      readUserSyncPreferences(nextUid);

      await refreshDriveBackupCheck(res.user, res.accessToken);
    } catch (err: any) {
      console.error("Login failed:", err);
      setAuthError(err);
      throw err;
    } finally {
      setIsSwitchingAccount(false);
    }
  }, [clearPendingAutoSync, readUserSyncPreferences, refreshDriveBackupCheck]);

  const loginWithGoogle = useCallback(async () => {
    return performInteractiveGoogleLogin();
  }, [performInteractiveGoogleLogin]);

  const switchGoogleAccount = useCallback(async () => {
    // Sign in with prompt=select_account; clears pending syncs and transitions cleanly to new UID
    return performInteractiveGoogleLogin();
  }, [performInteractiveGoogleLogin]);

  const reconnectGoogleDrive = useCallback(async () => {
    return performInteractiveGoogleLogin();
  }, [performInteractiveGoogleLogin]);

  const logoutGoogle = useCallback(async () => {
    clearPendingAutoSync();
    setIsSwitchingAccount(true);
    try {
      await signOutGoogle();
      authUidRef.current = "guest";
      userRef.current = null;
      checkedRestoreOfferForUidRef.current = null;

      userStorage.setActiveUid(null);
      setActiveUid("guest");
      setUser(null);
      setHasDriveAccessToken(false);
      setCloudBackupInfo(null);
      setPendingRestoreOffer(null);
      setSyncStatus("idle");
      setLastSyncError(null);
      setAuthError(null);
      readUserSyncPreferences("guest");
    } finally {
      setIsSwitchingAccount(false);
    }
  }, [clearPendingAutoSync, readUserSyncPreferences]);

  const dismissRestoreOffer = useCallback(() => {
    const uid = authUidRef.current;
    if (uid && uid !== "guest") {
      userStorage.setItem(STORAGE_BASE_DISMISSED_RESTORE_PROMPT, "true", uid);
    }
    setPendingRestoreOffer(null);
  }, []);

  const clearAccountLocalData = useCallback(() => {
    clearPendingAutoSync();
    const uid = authUidRef.current;
    userStorage.clear(uid);
    checkedRestoreOfferForUidRef.current = null;
    setLastSyncTime(null);
    setPendingRestoreOffer(null);
    if (onDataRestored) {
      onDataRestored();
    }
    window.dispatchEvent(new CustomEvent("homebudget:data-restored"));
  }, [clearPendingAutoSync, onDataRestored]);

  const deleteCloudBackup = useCallback(async (): Promise<{
    success: boolean;
    message: string;
  }> => {
    let activeUser = userRef.current;
    let token = activeUser ? await getGoogleAccessToken(activeUser.uid) : null;
    if (!token) {
      try {
        token = await ensureGoogleAccessToken(true, activeUser?.uid);
        activeUser = userRef.current;
        setHasDriveAccessToken(Boolean(token));
      } catch (authErr: any) {
        return {
          success: false,
          message: formatFirebaseAuthError(authErr) || "Няма активна Google сесия. Влезте с Google профила си.",
        };
      }
    }

    if (!token || !activeUser) {
      return {
        success: false,
        message: "Няма активна сесия. Влезте с Google профила си.",
      };
    }

    const expectedUid = activeUser.uid;

    try {
      setSyncStatus("syncing");
      const existing = await findDriveBackup(token);
      if (authUidRef.current !== expectedUid) {
        return {
          success: false,
          message: "Профилът бе сменен по време на операцията.",
        };
      }

      if (!existing || !existing.id) {
        setCloudBackupInfo(null);
        setSyncStatus("idle");
        return {
          success: false,
          message: "В Google Drive не бе намерен съхранен архив (budgetflows-backup.json).",
        };
      }

      await deleteDriveBackup(token, existing.id);
      if (authUidRef.current === expectedUid) {
        setCloudBackupInfo(null);
        setPendingRestoreOffer(null);
        setSyncStatus("idle");
        setLastSyncError(null);
        await refreshDriveBackupCheck(activeUser, token);
      }

      return {
        success: true,
        message: "Облачният архив бе изтрит успешно от Google Drive.",
      };
    } catch (err: any) {
      console.error("Delete cloud backup failed:", err);
      const errMsg = err?.message || "Грешка при изтриване на архива от Google Drive.";
      if (errMsg.includes("Сесията с Google изтече") || errMsg.includes("401")) {
        clearStoredOAuthToken();
        setHasDriveAccessToken(false);
      }
      setSyncStatus("failed");
      setLastSyncError(errMsg);
      return {
        success: false,
        message: errMsg,
      };
    }
  }, [refreshDriveBackupCheck]);

  const disconnectGoogleDrive = useCallback(async () => {
    clearPendingAutoSync();
    setIsSwitchingAccount(true);
    try {
      setAutoBackupEnabled(false);
      await signOutGoogle();
      authUidRef.current = "guest";
      userRef.current = null;
      checkedRestoreOfferForUidRef.current = null;

      userStorage.setActiveUid(null);
      setActiveUid("guest");
      setUser(null);
      setHasDriveAccessToken(false);
      setCloudBackupInfo(null);
      setPendingRestoreOffer(null);
      setSyncStatus("idle");
      setLastSyncError(null);
      setAuthError(null);
      readUserSyncPreferences("guest");
    } catch (e) {
      console.warn("Error disconnecting Google Drive:", e);
    } finally {
      setIsSwitchingAccount(false);
    }
  }, [clearPendingAutoSync, readUserSyncPreferences, setAutoBackupEnabled]);

  const isAuthenticated = Boolean(user);
  const storedProfile = user ? toUserProfile(user) : null;

  return (
    <CloudSyncContext.Provider
      value={{
        user,
        storedProfile,
        activeUid,
        isAuthenticated,
        isAuthLoading,
        isSwitchingAccount,
        hasDriveAccessToken,
        authError,
        isOnline,
        autoBackupEnabled,
        setAutoBackupEnabled,
        syncStatus,
        lastSyncTime,
        lastSyncError,
        cloudBackupInfo,
        isLoadingCloudInfo,
        pendingRestoreOffer,
        dismissRestoreOffer,
        loginWithGoogle,
        switchGoogleAccount,
        reconnectGoogleDrive,
        logoutGoogle,
        clearAccountLocalData,
        backupNow,
        deleteCloudBackup,
        disconnectGoogleDrive,
        fetchCloudBackupDetails,
        downloadAndParseCloudBackup,
        restoreCloudBackup,
        triggerAutoSync,
      }}
    >
      {children}
    </CloudSyncContext.Provider>
  );
};

export function useCloudSync(): CloudSyncContextType {
  const context = useContext(CloudSyncContext);
  if (!context) {
    throw new Error("useCloudSync must be used within a CloudSyncProvider");
  }
  return context;
}
