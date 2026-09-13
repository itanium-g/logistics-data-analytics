/**
 * Calendar date primitives.
 *
 * The source supplies calendar dates (YYYY-MM-DD) with no time and no timezone.
 * Treating them as local timestamps would shift results, so every operation
 * here is pure integer calendar arithmetic anchored at UTC midnight.
 */

const ISO_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

const MS_PER_DAY = 86_400_000;

export class DateParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DateParseError";
  }
}

/** True when the value is a well-formed, real calendar date. Rejects 2025-02-30. */
export function isIsoDate(value: string): boolean {
  const match = ISO_DATE_PATTERN.exec(value);
  if (match === null) return false;
  const year = Number.parseInt(match[1] ?? "", 10);
  const month = Number.parseInt(match[2] ?? "", 10);
  const day = Number.parseInt(match[3] ?? "", 10);
  if (month < 1 || month > 12 || day < 1 || day > 31) return false;
  const asUtc = Date.UTC(year, month - 1, day);
  const roundTrip = new Date(asUtc);
  return (
    roundTrip.getUTCFullYear() === year &&
    roundTrip.getUTCMonth() === month - 1 &&
    roundTrip.getUTCDate() === day
  );
}

function assertIsoDate(value: string): void {
  if (!isIsoDate(value)) {
    throw new DateParseError(`Expected a real YYYY-MM-DD date; received ${JSON.stringify(value)}`);
  }
}

/** UTC-midnight epoch milliseconds for a calendar date. */
export function toEpochMs(value: string): number {
  assertIsoDate(value);
  const match = ISO_DATE_PATTERN.exec(value);
  const year = Number.parseInt(match?.[1] ?? "", 10);
  const month = Number.parseInt(match?.[2] ?? "", 10);
  const day = Number.parseInt(match?.[3] ?? "", 10);
  return Date.UTC(year, month - 1, day);
}

/** Render UTC-midnight epoch milliseconds back to a calendar date. */
export function fromEpochMs(epochMs: number): string {
  const date = new Date(epochMs);
  const year = String(date.getUTCFullYear()).padStart(4, "0");
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** Whole calendar days from `from` to `to`. Negative when `to` precedes `from`. */
export function daysBetween(from: string, to: string): number {
  return Math.round((toEpochMs(to) - toEpochMs(from)) / MS_PER_DAY);
}

/** Lexicographic comparison is also chronological for ISO dates. */
export function compareIsoDates(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** "YYYY-MM" bucket key for a calendar date. */
export function monthKey(value: string): string {
  assertIsoDate(value);
  return value.slice(0, 7);
}

/** Add days to a calendar date. */
export function addDays(value: string, days: number): string {
  return fromEpochMs(toEpochMs(value) + days * MS_PER_DAY);
}

/** First day of the month containing `value`. */
export function startOfMonth(value: string): string {
  assertIsoDate(value);
  return `${value.slice(0, 7)}-01`;
}

/** Last day of the month containing `value`. */
export function endOfMonth(value: string): string {
  const start = startOfMonth(value);
  const year = Number.parseInt(start.slice(0, 4), 10);
  const month = Number.parseInt(start.slice(5, 7), 10);
  // Day 0 of the following month is the last day of this month.
  return fromEpochMs(Date.UTC(year, month, 0));
}

/**
 * Shift a calendar date by whole months, clamping the day to the target month's
 * length so 2025-01-31 plus one month is 2025-02-28 rather than 2025-03-03.
 */
export function addMonths(value: string, months: number): string {
  assertIsoDate(value);
  const year = Number.parseInt(value.slice(0, 4), 10);
  const month = Number.parseInt(value.slice(5, 7), 10);
  const day = Number.parseInt(value.slice(8, 10), 10);
  const targetIndex = (year * 12 + (month - 1)) + months;
  const targetYear = Math.floor(targetIndex / 12);
  const targetMonth = targetIndex - targetYear * 12 + 1;
  const lastDay = new Date(Date.UTC(targetYear, targetMonth, 0)).getUTCDate();
  return fromEpochMs(Date.UTC(targetYear, targetMonth - 1, Math.min(day, lastDay)));
}

/** "YYYY-MM" key shifted by whole months. */
export function addMonthsToKey(monthKeyValue: string, months: number): string {
  return monthKey(addMonths(`${monthKeyValue}-01`, months));
}

/**
 * Monday that starts the week containing `value`. Week grain uses Monday starts,
 * so a range boundary week can legitimately begin before the requested from-date.
 */
export function startOfWeekMonday(value: string): string {
  const weekday = new Date(toEpochMs(value)).getUTCDay(); // 0 = Sunday
  const offset = weekday === 0 ? -6 : 1 - weekday;
  return addDays(value, offset);
}

/** Inclusive list of "YYYY-MM" keys from `from` to `to`. */
export function monthKeysBetween(from: string, to: string): readonly string[] {
  const keys: string[] = [];
  let cursor = startOfMonth(from);
  const last = startOfMonth(to);
  while (compareIsoDates(cursor, last) <= 0) {
    keys.push(monthKey(cursor));
    cursor = addMonths(cursor, 1);
  }
  return keys;
}
