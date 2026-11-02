/**
 * Helpers for `@db.Date` columns.
 *
 * PostgreSQL `DATE` has no time or zone, but Prisma round-trips it through a JS
 * `Date`. Anchoring everything at UTC midnight keeps "2026-03-14" from drifting
 * to the 13th for anyone west of Greenwich.
 */

/** Parse `YYYY-MM-DD` (or anything Date accepts) to UTC midnight. */
export function toDateOnly(value: string | Date): Date {
  const date = value instanceof Date ? value : new Date(value);
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

/** Format a Date as `YYYY-MM-DD` in UTC. */
export function formatDateOnly(value: Date): string {
  return value.toISOString().slice(0, 10);
}

export function todayDateOnly(): Date {
  return toDateOnly(new Date());
}

// ---------------------------------------------------------------------------
// Business days (Asia/Kolkata)
// ---------------------------------------------------------------------------

/**
 * The company operates in India, so an attendance "day" is the Asia/Kolkata
 * calendar day — not the UTC one.
 *
 * This matters: IST is UTC+05:30, so between 00:00 and 05:30 IST the UTC date is
 * still *yesterday*. Keying attendance off the UTC date would file a 01:00 IST
 * check-in against the previous business day, and then happily accept a second
 * check-in at 09:00 for "today". Everything that decides which row a punch
 * belongs to must go through here.
 *
 * India has no daylight saving, so a fixed offset is exact rather than an
 * approximation.
 */
export const IST_OFFSET_MINUTES = 330;

/** The Asia/Kolkata calendar day for an instant, as a UTC-midnight DATE. */
export function businessDayFor(instant: Date = new Date()): Date {
  const shifted = new Date(instant.getTime() + IST_OFFSET_MINUTES * 60_000);
  return new Date(
    Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate()),
  );
}

/** Today's business day in Asia/Kolkata. */
export function currentBusinessDay(): Date {
  return businessDayFor(new Date());
}

/** `YYYY-MM-DD` for the Asia/Kolkata calendar day of an instant. */
export function formatBusinessDay(instant: Date = new Date()): string {
  return formatDateOnly(businessDayFor(instant));
}

export function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

/** Inclusive list of dates between two bounds. */
export function eachDayInclusive(start: Date, end: Date): Date[] {
  const days: Date[] = [];
  for (let cursor = toDateOnly(start); cursor <= end; cursor = addDays(cursor, 1)) {
    days.push(cursor);
  }
  return days;
}

export function isWeekend(date: Date): boolean {
  const day = date.getUTCDay();
  return day === 0 || day === 6;
}

/** Working days in a range, excluding weekends and the supplied holidays. */
export function countWorkingDays(start: Date, end: Date, holidays: Date[] = []): number {
  const holidaySet = new Set(holidays.map(formatDateOnly));
  return eachDayInclusive(start, end).filter(
    (day) => !isWeekend(day) && !holidaySet.has(formatDateOnly(day)),
  ).length;
}

/** First and last instant of a calendar month, as UTC date-only bounds. */
export function monthBounds(year: number, month: number): { start: Date; end: Date } {
  return {
    start: new Date(Date.UTC(year, month - 1, 1)),
    end: new Date(Date.UTC(year, month, 0)),
  };
}

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}
