import {
  createHash,
} from "node:crypto";

export const STELLAR_SETTLEMENT_INTENT_VERSION =
  "pai.stellar-settlement-intent.v1" as const;

export const STELLAR_EXECUTION_BINDING_VERSION =
  "pai.stellar-execution-binding.v1" as const;

export const STELLAR_TESTNET =
  "stellar-testnet" as const;

export const STELLAR_USDC_DECIMALS =
  7 as const;

const STELLAR_ACCOUNT_PATTERN =
  /^G[A-Z2-7]{55}$/;

const STELLAR_CONTRACT_PATTERN =
  /^C[A-Z2-7]{55}$/;

const HASH_32_PATTERN =
  /^(?:0x)?[0-9a-fA-F]{64}$/;

const POSITIVE_INTEGER_PATTERN =
  /^[1-9][0-9]*$/;

export interface StellarExecutionBindingFields {
  readonly network:
    typeof STELLAR_TESTNET;

  readonly paiAgreementId:
    string;

  readonly agreementVersion:
    string;

  /**
   * Lowercase 32-byte hex without 0x.
   * This representation matches Soroban BytesN<32> CLI/state output.
   */
  readonly agreementHash:
    string;

  readonly payerAccount:
    string;

  readonly recipientAccount:
    string;

  readonly assetCode:
    "USDC";

  readonly assetIssuer:
    string;

  readonly assetSac:
    string;

  /**
   * Amount in the Stellar asset's smallest unit.
   * USDC uses 7 decimal places.
   */
  readonly amountBaseUnits:
    string;
}

export interface StellarSettlementIntent {
  readonly version:
    typeof STELLAR_SETTLEMENT_INTENT_VERSION;

  readonly network:
    typeof STELLAR_TESTNET;

  readonly paiAgreementId:
    string;

  readonly agreementVersion:
    string;

  readonly agreementHash:
    string;

  readonly payerAccount:
    string;

  readonly recipientAccount:
    string;

  readonly settlementAsset: {
    readonly code:
      "USDC";

    readonly issuer:
      string;

    readonly sac:
      string;

    readonly decimals:
      typeof STELLAR_USDC_DECIMALS;
  };

  readonly amountBaseUnits:
    string;

  /**
   * SHA-256 over the canonical execution-binding payload.
   * Lowercase 32-byte hex without 0x.
   */
  readonly executionBindingHash:
    string;
}

export interface CreateStellarSettlementIntentInput {
  readonly paiAgreementId:
    string;

  readonly agreementVersion:
    string;

  readonly agreementHash:
    string;

  readonly payerAccount:
    string;

  readonly recipientAccount:
    string;

  readonly assetIssuer:
    string;

  readonly assetSac:
    string;

  readonly amountBaseUnits:
    string;
}

function requireNonEmpty(
  value: string,
  field: string,
): string {
  const normalized =
    value.trim();

  if (normalized.length === 0) {
    throw new Error(
      `${field} must not be empty.`,
    );
  }

  return normalized;
}

function normalizeHash32(
  value: string,
  field: string,
): string {
  const normalized =
    requireNonEmpty(
      value,
      field,
    );

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

function requireStellarAccount(
  value: string,
  field: string,
): string {
  const normalized =
    requireNonEmpty(
      value,
      field,
    );

  if (
    !STELLAR_ACCOUNT_PATTERN.test(
      normalized,
    )
  ) {
    throw new Error(
      `${field} must be a Stellar G-account.`,
    );
  }

  return normalized;
}

function requireStellarContract(
  value: string,
  field: string,
): string {
  const normalized =
    requireNonEmpty(
      value,
      field,
    );

  if (
    !STELLAR_CONTRACT_PATTERN.test(
      normalized,
    )
  ) {
    throw new Error(
      `${field} must be a Stellar contract ID.`,
    );
  }

  return normalized;
}

function requirePositiveInteger(
  value: string,
  field: string,
): string {
  const normalized =
    requireNonEmpty(
      value,
      field,
    );

  if (
    !POSITIVE_INTEGER_PATTERN.test(
      normalized,
    )
  ) {
    throw new Error(
      `${field} must be a positive integer string.`,
    );
  }

  return normalized;
}

/**
 * Property order is part of the v1 binding format.
 * Do not reorder these fields without introducing a new binding version.
 */
export function canonicalStellarExecutionBinding(
  input:
    StellarExecutionBindingFields,
): string {
  return JSON.stringify({
    version:
      STELLAR_EXECUTION_BINDING_VERSION,

    network:
      input.network,

    paiAgreementId:
      input.paiAgreementId,

    agreementVersion:
      input.agreementVersion,

    agreementHash:
      input.agreementHash,

    payerAccount:
      input.payerAccount,

    recipientAccount:
      input.recipientAccount,

    assetCode:
      input.assetCode,

    assetIssuer:
      input.assetIssuer,

    assetSac:
      input.assetSac,

    amountBaseUnits:
      input.amountBaseUnits,
  });
}

export function deriveStellarExecutionBindingHash(
  input:
    StellarExecutionBindingFields,
): string {
  return createHash(
    "sha256",
  )
    .update(
      canonicalStellarExecutionBinding(
        input,
      ),
      "utf8",
    )
    .digest(
      "hex",
    );
}

export function createStellarSettlementIntent(
  input:
    CreateStellarSettlementIntentInput,
): StellarSettlementIntent {
  const paiAgreementId =
    requireNonEmpty(
      input.paiAgreementId,
      "paiAgreementId",
    );

  const agreementVersion =
    requireNonEmpty(
      input.agreementVersion,
      "agreementVersion",
    );

  const agreementHash =
    normalizeHash32(
      input.agreementHash,
      "agreementHash",
    );

  const payerAccount =
    requireStellarAccount(
      input.payerAccount,
      "payerAccount",
    );

  const recipientAccount =
    requireStellarAccount(
      input.recipientAccount,
      "recipientAccount",
    );

  const assetIssuer =
    requireStellarAccount(
      input.assetIssuer,
      "assetIssuer",
    );

  const assetSac =
    requireStellarContract(
      input.assetSac,
      "assetSac",
    );

  const amountBaseUnits =
    requirePositiveInteger(
      input.amountBaseUnits,
      "amountBaseUnits",
    );

  const bindingFields:
    StellarExecutionBindingFields = {
      network:
        STELLAR_TESTNET,

      paiAgreementId,

      agreementVersion,

      agreementHash,

      payerAccount,

      recipientAccount,

      assetCode:
        "USDC",

      assetIssuer,

      assetSac,

      amountBaseUnits,
    };

  return {
    version:
      STELLAR_SETTLEMENT_INTENT_VERSION,

    network:
      STELLAR_TESTNET,

    paiAgreementId,

    agreementVersion,

    agreementHash,

    payerAccount,

    recipientAccount,

    settlementAsset: {
      code:
        "USDC",

      issuer:
        assetIssuer,

      sac:
        assetSac,

      decimals:
        STELLAR_USDC_DECIMALS,
    },

    amountBaseUnits,

    executionBindingHash:
      deriveStellarExecutionBindingHash(
        bindingFields,
      ),
  };
}
