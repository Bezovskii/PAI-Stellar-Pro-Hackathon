import {
  randomUUID,
} from "node:crypto";

import type {
  CanonicalAgreementReviewView,
} from "@pai/agreement-contract";

import type {
  VerifiedAssetAcquisitionProof,
} from "../try-anchor/types.js";

import {
  createStellarIntentFromCanonicalAgreement,
} from "../stellar-settlement/canonical-intent.js";

import {
  STELLAR_USDC_DECIMALS,
  type StellarSettlementIntent,
} from "../stellar-settlement/intent.js";

export const STELLAR_FUNDING_VERSION =
  "pai.stellar-funding.v1" as const;

export type StellarFundingState =
  | "PREPARING"
  | "QUOTING"
  | "ANCHOR_PENDING"
  | "STELLAR_RECEIVED"
  | "ESCROW_FUNDING"
  | "FUNDED"
  | "FAILED";

export interface StellarFundingLifecycleView {
  readonly reference: {
    readonly agreementId:
      string;

    readonly agreementVersion:
      number;

    readonly agreementHash:
      string;
  };

  readonly status:
    string;

  readonly walletBindingComplete:
    boolean;
}

export interface StartStellarFundingInput {
  readonly agreementId:
    string;

  readonly partyAccessToken:
    string;

  readonly sourceAsset:
    "TRY";

  readonly payerAccount:
    string;

  readonly recipientAccount:
    string;

  readonly maxSourceAmountTry?:
    string;
}

export interface StellarFundingRecord {
  readonly version:
    typeof STELLAR_FUNDING_VERSION;

  readonly fundingId:
    string;

  readonly agreementId:
    string;

  readonly state:
    StellarFundingState;

  readonly retryable:
    boolean;

  readonly createdAt:
    string;

  readonly updatedAt:
    string;

  readonly failure?:
    {
      readonly code:
        string;

      readonly message:
        string;
    };

  readonly transaction?:
    {
      readonly hash:
        string;

      readonly ledger:
        number;
    };
}

export interface StellarFundingAcquisitionInput {
  readonly targetBuyAmountUsdc:
    string;

  readonly destinationAccount:
    string;

  readonly maxSourceAmountTry?:
    string;

  readonly onProgress:
    (
      state:
        | "QUOTING"
        | "ANCHOR_PENDING"
        | "STELLAR_RECEIVED",
    ) =>
      void |
      Promise<void>;
}

export interface StellarFundingExecutionResult {
  readonly transactionHash:
    string;

  readonly ledger:
    number;
}

export interface StellarFundingDependencies {
  readonly assetIssuer:
    string;

  readonly assetSac:
    string;

  readonly getCanonicalAgreementReview:
    (
      input: {
        readonly agreementId:
          string;

        readonly partyAccessToken:
          string;
      },
    ) => Promise<CanonicalAgreementReviewView>;

  readonly getCanonicalAgreementLifecycle:
    (
      input: {
        readonly agreementId:
          string;
      },
    ) => Promise<StellarFundingLifecycleView>;

  readonly prepareEscrow:
    (
      intent:
        StellarSettlementIntent,
    ) => Promise<string>;

  readonly acquireTryToUsdc:
    (
      input:
        StellarFundingAcquisitionInput,
    ) => Promise<VerifiedAssetAcquisitionProof>;

  readonly bindAcquisition:
    (
      intent:
        StellarSettlementIntent,

      proof:
        VerifiedAssetAcquisitionProof,
    ) =>
      void |
      Promise<void>;

  readonly executeFunding:
    (
      input: {
        readonly intent:
          StellarSettlementIntent;

        readonly proof:
          VerifiedAssetAcquisitionProof;

        readonly contractId:
          string;
      },
    ) => Promise<StellarFundingExecutionResult>;

  readonly now?:
    () => Date;

  readonly generateFundingId?:
    () => string;
}

interface InternalFundingRecord {
  public:
    StellarFundingRecord;

  readonly request:
    StartStellarFundingInput;

  readonly intent:
    StellarSettlementIntent;
}

class FundingAgreementChangedError
  extends Error {
  constructor() {
    super(
      "Canonical agreement or Stellar execution binding changed before funding.",
    );

    this.name =
      "FundingAgreementChangedError";
  }
}

function normalizeHash(
  value: string,
): string {
  return value
    .trim()
    .replace(
      /^0x/i,
      "",
    )
    .toLowerCase();
}

function sameReference(
  left:
    StellarFundingLifecycleView["reference"],

  right:
    CanonicalAgreementReviewView["reference"],
): boolean {
  return (
    left.agreementId ===
      right.agreementId &&
    left.agreementVersion ===
      right.agreementVersion &&
    normalizeHash(
      left.agreementHash,
    ) ===
      normalizeHash(
        right.agreementHash,
      )
  );
}

function baseUnitsToDecimal(
  amountBaseUnits:
    string,
): string {
  const units =
    BigInt(
      amountBaseUnits,
    );

  const scale =
    10n **
    BigInt(
      STELLAR_USDC_DECIMALS,
    );

  const whole =
    units /
    scale;

  const remainder =
    units %
    scale;

  if (
    remainder ===
    0n
  ) {
    return whole.toString();
  }

  const fraction =
    remainder
      .toString()
      .padStart(
        STELLAR_USDC_DECIMALS,
        "0",
      )
      .replace(
        /0+$/,
        "",
      );

  return `${whole.toString()}.${fraction}`;
}

function requirePartyToken(
  value: string,
): string {
  const normalized =
    value.trim();

  if (
    normalized.length ===
    0
  ) {
    throw new Error(
      "x-pai-party-token is required.",
    );
  }

  return normalized;
}

function errorMessage(
  error: unknown,
): string {
  if (
    error instanceof
    Error
  ) {
    return error.message;
  }

  return "Unknown Stellar funding failure.";
}

export function createStellarFundingService(
  dependencies:
    StellarFundingDependencies,
) {
  const records =
    new Map<
      string,
      InternalFundingRecord
    >();

  const now =
    dependencies.now ??
    (() => new Date());

  const generateFundingId =
    dependencies.generateFundingId ??
    randomUUID;

  function updateRecord(
    fundingId:
      string,

    patch:
      Partial<
        Pick<
          StellarFundingRecord,
          | "state"
          | "retryable"
          | "failure"
          | "transaction"
        >
      >,
  ): StellarFundingRecord {
    const existing =
      records.get(
        fundingId,
      );

    if (
      existing ===
      undefined
    ) {
      throw new Error(
        "Stellar funding record not found.",
      );
    }

    const updatedPublic:
      StellarFundingRecord = {
      ...existing.public,
      ...patch,

      updatedAt:
        now().toISOString(),
    };

    records.set(
      fundingId,
      {
        ...existing,
        public:
          updatedPublic,
      },
    );

    return updatedPublic;
  }

  async function deriveIntent(
    request:
      StartStellarFundingInput,
  ): Promise<StellarSettlementIntent> {
    const partyAccessToken =
      requirePartyToken(
        request.partyAccessToken,
      );

    const [
      review,
      lifecycle,
    ] =
      await Promise.all([
        dependencies
          .getCanonicalAgreementReview({
            agreementId:
              request.agreementId,

            partyAccessToken,
          }),

        dependencies
          .getCanonicalAgreementLifecycle({
            agreementId:
              request.agreementId,
          }),
      ]);

    if (
      !sameReference(
        lifecycle.reference,
        review.reference,
      )
    ) {
      throw new Error(
        "Canonical review and lifecycle references do not match.",
      );
    }

    return createStellarIntentFromCanonicalAgreement({
      reference:
        review.reference,

      terms:
        review.terms,

      lifecycle: {
        status:
          lifecycle.status,

        walletBindingComplete:
          lifecycle.walletBindingComplete,
      },

      payerAccount:
        request.payerAccount,

      recipientAccount:
        request.recipientAccount,

      assetIssuer:
        dependencies.assetIssuer,

      assetSac:
        dependencies.assetSac,
    });
  }

  async function authenticateRecord(
    agreementId:
      string,

    fundingId:
      string,

    partyAccessToken:
      string,
  ): Promise<InternalFundingRecord> {
    const record =
      records.get(
        fundingId,
      );

    if (
      record ===
        undefined ||
      record.public
        .agreementId !==
        agreementId
    ) {
      throw new Error(
        "Stellar funding record not found.",
      );
    }

    await dependencies
      .getCanonicalAgreementReview({
        agreementId,

        partyAccessToken:
          requirePartyToken(
            partyAccessToken,
          ),
      });

    return record;
  }

  async function prepareFunding(
    input:
      StartStellarFundingInput,
  ): Promise<StellarFundingRecord> {
    if (
      input.sourceAsset !==
      "TRY"
    ) {
      throw new Error(
        "Stellar funding sourceAsset must be TRY.",
      );
    }

    const request:
      StartStellarFundingInput = {
      ...input,

      partyAccessToken:
        requirePartyToken(
          input.partyAccessToken,
        ),
    };

    const intent =
      await deriveIntent(
        request,
      );

    const timestamp =
      now().toISOString();

    const fundingId =
      generateFundingId();

    const publicRecord:
      StellarFundingRecord = {
      version:
        STELLAR_FUNDING_VERSION,

      fundingId,

      agreementId:
        request.agreementId,

      state:
        "PREPARING",

      retryable:
        false,

      createdAt:
        timestamp,

      updatedAt:
        timestamp,
    };

    records.set(
      fundingId,
      {
        public:
          publicRecord,

        request,
        intent,
      },
    );

    return publicRecord;
  }

  async function runFunding(
    fundingId:
      string,
  ): Promise<StellarFundingRecord> {
    const record =
      records.get(
        fundingId,
      );

    if (
      record ===
      undefined
    ) {
      throw new Error(
        "Stellar funding record not found.",
      );
    }

    if (
      record.public.state !==
      "PREPARING"
    ) {
      throw new Error(
        "Stellar funding record is not ready to run.",
      );
    }

    try {
      const contractId =
        await dependencies
          .prepareEscrow(
            record.intent,
          );

      const proof =
        await dependencies
          .acquireTryToUsdc({
            targetBuyAmountUsdc:
              baseUnitsToDecimal(
                record.intent
                  .amountBaseUnits,
              ),

            destinationAccount:
              record.intent
                .payerAccount,

            ...(
              record.request
                .maxSourceAmountTry ===
              undefined
                ? {}
                : {
                    maxSourceAmountTry:
                      record.request
                        .maxSourceAmountTry,
                  }
            ),

            onProgress:
              async (
                state,
              ) => {
                updateRecord(
                  fundingId,
                  {
                    state,
                  },
                );
              },
          });

      await dependencies
        .bindAcquisition(
          record.intent,
          proof,
        );

      updateRecord(
        fundingId,
        {
          state:
            "ESCROW_FUNDING",
        },
      );

      const currentIntent =
        await deriveIntent(
          record.request,
        );

      if (
        currentIntent
          .executionBindingHash !==
          record.intent
            .executionBindingHash ||
        currentIntent
          .agreementHash !==
          record.intent
            .agreementHash
      ) {
        throw new FundingAgreementChangedError();
      }

      const execution =
        await dependencies
          .executeFunding({
            intent:
              record.intent,

            proof,

            contractId,
          });

      return updateRecord(
        fundingId,
        {
          state:
            "FUNDED",

          retryable:
            false,

          transaction: {
            hash:
              execution
                .transactionHash,

            ledger:
              execution
                .ledger,
          },
        },
      );
    } catch (error) {
      return updateRecord(
        fundingId,
        {
          state:
            "FAILED",

          retryable:
            !(
              error instanceof
              FundingAgreementChangedError
            ),

          failure: {
            code:
              error instanceof
              FundingAgreementChangedError
                ? "AGREEMENT_CHANGED"
                : "STELLAR_FUNDING_FAILED",

            message:
              errorMessage(
                error,
              ),
          },
        },
      );
    }
  }

  async function getFunding(
    input: {
      readonly agreementId:
        string;

      readonly fundingId:
        string;

      readonly partyAccessToken:
        string;
    },
  ): Promise<StellarFundingRecord> {
    const record =
      await authenticateRecord(
        input.agreementId,
        input.fundingId,
        input.partyAccessToken,
      );

    return record.public;
  }

  async function retryFunding(
    input: {
      readonly agreementId:
        string;

      readonly fundingId:
        string;

      readonly partyAccessToken:
        string;
    },
  ): Promise<StellarFundingRecord> {
    const existing =
      await authenticateRecord(
        input.agreementId,
        input.fundingId,
        input.partyAccessToken,
      );

    if (
      existing.public.state !==
        "FAILED" ||
      existing.public.retryable !==
        true
    ) {
      throw new Error(
        "Only retryable FAILED Stellar funding may be retried.",
      );
    }

    const currentIntent =
      await deriveIntent({
        ...existing.request,

        partyAccessToken:
          input.partyAccessToken,
      });

    if (
      currentIntent
        .executionBindingHash !==
        existing.intent
          .executionBindingHash ||
      currentIntent
        .agreementHash !==
        existing.intent
          .agreementHash
    ) {
      throw new FundingAgreementChangedError();
    }

    const timestamp =
      now().toISOString();

    const reset:
      StellarFundingRecord = {
      version:
        STELLAR_FUNDING_VERSION,

      fundingId:
        existing.public
          .fundingId,

      agreementId:
        existing.public
          .agreementId,

      state:
        "PREPARING",

      retryable:
        false,

      createdAt:
        existing.public
          .createdAt,

      updatedAt:
        timestamp,
    };

    records.set(
      input.fundingId,
      {
        ...existing,

        request: {
          ...existing.request,

          partyAccessToken:
            input.partyAccessToken,
        },

        public:
          reset,
      },
    );

    return reset;
  }

  return {
    prepareFunding,
    runFunding,
    getFunding,
    retryFunding,
  };
}

export type StellarFundingService =
  ReturnType<
    typeof createStellarFundingService
  >;