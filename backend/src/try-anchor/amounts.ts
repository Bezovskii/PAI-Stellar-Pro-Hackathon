import {
  TryAnchorError,
  type TryAnchorErrorCode,
} from "./error.js";

export function parseDecimalUnits(
  value: string,
  decimals: number,
  field: string,
  errorCode: TryAnchorErrorCode = "ANCHOR_RESPONSE_INVALID",
): bigint {
  const match = /^(0|[1-9]\d*)(?:\.(\d+))?$/.exec(value);

  if (match === null) {
    throw new TryAnchorError(
      errorCode,
      `${field} must be a non-negative decimal string.`,
    );
  }

  const whole = match[1] ?? "0";
  const rawFraction = match[2] ?? "";

  if (rawFraction.length > decimals) {
    throw new TryAnchorError(
      errorCode,
      `${field} supports at most ${decimals} decimal places.`,
    );
  }

  const scale = 10n ** BigInt(decimals);
  const fraction = rawFraction.padEnd(decimals, "0");

  return BigInt(whole) * scale + BigInt(fraction || "0");
}

export function formatDecimalUnits(
  value: bigint,
  decimals: number,
): string {
  if (value < 0n) {
    throw new TryAnchorError(
      "ANCHOR_RESPONSE_INVALID",
      "Decimal units cannot be negative.",
    );
  }

  const scale = 10n ** BigInt(decimals);
  const whole = value / scale;
  const fraction = (value % scale)
    .toString()
    .padStart(decimals, "0")
    .replace(/0+$/, "");

  return fraction.length === 0
    ? whole.toString()
    : `${whole.toString()}.${fraction}`;
}
