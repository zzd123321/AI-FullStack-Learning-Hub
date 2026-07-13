// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import {
  useDebouncedLessonSearch,
  type LessonSearchService
} from './useDebouncedLessonSearch'
import { withSetup } from './withSetup'

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('useDebouncedLessonSearch', () => {
  it('debounces input and exposes resolved results', async () => {
    vi.useFakeTimers()
    const service: LessonSearchService = {
      search: vi.fn().mockResolvedValue([{ id: 'vue-3', title: 'Vue 3' }])
    }
    const [search, app] = withSetup(() =>
      useDebouncedLessonSearch(service, 300)
    )

    search.query.value = 'v'
    await nextTick()
    await vi.advanceTimersByTimeAsync(300)
    expect(service.search).not.toHaveBeenCalled()

    search.query.value = 'vue'
    await nextTick()
    await vi.advanceTimersByTimeAsync(299)
    expect(service.search).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(1)
    expect(service.search).toHaveBeenCalledOnce()
    expect(search.results.value).toEqual([{ id: 'vue-3', title: 'Vue 3' }])

    app.unmount()
  })

  it('aborts an active request when a new query arrives', async () => {
    vi.useFakeTimers()
    const signals: AbortSignal[] = []
    const service: LessonSearchService = {
      search: vi.fn((_query, signal) => {
        if (signal) signals.push(signal)
        return new Promise(() => undefined)
      })
    }
    const [search, app] = withSetup(() =>
      useDebouncedLessonSearch(service, 100)
    )

    search.query.value = 'vue'
    await nextTick()
    await vi.advanceTimersByTimeAsync(100)
    expect(signals[0]?.aborted).toBe(false)

    search.query.value = 'react'
    await nextTick()
    await vi.advanceTimersByTimeAsync(0)
    expect(signals[0]?.aborted).toBe(true)

    app.unmount()
  })
})
