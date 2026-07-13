export type MigrationArea =
  | 'runtime'
  | 'template'
  | 'router'
  | 'store'
  | 'component'
  | 'dependency'

export type MigrationStatus = 'blocked' | 'compat' | 'native-vue3' | 'verified'

export interface MigrationItem {
  id: string
  area: MigrationArea
  owner: string
  status: MigrationStatus
  rollbackFlag?: string
  evidence?: string
}

export interface MigrationSummary {
  total: number
  blocked: number
  remainingCompat: number
  verified: number
  readyToRemoveCompat: boolean
}

export function summarizeMigration(items: readonly MigrationItem[]): MigrationSummary {
  const blocked = items.filter((item) => item.status === 'blocked').length
  const remainingCompat = items.filter((item) => item.status === 'compat').length
  const verified = items.filter((item) => item.status === 'verified').length

  return {
    total: items.length,
    blocked,
    remainingCompat,
    verified,
    readyToRemoveCompat: items.length > 0 && blocked === 0 && remainingCompat === 0
  }
}

export function assertAssignedOwners(items: readonly MigrationItem[]): void {
  for (const item of items) {
    if (item.owner.trim() === '') throw new Error(`${item.id} 缺少负责人`)
  }
}
