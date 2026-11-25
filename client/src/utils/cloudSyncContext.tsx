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
  getStoredOAuthToken,
  getGoogleTokenExpiresAt,
  trySilentDriveTokenRestore,
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
  formatDriveFileSize,
  DRIVE_BACKUP_FILENAME,
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
  STORAGE_BASE_LAST_CLOUD_MODIFIED_AT,
  STORAGE_BASE_CLOUD_FILE_INFO,
  STORAGE_BASE_DRIVE_CONNECTED,
  STORAGE_BASE_PENDING_SYNC,
  STORAGE_BASE_DISMISSED_RESTORE_PROMPT,
} from "./userStorage";
import { BackupData } from "@/types";
import { t } from "@/i18n/helpers";

export type SyncStatus = "idle" | "syncing" | "synced" | "failed" | "offline";

export type DriveSessionStatus =
  | "disconnected"
  | "restoring"
  | "connected"
  | "standby"
  | "needs_reauth";

export interface PendingRestoreOffer {
  fileInfo: DriveFileInfo;
  uid: string;
}

export interface SyncConflictInfo {
  uid: string;
  reason: "cloud_newer" | "both_modified" | "fresh_device";
  localUpdatedAt: string | null;
  cloudUpdatedAt: string | null;
  localSummary: BackupData["summary"];
  cloudBackup: BackupData | null;
  fileInfo: DriveFileInfo;
}

export type SyncDecision =
  | { action: "idle" }
  | { action: "in_sync" }
  | { action: "upload_local" }
  | { action: "prompt_fresh_device" }
  | { action: "prompt_conflict"; reason: "cloud_newer" | "both_modified" };

function parseTimestampMs(iso?: string | null): number | null {
  if (!iso) return null;
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? ms : null;
}

function computeHasUnsyncedLocalChanges(uid: string): boolean {
  if (!uid || uid === "guest") return false;
  if (userStorage.getItem(STORAGE_BASE_PENDING_SYNC, uid) === "true") {
    return true;
  }
  const localTs = parseTimestampMs(userStorage.getLocalUpdatedAt(uid));
  const lastSyncTs = parseTimestampMs(userStorage.getItem(STORAGE_BASE_LAST_SYNC, uid));
  if (localTs !== null && lastSyncTs !== null && localTs > lastSyncTs + 1500) {
    return true;
  }
  if (!userStorage.isEmpty(uid) && lastSyncTs === null) {
    return true;
  }
  return false;
}

/**
 * Pure synchronization decision engine comparing Local vs Cloud version timestamps.
 * Never allows silent overwrite of existing local data OR silent overwrite of newer cloud data.
 */
export function decideDriveSyncAction(params: {
  isLocalEmpty: boolean;
  localUpdatedAt: string | null;
  lastSyncTime: string | null;
  lastKnownCloudModifiedTime: string | null;
  cloudInfo: DriveFileInfo | null;
  hasPendingSync: boolean;
  autoBackupEnabled: boolean;
}): SyncDecision {
  const {
    isLocalEmpty,
    localUpdatedAt,
    lastSyncTime,
    lastKnownCloudModifiedTime,
    cloudInfo,
    hasPendingSync,
    autoBackupEnabled,
  } = params;

  // 1. No backup exists in Google Drive yet
  if (!cloudInfo) {
    if (!isLocalEmpty && autoBackupEnabled) {
      return { action: "upload_local" };
    }
    return { action: "idle" };
  }

  // 2. Fresh device / empty local storage while Cloud backup exists
  if (isLocalEmpty) {
    return { action: "prompt_fresh_device" };
  }

  // 3. Both local data and cloud backup exist -> compare version timestamps
  const localTs = parseTimestampMs(localUpdatedAt);
  const cloudTs = parseTimestampMs(cloudInfo.modifiedTime);
  const lastSyncTs = parseTimestampMs(lastSyncTime);
  const lastKnownCloudTs = parseTimestampMs(lastKnownCloudModifiedTime);

  const hasSyncLineage = lastSyncTs !== null || lastKnownCloudTs !== null;

  if (hasSyncLineage) {
    const cloudChanged =
      cloudTs !== null &&
      (lastKnownCloudTs !== null
        ? cloudTs > lastKnownCloudTs + 1500
        : lastSyncTs !== null
        ? cloudTs > lastSyncTs + 2000
        : true);

    const localChanged =
      hasPendingSync ||
      (localTs !== null && lastSyncTs !== null ? localTs > lastSyncTs + 1500 : false);

    if (localChanged && !cloudChanged) {
      return autoBackupEnabled ? { action: "upload_local" } : { action: "idle" };
    }

    if (cloudChanged && !localChanged) {
      return { action: "prompt_conflict", reason: "cloud_newer" };
    }

    if (cloudChanged && localChanged) {
      return { action: "prompt_conflict", reason: "both_modified" };
    }

    return { action: "in_sync" };
  }

  // Browser has no prior sync history with Drive, yet both local & cloud have data.
  // Never auto-overwrite in either direction; prompt the user safely.
  if (cloudTs !== null && localTs !== null && cloudTs > localTs + 2000) {
    return { action: "prompt_conflict", reason: "cloud_newer" };
  }

  return { action: "prompt_conflict", reason: "both_modified" };
}

interface CloudSyncContextType {
  user: User | null;
  storedProfile: StoredUserProfile | null;
  activeUid: string;
  isAuthenticated: boolean;
  isAuthLoading: boolean;
  isSwitchingAccount: boolean;
  hasDriveAccessToken: boolean;
  driveSessionStatus: DriveSessionStatus;
  hasUnsyncedChanges: boolean;
  isRestoringDriveSession: boolean;
  authError: any | null;
  isOnline: boolean;
  autoBackupEnabled: boolean;
  setAutoBackupEnabled: (enabled: boolean) => void;
  syncStatus: SyncStatus;
  lastSyncTime: string | null;
  localUpdatedAt: string | null;
  cloudUpdatedAt: string | null;
  lastSyncError: string | null;
  cloudBackupInfo: DriveFileInfo | null;
  isLoadingCloudInfo: boolean;
  pendingRestoreOffer: PendingRestoreOffer | null;
  syncConflict: SyncConflictInfo | null;
  dismissRestoreOffer: () => void;
  dismissSyncConflict: () => void;
  resolveConflictUseLocal: () => Promise<{ success: boolean; message: string }>;
  resolveConflictRestoreCloud: (
    mode: "merge" | "replace"
  ) => { success: boolean; message: string };
  refreshLocalUpdatedAt: () => void;
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
    mode: "merge" | "replace",
    cloudModifiedTime?: string
  ) => { success: boolean; message: string };
  triggerAutoSync: () => void;
}

const CLOUD_SYNC_CONTEXT_SYMBOL = Symbol.for("budgetflows.CloudSyncContext");
const cloudSyncContextStore = globalThis as Record<
  symbol,
  React.Context<CloudSyncContextType | undefined> | undefined
>;

const CloudSyncContext =
  cloudSyncContextStore[CLOUD_SYNC_CONTEXT_SYMBOL] ??
  (cloudSyncContextStore[CLOUD_SYNC_CONTEXT_SYMBOL] = createContext<
    CloudSyncContextType | undefined
  >(undefined));

export const CloudSyncProvider: React.FC<{
  children: React.ReactNode;
  onDataRestored?: () => void;
}> = ({ children, onDataRestored }) => {
  const [user, setUser] = useState<User | null>(null);
  const [activeUid, setActiveUid] = useState<string>("guest");
  const [isAuthLoading, setIsAuthLoading] = useState<boolean>(true);
  const [isSwitchingAccount, setIsSwitchingAccount] = useState<boolean>(false);
  const [hasDriveAccessToken, setHasDriveAccessToken] = useState<boolean>(false);
  const [driveSessionStatus, setDriveSessionStatus] =
    useState<DriveSessionStatus>("disconnected");
  const [isRestoringDriveSession, setIsRestoringDriveSession] =
    useState<boolean>(false);
  const [authError, setAuthError] = useState<any | null>(null);

  const [isOnline, setIsOnline] = useState<boolean>(() =>
    typeof navigator !== "undefined" ? navigator.onLine : true
  );
  const [autoBackupEnabled, setAutoBackupEnabledState] = useState<boolean>(true);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>("idle");
  const [lastSyncTime, setLastSyncTime] = useState<string | null>(null);
  const [localUpdatedAt, setLocalUpdatedAt] = useState<string | null>(null);
  const [lastSyncError, setLastSyncError] = useState<string | null>(null);
  const [cloudBackupInfo, setCloudBackupInfo] = useState<DriveFileInfo | null>(
    null
  );
  const [isLoadingCloudInfo, setIsLoadingCloudInfo] = useState(false);
  const [pendingRestoreOffer, setPendingRestoreOffer] =
    useState<PendingRestoreOffer | null>(null);
  const [syncConflict, setSyncConflict] = useState<SyncConflictInfo | null>(
    null
  );

  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasPendingSyncRef = useRef<boolean>(false);
  const authUidRef = useRef<string>("guest");
  const userRef = useRef<User | null>(null);
  const autoBackupRef = useRef<boolean>(true);
  const checkedRestoreOfferForUidRef = useRef<string | null>(null);
  const isApplyingRestoreRef = useRef<boolean>(false);
  const isBackupInFlightRef = useRef<boolean>(false);
  const triggerAutoSyncRef = useRef<() => void>(() => {});
  const executeBackupRef = useRef<
    (isAutomatic?: boolean, allowOverwriteConflict?: boolean) => Promise<{ success: boolean; message: string }>
  >(async () => ({ success: false, message: "" }));

  const persistPendingSyncFlag = useCallback((uid: string, pending: boolean) => {
    hasPendingSyncRef.current = pending;
    if (!uid || uid === "guest") return;
    if (pending) {
      userStorage.setItem(STORAGE_BASE_PENDING_SYNC, "true", uid);
    } else {
      userStorage.removeItem(STORAGE_BASE_PENDING_SYNC, uid);
    }
  }, []);

  const clearPendingAutoSync = useCallback(() => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
    hasPendingSyncRef.current = false;
  }, []);

  const clearRefreshTimer = useCallback(() => {
    if (refreshTimerRef.current) {
      clearTimeout(refreshTimerRef.current);
      refreshTimerRef.current = null;
    }
  }, []);

  const readUserSyncPreferences = useCallback((uid: string) => {
    const autoRaw = userStorage.getItem(STORAGE_BASE_AUTO_BACKUP, uid);
    const enabled = autoRaw === null ? true : autoRaw === "true";
    autoBackupRef.current = enabled;
    setAutoBackupEnabledState(enabled);

    const lastSync = userStorage.getItem(STORAGE_BASE_LAST_SYNC, uid);
    setLastSyncTime(lastSync);

    const localTs = userStorage.getLocalUpdatedAt(uid);
    setLocalUpdatedAt(localTs);

    const cachedInfo =
      uid && uid !== "guest"
        ? userStorage.getJSON<DriveFileInfo | null>(STORAGE_BASE_CLOUD_FILE_INFO, null, uid)
        : null;
    if (cachedInfo && cachedInfo.id) {
      setCloudBackupInfo(cachedInfo);
    } else {
      const lastCloudMod =
        uid && uid !== "guest"
          ? userStorage.getItem(STORAGE_BASE_LAST_CLOUD_MODIFIED_AT, uid)
          : null;
      if (lastCloudMod) {
        setCloudBackupInfo({
          id: "",
          name: DRIVE_BACKUP_FILENAME,
          modifiedTime: lastCloudMod,
        });
      } else {
        setCloudBackupInfo(null);
      }
    }

    hasPendingSyncRef.current = computeHasUnsyncedLocalChanges(uid);
  }, []);

  const refreshLocalUpdatedAt = useCallback(() => {
    const uid = authUidRef.current;
    setLocalUpdatedAt(userStorage.getLocalUpdatedAt(uid));
  }, []);

  // Keep localUpdatedAt synchronized whenever any storage module writes user changes
  // (Expenses, Incomes, Budgets, Categories, Electricity, Settings) and queue auto-sync cleanly.
  useEffect(() => {
    const handleLocalUpdate = (ev: Event) => {
      const uid = authUidRef.current;
      const detail = (ev as CustomEvent<{ timestamp?: string }>)?.detail;
      if (detail?.timestamp) {
        setLocalUpdatedAt(detail.timestamp);
      } else {
        setLocalUpdatedAt(userStorage.getLocalUpdatedAt(uid));
      }

      if (!isApplyingRestoreRef.current && uid && uid !== "guest") {
        persistPendingSyncFlag(uid, true);
        if (autoBackupRef.current && userRef.current) {
          triggerAutoSyncRef.current();
        }
      }
    };
    window.addEventListener("budgetflows:local-data-updated", handleLocalUpdate);
    return () => {
      window.removeEventListener(
        "budgetflows:local-data-updated",
        handleLocalUpdate
      );
    };
  }, [persistPendingSyncFlag]);

  // Mark session status cleanly when in-memory token expires (no auto-popups)
  const scheduleProactiveTokenRefresh = useCallback(
    (targetUser: User) => {
      clearRefreshTimer();
      const expiresAt = getGoogleTokenExpiresAt(targetUser.uid);
      if (!expiresAt) return;

      const msUntilExpiryCheck = Math.max(20_000, expiresAt - Date.now() + 1_000);
      refreshTimerRef.current = setTimeout(async () => {
        if (authUidRef.current !== targetUser.uid) return;
        const stillValid = await getGoogleAccessToken(targetUser.uid);
        if (authUidRef.current !== targetUser.uid) return;
        if (!stillValid) {
          setHasDriveAccessToken(false);
          const unsynced =
            hasPendingSyncRef.current || computeHasUnsyncedLocalChanges(targetUser.uid);
          const hasSyncedBefore = Boolean(
            userStorage.getItem(STORAGE_BASE_LAST_SYNC, targetUser.uid)
          );
          setDriveSessionStatus(
            unsynced || !hasSyncedBefore ? "needs_reauth" : "standby"
          );
        } else {
          scheduleProactiveTokenRefresh(targetUser);
        }
      }, msUntilExpiryCheck);
    },
    [clearRefreshTimer]
  );

  // Refreshes only the Drive file metadata without evaluating sync conflicts
  const refreshDriveMetadataOnly = useCallback(
    async (
      targetUser: User,
      tokenOverride?: string | null
    ): Promise<DriveFileInfo | null> => {
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
        if (info) {
          userStorage.setJSON(STORAGE_BASE_CLOUD_FILE_INFO, info, expectedUid);
        } else {
          userStorage.removeItem(STORAGE_BASE_CLOUD_FILE_INFO, expectedUid);
        }
        return info;
      } catch (e: any) {
        const errMsg = e?.message || "";
        if (errMsg.includes("Сесията с Google изтече") || errMsg.includes("401")) {
          clearStoredOAuthToken();
          if (authUidRef.current === expectedUid) {
            setHasDriveAccessToken(false);
            setDriveSessionStatus("needs_reauth");
          }
        }
        console.warn("Could not fetch cloud backup metadata:", e);
        return null;
      } finally {
        if (authUidRef.current === expectedUid) {
          setIsLoadingCloudInfo(false);
        }
      }
    },
    []
  );

  // Evaluates Local vs Cloud timestamps, auto-uploads newer local data, or prompts safely on conflict
  const evaluateDriveSyncState = useCallback(
    async (
      targetUser: User,
      tokenOverride?: string | null
    ): Promise<DriveFileInfo | null> => {
      const expectedUid = targetUser.uid;
      const token =
        tokenOverride || (await getGoogleAccessToken(expectedUid));
      if (authUidRef.current !== expectedUid) return null;

      setHasDriveAccessToken(Boolean(token));
      if (!token) {
        setCloudBackupInfo(null);
        return null;
      }

      setDriveSessionStatus("connected");
      scheduleProactiveTokenRefresh(targetUser);

      try {
        setIsLoadingCloudInfo(true);
        const info = await findDriveBackup(token);
        if (authUidRef.current !== expectedUid) return null;
        setCloudBackupInfo(info);
        if (info) {
          userStorage.setJSON(STORAGE_BASE_CLOUD_FILE_INFO, info, expectedUid);
        } else {
          userStorage.removeItem(STORAGE_BASE_CLOUD_FILE_INFO, expectedUid);
        }

        const isEmpty = userStorage.isEmpty(expectedUid);
        const currentLocalUpdatedAt = userStorage.getLocalUpdatedAt(expectedUid);
        const currentLastSync = userStorage.getItem(
          STORAGE_BASE_LAST_SYNC,
          expectedUid
        );
        const lastKnownCloudMod = userStorage.getItem(
          STORAGE_BASE_LAST_CLOUD_MODIFIED_AT,
          expectedUid
        );

        const persistentPending = computeHasUnsyncedLocalChanges(expectedUid);
        const decision = decideDriveSyncAction({
          isLocalEmpty: isEmpty,
          localUpdatedAt: currentLocalUpdatedAt,
          lastSyncTime: currentLastSync,
          lastKnownCloudModifiedTime: lastKnownCloudMod,
          cloudInfo: info,
          hasPendingSync: hasPendingSyncRef.current || persistentPending,
          autoBackupEnabled: autoBackupRef.current,
        });

        if (decision.action === "upload_local") {
          setSyncStatus("syncing");
          setLastSyncError(null);

          const currentData = gatherApplicationData({
            uid: targetUser.uid,
            email: targetUser.email,
          });
          const uploadRes = await uploadDriveBackup(token, currentData);
          if (authUidRef.current !== expectedUid) return info;

          const nowIso = new Date().toISOString();
          const cloudModTime = uploadRes.modifiedTime || nowIso;

          userStorage.setItem(STORAGE_BASE_LAST_SYNC, nowIso, expectedUid);
          userStorage.setItem(
            STORAGE_BASE_LAST_CLOUD_MODIFIED_AT,
            cloudModTime,
            expectedUid
          );
          if (!currentLocalUpdatedAt) {
            const stamped = currentData.dataUpdatedAt || nowIso;
            userStorage.setLocalUpdatedAt(stamped, expectedUid);
            setLocalUpdatedAt(stamped);
          }

          persistPendingSyncFlag(expectedUid, false);
          setLastSyncTime(nowIso);
          setSyncStatus("synced");
          setSyncConflict(null);

          const updatedInfo: DriveFileInfo = {
            id: uploadRes.fileId || info?.id || "",
            name: DRIVE_BACKUP_FILENAME,
            modifiedTime: cloudModTime,
            sizeBytes: uploadRes.sizeBytes,
            size: formatDriveFileSize(uploadRes.sizeBytes),
            createdTime: info?.createdTime || cloudModTime,
          };
          userStorage.setJSON(STORAGE_BASE_CLOUD_FILE_INFO, updatedInfo, expectedUid);
          setCloudBackupInfo(updatedInfo);
          return updatedInfo;
        }

        if (decision.action === "in_sync") {
          if (info?.modifiedTime) {
            userStorage.setItem(
              STORAGE_BASE_LAST_CLOUD_MODIFIED_AT,
              info.modifiedTime,
              expectedUid
            );
          }
          persistPendingSyncFlag(expectedUid, false);
          setSyncConflict(null);
          setSyncStatus("synced");
          return info;
        }

        if (
          (decision.action === "prompt_fresh_device" ||
            decision.action === "prompt_conflict") &&
          info
        ) {
          // Download & verify ownership so the user gets full comparison + safe Merge/Replace options
          let validatedCloudBackup: BackupData | null = null;
          try {
            const rawText = await downloadDriveBackup(token, info.id);
            if (authUidRef.current !== expectedUid) return info;
            const parsed = validateAndParseBackupFile(rawText);
            if (parsed.isValid && parsed.backup) {
              const ownership = validateBackupOwnership(parsed.backup, {
                uid: targetUser.uid,
                email: targetUser.email,
              });
              if (ownership.allowed) {
                validatedCloudBackup = parsed.backup;
              }
            }
          } catch (dlErr) {
            console.warn("Could not preview cloud backup for conflict check:", dlErr);
          }

          if (authUidRef.current !== expectedUid) return info;

          if (decision.action === "prompt_fresh_device") {
            const dismissed = userStorage.getItem(
              STORAGE_BASE_DISMISSED_RESTORE_PROMPT,
              expectedUid
            );
            if (
              !dismissed &&
              checkedRestoreOfferForUidRef.current !== expectedUid
            ) {
              checkedRestoreOfferForUidRef.current = expectedUid;
              setPendingRestoreOffer({
                fileInfo: info,
                uid: expectedUid,
              });
              if (validatedCloudBackup) {
                const localSnapshot = gatherApplicationData({
                  uid: targetUser.uid,
                  email: targetUser.email,
                });
                setSyncConflict({
                  uid: expectedUid,
                  reason: "fresh_device",
                  localUpdatedAt: currentLocalUpdatedAt,
                  cloudUpdatedAt:
                    info.modifiedTime ||
                    validatedCloudBackup.dataUpdatedAt ||
                    validatedCloudBackup.exportDate ||
                    null,
                  localSummary: localSnapshot.summary,
                  cloudBackup: validatedCloudBackup,
                  fileInfo: info,
                });
              }
            }
          } else if (validatedCloudBackup) {
            const localSnapshot = gatherApplicationData({
              uid: targetUser.uid,
              email: targetUser.email,
            });
            setSyncConflict({
              uid: expectedUid,
              reason: decision.reason,
              localUpdatedAt: currentLocalUpdatedAt,
              cloudUpdatedAt:
                info.modifiedTime ||
                validatedCloudBackup.dataUpdatedAt ||
                validatedCloudBackup.exportDate ||
                null,
              localSummary: localSnapshot.summary,
              cloudBackup: validatedCloudBackup,
              fileInfo: info,
            });
          }

          return info;
        }

        return info;
      } catch (e: any) {
        const errMsg = e?.message || "";
        if (errMsg.includes("Сесията с Google изтече") || errMsg.includes("401")) {
          clearStoredOAuthToken();
          if (authUidRef.current === expectedUid) {
            setHasDriveAccessToken(false);
            setDriveSessionStatus("needs_reauth");
          }
        } else if (authUidRef.current === expectedUid) {
          setSyncStatus("failed");
          setLastSyncError(errMsg || t("syncErrors.syncErrorGeneric"));
        }
        console.warn("Could not evaluate Drive sync state:", e);
        return null;
      } finally {
        if (authUidRef.current === expectedUid) {
          setIsLoadingCloudInfo(false);
        }
      }
    },
    [scheduleProactiveTokenRefresh, persistPendingSyncFlag]
  );

  // Auth observer: synchronizes userStorage namespace strictly with Firebase UID
  // and silently restores existing Firebase Auth session without launching Google OAuth.
  useEffect(() => {
    const unsubscribe = initGoogleAuth(
      (currentUser, token) => {
        const nextUid = currentUser?.uid || "guest";
        const accountChanged = authUidRef.current !== nextUid;

        if (accountChanged) {
          clearPendingAutoSync();
          clearRefreshTimer();
          setCloudBackupInfo(null);
          setLastSyncError(null);
          setPendingRestoreOffer(null);
          setSyncConflict(null);
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

        if (!currentUser) {
          setDriveSessionStatus("disconnected");
          setIsRestoringDriveSession(false);
          return;
        }

        if (token) {
          setDriveSessionStatus("connected");
          setIsRestoringDriveSession(false);
          userStorage.setItem(STORAGE_BASE_DRIVE_CONNECTED, "true", nextUid);
          if (typeof navigator === "undefined" || navigator.onLine) {
            evaluateDriveSyncState(currentUser, token);
          }
        } else {
          // Existing Firebase session restored silently; try passive in-memory cross-tab restore
          setIsRestoringDriveSession(true);
          setDriveSessionStatus("restoring");
          void trySilentDriveTokenRestore(currentUser)
            .then((restored) => {
              if (authUidRef.current !== nextUid) return;
              // Guard against race where user clicked interactive sign-in while BroadcastChannel check waited
              if (getStoredOAuthToken(nextUid)) {
                setIsRestoringDriveSession(false);
                setHasDriveAccessToken(true);
                setDriveSessionStatus("connected");
                return;
              }
              setIsRestoringDriveSession(false);
              if (restored?.accessToken) {
                setHasDriveAccessToken(true);
                setDriveSessionStatus("connected");
                userStorage.setItem(STORAGE_BASE_DRIVE_CONNECTED, "true", nextUid);
                if (typeof navigator === "undefined" || navigator.onLine) {
                  evaluateDriveSyncState(currentUser, restored.accessToken);
                }
              } else {
                setHasDriveAccessToken(false);
                const unsynced = computeHasUnsyncedLocalChanges(nextUid);
                const hasSyncedBefore = Boolean(
                  userStorage.getItem(STORAGE_BASE_LAST_SYNC, nextUid)
                );
                if (unsynced) {
                  persistPendingSyncFlag(nextUid, true);
                  setDriveSessionStatus("needs_reauth");
                } else if (hasSyncedBefore) {
                  setDriveSessionStatus("standby");
                  setSyncStatus((prev) => (prev === "idle" ? "synced" : prev));
                } else {
                  setDriveSessionStatus(
                    autoBackupRef.current ? "needs_reauth" : "standby"
                  );
                }
              }
            })
            .catch(() => {
              if (authUidRef.current !== nextUid || getStoredOAuthToken(nextUid)) return;
              setIsRestoringDriveSession(false);
              setHasDriveAccessToken(false);
              const unsynced = computeHasUnsyncedLocalChanges(nextUid);
              const hasSyncedBefore = Boolean(
                userStorage.getItem(STORAGE_BASE_LAST_SYNC, nextUid)
              );
              setDriveSessionStatus(
                unsynced || !hasSyncedBefore ? "needs_reauth" : "standby"
              );
            });
        }
      },
      (err) => {
        setAuthError(err);
        setIsAuthLoading(false);
      }
    );

    return () => {
      clearPendingAutoSync();
      clearRefreshTimer();
      unsubscribe();
    };
  }, [
    clearPendingAutoSync,
    clearRefreshTimer,
    readUserSyncPreferences,
    evaluateDriveSyncState,
    persistPendingSyncFlag,
  ]);

  // Passively verify token expiry on tab focus / visibility return, AND flush pending sync before page hide/close
  useEffect(() => {
    const flushPendingOnLeave = () => {
      const activeUser = userRef.current;
      if (!activeUser || !autoBackupRef.current) return;
      if (!debounceTimerRef.current && !hasPendingSyncRef.current) return;
      if (typeof navigator !== "undefined" && !navigator.onLine) return;
      if (!getStoredOAuthToken(activeUser.uid)) return;

      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }
      void executeBackupRef.current(true);
    };

    const checkFocusRecovery = () => {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") {
        flushPendingOnLeave();
        return;
      }
      const activeUser = userRef.current;
      if (!activeUser) return;

      const uid = activeUser.uid;
      if (getStoredOAuthToken(uid)) return;

      void trySilentDriveTokenRestore(activeUser).then((restored) => {
        if (authUidRef.current !== uid || getStoredOAuthToken(uid)) return;
        if (restored?.accessToken) {
          setHasDriveAccessToken(true);
          setDriveSessionStatus("connected");
          if (typeof navigator === "undefined" || navigator.onLine) {
            void evaluateDriveSyncState(activeUser, restored.accessToken);
          }
        } else {
          setHasDriveAccessToken(false);
          const unsynced =
            hasPendingSyncRef.current || computeHasUnsyncedLocalChanges(uid);
          const hasSyncedBefore = Boolean(
            userStorage.getItem(STORAGE_BASE_LAST_SYNC, uid)
          );
          setDriveSessionStatus(
            unsynced || !hasSyncedBefore ? "needs_reauth" : "standby"
          );
        }
      });
    };

    window.addEventListener("focus", checkFocusRecovery);
    document.addEventListener("visibilitychange", checkFocusRecovery);
    window.addEventListener("pagehide", flushPendingOnLeave);
    return () => {
      window.removeEventListener("focus", checkFocusRecovery);
      document.removeEventListener("visibilitychange", checkFocusRecovery);
      window.removeEventListener("pagehide", flushPendingOnLeave);
    };
  }, [evaluateDriveSyncState]);

  const setAutoBackupEnabled = useCallback((enabled: boolean) => {
    const uid = authUidRef.current;
    autoBackupRef.current = enabled;
    setAutoBackupEnabledState(enabled);
    userStorage.setItem(STORAGE_BASE_AUTO_BACKUP, String(enabled), uid);
    if (enabled && uid !== "guest" && computeHasUnsyncedLocalChanges(uid)) {
      triggerAutoSyncRef.current();
    }
  }, []);

  const fetchCloudBackupDetails = useCallback(async (): Promise<DriveFileInfo | null> => {
    const currentUser = userRef.current;
    if (!currentUser) {
      setCloudBackupInfo(null);
      return null;
    }
    return refreshDriveMetadataOnly(currentUser);
  }, [refreshDriveMetadataOnly]);

  // Core backup execution
  const executeBackup = useCallback(
    async (
      isAutomatic = false,
      allowOverwriteConflict = false
    ): Promise<{ success: boolean; message: string }> => {
      let activeUser = userRef.current;
      let expectedUid = activeUser?.uid;
      let token = expectedUid ? await getGoogleAccessToken(expectedUid) : null;

      // Try silent refresh before giving up or prompting
      if (!token && activeUser && expectedUid) {
        const silentRes = await trySilentDriveTokenRestore(activeUser);
        if (silentRes?.accessToken && authUidRef.current === expectedUid) {
          token = silentRes.accessToken;
          setHasDriveAccessToken(true);
          setDriveSessionStatus("connected");
          scheduleProactiveTokenRefresh(activeUser);
        }
      }

      // If token is still missing and this is a manual backup, acquire interactively
      if (!token && !isAutomatic) {
        try {
          token = await ensureGoogleAccessToken(true, expectedUid);
          const latestClientUser = userRef.current;
          if (latestClientUser) {
            activeUser = latestClientUser;
            expectedUid = latestClientUser.uid;
          }
          setHasDriveAccessToken(Boolean(token));
          if (token) {
            setDriveSessionStatus("connected");
          }
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
          setLastSyncError(t("syncErrors.noActiveSessionRenew"));
        } else if (expectedUid && expectedUid !== "guest") {
          // Keep pending sync queued so reconnect uploads it automatically
          persistPendingSyncFlag(expectedUid, true);
          setDriveSessionStatus("needs_reauth");
        }
        return {
          success: false,
          message: t("syncErrors.noActiveSessionLogin"),
        };
      }

      // Guard: Never auto-overwrite an existing Drive backup from an empty device before restore
      if (isAutomatic && userStorage.isEmpty(expectedUid) && cloudBackupInfo) {
        return {
          success: false,
          message: t("syncErrors.uploadDeferredEmpty"),
        };
      }

      // Guard: Never silently auto-overwrite when an unresolved conflict is active
      if (
        isAutomatic &&
        !allowOverwriteConflict &&
        syncConflict &&
        syncConflict.uid === expectedUid
      ) {
        persistPendingSyncFlag(expectedUid, true);
        return {
          success: false,
          message: t("syncErrors.autoUploadPausedConflict"),
        };
      }

      if (typeof navigator !== "undefined" && !navigator.onLine) {
        persistPendingSyncFlag(expectedUid, true);
        setSyncStatus("offline");
        return {
          success: false,
          message: t("syncErrors.offlineQueued"),
        };
      }

      if (isBackupInFlightRef.current) {
        persistPendingSyncFlag(expectedUid, true);
        return {
          success: false,
          message: t("syncErrors.syncInFlight"),
        };
      }

      const localStampBeforeUpload = userStorage.getLocalUpdatedAt(expectedUid);
      isBackupInFlightRef.current = true;

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
            message: t("syncErrors.accountSwitchedMidSync"),
          };
        }

        const nowIso = new Date().toISOString();
        const cloudModTime = result.modifiedTime || nowIso;

        const localStampAfterUpload = userStorage.getLocalUpdatedAt(expectedUid);
        const modifiedDuringUpload =
          localStampAfterUpload &&
          localStampBeforeUpload &&
          localStampAfterUpload !== localStampBeforeUpload;

        if (!modifiedDuringUpload) {
          persistPendingSyncFlag(expectedUid, false);
          setSyncStatus("synced");
        } else {
          persistPendingSyncFlag(expectedUid, true);
        }

        setLastSyncTime(nowIso);
        setSyncConflict(null);
        setPendingRestoreOffer(null);

        userStorage.setItem(STORAGE_BASE_LAST_SYNC, nowIso, expectedUid);
        userStorage.setItem(
          STORAGE_BASE_LAST_CLOUD_MODIFIED_AT,
          cloudModTime,
          expectedUid
        );
        userStorage.setItem(STORAGE_BASE_DRIVE_CONNECTED, "true", expectedUid);

        if (!userStorage.getLocalUpdatedAt(expectedUid)) {
          const stamped = currentData.dataUpdatedAt || nowIso;
          userStorage.setLocalUpdatedAt(stamped, expectedUid);
          setLocalUpdatedAt(stamped);
        }

        const updatedInfo: DriveFileInfo = {
          id: result.fileId || cloudBackupInfo?.id || "",
          name: DRIVE_BACKUP_FILENAME,
          modifiedTime: cloudModTime,
          sizeBytes: result.sizeBytes,
          size: formatDriveFileSize(result.sizeBytes),
          createdTime: cloudBackupInfo?.createdTime || cloudModTime,
        };
        userStorage.setJSON(STORAGE_BASE_CLOUD_FILE_INFO, updatedInfo, expectedUid);
        setCloudBackupInfo(updatedInfo);

        await refreshDriveMetadataOnly(activeUser, token);

        if (modifiedDuringUpload && autoBackupRef.current) {
          triggerAutoSyncRef.current();
        }

        return {
          success: true,
          message:
            result.message || t("syncErrors.driveSavedSuccess"),
        };
      } catch (err: any) {
        console.error("Backup to Google Drive failed:", err);
        const errMsg = err?.message || t("syncErrors.driveSaveFailed");
        const isAuthError =
          errMsg.includes("Сесията с Google изтече") ||
          errMsg.includes("401") ||
          errMsg.includes("invalid_grant");

        if (isAuthError) {
          clearStoredOAuthToken();
          if (authUidRef.current === expectedUid) {
            setHasDriveAccessToken(false);
            setDriveSessionStatus("needs_reauth");
          }

          if (!isAutomatic) {
            try {
              const freshToken = await ensureGoogleAccessToken(true, expectedUid);
              const refreshedUser = userRef.current;
              if (freshToken && refreshedUser && refreshedUser.uid === expectedUid) {
                setHasDriveAccessToken(true);
                setDriveSessionStatus("connected");
                const currentData = gatherApplicationData({
                  uid: refreshedUser.uid,
                  email: refreshedUser.email,
                });
                const retryResult = await uploadDriveBackup(
                  freshToken,
                  currentData
                );
                if (authUidRef.current === expectedUid) {
                  const nowIso = new Date().toISOString();
                  const cloudModTime = retryResult.modifiedTime || nowIso;
                  persistPendingSyncFlag(expectedUid, false);
                  setSyncStatus("synced");
                  setLastSyncTime(nowIso);
                  setSyncConflict(null);
                  userStorage.setItem(
                    STORAGE_BASE_LAST_SYNC,
                    nowIso,
                    expectedUid
                  );
                  userStorage.setItem(
                    STORAGE_BASE_LAST_CLOUD_MODIFIED_AT,
                    cloudModTime,
                    expectedUid
                  );
                  await refreshDriveMetadataOnly(refreshedUser, freshToken);
                }
                return {
                  success: true,
                  message:
                    retryResult.message ||
                    t("syncErrors.driveSavedSuccess"),
                };
              }
            } catch (retryErr: any) {
              console.warn("Retry after token refresh failed:", retryErr);
            }
          } else {
            persistPendingSyncFlag(expectedUid, true);
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
      } finally {
        isBackupInFlightRef.current = false;
      }
    },
    [
      cloudBackupInfo,
      syncConflict,
      refreshDriveMetadataOnly,
      scheduleProactiveTokenRefresh,
      persistPendingSyncFlag,
    ]
  );

  executeBackupRef.current = executeBackup;

  // Trigger manual backup
  const backupNow = useCallback(async () => {
    return executeBackup(false, true);
  }, [executeBackup]);

  // Trigger fast debounced auto sync (1000ms) — ALWAYS persists pending sync flag
  // across reloads/offline periods so local edits are never lost or overwritten.
  const triggerAutoSync = useCallback(() => {
    const currentUser = userRef.current;
    const uid = authUidRef.current;

    if (uid && uid !== "guest") {
      persistPendingSyncFlag(uid, true);
      if (!userStorage.getLocalUpdatedAt(uid)) {
        const ts = userStorage.markLocalModified(uid);
        setLocalUpdatedAt(ts);
      }
    }

    if (!autoBackupRef.current || !currentUser) return;

    if (typeof navigator !== "undefined" && !navigator.onLine) {
      setSyncStatus("offline");
      return;
    }

    // If token isn't in memory right now, try cross-tab silent restore cleanly;
    // keep durable pending flag = true without opening automatic OAuth popups.
    if (!getStoredOAuthToken(currentUser.uid)) {
      const scheduledForUid = currentUser.uid;
      void trySilentDriveTokenRestore(currentUser).then((silentRes) => {
        if (authUidRef.current !== scheduledForUid || getStoredOAuthToken(scheduledForUid)) return;
        if (silentRes?.accessToken) {
          setHasDriveAccessToken(true);
          setDriveSessionStatus("connected");
          if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
          setSyncStatus("syncing");
          debounceTimerRef.current = setTimeout(() => {
            if (authUidRef.current !== scheduledForUid) return;
            void executeBackup(true);
          }, 1000);
        } else {
          setHasDriveAccessToken(false);
          setDriveSessionStatus("needs_reauth");
        }
      });
      return;
    }

    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    const scheduledForUid = currentUser.uid;
    setSyncStatus("syncing");

    debounceTimerRef.current = setTimeout(() => {
      if (authUidRef.current !== scheduledForUid) return;
      void executeBackup(true);
    }, 1000);
  }, [executeBackup, persistPendingSyncFlag]);

  triggerAutoSyncRef.current = triggerAutoSync;

  // Online / Offline listeners
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      const currentUser = userRef.current;
      if (!currentUser) return;

      const hasPending =
        hasPendingSyncRef.current ||
        computeHasUnsyncedLocalChanges(currentUser.uid);

      if (!getStoredOAuthToken(currentUser.uid)) {
        void trySilentDriveTokenRestore(currentUser).then((restored) => {
          if (authUidRef.current !== currentUser.uid || getStoredOAuthToken(currentUser.uid)) return;
          if (restored?.accessToken) {
            setHasDriveAccessToken(true);
            setDriveSessionStatus("connected");
            if (hasPending && autoBackupRef.current) {
              triggerAutoSync();
            }
          } else {
            setHasDriveAccessToken(false);
            const hasSyncedBefore = Boolean(
              userStorage.getItem(STORAGE_BASE_LAST_SYNC, currentUser.uid)
            );
            setDriveSessionStatus(
              hasPending || !hasSyncedBefore ? "needs_reauth" : "standby"
            );
          }
        });
        return;
      }

      if (hasPending && autoBackupRef.current) {
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
  }, [triggerAutoSync]);

  // Download and parse cloud backup for preview modal (with strict ownership validation)
  const downloadAndParseCloudBackup = useCallback(async () => {
    let activeUser = userRef.current;
    let token = activeUser ? await getGoogleAccessToken(activeUser.uid) : null;

    if (!token && activeUser) {
      const silentRes = await trySilentDriveTokenRestore(activeUser);
      if (silentRes?.accessToken) {
        token = silentRes.accessToken;
        setHasDriveAccessToken(true);
        setDriveSessionStatus("connected");
      }
    }

    if (!token) {
      try {
        token = await ensureGoogleAccessToken(true, activeUser?.uid);
        activeUser = userRef.current;
        setHasDriveAccessToken(Boolean(token));
        if (token) setDriveSessionStatus("connected");
      } catch (authErr: any) {
        return {
          backup: null,
          rawText: null,
          fileInfo: null,
          error:
            formatFirebaseAuthError(authErr) ||
            t("syncErrors.signInPrompt"),
        };
      }
    }

    if (!token || !activeUser) {
      return {
        backup: null,
        rawText: null,
        fileInfo: null,
        error: t("syncErrors.noActiveSession"),
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
          error: t("syncErrors.accountSwitchedMidReq"),
        };
      }

      if (!fileInfo) {
        return {
          backup: null,
          rawText: null,
          fileInfo: null,
          error: t("syncErrors.backupNotFoundDrive"),
        };
      }

      const rawText = await downloadDriveBackup(token, fileInfo.id);
      if (authUidRef.current !== expectedUid) {
        return {
          backup: null,
          rawText: null,
          fileInfo: null,
          error: t("syncErrors.accountSwitchedMidDownload"),
        };
      }

      const validation = validateAndParseBackupFile(rawText);
      if (!validation.isValid || !validation.backup) {
        return {
          backup: null,
          rawText,
          fileInfo,
          error:
            validation.errorMessage ||
            t("syncErrors.corruptBackup"),
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
          error: ownership.reason || t("syncErrors.otherAccountBackup"),
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
        setDriveSessionStatus("needs_reauth");
      }
      return {
        backup: null,
        rawText: null,
        fileInfo: null,
        error: errMsg || t("syncErrors.downloadFailed"),
      };
    }
  }, []);

  // Restore cloud backup safely inside the active user's isolated namespace
  const restoreCloudBackup = useCallback(
    (
      backup: BackupData,
      mode: "merge" | "replace",
      cloudModifiedTime?: string
    ): { success: boolean; message: string } => {
      try {
        const currentUser = userRef.current;
        const targetUid = currentUser?.uid || authUidRef.current;
        const ownership = validateBackupOwnership(
          backup,
          currentUser ? { uid: currentUser.uid, email: currentUser.email } : null
        );
        if (!ownership.allowed) {
          return {
            success: false,
            message: ownership.reason || t("syncErrors.otherAccountBackup"),
          };
        }

        // Data safety: create an account-isolated emergency pre-restore snapshot
        try {
          const preRestoreSnapshot = gatherApplicationData(
            currentUser
              ? { uid: currentUser.uid, email: currentUser.email }
              : undefined
          );
          userStorage.savePreRestoreSnapshot(preRestoreSnapshot, currentUser?.uid);
        } catch (e) {
          console.warn("Could not save emergency pre-restore snapshot:", e);
        }

        isApplyingRestoreRef.current = true;
        let res: { message: string };
        try {
          res = applyBackup(backup, mode);
        } finally {
          isApplyingRestoreRef.current = false;
        }

        const nowIso = new Date().toISOString();
        const effectiveCloudTime =
          cloudModifiedTime ||
          cloudBackupInfo?.modifiedTime ||
          backup.dataUpdatedAt ||
          backup.exportDate;

        setPendingRestoreOffer(null);
        setSyncConflict(null);

        if (targetUid && targetUid !== "guest") {
          userStorage.removeItem(
            STORAGE_BASE_DISMISSED_RESTORE_PROMPT,
            targetUid
          );
        }

        if (mode === "replace") {
          const alignedLocalTs = effectiveCloudTime || nowIso;
          userStorage.setLocalUpdatedAt(alignedLocalTs, targetUid);
          setLocalUpdatedAt(alignedLocalTs);
          userStorage.setItem(STORAGE_BASE_LAST_SYNC, nowIso, targetUid);
          setLastSyncTime(nowIso);
          if (effectiveCloudTime) {
            userStorage.setItem(
              STORAGE_BASE_LAST_CLOUD_MODIFIED_AT,
              effectiveCloudTime,
              targetUid
            );
          }
          persistPendingSyncFlag(targetUid, false);
          clearPendingAutoSync();
          setSyncStatus("synced");
        } else {
          // Merge mode preserves existing local items + adds missing cloud items,
          // then queues an upload so Google Drive receives the merged superset.
          const mergedTs = userStorage.markLocalModified(targetUid);
          setLocalUpdatedAt(mergedTs);
          if (effectiveCloudTime) {
            userStorage.setItem(
              STORAGE_BASE_LAST_CLOUD_MODIFIED_AT,
              effectiveCloudTime,
              targetUid
            );
          }
          persistPendingSyncFlag(targetUid, true);
          if (autoBackupRef.current && currentUser && getStoredOAuthToken(currentUser.uid)) {
            if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
            debounceTimerRef.current = setTimeout(() => {
              if (authUidRef.current === currentUser.uid) {
                executeBackup(true, true);
              }
            }, 1000);
          }
        }

        if (onDataRestored) {
          onDataRestored();
        }
        window.dispatchEvent(new CustomEvent("homebudget:data-restored"));

        return {
          success: true,
          message: res.message || t("syncErrors.restoreSuccess"),
        };
      } catch (err: any) {
        return {
          success: false,
          message:
            err?.message || t("syncErrors.restoreError"),
        };
      }
    },
    [onDataRestored, cloudBackupInfo, clearPendingAutoSync, executeBackup, persistPendingSyncFlag]
  );

  // Explicit conflict resolution: keep local data and push to Drive
  const resolveConflictUseLocal = useCallback(async () => {
    const uid = authUidRef.current;
    if (!userStorage.getLocalUpdatedAt(uid)) {
      const ts = userStorage.markLocalModified(uid);
      setLocalUpdatedAt(ts);
    }
    setSyncConflict(null);
    setPendingRestoreOffer(null);
    return executeBackup(false, true);
  }, [executeBackup]);

  // Explicit conflict resolution: merge or replace from Cloud backup
  const resolveConflictRestoreCloud = useCallback(
    (mode: "merge" | "replace") => {
      if (!syncConflict?.cloudBackup) {
        return {
          success: false,
          message: t("syncErrors.cloudNotLoaded"),
        };
      }
      return restoreCloudBackup(
        syncConflict.cloudBackup,
        mode,
        syncConflict.fileInfo.modifiedTime
      );
    },
    [syncConflict, restoreCloudBackup]
  );

  const dismissSyncConflict = useCallback(() => {
    const uid = authUidRef.current;
    if (syncConflict?.reason === "fresh_device" && uid && uid !== "guest") {
      userStorage.setItem(STORAGE_BASE_DISMISSED_RESTORE_PROMPT, "true", uid);
    }
    setSyncConflict(null);
    setPendingRestoreOffer(null);
  }, [syncConflict]);

  const performGoogleSignInFlow = useCallback(
    async (mode: "login" | "switch" | "reconnect") => {
      const activeUser = userRef.current;
      // Preserve pending local edits when reconnecting the SAME account!
      if (mode === "switch") {
        clearPendingAutoSync();
        clearRefreshTimer();
      }
      setIsSwitchingAccount(mode === "switch");
      setAuthError(null);
      setLastSyncError(null);

      try {
        const res = await signInWithGoogle({
          mode,
          expectedUid: mode === "reconnect" ? activeUser?.uid : undefined,
          loginHint: mode === "reconnect" ? activeUser?.email : undefined,
        });
        const nextUid = res.user.uid;
        const accountChanged = authUidRef.current !== nextUid;

        if (accountChanged) {
          clearPendingAutoSync();
          clearRefreshTimer();
          setCloudBackupInfo(null);
          setPendingRestoreOffer(null);
          setSyncConflict(null);
          checkedRestoreOfferForUidRef.current = null;
        }

        authUidRef.current = nextUid;
        userRef.current = res.user;
        userStorage.setActiveUid(nextUid);
        userStorage.setItem(STORAGE_BASE_DRIVE_CONNECTED, "true", nextUid);
        setActiveUid(nextUid);
        setUser(res.user);
        setHasDriveAccessToken(true);
        setDriveSessionStatus("connected");
        readUserSyncPreferences(nextUid);

        await evaluateDriveSyncState(res.user, res.accessToken);
      } catch (err: any) {
        console.error(`Google ${mode} failed:`, err);
        setAuthError(err);
        throw err;
      } finally {
        setIsSwitchingAccount(false);
      }
    },
    [
      clearPendingAutoSync,
      clearRefreshTimer,
      readUserSyncPreferences,
      evaluateDriveSyncState,
    ]
  );

  const loginWithGoogle = useCallback(async () => {
    return performGoogleSignInFlow("login");
  }, [performGoogleSignInFlow]);

  const switchGoogleAccount = useCallback(async () => {
    return performGoogleSignInFlow("switch");
  }, [performGoogleSignInFlow]);

  const reconnectGoogleDrive = useCallback(async () => {
    return performGoogleSignInFlow("reconnect");
  }, [performGoogleSignInFlow]);

  const logoutGoogle = useCallback(async () => {
    clearPendingAutoSync();
    clearRefreshTimer();
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
      setDriveSessionStatus("disconnected");
      setIsRestoringDriveSession(false);
      setCloudBackupInfo(null);
      setPendingRestoreOffer(null);
      setSyncConflict(null);
      setSyncStatus("idle");
      setLastSyncError(null);
      setAuthError(null);
      readUserSyncPreferences("guest");
    } finally {
      setIsSwitchingAccount(false);
    }
  }, [clearPendingAutoSync, clearRefreshTimer, readUserSyncPreferences]);

  const dismissRestoreOffer = useCallback(() => {
    const uid = authUidRef.current;
    if (uid && uid !== "guest") {
      userStorage.setItem(STORAGE_BASE_DISMISSED_RESTORE_PROMPT, "true", uid);
    }
    setPendingRestoreOffer(null);
    setSyncConflict((prev) =>
      prev?.reason === "fresh_device" ? null : prev
    );
  }, []);

  const clearAccountLocalData = useCallback(() => {
    clearPendingAutoSync();
    const uid = authUidRef.current;
    userStorage.clear(uid);
    checkedRestoreOfferForUidRef.current = null;
    setLastSyncTime(null);
    setLocalUpdatedAt(null);
    setPendingRestoreOffer(null);
    setSyncConflict(null);
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
        if (token) setDriveSessionStatus("connected");
      } catch (authErr: any) {
        return {
          success: false,
          message:
            formatFirebaseAuthError(authErr) ||
            t("syncErrors.signInPrompt"),
        };
      }
    }

    if (!token || !activeUser) {
      return {
        success: false,
        message: t("syncErrors.signInPrompt"),
      };
    }

    const expectedUid = activeUser.uid;

    try {
      setSyncStatus("syncing");
      const existing = await findDriveBackup(token);
      if (authUidRef.current !== expectedUid) {
        return {
          success: false,
          message: t("syncErrors.accountSwitchedMidOp"),
        };
      }

      if (!existing || !existing.id) {
        setCloudBackupInfo(null);
        setSyncStatus("idle");
        return {
          success: false,
          message: t("syncErrors.backupNotFoundDrive"),
        };
      }

      await deleteDriveBackup(token, existing.id);
      if (authUidRef.current === expectedUid) {
        userStorage.removeItem(STORAGE_BASE_LAST_CLOUD_MODIFIED_AT, expectedUid);
        userStorage.removeItem(STORAGE_BASE_CLOUD_FILE_INFO, expectedUid);
        setCloudBackupInfo(null);
        setPendingRestoreOffer(null);
        setSyncConflict(null);
        setSyncStatus("idle");
        setLastSyncError(null);
        await refreshDriveMetadataOnly(activeUser, token);
      }

      return {
        success: true,
        message: t("syncErrors.cloudDeletedSuccess"),
      };
    } catch (err: any) {
      console.error("Delete cloud backup failed:", err);
      const errMsg =
        err?.message || t("syncErrors.deleteCloudError");
      if (errMsg.includes("Сесията с Google изтече") || errMsg.includes("401")) {
        clearStoredOAuthToken();
        setHasDriveAccessToken(false);
        setDriveSessionStatus("needs_reauth");
      }
      setSyncStatus("failed");
      setLastSyncError(errMsg);
      return {
        success: false,
        message: errMsg,
      };
    }
  }, [refreshDriveMetadataOnly]);

  const disconnectGoogleDrive = useCallback(async () => {
    clearPendingAutoSync();
    clearRefreshTimer();
    const uid = authUidRef.current;
    setIsSwitchingAccount(true);
    try {
      setAutoBackupEnabled(false);
      if (uid && uid !== "guest") {
        userStorage.setItem(STORAGE_BASE_DRIVE_CONNECTED, "false", uid);
      }
      await signOutGoogle();
      authUidRef.current = "guest";
      userRef.current = null;
      checkedRestoreOfferForUidRef.current = null;

      userStorage.setActiveUid(null);
      setActiveUid("guest");
      setUser(null);
      setHasDriveAccessToken(false);
      setDriveSessionStatus("disconnected");
      setIsRestoringDriveSession(false);
      setCloudBackupInfo(null);
      setPendingRestoreOffer(null);
      setSyncConflict(null);
      setSyncStatus("idle");
      setLastSyncError(null);
      setAuthError(null);
      readUserSyncPreferences("guest");
    } catch (e) {
      console.warn("Error disconnecting Google Drive:", e);
    } finally {
      setIsSwitchingAccount(false);
    }
  }, [
    clearPendingAutoSync,
    clearRefreshTimer,
    readUserSyncPreferences,
    setAutoBackupEnabled,
  ]);

  const isAuthenticated = Boolean(user);
  const storedProfile = user ? toUserProfile(user) : null;
  const cloudUpdatedAt =
    cloudBackupInfo?.modifiedTime ||
    (activeUid && activeUid !== "guest"
      ? userStorage.getItem(STORAGE_BASE_LAST_CLOUD_MODIFIED_AT, activeUid)
      : null) ||
    null;
  const hasUnsyncedChanges =
    Boolean(user) &&
    (driveSessionStatus === "needs_reauth" ||
      computeHasUnsyncedLocalChanges(activeUid));

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
        driveSessionStatus,
        hasUnsyncedChanges,
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
        pendingRestoreOffer,
        syncConflict,
        dismissRestoreOffer,
        dismissSyncConflict,
        resolveConflictUseLocal,
        resolveConflictRestoreCloud,
        refreshLocalUpdatedAt,
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
