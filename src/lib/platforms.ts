import type { Platform } from '../types'

export const PLATFORMS: readonly Platform[] = ['youtube', 'instagram']

export const PLATFORM_LABELS: Record<Platform, string> = {
  youtube: 'YouTube',
  instagram: 'Instagram',
}
