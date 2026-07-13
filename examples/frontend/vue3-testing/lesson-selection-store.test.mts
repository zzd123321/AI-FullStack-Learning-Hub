import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useLessonSelectionStore } from './lesson-selection-store'

describe('lesson selection store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('toggles a lesson exactly once', () => {
    const store = useLessonSelectionStore()

    store.toggle('vue-testing')
    expect(store.selectedIds).toEqual(['vue-testing'])
    expect(store.selectedCount).toBe(1)

    store.toggle('vue-testing')
    expect(store.selectedIds).toEqual([])
    expect(store.selectedCount).toBe(0)
  })

  it('starts from isolated state in every test', () => {
    const store = useLessonSelectionStore()
    expect(store.selectedIds).toEqual([])
  })
})
