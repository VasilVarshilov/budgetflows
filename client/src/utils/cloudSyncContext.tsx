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
    if (!token) return null;

    try {
      setIsLoadingCloudInfo(true);
      const info = await findDriveBackup(token);
      setCloudBackupInfo(info);
      return info;
    } catch (e: any) {
      console.warn("Could not fetch cloud backup info:", e);
      return null;
    } finally {
      setIsLoadingCloudInfo(false);
    }
  }, []);

  // Check cloud backup on login
  useEffect(() => {
    if (user && isOnline) {
      fetchCloudBackupDetails();
    }
  }, [user, isOnline, fetchCloudBackupDetails]);

  // Core backup execution
  const executeBackup = useCallback(
    async (isAutomatic = false): Promise<{ success: boolean; message: string }> => {
      const token = await getGoogleAccessToken();
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
        setSyncStatus("failed");
        const errMsg = err?.message || "Неуспешен запис в Google Drive.";
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
    const token = await getGoogleAccessToken();
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
      return {
        backup: null,
        rawText: null,
        fileInfo: null,
        error: e?.message || "Грешка при сваляне на архива от Google Drive.",
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
  }, []);

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
