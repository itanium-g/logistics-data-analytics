/**
 * Date interpretation.
 *
 * Calendar dates are not local timestamps, and the supplied dataset is
 * historical. Two explicit modes exist:
 *
 *  - dataset mode (the demo default) anchors relative expressions to
 *    2026-01-01, the day after assumed coverage ends, so "last month" means
 *    December 2025 for a reviewer.
 *  - current mode uses the real UTC date. Out-of-sample ranges stay empty; they
 *    are never silently shifted back into 2025.
 *
 * Relative ranges always resolve to whole complete calendar months so a partial
 * month cannot distort a comparison. Explicit bounds override relative ranges,
 * and supplying both is a conflict the caller must resolve.
 */
import {
  DATASET_REFERENCE_DATE,
  ASSUMED_COVERAGE_END,
  ASSUMED_COVERAGE_START,
} from "../shared/dataset.ts";
import type { DateContext, DateField, RelativeRange } from "../shared/contracts.ts";
import {
  addMonths,
  compareIsoDates,
  endOfMonth,
  fromEpochMs,
  isIsoDate,
  startOfMonth,
} from "./dates.ts";

export class DateScopeError extends Error {
  readonly field: string;

  constructor(message: string, field: string) {
    super(message);
    this.name = "DateScopeError";
    this.field = field;
  }
}

export interface DateScopeInput {
  readonly date_field: DateField;
  readonly date_context: DateContext;
  readonly relative_range?: RelativeRange | null;
  readonly date_from?: string | null;
  readonly date_to?: string | null;
}

export interface ResolvedDateScope {
  readonly date_field: DateField;
  readonly date_context: DateContext;
  readonly reference_date: string;
  /** Inclusive lower bound, or null when the scope is unbounded. */
  readonly from: string | null;
  /** Inclusive upper bound, or null when the scope is unbounded. */
  readonly to: string | null;
  readonly relative_range: RelativeRange | null;
  /** Human-readable explanation of how the bounds were derived. */
  readonly basis: string;
}

const RELATIVE_MONTH_COUNTS: Readonly<Record<Exclude<RelativeRange, "all_time">, number>> = {
  last_month: 1,
  last_3_months: 3,
  last_6_months: 6,
  last_12_months: 12,
};

/** UTC calendar date for an instant. */
export function utcToday(now: Date): string {
  return fromEpochMs(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
}

export function referenceDateFor(context: DateContext, now: Date): string {
  return context === "dataset" ? DATASET_REFERENCE_DATE : utcToday(now);
}

export function resolveDateScope(input: DateScopeInput, now: Date): ResolvedDateScope {
  const referenceDate = referenceDateFor(input.date_context, now);
  const from = input.date_from ?? null;
  const to = input.date_to ?? null;
  const relative = input.relative_range ?? null;
  const hasExplicit = from !== null || to !== null;

  if (hasExplicit && relative !== null && relative !== "all_time") {
    throw new DateScopeError(
      "Supply either explicit date_from/date_to bounds or a relative_range, not both. Explicit dates override relative expressions, so the intent is ambiguous.",
      "relative_range",
    );
  }

  if (hasExplicit) {
    if (from === null || to === null) {
      throw new DateScopeError(
        "date_from and date_to must both be supplied or both omitted; a single open bound is not supported.",
        from === null ? "date_from" : "date_to",
      );
    }
    if (!isIsoDate(from)) {
      throw new DateScopeError(
        `date_from must be a real YYYY-MM-DD date; received ${JSON.stringify(from)}.`,
        "date_from",
      );
    }
    if (!isIsoDate(to)) {
      throw new DateScopeError(
        `date_to must be a real YYYY-MM-DD date; received ${JSON.stringify(to)}.`,
        "date_to",
      );
    }
    if (compareIsoDates(from, to) > 0) {
      throw new DateScopeError(
        `date_from ${from} must not be later than date_to ${to}.`,
        "date_from",
      );
    }
    return {
      date_field: input.date_field,
      date_context: input.date_context,
      reference_date: referenceDate,
      from,
      to,
      relative_range: null,
      basis: `Explicit inclusive bounds ${from} to ${to} on ${input.date_field}.`,
    };
  }

  if (relative === null || relative === "all_time") {
    return {
      date_field: input.date_field,
      date_context: input.date_context,
      reference_date: referenceDate,
      from: null,
      to: null,
      relative_range: relative,
      basis: `All available records, unbounded on ${input.date_field}.`,
    };
  }

  const months = RELATIVE_MONTH_COUNTS[relative];
  // The last complete calendar month is the one before the reference month, so a
  // partially observed month is never included.
  const lastCompleteMonthStart = addMonths(startOfMonth(referenceDate), -1);
  const resolvedTo = endOfMonth(lastCompleteMonthStart);
  const resolvedFrom = startOfMonth(addMonths(lastCompleteMonthStart, -(months - 1)));

  return {
    date_field: input.date_field,
    date_context: input.date_context,
    reference_date: referenceDate,
    from: resolvedFrom,
    to: resolvedTo,
    relative_range: relative,
    basis:
      months === 1
        ? `Last complete calendar month before the ${input.date_context} reference date ${referenceDate}: ${resolvedFrom} to ${resolvedTo} on ${input.date_field}.`
        : `Last ${months} complete calendar months before the ${input.date_context} reference date ${referenceDate}: ${resolvedFrom} to ${resolvedTo} on ${input.date_field}.`,
  };
}

export interface CoverageBounds {
  readonly start: string;
  readonly end: string;
}

export const ASSUMED_COVERAGE: CoverageBounds = {
  start: ASSUMED_COVERAGE_START,
  end: ASSUMED_COVERAGE_END,
};

/**
 * Warnings a caller should see about the resolved scope. These make an honestly
 * empty current-mode range legible instead of looking like a bug.
 */
export function dateScopeWarnings(
  scope: ResolvedDateScope,
  coverage: CoverageBounds = ASSUMED_COVERAGE,
): readonly string[] {
  const warnings: string[] = [];

  if (scope.from !== null && scope.to !== null) {
    const startsAfterCoverage = compareIsoDates(scope.from, coverage.end) > 0;
    const endsBeforeCoverage = compareIsoDates(scope.to, coverage.start) < 0;
    if (startsAfterCoverage || endsBeforeCoverage) {
      warnings.push(
        `The requested range ${scope.from} to ${scope.to} lies entirely outside the assumed data coverage ${coverage.start} to ${coverage.end}, so no records can match. The range was not shifted to fit the data.`,
      );
    } else if (
      compareIsoDates(scope.from, coverage.start) < 0 ||
      compareIsoDates(scope.to, coverage.end) > 0
    ) {
      warnings.push(
        `The requested range ${scope.from} to ${scope.to} extends beyond the assumed data coverage ${coverage.start} to ${coverage.end}; the portion outside coverage has no records.`,
      );
    }
  }

  if (scope.date_context === "current") {
    warnings.push(
      `Current mode resolves relative dates against today's UTC date (${scope.reference_date}). The supplied dataset is historical, so recent ranges are legitimately empty.`,
    );
  }

  if (scope.date_field === "delivery_date") {
    warnings.push(
      "Filtering on delivery_date excludes records without a delivery date, which are in_transit and canceled orders.",
    );
  }

  return warnings;
}
