import { createTypedEmitter } from './typed-emitter'
import type { MigrationEvents } from './contracts'

export const migrationEvents = createTypedEmitter<MigrationEvents>()

export interface RolloutFlags {
  vue3LessonSearch: boolean
  piniaLessonState: boolean
}

export const rolloutFlags: Readonly<RolloutFlags> = Object.freeze({
  vue3LessonSearch: true,
  piniaLessonState: false
})
