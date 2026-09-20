import type {
  CanonicalAgreementTerms,
} from "@pai/agreement-contract";

import {
  computeCanonicalAgreementHash,
} from "../agreements/canonical.js";

import {
  createStellarSettlementIntent,
  STELLAR_USDC_DECIMALS,
  type StellarSettlementIntent,
} from "./intent.js";

const DECIMAL_PATTERN =
  /^(0|[1-9][0-9]*)(?:\.([0-9]+))?$/;

const HASH_32_PATTERN =
  /^(?:0x)?[0-9a-fA-F]{64}$/;

export interface CanonicalAgreementReferenceForStellar {
  readonly agreementId:
    string;

  readonly agreementVersion:
    number;

  readonly agreementHash:
    string;
}

export interface CanonicalLifecycleForStellar {
  readonly status:
    string;

  readonly walletBindingComplete:
    boolean;
}

export interface CreateStellarIntentFromCanonicalInput {
  readonly reference:
    CanonicalAgreementReferenceForStellar;

  readonly terms:
    CanonicalAgreementTerms;

  readonly lifecycle:
    CanonicalLifecycleForStellar;

  /**
   * Explicit Stellar execution identities.
   *
   * These are intentionally separate from the current
   * PAI SIWE/EVM authentication wallets.
   */
  readonly payerAccount:
    string;

  readonly recipientAccount:
    string;

  readonly assetIssuer:
    string;

  readonly assetSac:
    string;
}

function normalizeHash32(
  value: string,
  field: string,
): string {
  const normalized =
    value.trim();

  if (
    !HASH_32_PATTERN.test(
      normalized,
    )
  ) {
    throw new Error(
      `${field} must be a 32-byte hex value.`,
    );
  }

  return normalized
    .replace(
      /^0x/i,
      "",
    )
    .toLowerCase();
}

export function stellarDecimalToBaseUnits(
  value: string,
): string {
  const normalized =
    value.trim();

  const match =
    DECIMAL_PATTERN.exec(
      normalized,
    );

  if (match === null) {
    throw new Error(
      "Canonical totalValue must be a non-negative decimal string.",
    );
  }

  const whole =
    match[1] ?? "0";

  const fraction =
    match[2] ?? "";

  if (
    fraction.length >
    STELLAR_USDC_DECIMALS
  ) {
    throw new Error(
      `Canonical totalValue exceeds ${STELLAR_USDC_DECIMALS} decimal places.`,
    );
  }

  const paddedFraction =
    fraction.padEnd(
      STELLAR_USDC_DECIMALS,
      "0",
    );

  const scale =
    10n **
    BigInt(
      STELLAR_USDC_DECIMALS,
    );

  const baseUnits =
    BigInt(
      whole,
    ) *
      scale +
    BigInt(
      paddedFraction.length === 0
        ? "0"
        : paddedFraction,
    );

  if (
    baseUnits <=
    0n
  ) {
    throw new Error(
      "Canonical totalValue must be greater than zero.",
    );
  }

  return baseUnits.toString();
}

export function createStellarIntentFromCanonicalAgreement(
  input:
    CreateStellarIntentFromCanonicalInput,
): StellarSettlementIntent {
  if (
    input.lifecycle.status !==
    "READY_TO_FUND"
  ) {
    throw new Error(
      "Canonical agreement must be READY_TO_FUND before Stellar settlement routing.",
    );
  }

  if (
    input.lifecycle.walletBindingComplete !==
    true
  ) {
    throw new Error(
      "Canonical agreement wallet binding must be complete before Stellar settlement routing.",
    );
  }

  const canonicalHash =
    normalizeHash32(
      computeCanonicalAgreementHash(
        input.terms,
      ),
      "computed canonical agreement hash",
    );

  const referencedHash =
    normalizeHash32(
      input.reference.agreementHash,
      "agreementHash",
    );

  if (
    canonicalHash !==
    referencedHash
  ) {
    throw new Error(
      "Canonical agreement terms do not match the supplied agreementHash.",
    );
  }

  const settlementAsset =
    input.terms
      .settlementAsset
      ?.trim()
      .toUpperCase();

  if (
    settlementAsset !==
    "USDC"
  ) {
    throw new Error(
      "Stellar settlement currently requires canonical settlementAsset USDC.",
    );
  }

  if (
    input.terms.totalValue ===
    null
  ) {
    throw new Error(
      "Canonical totalValue is required for Stellar settlement.",
    );
  }

  const amountBaseUnits =
    stellarDecimalToBaseUnits(
      input.terms.totalValue,
    );

  return createStellarSettlementIntent({
    paiAgreementId:
      input.reference.agreementId,

    agreementVersion:
      String(
        input.reference.agreementVersion,
      ),

    agreementHash:
      referencedHash,

    payerAccount:
      input.payerAccount,

    recipientAccount:
      input.recipientAccount,

    assetIssuer:
      input.assetIssuer,

    assetSac:
      input.assetSac,

    amountBaseUnits,
  });
}