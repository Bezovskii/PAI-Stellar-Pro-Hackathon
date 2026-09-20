import {
  discoverAnchor,
} from "./discovery.js";

import {
  TryAnchorError,
} from "./error.js";

import {
  verifySpendableAcquisition,
} from "./proof.js";

import {
  authenticateSep10,
} from "./sep10.js";

import {
  ensureKycAccepted,
} from "./sep12.js";

import {
  createFirmQuote,
} from "./sep38.js";

import {
  createDepositExchange,
  getSep6Transaction,
  simulateSandboxBankTransfer,
} from "./sep6.js";

import type {
  FetchLike,
  KycFieldValues,
  Sep10Signer,
  TryAnchorConfig,
  VerifiedAssetAcquisitionProof,
} from "./types.js";

export type TryAcquisitionProgress =
  | "QUOTING"
  | "ANCHOR_PENDING"
  | "STELLAR_RECEIVED";

interface AcquireTryToStellarUsdcBaseInput {
  readonly config:
    TryAnchorConfig;

  readonly signer:
    Sep10Signer;

  readonly destinationAccount:
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
        TryAcquisitionProgress,
    ) =>
      void |
      Promise<void>;

  readonly now?:
    () => Date;
}

export type AcquireTryToStellarUsdcInput =
  AcquireTryToStellarUsdcBaseInput &
    (
      | {
          readonly sellAmountTry:
            string;

          readonly targetBuyAmountUsdc?:
            never;

          readonly maxSourceAmountTry?:
            never;
        }
      | {
          readonly sellAmountTry?:
            never;

          readonly targetBuyAmountUsdc:
            string;

          readonly maxSourceAmountTry?:
            string;
        }
    );

const MAX_TRANSACTION_POLLS =
  30;

const TRANSACTION_POLL_INTERVAL_MS =
  1000;

async function sleep(
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

export async function acquireTryToStellarUsdc(
  input:
    AcquireTryToStellarUsdcInput,
): Promise<VerifiedAssetAcquisitionProof> {
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

      ...(
        input.customerType ===
        undefined
          ? {}
          : {
              customerType:
                input.customerType,
            }
      ),

      ...(
        input.kycFields ===
        undefined
          ? {}
          : {
              fields:
                input.kycFields,
            }
      ),

      fetchImpl,
    });

  await input.onProgress?.(
    "QUOTING",
  );

  const quote =
    input.targetBuyAmountUsdc !==
    undefined
      ? await createFirmQuote({
          config:
            input.config,

          discovery,
          session,

          buyAmountUsdc:
            input.targetBuyAmountUsdc,

          ...(
            input.maxSourceAmountTry ===
            undefined
              ? {}
              : {
                  maxSourceAmountTry:
                    input.maxSourceAmountTry,
                }
          ),

          fetchImpl,

          ...(
            input.now ===
            undefined
              ? {}
              : {
                  now:
                    input.now,
                }
          ),
        })
      : await createFirmQuote({
          config:
            input.config,

          discovery,
          session,

          sellAmountTry:
            input.sellAmountTry,

          fetchImpl,

          ...(
            input.now ===
            undefined
              ? {}
              : {
                  now:
                    input.now,
                }
          ),
        });

  await input.onProgress?.(
    "ANCHOR_PENDING",
  );

  const deposit =
    await createDepositExchange({
      config:
        input.config,

      discovery,
      session,
      kyc,
      quote,

      destinationAccount:
        input.destinationAccount,

      fetchImpl,
    });

  await simulateSandboxBankTransfer(
    discovery,
    session,
    deposit.anchorTransactionId,
    fetchImpl,
  );

  let transaction =
    await getSep6Transaction(
      discovery,
      session,
      deposit.anchorTransactionId,
      fetchImpl,
    );

  for (
    let attempt = 1;
    transaction.status.toLowerCase() !==
      "completed";
    attempt += 1
  ) {
    if (
      attempt >=
      MAX_TRANSACTION_POLLS
    ) {
      throw new TryAnchorError(
        "ACQUISITION_NOT_READY",
        `Anchor transaction ${deposit.anchorTransactionId} did not complete after ${MAX_TRANSACTION_POLLS} status checks.`,
      );
    }

    await sleep(
      TRANSACTION_POLL_INTERVAL_MS,
    );

    transaction =
      await getSep6Transaction(
        discovery,
        session,
        deposit.anchorTransactionId,
        fetchImpl,
      );
  }

  const proof =
    await verifySpendableAcquisition({
      config:
        input.config,

      quote,
      deposit,
      transaction,
      fetchImpl,

      ...(
        input.now ===
        undefined
          ? {}
          : {
              now:
                input.now,
            }
      ),
    });

  await input.onProgress?.(
    "STELLAR_RECEIVED",
  );

  return proof;
}