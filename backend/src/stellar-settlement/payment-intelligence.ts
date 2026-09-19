export type PaymentDirection =
  | "FUNDING"
  | "PAYOUT";

export type PaymentAsset =
  | "TRY"
  | "STELLAR_USDC";

export type PaymentRail =
  | "BANK_TRY"
  | "STELLAR";

export type PaymentRoute =
  | "DIRECT_STELLAR"
  | "TRY_ONRAMP"
  | "TRY_OFFRAMP"
  | "NO_ROUTE";

export type PaymentRouteReason =
  | "SOURCE_ALREADY_STELLAR_USDC"
  | "TRY_TO_STELLAR_USDC"
  | "STELLAR_USDC_TO_TRY"
  | "ONRAMP_UNAVAILABLE"
  | "OFFRAMP_UNAVAILABLE"
  | "UNSUPPORTED_COMBINATION";

export type PaymentExecutionTarget =
  | "STELLAR"
  | "TRY_ANCHOR"
  | null;

export interface PaymentRouteInput {
  readonly direction:
    PaymentDirection;

  readonly sourceAsset:
    PaymentAsset;

  readonly targetAsset:
    PaymentAsset;

  readonly sourceRail:
    PaymentRail;

  readonly targetRail:
    PaymentRail;

  readonly tryOnrampAvailable:
    boolean;

  readonly tryOfframpAvailable:
    boolean;
}

export interface PaymentRouteDecision {
  readonly route:
    PaymentRoute;

  readonly reason:
    PaymentRouteReason;

  readonly executionTarget:
    PaymentExecutionTarget;
}

const DIRECT_STELLAR_DECISION:
  PaymentRouteDecision = {
    route:
      "DIRECT_STELLAR",

    reason:
      "SOURCE_ALREADY_STELLAR_USDC",

    executionTarget:
      "STELLAR",
  };

const TRY_ONRAMP_DECISION:
  PaymentRouteDecision = {
    route:
      "TRY_ONRAMP",

    reason:
      "TRY_TO_STELLAR_USDC",

    executionTarget:
      "TRY_ANCHOR",
  };

const TRY_OFFRAMP_DECISION:
  PaymentRouteDecision = {
    route:
      "TRY_OFFRAMP",

    reason:
      "STELLAR_USDC_TO_TRY",

    executionTarget:
      "TRY_ANCHOR",
  };

const ONRAMP_UNAVAILABLE_DECISION:
  PaymentRouteDecision = {
    route:
      "NO_ROUTE",

    reason:
      "ONRAMP_UNAVAILABLE",

    executionTarget:
      null,
  };

const OFFRAMP_UNAVAILABLE_DECISION:
  PaymentRouteDecision = {
    route:
      "NO_ROUTE",

    reason:
      "OFFRAMP_UNAVAILABLE",

    executionTarget:
      null,
  };

const UNSUPPORTED_DECISION:
  PaymentRouteDecision = {
    route:
      "NO_ROUTE",

    reason:
      "UNSUPPORTED_COMBINATION",

    executionTarget:
      null,
  };

/**
 * Pure deterministic route selection.
 *
 * Agreement Intelligence decides whether payment is allowed.
 * This function decides only how an approved obligation can move.
 */
export function decidePaymentRoute(
  input:
    PaymentRouteInput,
): PaymentRouteDecision {
  const sourceIsStellarUsdc =
    input.sourceAsset ===
      "STELLAR_USDC" &&
    input.sourceRail ===
      "STELLAR";

  const targetIsStellarUsdc =
    input.targetAsset ===
      "STELLAR_USDC" &&
    input.targetRail ===
      "STELLAR";

  const sourceIsTryBank =
    input.sourceAsset ===
      "TRY" &&
    input.sourceRail ===
      "BANK_TRY";

  const targetIsTryBank =
    input.targetAsset ===
      "TRY" &&
    input.targetRail ===
      "BANK_TRY";

  if (
    sourceIsStellarUsdc &&
    targetIsStellarUsdc
  ) {
    return DIRECT_STELLAR_DECISION;
  }

  if (
    input.direction ===
      "FUNDING" &&
    sourceIsTryBank &&
    targetIsStellarUsdc
  ) {
    return input.tryOnrampAvailable
      ? TRY_ONRAMP_DECISION
      : ONRAMP_UNAVAILABLE_DECISION;
  }

  if (
    input.direction ===
      "PAYOUT" &&
    sourceIsStellarUsdc &&
    targetIsTryBank
  ) {
    return input.tryOfframpAvailable
      ? TRY_OFFRAMP_DECISION
      : OFFRAMP_UNAVAILABLE_DECISION;
  }

  return UNSUPPORTED_DECISION;
}