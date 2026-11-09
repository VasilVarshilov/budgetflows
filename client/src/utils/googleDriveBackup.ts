import { BackupData } from "@/types";

export const DRIVE_BACKUP_FILENAME = "budgetflows-backup.json";

export interface DriveFileInfo {
  id: string;
  name: string;
  size?: string;
  sizeBytes?: number;
  modifiedTime?: string;
  createdTime?: string;
}

export interface DriveBackupResult {
  success: boolean;
  fileId?: string;
  modifiedTime?: string;
  sizeBytes?: number;
  message?: string;
}

/**
 * Searches for the backup file in the user's appDataFolder
 */
export async function findDriveBackup(
  accessToken: string
): Promise<DriveFileInfo | null> {
  const query = encodeURIComponent(
    `name = '${DRIVE_BACKUP_FILENAME}' and trashed = false`
  );
  const url = `https://www.googleapis.com/drive/v3/files?spaces=appDataFolder&q=${query}&fields=files(id,name,size,modifiedTime,createdTime)&pageSize=1`;

  const response = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    if (response.status === 401) {
      throw new Error("Сесията с Google изтече. Моля, влезте отново.");
    }
    const errText = await response.text();
    throw new Error(`Грешка при търсене в Google Drive: ${errText}`);
  }

  const result = await response.json();
  const files: any[] = result.files || [];

  if (files.length === 0) {
    return null;
  }

  const f = files[0];
  const sizeNum = f.size ? parseInt(f.size, 10) : undefined;

  return {
    id: f.id,
    name: f.name,
    size: formatDriveFileSize(sizeNum),
    sizeBytes: sizeNum,
    modifiedTime: f.modifiedTime,
    createdTime: f.createdTime,
  };
}

/**
 * Uploads (creates or updates) the backup file inside appDataFolder
 */
export async function uploadDriveBackup(
  accessToken: string,
  backupData: BackupData
): Promise<DriveBackupResult> {
  const jsonContent = JSON.stringify(backupData, null, 2);
  const sizeBytes = new Blob([jsonContent]).size;

  // 1. Check if an existing backup file already exists in appDataFolder
  const existingFile = await findDriveBackup(accessToken);

  if (existingFile && existingFile.id) {
    // 2. Update existing file content directly using media upload
    const updateUrl = `https://www.googleapis.com/upload/drive/v3/files/${existingFile.id}?uploadType=media`;

    const response = await fetch(updateUrl, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json; charset=UTF-8",
      },
      body: jsonContent,
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Неуспешно обновяване на архива в Google Drive: ${errText}`);
    }

    const updated = await response.json();
    return {
      success: true,
      fileId: updated.id || existingFile.id,
      modifiedTime: new Date().toISOString(),
      sizeBytes,
      message: "Архивът в Google Drive беше обновен успешно.",
    };
  }

  // 3. Create a new file in appDataFolder using multipart upload
  const boundary = "-------314159265358979323846";
  const delimiter = `\r\n--${boundary}\r\n`;
  const closeDelimiter = `\r\n--${boundary}--`;

  const metadata = {
    name: DRIVE_BACKUP_FILENAME,
    parents: ["appDataFolder"],
    mimeType: "application/json",
    description: "Budget Flow App Cloud Backup (appDataFolder)",
  };

  const multipartRequestBody =
    delimiter +
    "Content-Type: application/json; charset=UTF-8\r\n\r\n" +
    JSON.stringify(metadata) +
    delimiter +
    "Content-Type: application/json; charset=UTF-8\r\n\r\n" +
    jsonContent +
    closeDelimiter;

  const uploadUrl =
    "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart";

  const response = await fetch(uploadUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": `multipart/related; boundary=${boundary}`,
    },
    body: multipartRequestBody,
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Неуспешно качване на архив в Google Drive: ${errText}`);
  }

  const created = await response.json();

  return {
    success: true,
    fileId: created.id,
    modifiedTime: new Date().toISOString(),
    sizeBytes,
    message: "Новият архив бе успешно записан в Google Drive (appDataFolder).",
  };
}

/**
 * Downloads the backup JSON content from Google Drive
 */
export async function downloadDriveBackup(
  accessToken: string,
  fileId: string
): Promise<string> {
  const downloadUrl = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`;

  const response = await fetch(downloadUrl, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    if (response.status === 401) {
      throw new Error("Сесията с Google изтече (401). Моля, влезте отново.");
    }
    const errText = await response.text();
    throw new Error(`Грешка при изтегляне на архив от Google Drive: ${errText}`);
  }

  return await response.text();
}

/**
 * Permanently deletes the backup file from Google Drive (appDataFolder)
 */
export async function deleteDriveBackup(
  accessToken: string,
  fileId: string
): Promise<boolean> {
  const deleteUrl = `https://www.googleapis.com/drive/v3/files/${fileId}`;

  const response = await fetch(deleteUrl, {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    if (response.status === 401) {
      throw new Error("Сесията с Google изтече (401). Моля, влезте отново.");
    }
    if (response.status === 404) {
      // File was already deleted or not found
      return true;
    }
    const errText = await response.text();
    throw new Error(`Грешка при изтриване на архива от Google Drive: ${errText}`);
  }

  return true;
}

/**
 * Formats byte size to human readable KB/MB
 */
export function formatDriveFileSize(bytes?: number): string {
  if (!bytes || bytes === 0) return "0 KB";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}
