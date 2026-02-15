export interface Project {
  id: string
  name: string
  createdAt: string
}

export interface Task {
  id: string
  title: string
  startDate: string | null // ISO date, null when not yet set
  duration: number // days
  parentId: string | null // null = top-level task
  dependencyIds: string[] // task ids that must complete before this starts
  details: string // description / notes
  createdAt: string
}

export type ViewMode = 'list' | 'timeline' | 'gantt' | 'dependencies'

export type TimeUnit = 'day' | 'week' | 'month' | 'quarter'

/** Duration unit for task creation (stored as days in DB). */
export type DurationUnit = 'day' | 'week' | 'month'
