import type { ChangeEvent } from 'react'
import type { LessonFilters } from './types'

interface SearchControlsProps {
  filters: LessonFilters
  onChange: (filters: LessonFilters) => void
}

export function SearchControls({ filters, onChange }: SearchControlsProps) {
  function updateKeyword(event: ChangeEvent<HTMLInputElement>): void {
    onChange({ ...filters, keyword: event.currentTarget.value })
  }

  function updatePublishedOnly(event: ChangeEvent<HTMLInputElement>): void {
    onChange({ ...filters, publishedOnly: event.currentTarget.checked })
  }

  return (
    <fieldset>
      <legend>筛选课程</legend>
      <label>
        关键词
        <input value={filters.keyword} onChange={updateKeyword} type="search" />
      </label>
      <label>
        <input
          checked={filters.publishedOnly}
          onChange={updatePublishedOnly}
          type="checkbox"
        />
        只看已发布
      </label>
    </fieldset>
  )
}
