// The only module screens import for data. Everything behind it (Dexie today,
// a cloud sync backend later) can change without touching components.

export * from './projects'
export * from './subtasks'
export * from './ideas'
export * from './queries'
export * from './hooks'
export {
  answerGuestCopyOffer,
  copyGuestData,
  countGuestData,
  guestCopyOffer,
  type GuestCounts,
} from './guest'
export {
  getAccount,
  signInWithGoogle,
  signOut,
  startAccount,
  syncNow,
  startupSignInError,
  useAccount,
  type Account,
  type SignOutResult,
} from './account'
export { countPendingChanges, useSyncStatus, type SyncStatus } from './sync'
export {
  backupFileName,
  BackupError,
  clearAllData,
  exportBackupText,
  importBackupText,
} from './backup'
