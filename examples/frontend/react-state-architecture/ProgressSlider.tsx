import { useLessonProgress, useSetLessonProgress } from './ProgressContext'

interface ProgressSliderProps {
  lessonId: string
}

export function ProgressSlider({ lessonId }: ProgressSliderProps) {
  const progress = useLessonProgress(lessonId)
  const setProgress = useSetLessonProgress()

  return (
    <label>
      学习进度：{progress}%
      <input
        type="range"
        min="0"
        max="100"
        value={progress}
        onChange={(event) => setProgress(lessonId, Number(event.currentTarget.value))}
      />
    </label>
  )
}
