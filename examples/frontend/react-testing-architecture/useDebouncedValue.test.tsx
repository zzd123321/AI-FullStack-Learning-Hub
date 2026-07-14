import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useDebouncedValue } from './useDebouncedValue'

describe('useDebouncedValue', () => {
  afterEach(() => vi.useRealTimers())

  it('只在最后一次等待结束后发布新值', () => {
    vi.useFakeTimers()
    const { result, rerender } = renderHook(
      ({ value }) => useDebouncedValue(value, 300),
      { initialProps: { value: 'react' } },
    )

    rerender({ value: 'react 19' })
    act(() => vi.advanceTimersByTime(299))
    expect(result.current).toBe('react')

    rerender({ value: 'react testing' })
    act(() => vi.advanceTimersByTime(300))
    expect(result.current).toBe('react testing')
  })
})
