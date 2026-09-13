/**
 * Exact money handling.
 *
 * Currency is parsed from the source decimal string straight into integer cents
 * by string manipulation. Multiplying by 100 in binary floating point is wrong:
 * 11.69 * 100 evaluates to 1168.9999999999998. The source also mixes one- and
 * two-decimal values ("10.4" and "11.69"), so padding is required.
 */

export class MoneyParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MoneyParseError";
  }
}

const USD_PATTERN = /^(\d+)(?:\.(\d{1,2}))?$/;

/** Parse a non-negative USD decimal string into integer cents. */
export function parseUsdToCents(raw: string): number {
  const match = USD_PATTERN.exec(raw.trim());
  if (match === null) {
    throw new MoneyParseError(
      `Expected a non-negative amount with at most two decimals; received ${JSON.stringify(raw)}`,
    );
  }
  const whole = match[1] ?? "0";
  const fraction = (match[2] ?? "").padEnd(2, "0");
  return Number.parseInt(whole, 10) * 100 + Number.parseInt(fraction, 10);
}

/** Render integer cents as a plain decimal string, without a currency symbol. */
export function formatCents(cents: number): string {
  const negative = cents < 0;
  const absolute = Math.abs(cents);
  const whole = Math.trunc(absolute / 100);
  const fraction = absolute % 100;
  return `${negative ? "-" : ""}${whole}.${String(fraction).padStart(2, "0")}`;
}
