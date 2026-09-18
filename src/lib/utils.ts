import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { format, parseISO, isValid } from 'date-fns'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function uid(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`
}

// ---------- Indian conventions ----------

export function inr(amount: number | undefined | null): string {
  const n = amount ?? 0
  return `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`
}

export function fmtDate(d: string | number | Date | undefined | null): string {
  if (d === undefined || d === null || d === '') return '-'
  let date: Date
  if (typeof d === 'string') {
    date = /^\d{4}-\d{2}-\d{2}$/.test(d) ? parseISO(d) : new Date(d)
  } else if (typeof d === 'number') {
    date = new Date(d)
  } else {
    date = d
  }
  if (!isValid(date)) return '-'
  return format(date, 'dd MMM yyyy')
}

export function fmtDateTime(d: number | Date | undefined): string {
  if (!d) return '-'
  const date = typeof d === 'number' ? new Date(d) : d
  if (!isValid(date)) return '-'
  return format(date, 'dd MMM yyyy, hh:mm a')
}

export function todayStr(): string {
  return format(new Date(), 'yyyy-MM-dd')
}

export function periodKeyOf(d: Date = new Date()): string {
  return format(d, 'yyyy-MM')
}

export function monthLabel(periodKey: string): string {
  const [y, m] = periodKey.split('-').map(Number)
  if (!y || !m) return periodKey
  const date = new Date(y, m - 1, 1)
  return format(date, 'MMM yyyy')
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('')
}

export function pct(part: number, total: number): number {
  if (!total) return 0
  return Math.round((part / total) * 1000) / 10
}

export function downloadCsv(filename: string, rows: (string | number | null | undefined)[][]) {
  const esc = (v: string | number | null | undefined) => {
    const s = v === null || v === undefined ? '' : String(v)
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const csv = rows.map((r) => r.map(esc).join(',')).join('\n')
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export function nextAdmissionNo(existing: number): string {
  const year = new Date().getFullYear()
  return `ADM${year}${String(existing + 1).padStart(4, '0')}`
}

export function gradeFor(pctValue: number, bands: { grade: string; min: number; max: number }[]): string {
  const band = bands.find((b) => pctValue >= b.min && pctValue <= b.max)
  return band?.grade ?? '-'
}

export const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const

export function sortByOrder<T extends { order?: number; name?: string; createdAt?: number }>(items: T[]): T[] {
  return [...items].sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || (a.name ?? '').localeCompare(b.name ?? ''))
}
