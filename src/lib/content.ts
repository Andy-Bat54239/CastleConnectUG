import type { CourseConfig, CourseIndexEntry, DayContent } from '../types'
import config from '../../content/config.json'
import index from '../../content/index.json'

export const course: CourseConfig = config as CourseConfig
export const curriculum: CourseIndexEntry[] = index as CourseIndexEntry[]
export const TOTAL_DAYS = curriculum.length

// Each day is its own file and its own chunk: opening Day 3 downloads Day 3 only.
const loaders = import.meta.glob('../../content/day-*.json', { import: 'default' }) as Record<string, () => Promise<DayContent>>

const keyFor = (n: number) => `../../content/day-${String(n).padStart(2, '0')}.json`

/** True when the lesson for this day has been written and shipped. */
export function hasDay(n: number): boolean {
  return keyFor(n) in loaders
}

export async function loadDay(n: number): Promise<DayContent | null> {
  const load = loaders[keyFor(n)]
  return load ? load() : null
}
