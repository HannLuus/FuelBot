/**
 * Calendar month addition in UTC, aligned with PostgreSQL
 * `timestamptz + make_interval(months => m)` (day clamps to last valid day of the target month).
 *
 * Do not use `Date#setUTCMonth` for this: e.g. Jan 31 + 1 month overflows to March in JS,
 * while Postgres yields February’s last day.
 */
export function addCalendarMonthsUtc(date: Date, months: number): Date {
  const mWhole = Math.trunc(months)
  const y = date.getUTCFullYear()
  const mo = date.getUTCMonth()
  const d = date.getUTCDate()
  const totalMonths = mo + mWhole
  const newYear = y + Math.floor(totalMonths / 12)
  const newMonth = ((totalMonths % 12) + 12) % 12
  const lastDayOfTargetMonth = new Date(Date.UTC(newYear, newMonth + 1, 0)).getUTCDate()
  const newDay = Math.min(d, lastDayOfTargetMonth)
  return new Date(
    Date.UTC(
      newYear,
      newMonth,
      newDay,
      date.getUTCHours(),
      date.getUTCMinutes(),
      date.getUTCSeconds(),
      date.getUTCMilliseconds(),
    ),
  )
}
