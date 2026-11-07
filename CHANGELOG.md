# Changelog

All notable changes to the Home Budget application are documented in this file.

## [1.2.0] - Google Authentication & Google Drive Cloud Backup (appDataFolder)

### Architecture & Storage Strategy
- **Primary Storage**: Maintained `localStorage` as the authoritative primary offline storage. All offline functionality remains 100% operational with zero disruption.
- **Cloud Backup**: Integrated Google Drive REST API v3 using the dedicated and secure `appDataFolder` (`spaces=appDataFolder`). No visible clutter is created in the user's personal Google Drive file listing.
- **Backup File**: `budgetflows-backup.json` containing complete normalized application state:
  - Incomes & Transactions
  - Expenses (Fixed & Variable across all months)
  - Savings deposits and withdrawals
  - Electricity calculation history and meter readings
  - Category customizations and icons
  - Monthly budgets and limits
  - Application settings and preferences

### Google Authentication
- **OAuth Login**: Official Google sign-in workflow powered by Firebase Auth SDK with `https://www.googleapis.com/auth/drive.appdata` scope.
- **Security & Privacy**: Access token is held strictly in-memory (never persisted in plain storage), conforming to security best practices.
- **User Profile**: Persistent local profile caching (`localStorage.getItem('HomeBudget_GoogleUser')`) storing avatar photo, email, display name, and last connection timestamp.
- **Sign Out**: Clean sign-out flow that invalidates in-memory session tokens and resets UI states.

### Automatic Synchronization & Offline Mode
- **Auto Backup Setting**: Toggle switch (ON/OFF) allowing users to enable or disable continuous background sync.
- **Debounced Updates**: 3.5-second debounce on data modifications to batch updates and prevent excessive API calls.
- **Offline Resiliency**: Listens for browser `online` and `offline` events. When offline, changes are safely kept locally; when internet connectivity is restored, pending changes automatically synchronize to Google Drive.
- **Sync Status Indicators**:
  - `✅ Synced` (Синхронизирано)
  - `⏳ Syncing` (Синхронизиране...)
  - `❌ Sync Failed` (Грешка при синхронизация)
  - `🌐 Offline` (Офлайн режим)
  - Timestamp of the last successful synchronization.

### Manual Actions & Safe Restore Flow
- **Backup Now**: Instant on-demand sync of current application state to Google Drive.
- **Restore From Drive**:
  - Automatically queries Google Drive `appDataFolder` for `budgetflows-backup.json`.
  - Displays backup metadata: Last modified date, formatted file size, and schema version.
  - Generates comparison breakdown of records (Local vs Cloud).
  - Offers **Merge Data** (preserves existing records and adds missing elements) and **Replace Local Data** (complete overwrite).
  - **Emergency Safeguard**: Creates an automatic snapshot in `localStorage` (`HomeBudget_PreRestore_Backup_<timestamp>`) before any restore operation.
  - **Confirmation Shield**: Requires explicit confirmation checkbox for full replacement to eliminate accidental data loss.
- **Download / Upload Local Backup**: Preserved complete offline JSON download and file upload.

### User Interface
- **Cloud Backup Section**: Dedicated high-contrast card in the Backup & Restore screen with Google profile details, connection state, auto-sync toggle, and action triggers.
- **Header Profile Chip**: Sleek, compact profile indicator in the top navigation bar showing avatar, name, and live sync status dot (green, pulsing blue, or red).
- **Responsive Layout**: Zero horizontal scrolling across mobile, tablet, and desktop viewports.
