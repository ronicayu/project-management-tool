import {
  addDays,
  parseISO,
  differenceInDays,
  startOfDay,
  startOfWeek,
  endOfWeek,
  eachWeekOfInterval,
  eachMonthOfInterval,
  eachQuarterOfInterval,
  format,
} from 'date-fns'
import type { Task, TimeUnit, DurationUnit } from '../types'

const DAYS_PER_DURATION_UNIT: Record<DurationUnit, number> = {
  day: 1,
  week: 7,
  month: 30,
}

export function durationToDays(amount: number, unit: DurationUnit): number {
  return Math.max(1, Math.round(amount * DAYS_PER_DURATION_UNIT[unit]))
}

export function getEndDate(startDate: string, durationDays: number): string {
  return addDays(parseISO(startDate), durationDays).toISOString().slice(0, 10)
}

/** Effective start and duration for display: parents span from earliest child start to latest child end. */
export function getEffectiveTaskBounds(
  tasks: Task[],
  taskId: string
): { startDate: string | null; duration: number } {
  const task = tasks.find((t) => t.id === taskId)
  if (!task) return { startDate: null, duration: 0 }
  const children = tasks.filter((t) => t.parentId === taskId)
  if (children.length === 0) {
    return { startDate: task.startDate, duration: task.duration }
  }
  let minStart: string | null = null
  let maxEndExclusive: Date | null = null
  for (const c of children) {
    const b = getEffectiveTaskBounds(tasks, c.id)
    if (b.startDate) {
      const start = parseISO(b.startDate)
      const endExclusive = addDays(start, b.duration)
      if (!minStart || b.startDate < minStart) minStart = b.startDate
      if (!maxEndExclusive || endExclusive > maxEndExclusive) maxEndExclusive = endExclusive
    }
  }
  if (!minStart || !maxEndExclusive) return { startDate: task.startDate, duration: task.duration }
  const duration = Math.max(1, differenceInDays(maxEndExclusive, parseISO(minStart)))
  return { startDate: minStart, duration }
}

export function getProjectBounds(
  tasks: { startDate: string | null; duration: number }[]
): { min: Date; max: Date } {
  const today = startOfDay(new Date())
  const withDate = tasks.filter((t): t is { startDate: string; duration: number } => t.startDate != null && t.startDate !== '')
  if (withDate.length === 0) {
    return { min: today, max: addDays(today, 30) }
  }
  let min = parseISO(withDate[0].startDate)
  let max = addDays(parseISO(withDate[0].startDate), withDate[0].duration)
  withDate.forEach((t) => {
    const start = parseISO(t.startDate)
    const end = addDays(start, t.duration)
    if (start < min) min = start
    if (end > max) max = end
  })
  min = startOfDay(min)
  max = startOfDay(max)
  if (today < min) min = today
  if (today > max) max = today
  const minSpanDays = 30
  if (differenceInDays(max, min) < minSpanDays) max = addDays(min, minSpanDays)
  return { min, max }
}

export function dateToPercent(date: Date, min: Date, max: Date): number {
  const total = differenceInDays(max, min) || 1
  const elapsed = differenceInDays(date, min)
  return Math.max(0, Math.min(100, (elapsed / total) * 100))
}

export function durationToPercent(days: number, min: Date, max: Date): number {
  const total = differenceInDays(max, min) || 1
  return Math.min(100, (days / total) * 100)
}

const DAYS_PER_UNIT: Record<TimeUnit, number> = {
  day: 1,
  week: 7,
  month: 30,
  quarter: 91,
}

export function getDaysPerUnit(unit: TimeUnit): number {
  return DAYS_PER_UNIT[unit]
}

export function getTotalUnits(min: Date, max: Date, unit: TimeUnit): number {
  const days = Math.max(0, differenceInDays(max, min))
  return days / getDaysPerUnit(unit)
}

/** Position of a date in units from min (0-based, can be fractional). */
export function dateToUnitOffset(date: Date, min: Date, unit: TimeUnit): number {
  const days = differenceInDays(date, min)
  return Math.max(0, days / getDaysPerUnit(unit))
}

/** Duration in units (e.g. 14 days = 2 weeks). */
export function durationInUnits(days: number, unit: TimeUnit): number {
  return days / getDaysPerUnit(unit)
}

export interface AxisTick {
  date: Date
  label: string
  offsetUnits: number
}

export function getAxisTicks(min: Date, max: Date, unit: TimeUnit): AxisTick[] {
  const totalDays = Math.max(1, differenceInDays(max, min))
  const daysPer = getDaysPerUnit(unit)

  if (unit === 'day') {
    const ticks: AxisTick[] = []
    let d = startOfWeek(min, { weekStartsOn: 1 })
    const end = endOfWeek(max, { weekStartsOn: 1 })
    while (d <= end) {
      ticks.push({
        date: d,
        label: format(d, 'MMM d'),
        offsetUnits: Math.max(0, differenceInDays(d, min) / daysPer),
      })
      d = addDays(d, 7)
    }
    return ticks
  }

  if (unit === 'week') {
    const weeks = eachWeekOfInterval({ start: min, end: max }, { weekStartsOn: 1 })
    return weeks.map((d) => ({
      date: d,
      label: format(d, 'MMM d'),
      offsetUnits: differenceInDays(d, min) / daysPer,
    }))
  }

  if (unit === 'month') {
    const months = eachMonthOfInterval({ start: min, end: max })
    return months.map((d) => ({
      date: d,
      label: format(d, 'MMM yyyy'),
      offsetUnits: differenceInDays(d, min) / daysPer,
    }))
  }

  if (unit === 'quarter') {
    const quarters = eachQuarterOfInterval({ start: min, end: max })
    return quarters.map((d) => ({
      date: d,
      label: `Q${Math.ceil((d.getMonth() + 1) / 3)} ${format(d, 'yyyy')}`,
      offsetUnits: differenceInDays(d, min) / daysPer,
    }))
  }

  return []
}
