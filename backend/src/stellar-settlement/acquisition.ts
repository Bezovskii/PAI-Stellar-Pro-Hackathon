import type {
  VerifiedAssetAcquisitionProof,
} from "../try-anchor/types.js";

import {
  STELLAR_USDC_DECIMALS,
  type StellarSettlementIntent,
} from "./intent.js";

export const STELLAR_ACQUISITION_BINDING_VERSION =
  "pai.stellar-acquisition-binding.v1" as const;

const HEX_32_PATTERN =
  /^[0-9a-fA-F]{64}$/;

const DECIMAL_PATTERN =
  /^(0|[1-9][0-9]*)(?:\.([0-9]+))?$/;

export interface VerifiedStellarAcquisitionBinding {
  readonly version:
    typeof STELLAR_ACQUISITION_BINDING_VERSION;

  readonly intent:
    StellarSettlementIntent;

  readonly acquisitionProof:
    VerifiedAssetAcquisitionProof;

  readonly acquiredAmountBaseUnits:
    string;

  readonly spendableBalanceBaseUnits:
    string;

  readonly stellarTransactionHash:
    string;

  readonly ledger:
    number;
}

function decimalToBaseUnits(
  value: string,
  decimals: number,
  field: string,
): bigint {
  const normalized =
    value.trim();

  const match =
    DECIMAL_PATTERN.exec(
      normalized,
    );

  if (match === null) {
    throw new Error(
      `${field} must be a non-negative decimal string.`,
    );
  }

  const whole =
    match[1] ?? "0";

  const fraction =
    match[2] ?? "";

  if (
    fraction.length >
    decimals
  ) {
    throw new Error(
      `${field} exceeds ${decimals} decimal places.`,
    );
  }

  const paddedFraction =
    fraction.padEnd(
      decimals,
      "0",
    );

  const scale =
    10n **
    BigInt(
      decimals,
    );

  return (
    BigInt(
      whole,
    ) *
      scale +
    BigInt(
      paddedFraction.length === 0
        ? "0"
        : paddedFraction,
    )
  );
}

function requireTransactionHash(
  value: string,
): string {
  const normalized =
    value.trim();

  if (
    !HEX_32_PATTERN.test(
      normalized,
    )
  ) {
    throw new Error(
      "stellarTransactionHash must be a 32-byte hex value.",
    );
  }

  return normalized.toLowerCase();
}

export function bindVerifiedAcquisitionToIntent(
  intent:
    StellarSettlementIntent,

  proof:
    VerifiedAssetAcquisitionProof,
): VerifiedStellarAcquisitionBinding {
  if (
    proof.version !==
    "pai.asset-acquisition-proof.v1"
  ) {
    throw new Error(
      "Unsupported asset acquisition proof version.",
    );
  }

  if (
    proof.status !==
    "verified"
  ) {
    throw new Error(
      "Asset acquisition proof is not verified.",
    );
  }

  if (
    proof.environment !==
      intent.network ||
    proof.settlement.network !==
      intent.network
  ) {
    throw new Error(
      "Asset acquisition network does not match the Stellar settlement intent.",
    );
  }

  if (
    proof.source.asset !==
    "iso4217:TRY"
  ) {
    throw new Error(
      "Asset acquisition source must be TRY.",
    );
  }

  if (
    proof.settlement.asset.code !==
    intent.settlementAsset.code
  ) {
    throw new Error(
      "Acquired settlement asset code does not match the Stellar settlement intent.",
    );
  }

  if (
    proof.settlement.asset.issuer !==
    intent.settlementAsset.issuer
  ) {
    throw new Error(
      "Acquired settlement asset issuer does not match the Stellar settlement intent.",
    );
  }

  if (
    proof.settlement.destinationAccount !==
    intent.payerAccount
  ) {
    throw new Error(
      "Acquired USDC destination must be the settlement payer account.",
    );
  }

  const acquiredAmount =
    decimalToBaseUnits(
      proof.settlement.amount,
      STELLAR_USDC_DECIMALS,
      "settlement amount",
    );

  const requiredAmount =
    BigInt(
      intent.amountBaseUnits,
    );

  if (
    acquiredAmount !==
    requiredAmount
  ) {
    throw new Error(
      "Acquired USDC amount does not exactly match the Stellar settlement intent.",
    );
  }

  const spendableBalance =
    decimalToBaseUnits(
      proof.settlement.spendableBalance,
      STELLAR_USDC_DECIMALS,
      "spendable balance",
    );

  if (
    spendableBalance <
    requiredAmount
  ) {
    throw new Error(
      "Verified Stellar USDC balance is insufficient for escrow funding.",
    );
  }

  if (
    !Number.isSafeInteger(
      proof.references.ledger,
    ) ||
    proof.references.ledger <= 0
  ) {
    throw new Error(
      "Acquisition proof ledger must be a positive safe integer.",
    );
  }

  const stellarTransactionHash =
    requireTransactionHash(
      proof.references.stellarTransactionHash,
    );

  return {
    version:
      STELLAR_ACQUISITION_BINDING_VERSION,

    intent,

    acquisitionProof:
      proof,

    acquiredAmountBaseUnits:
      acquiredAmount.toString(),

    spendableBalanceBaseUnits:
      spendableBalance.toString(),

    stellarTransactionHash,

    ledger:
      proof.references.ledger,
  };
}