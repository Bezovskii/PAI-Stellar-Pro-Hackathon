import {
  TryAnchorError,
} from "./error.js";

import {
  parseDecimalUnits,
} from "./amounts.js";

import {
  TRY_ASSET,
  stellarAssetId,
} from "./sep38.js";

import {
  verifyHorizonPayment,
} from "./horizon.js";

import type {
  DepositExchangeInstructions,
  FetchLike,
  Sep38Quote,
  Sep6Transaction,
  TryAnchorConfig,
  VerifiedAssetAcquisitionProof,
} from "./types.js";

export interface VerifySpendableAcquisitionInput {
  readonly config: TryAnchorConfig;
  readonly quote: Sep38Quote;
  readonly deposit: DepositExchangeInstructions;
  readonly transaction: Sep6Transaction;
  readonly fetchImpl?: FetchLike;
  readonly now?: () => Date;
}

function requireMatchingAmount(
  actual: string,
  expected: string,
  decimals: number,
  field: string,
): void {
  if (
    parseDecimalUnits(
      actual,
      decimals,
      field,
      "HORIZON_TRANSACTION_INVALID",
    ) !==
      parseDecimalUnits(
        expected,
        decimals,
        field,
        "HORIZON_TRANSACTION_INVALID",
      )
  ) {
    throw new TryAnchorError(
      "HORIZON_TRANSACTION_INVALID",
      `${field} does not match the firm quote.`,
    );
  }
}

export async function verifySpendableAcquisition(
  input: VerifySpendableAcquisitionInput,
): Promise<VerifiedAssetAcquisitionProof> {
  if (
    input.quote.sellAsset !== TRY_ASSET ||
    input.quote.buyAsset !== stellarAssetId(input.config) ||
    input.deposit.quoteId !== input.quote.id ||
    input.transaction.id !== input.deposit.anchorTransactionId ||
    (
      input.transaction.quoteId !== undefined &&
      input.transaction.quoteId !== input.quote.id
    )
  ) {
    throw new TryAnchorError(
      "HORIZON_TRANSACTION_INVALID",
      "Anchor transaction, deposit, and quote references do not match.",
    );
  }

  if (input.transaction.status.toLowerCase() !== "completed") {
    throw new TryAnchorError(
      "ACQUISITION_NOT_READY",
      `Anchor transaction is ${input.transaction.status}, not completed.`,
    );
  }

  if (input.transaction.claimableBalanceId !== undefined) {
    throw new TryAnchorError(
      "ASSET_NOT_SPENDABLE",
      "Anchor returned a claimable balance instead of spendable USDC.",
    );
  }

  if (
    input.transaction.amountOut === undefined ||
    input.transaction.amountOutAsset === undefined ||
    input.transaction.stellarTransactionId === undefined
  ) {
    throw new TryAnchorError(
      "ACQUISITION_NOT_READY",
      "Completed anchor transaction is missing settlement evidence.",
    );
  }

  if (input.transaction.amountOutAsset !== stellarAssetId(input.config)) {
    throw new TryAnchorError(
      "HORIZON_TRANSACTION_INVALID",
      "Anchor transaction returned an unexpected settlement asset.",
    );
  }

  requireMatchingAmount(
    input.transaction.amountOut,
    input.quote.buyAmount,
    7,
    "settlement amount",
  );

  if (input.transaction.amountIn !== undefined) {
    requireMatchingAmount(
      input.transaction.amountIn,
      input.quote.sellAmount,
      7,
      "source TRY amount",
    );
  }

  if (
    input.transaction.amountInAsset !== undefined &&
    input.transaction.amountInAsset !== TRY_ASSET
  ) {
    throw new TryAnchorError(
      "HORIZON_TRANSACTION_INVALID",
      "Anchor transaction returned an unexpected source asset.",
    );
  }

  const horizon = await verifyHorizonPayment({
    config: input.config,
    transactionHash: input.transaction.stellarTransactionId,
    destinationAccount: input.deposit.destinationAccount,
    expectedAmount: input.quote.buyAmount,
    ...(input.fetchImpl === undefined
      ? {}
      : { fetchImpl: input.fetchImpl }),
  });

  return {
    version: "pai.asset-acquisition-proof.v1",
    status: "verified",
    provider: "tr-mock-anchor",
    environment: "stellar-testnet",
    rail: "sep6-deposit-exchange",
    source: {
      asset: TRY_ASSET,
      amount: input.quote.sellAmount,
    },
    settlement: {
      network: "stellar-testnet",
      asset: {
        code: input.config.settlementAsset.code,
        issuer: input.config.settlementAsset.issuer,
      },
      amount: input.quote.buyAmount,
      destinationAccount: input.deposit.destinationAccount,
      spendableBalance: horizon.spendableBalance,
    },
    references: {
      quoteId: input.quote.id,
      anchorTransactionId: input.deposit.anchorTransactionId,
      stellarTransactionHash: horizon.transactionHash,
      ledger: horizon.ledger,
    },
    verifiedAt: (input.now ?? (() => new Date()))().toISOString(),
  };
}
