import type { SyncStatus } from '../data'

// The sync status in words, for the account menu.
export function describeSync(status: SyncStatus, now = Date.now()): string {
  switch (status.state) {
    case 'off':
      return 'Sync is off'
    case 'syncing':
      return 'Syncing…'
    case 'offline':
      return "Offline. Changes will sync when you're back online."
    case 'error':
      return "Can't reach the sync server. Changes are kept on this device."
    case 'synced': {
      const minutes = Math.floor((now - Date.parse(status.at)) / 60_000)
      if (minutes < 1) return 'Synced just now'
      if (minutes < 60) return `Synced ${minutes} min ago`
      const hours = Math.floor(minutes / 60)
      return `Synced ${hours} ${hours === 1 ? 'hour' : 'hours'} ago`
    }
  }
}
