import {
  parseDecimalUnits,
} from "./amounts.js";

import {
  discoverAnchor,
} from "./discovery.js";

import {
  TryAnchorError,
} from "./error.js";

import {
  verifyHorizonOutboundPayment,
} from "./horizon.js";

import {
  authenticateSep10,
} from "./sep10.js";

import {
  ensureKycAccepted,
} from "./sep12.js";

import {
  createOfframpFirmQuote,
} from "./sep38.js";

import {
  createWithdrawExchange,
  getSep6Transaction,
} from "./sep6.js";

import type {
  FetchLike,
  HorizonOutboundPaymentEvidence,
  KycFieldValues,
  Sep10Signer,
  Sep38Quote,
  Sep6Transaction,
  StellarPaymentAuthorizer,
  TryAnchorConfig,
  VerifiedTryOfframpProof,
  WithdrawalExchangeInstructions,
} from "./types.js";

const MAX_TRANSACTION_POLLS =
  30;

const TRANSACTION_POLL_INTERVAL_MS =
  1000;

const USDC_DECIMALS =
  7;

const TRY_DECIMALS =
  2;

export type TryOfframpProgress =
  | "QUOTING"
  | "ANCHOR_PENDING"
  | "STELLAR_SENDING"
  | "STELLAR_VERIFIED"
  | "TRY_PAID";

export interface OfframpTryFromStellarUsdcInput {
  readonly config:
    TryAnchorConfig;

  readonly signer:
    Sep10Signer;

  readonly paymentAuthorizer:
    StellarPaymentAuthorizer;

  readonly sourceAccount:
    string;

  readonly sellAmountUsdc:
    string;

  readonly kycFields?:
    KycFieldValues;

  readonly customerType?:
    string;

  readonly fetchImpl?:
    FetchLike;

  readonly onProgress?:
    (
      state:
        TryOfframpProgress,
    ) =>
      void |
      Promise<void>;

  readonly now?:
    () => Date;

  readonly sleepImpl?:
    (
      milliseconds:
        number,
    ) =>
      Promise<void>;

  readonly maxTransactionPolls?:
    number;

  readonly transactionPollIntervalMs?:
    number;
}

function sameAmount(
  left:
    string,
  right:
    string,
  decimals:
    number,
  label:
    string,
): boolean {
  return (
    parseDecimalUnits(
      left,
      decimals,
      label,
      "OFFRAMP_NOT_READY",
    ) ===
    parseDecimalUnits(
      right,
      decimals,
      label,
      "OFFRAMP_NOT_READY",
    )
  );
}

export interface FinalizeCompletedOfframpInput {
  readonly config:
    TryAnchorConfig;

  readonly sourceAccount:
    string;

  readonly quote:
    Sep38Quote;

  readonly withdrawal:
    WithdrawalExchangeInstructions;

  readonly transaction:
    Sep6Transaction;

  readonly horizon:
    HorizonOutboundPaymentEvidence;

  readonly now?:
    () => Date;
}

export function finalizeCompletedOfframp(
  input:
    FinalizeCompletedOfframpInput,
): VerifiedTryOfframpProof {
  if (
    input.transaction.status
      .toLowerCase() !==
    "completed"
  ) {
    throw new TryAnchorError(
      "OFFRAMP_NOT_READY",
      "Anchor off-ramp transaction is not completed.",
    );
  }

  if (
    input.transaction.quoteId !==
      input.quote.id
  ) {
    throw new TryAnchorError(
      "OFFRAMP_NOT_READY",
      "Completed off-ramp transaction does not reference the expected quote.",
    );
  }

  if (
    input.transaction.amountIn ===
      undefined ||
    !sameAmount(
      input.transaction.amountIn,
      input.quote.sellAmount,
      USDC_DECIMALS,
      "off-ramp USDC amount",
    )
  ) {
    throw new TryAnchorError(
      "OFFRAMP_NOT_READY",
      "Completed off-ramp transaction has an unexpected USDC amount.",
    );
  }

  if (
    input.transaction.amountOut ===
      undefined ||
    !sameAmount(
      input.transaction.amountOut,
      input.quote.buyAmount,
      TRY_DECIMALS,
      "off-ramp TRY amount",
    ) ||
    input.transaction.amountOutAsset !==
      input.quote.buyAsset
  ) {
    throw new TryAnchorError(
      "OFFRAMP_NOT_READY",
      "Completed off-ramp transaction has unexpected TRY payout details.",
    );
  }

  const providerHash =
    input.transaction
      .stellarTransactionId
      ?.toLowerCase();

  const independentHash =
    input.horizon
      .transactionHash
      .toLowerCase();

  if (
    providerHash ===
      undefined ||
    providerHash !==
      independentHash
  ) {
    throw new TryAnchorError(
      "OFFRAMP_NOT_READY",
      "Anchor Stellar transaction id does not match independently verified Horizon evidence.",
    );
  }

  if (
    input.horizon.sourceAccount !==
      input.sourceAccount ||
    input.horizon.destinationAccount !==
      input.withdrawal.destinationAccount ||
    input.horizon.memoType !==
      input.withdrawal.memoType ||
    input.horizon.memo !==
      input.withdrawal.memo ||
    !sameAmount(
      input.horizon.paymentAmount,
      input.quote.sellAmount,
      USDC_DECIMALS,
      "independent outbound USDC amount",
    )
  ) {
    throw new TryAnchorError(
      "OFFRAMP_NOT_READY",
      "Independent Horizon evidence does not match the authorized off-ramp payment.",
    );
  }

  const payoutReference =
    input.transaction
      .externalTransactionId;

  if (
    payoutReference ===
      undefined
  ) {
    throw new TryAnchorError(
      "OFFRAMP_NOT_READY",
      "Completed sandbox off-ramp is missing the simulated TRY payout reference.",
    );
  }

  return {
    version:
      "pai.try-offramp-proof.v1",

    status:
      "verified",

    provider:
      "tr-mock-anchor",

    environment:
      "stellar-testnet",

    rail:
      "sep6-withdraw-exchange",

    source: {
      network:
        "stellar-testnet",

      asset: {
        code:
          input.config
            .settlementAsset
            .code,

        issuer:
          input.config
            .settlementAsset
            .issuer,
      },

      amount:
        input.quote.sellAmount,

      account:
        input.sourceAccount,
    },

    destination: {
      asset:
        "iso4217:TRY",

      amount:
        input.quote.buyAmount,

      payoutReference,
    },

    references: {
      quoteId:
        input.quote.id,

      anchorTransactionId:
        input.withdrawal
          .anchorTransactionId,

      stellarTransactionHash:
        independentHash,

      ledger:
        input.horizon.ledger,
    },

    verifiedAt:
      (
        input.now ??
        (() => new Date())
      )().toISOString(),
  };
}

async function defaultSleep(
  milliseconds:
    number,
): Promise<void> {
  await new Promise<void>(
    (resolve) => {
      setTimeout(
        resolve,
        milliseconds,
      );
    },
  );
}

export async function offrampTryFromStellarUsdc(
  input:
    OfframpTryFromStellarUsdcInput,
): Promise<VerifiedTryOfframpProof> {
  if (
    input.signer.accountId !==
      input.sourceAccount
  ) {
    throw new TryAnchorError(
      "SEP10_SIGNING_FAILED",
      "SEP-10 signer must be the released-USDC recipient account.",
    );
  }

  if (
    input.paymentAuthorizer.accountId !==
      input.sourceAccount
  ) {
    throw new TryAnchorError(
      "OFFRAMP_NOT_READY",
      "Stellar payment authorizer must be the released-USDC recipient account.",
    );
  }

  const fetchImpl =
    input.fetchImpl ??
    globalThis.fetch;

  const discovery =
    await discoverAnchor(
      input.config,
      fetchImpl,
    );

  const session =
    await authenticateSep10({
      config:
        input.config,

      signer:
        input.signer,

      discovery,
      fetchImpl,
    });

  const kyc =
    await ensureKycAccepted({
      discovery,
      session,

      ...(input.customerType ===
        undefined
        ? {}
        : {
            customerType:
              input.customerType,
          }),

      ...(input.kycFields ===
        undefined
        ? {}
        : {
            fields:
              input.kycFields,
          }),

      fetchImpl,
    });

  await input.onProgress?.(
    "QUOTING",
  );

  const quote =
    await createOfframpFirmQuote({
      config:
        input.config,

      discovery,
      session,

      sellAmountUsdc:
        input.sellAmountUsdc,

      fetchImpl,

      ...(input.now ===
        undefined
        ? {}
        : {
            now:
              input.now,
          }),
    });

  await input.onProgress?.(
    "ANCHOR_PENDING",
  );

  const withdrawal =
    await createWithdrawExchange({
      config:
        input.config,

      discovery,
      session,
      kyc,
      quote,
      fetchImpl,

      ...(input.now ===
        undefined
        ? {}
        : {
            now:
              input.now,
          }),
    });

  await input.onProgress?.(
    "STELLAR_SENDING",
  );

  const submitted =
    await input.paymentAuthorizer
      .submitPayment({
        sourceAccount:
          input.sourceAccount,

        destinationAccount:
          withdrawal
            .destinationAccount,

        asset: {
          code:
            input.config
              .settlementAsset
              .code,

          issuer:
            input.config
              .settlementAsset
              .issuer,
        },

        amount:
          quote.sellAmount,

        memoType:
          withdrawal.memoType,

        memo:
          withdrawal.memo,

        networkPassphrase:
          input.config
            .networkPassphrase,
      });

  const horizon =
    await verifyHorizonOutboundPayment({
      config:
        input.config,

      transactionHash:
        submitted.transactionHash,

      sourceAccount:
        input.sourceAccount,

      destinationAccount:
        withdrawal
          .destinationAccount,

      expectedAmount:
        quote.sellAmount,

      memo:
        withdrawal.memo,

      fetchImpl,
    });

  await input.onProgress?.(
    "STELLAR_VERIFIED",
  );

  let transaction =
    await getSep6Transaction(
      discovery,
      session,
      withdrawal
        .anchorTransactionId,
      fetchImpl,
    );

  const maxPolls =
    input.maxTransactionPolls ??
    MAX_TRANSACTION_POLLS;

  const pollInterval =
    input.transactionPollIntervalMs ??
    TRANSACTION_POLL_INTERVAL_MS;

  const sleep =
    input.sleepImpl ??
    defaultSleep;

  for (
    let attempt = 1;
    transaction.status
      .toLowerCase() !==
      "completed";
    attempt += 1
  ) {
    if (
      attempt >=
        maxPolls
    ) {
      throw new TryAnchorError(
        "OFFRAMP_NOT_READY",
        `Anchor transaction ${withdrawal.anchorTransactionId} did not complete after ${maxPolls} status checks.`,
      );
    }

    await sleep(
      pollInterval,
    );

    transaction =
      await getSep6Transaction(
        discovery,
        session,
        withdrawal
          .anchorTransactionId,
        fetchImpl,
      );
  }

  const proof =
    finalizeCompletedOfframp({
      config:
        input.config,

      sourceAccount:
        input.sourceAccount,

      quote,
      withdrawal,
      transaction,
      horizon,

      ...(input.now ===
        undefined
        ? {}
        : {
            now:
              input.now,
          }),
    });

  await input.onProgress?.(
    "TRY_PAID",
  );

  return proof;
}