// The only module screens import for data. Everything behind it (Dexie today,
// a cloud sync backend later) can change without touching components.

export * from './projects'
export * from './subtasks'
export * from './queries'
export * from './hooks'
export { copyGuestProjects, countGuestProjects } from './guest'
export {
  backupFileName,
  BackupError,
  clearAllData,
  exportBackupText,
  importBackupText,
} from './backup'
