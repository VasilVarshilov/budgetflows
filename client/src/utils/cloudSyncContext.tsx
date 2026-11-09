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
  getStoredUserProfile,
  saveStoredUserProfile,
  StoredUserProfile,
  STORAGE_KEY_AUTO_BACKUP,
  STORAGE_KEY_LAST_SYNC,
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
  applyBackup,
} from "./backupRestore";
import { BackupData } from "@/types";

export type SyncStatus = "idle" | "syncing" | "synced" | "failed" | "offline";

interface CloudSyncContextType {
  user: User | null;
  storedProfile: StoredUserProfile | null;
  isAuthenticated: boolean;
  isOnline: boolean;
  autoBackupEnabled: boolean;
  setAutoBackupEnabled: (enabled: boolean) => void;
  syncStatus: SyncStatus;
  lastSyncTime: string | null;
  lastSyncError: string | null;
  cloudBackupInfo: DriveFileInfo | null;
  isLoadingCloudInfo: boolean;
  loginWithGoogle: () => Promise<void>;
  logoutGoogle: () => Promise<void>;
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
  const [storedProfile, setStoredProfile] = useState<StoredUserProfile | null>(
    () => getStoredUserProfile()
  );
  const [isOnline, setIsOnline] = useState<boolean>(() =>
    typeof navigator !== "undefined" ? navigator.onLine : true
  );
  const [autoBackupEnabled, setAutoBackupEnabledState] = useState<boolean>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY_AUTO_BACKUP);
      return stored === null ? true : stored === "true";
    } catch {
      return true;
    }
  });

  const [syncStatus, setSyncStatus] = useState<SyncStatus>("idle");
  const [lastSyncTime, setLastSyncTime] = useState<string | null>(() => {
    try {
      return localStorage.getItem(STORAGE_KEY_LAST_SYNC);
    } catch {
      return null;
    }
  });
  const [lastSyncError, setLastSyncError] = useState<string | null>(null);
  const [cloudBackupInfo, setCloudBackupInfo] = useState<DriveFileInfo | null>(
    null
  );
  const [isLoadingCloudInfo, setIsLoadingCloudInfo] = useState(false);

  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const hasPendingSyncRef = useRef<boolean>(false);

  // Online / Offline listeners
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      if (hasPendingSyncRef.current && autoBackupEnabled && user) {
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
  }, [autoBackupEnabled, user]);

  // Auth observer
  useEffect(() => {
    const unsubscribe = initGoogleAuth((currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        setStoredProfile(getStoredUserProfile());
      } else {
        setStoredProfile(null);
        setCloudBackupInfo(null);
        setSyncStatus("idle");
      }
    });

    return () => unsubscribe();
  }, []);

  const setAutoBackupEnabled = useCallback((enabled: boolean) => {
    setAutoBackupEnabledState(enabled);
    try {
      localStorage.setItem(STORAGE_KEY_AUTO_BACKUP, String(enabled));
    } catch {
      // ignore
    }
  }, []);

  // Fetch info about existing backup in Drive
  const fetchCloudBackupDetails = useCallback(async (): Promise<DriveFileInfo | null> => {
    const token = await getGoogleAccessToken();
    if (!token) {
      setCloudBackupInfo(null);
      return null;
    }

    try {
      setIsLoadingCloudInfo(true);
      const info = await findDriveBackup(token);
      setCloudBackupInfo(info);
      return info;
    } catch (e: any) {
      const errMsg = e?.message || "";
      if (errMsg.includes("Сесията с Google изтече") || errMsg.includes("401")) {
        clearStoredOAuthToken();
      }
      console.warn("Could not fetch cloud backup info:", e);
      return null;
    } finally {
      setIsLoadingCloudInfo(false);
    }
  }, []);

  // Check cloud backup on login or stored profile
  useEffect(() => {
    if ((user || storedProfile) && isOnline) {
      fetchCloudBackupDetails();
    }
  }, [user, storedProfile, isOnline, fetchCloudBackupDetails]);

  // Core backup execution
  const executeBackup = useCallback(
    async (isAutomatic = false): Promise<{ success: boolean; message: string }> => {
      let token = await getGoogleAccessToken();

      // If token is missing and this is a manual backup, attempt interactive acquisition
      if (!token && !isAutomatic) {
        try {
          token = await ensureGoogleAccessToken(true);
          if (token) {
            setStoredProfile(getStoredUserProfile());
          }
        } catch (authErr: any) {
          console.warn("Could not obtain Google token interactively:", authErr);
          const formatted = formatFirebaseAuthError(authErr);
          setSyncStatus("failed");
          setLastSyncError(formatted);
          return {
            success: false,
            message: formatted,
          };
        }
      }

      if (!token) {
        if (!isAutomatic) {
          setSyncStatus("failed");
          setLastSyncError("Няма активна Google сесия. Моля, влезте с профила си.");
        }
        return {
          success: false,
          message: "Няма активна сесия. Влезте с Google профила си.",
        };
      }

      if (!navigator.onLine) {
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

        const currentData = gatherApplicationData();
        const result = await uploadDriveBackup(token, currentData);

        const nowIso = new Date().toISOString();
        setSyncStatus("synced");
        setLastSyncTime(nowIso);
        try {
          localStorage.setItem(STORAGE_KEY_LAST_SYNC, nowIso);
        } catch {
          // ignore
        }

        // Refresh cloud info metadata
        await fetchCloudBackupDetails();

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

        // If access token was expired/revoked on Google's side during manual backup,
        // automatically refresh the token and retry once!
        if (isAuthError) {
          clearStoredOAuthToken();
          if (!isAutomatic) {
            try {
              const freshToken = await ensureGoogleAccessToken(true);
              if (freshToken) {
                setStoredProfile(getStoredUserProfile());
                const currentData = gatherApplicationData();
                const retryResult = await uploadDriveBackup(freshToken, currentData);
                const nowIso = new Date().toISOString();
                setSyncStatus("synced");
                setLastSyncTime(nowIso);
                try {
                  localStorage.setItem(STORAGE_KEY_LAST_SYNC, nowIso);
                } catch {
                  // ignore
                }
                await fetchCloudBackupDetails();
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

        setSyncStatus("failed");
        setLastSyncError(errMsg);
        return {
          success: false,
          message: errMsg,
        };
      }
    },
    [fetchCloudBackupDetails]
  );

  // Trigger manual backup
  const backupNow = useCallback(async () => {
    return executeBackup(false);
  }, [executeBackup]);

  // Trigger debounced auto sync
  const triggerAutoSync = useCallback(() => {
    if (!autoBackupEnabled) return;
    if (!user) return;

    if (!navigator.onLine) {
      hasPendingSyncRef.current = true;
      setSyncStatus("offline");
      return;
    }

    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    setSyncStatus("syncing");

    debounceTimerRef.current = setTimeout(() => {
      executeBackup(true);
    }, 3500); // 3.5s debounce
  }, [autoBackupEnabled, user, executeBackup]);

  // Download and parse cloud backup for preview modal
  const downloadAndParseCloudBackup = useCallback(async () => {
    let token = await getGoogleAccessToken();
    if (!token) {
      try {
        token = await ensureGoogleAccessToken(true);
        if (token) {
          setStoredProfile(getStoredUserProfile());
        }
      } catch (authErr: any) {
        return {
          backup: null,
          rawText: null,
          fileInfo: null,
          error: "Няма активна Google сесия. Влезте с Google профила си.",
        };
      }
    }

    if (!token) {
      return {
        backup: null,
        rawText: null,
        fileInfo: null,
        error: "Няма активна Google сесия.",
      };
    }

    try {
      const fileInfo = await findDriveBackup(token);
      if (!fileInfo) {
        return {
          backup: null,
          rawText: null,
          fileInfo: null,
          error: "В Google Drive не бе намерен съхранен архив (budgetflows-backup.json).",
        };
      }

      const rawText = await downloadDriveBackup(token, fileInfo.id);
      const validation = validateAndParseBackupFile(rawText);

      if (!validation.isValid || !validation.backup) {
        return {
          backup: null,
          rawText,
          fileInfo,
          error: validation.errorMessage || "Архивният файл е повреден или невалиден.",
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
      }
      return {
        backup: null,
        rawText: null,
        fileInfo: null,
        error: errMsg || "Грешка при сваляне на архива от Google Drive.",
      };
    }
  }, []);

  // Restore cloud backup safely
  const restoreCloudBackup = useCallback(
    (
      backup: BackupData,
      mode: "merge" | "replace"
    ): { success: boolean; message: string } => {
      try {
        // Data safety: create an emergency pre-restore snapshot in localStorage
        try {
          const preRestoreSnapshot = gatherApplicationData();
          localStorage.setItem(
            `HomeBudget_PreRestore_Backup_${Date.now()}`,
            JSON.stringify(preRestoreSnapshot)
          );
        } catch (e) {
          console.warn("Could not save emergency pre-restore snapshot:", e);
        }

        const res = applyBackup(backup, mode);

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

  const loginWithGoogle = useCallback(async () => {
    try {
      setSyncStatus("idle");
      setLastSyncError(null);
      const res = await signInWithGoogle();
      setUser(res.user);
      setStoredProfile(getStoredUserProfile());
      await fetchCloudBackupDetails();
    } catch (err: any) {
      console.error("Login failed:", err);
      throw err;
    }
  }, [fetchCloudBackupDetails]);

  const logoutGoogle = useCallback(async () => {
    await signOutGoogle();
    setUser(null);
    setStoredProfile(null);
    setCloudBackupInfo(null);
    setSyncStatus("idle");
    setLastSyncError(null);
  }, []);

  const deleteCloudBackup = useCallback(async (): Promise<{
    success: boolean;
    message: string;
  }> => {
    let token = await getGoogleAccessToken();
    if (!token) {
      try {
        token = await ensureGoogleAccessToken(true);
        if (token) {
          setStoredProfile(getStoredUserProfile());
        }
      } catch (authErr: any) {
        return {
          success: false,
          message: "Няма активна Google сесия. Влезте с Google профила си.",
        };
      }
    }

    if (!token) {
      return {
        success: false,
        message: "Няма активна сесия. Влезте с Google профила си.",
      };
    }

    try {
      setSyncStatus("syncing");
      const existing = await findDriveBackup(token);
      if (!existing || !existing.id) {
        setCloudBackupInfo(null);
        setSyncStatus("idle");
        return {
          success: false,
          message: "В Google Drive не бе намерен съхранен архив (budgetflows-backup.json).",
        };
      }

      await deleteDriveBackup(token, existing.id);
      setCloudBackupInfo(null);
      setSyncStatus("idle");
      setLastSyncError(null);

      // Refresh cloud metadata to ensure drive state is updated
      await fetchCloudBackupDetails();

      return {
        success: true,
        message: "Cloud backup successfully deleted.",
      };
    } catch (err: any) {
      console.error("Delete cloud backup failed:", err);
      const errMsg = err?.message || "Грешка при изтриване на архива от Google Drive.";
      if (errMsg.includes("Сесията с Google изтече") || errMsg.includes("401")) {
        clearStoredOAuthToken();
      }
      setSyncStatus("failed");
      setLastSyncError(errMsg);
      return {
        success: false,
        message: errMsg,
      };
    }
  }, [fetchCloudBackupDetails]);

  const disconnectGoogleDrive = useCallback(async () => {
    try {
      await signOutGoogle();
      clearStoredOAuthToken();
      setAutoBackupEnabled(false);
      setUser(null);
      setStoredProfile(null);
      setCloudBackupInfo(null);
      setSyncStatus("idle");
      setLastSyncError(null);
    } catch (e) {
      console.warn("Error disconnecting Google Drive:", e);
    }
  }, [setAutoBackupEnabled]);

  const isAuthenticated = Boolean(user || storedProfile);

  return (
    <CloudSyncContext.Provider
      value={{
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
