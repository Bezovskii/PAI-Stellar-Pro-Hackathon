import assert from "node:assert/strict";
import test from "node:test";

import type {
  CanonicalAgreementReviewView,
  CanonicalAgreementTerms,
} from "@pai/agreement-contract";

import {
  computeCanonicalAgreementHash,
} from "../src/agreements/canonical.js";

import {
  createStellarFundingService,
} from "../src/stellar-funding/service.js";

import type {
  VerifiedAssetAcquisitionProof,
} from "../src/try-anchor/types.js";

const PAYER =
  "GC4CKF3TLUAXUG5CR7WIQTRXEQYQOV76TT4FTZHIEY7SET7A75OF3KRV";

const PAYEE =
  "GBJKQCGXP5PYCXA25HQNYJB63BJ7HMDAFNM6AFZARGBP7P7JBSLO2L6S";

const ISSUER =
  "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5";

const SAC =
  "CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA";

const TERMS:
  CanonicalAgreementTerms = {
    title:
      "Funding service proof",

    description:
      "Canonical funding service test.",

    totalValue:
      "1",

    settlementAsset:
      "USDC",

    deadline:
      null,

    approvalWindow:
      null,

    milestones: [
      {
        amount:
          "1",

        deliverable:
          "Deliver work.",

        acceptanceCriteria:
          "Client accepts.",

        deadline:
          null,
      },
    ],
  };

const AGREEMENT_HASH =
  computeCanonicalAgreementHash(
    TERMS,
  );

function review():
  CanonicalAgreementReviewView {
  return {
    reference: {
      agreementId:
        "agreement-1",

      agreementVersion:
        4,

      agreementHash:
        AGREEMENT_HASH,
    },

    terms:
      TERMS,

    party: {
      partyId:
        "party-client",

      role:
        "CLIENT",

      displayName:
        "Client",
    },

    status:
      "READY_TO_FUND",

    acceptanceComplete:
      true,
  } as unknown as CanonicalAgreementReviewView;
}

function proof():
  VerifiedAssetAcquisitionProof {
  return {
    version:
      "pai.asset-acquisition-proof.v1",

    status:
      "verified",

    provider:
      "tr-mock-anchor",

    environment:
      "stellar-testnet",

    rail:
      "sep6-deposit-exchange",

    source: {
      asset:
        "iso4217:TRY",

      amount:
        "50",
    },

    settlement: {
      network:
        "stellar-testnet",

      asset: {
        code:
          "USDC",

        issuer:
          ISSUER,
      },

      amount:
        "1.0000000",

      destinationAccount:
        PAYER,

      spendableBalance:
        "2.0000000",
    },

    references: {
      quoteId:
        "quote-1",

      anchorTransactionId:
        "anchor-1",

      stellarTransactionHash:
        "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",

      ledger:
        12345,
    },

    verifiedAt:
      "2026-09-19T15:00:00.000Z",
  };
}

test(
  "drives canonical TRY funding through every truthful funding state",
  async () => {
    const states:
      string[] = [];

    let targetAmount:
      string |
      undefined;

    let destination:
      string |
      undefined;

    let maxTry:
      string |
      undefined;

    let tokenSeen =
      "";

    let bindSeen =
      false;

    const service =
      createStellarFundingService({
        assetIssuer:
          ISSUER,

        assetSac:
          SAC,

        generateFundingId:
          () =>
            "funding-1",

        now:
          () =>
            new Date(
              "2026-09-19T15:00:00.000Z",
            ),

        async getCanonicalAgreementReview(
          input,
        ) {
          tokenSeen =
            input.partyAccessToken;

          return review();
        },

        async getCanonicalAgreementLifecycle() {
          return {
            reference:
              review().reference,

            status:
              "READY_TO_FUND",

            walletBindingComplete:
              true,
          };
        },

        async prepareEscrow(
          intent,
        ) {
          assert.equal(
            intent.amountBaseUnits,
            "10000000",
          );

          return "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4";
        },

        async acquireTryToUsdc(
          input,
        ) {
          targetAmount =
            input.targetBuyAmountUsdc;

          destination =
            input.destinationAccount;

          maxTry =
            input.maxSourceAmountTry;

          for (
            const state of [
              "QUOTING",
              "ANCHOR_PENDING",
              "STELLAR_RECEIVED",
            ] as const
          ) {
            states.push(
              state,
            );

            await input
              .onProgress(
                state,
              );
          }

          return proof();
        },

        async bindAcquisition(
          intent,
          acquisitionProof,
        ) {
          bindSeen =
            true;

          assert.equal(
            intent.amountBaseUnits,
            "10000000",
          );

          assert.equal(
            acquisitionProof
              .settlement
              .destinationAccount,
            PAYER,
          );
        },

        async executeFunding(
          input,
        ) {
          states.push(
            "ESCROW_FUNDING",
          );

          assert.equal(
            input.intent
              .payerAccount,
            PAYER,
          );

          assert.equal(
            input.contractId,
            "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4",
          );

          return {
            transactionHash:
              "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",

            ledger:
              54321,
          };
        },
      });

    const prepared =
      await service
        .prepareFunding({
          agreementId:
            "agreement-1",

          partyAccessToken:
            "party-token",

          sourceAsset:
            "TRY",

          payerAccount:
            PAYER,

          recipientAccount:
            PAYEE,

          maxSourceAmountTry:
            "55",
        });

    assert.equal(
      prepared.state,
      "PREPARING",
    );

    const funded =
      await service
        .runFunding(
          prepared.fundingId,
        );

    assert.equal(
      tokenSeen,
      "party-token",
    );

    assert.equal(
      targetAmount,
      "1",
    );

    assert.equal(
      destination,
      PAYER,
    );

    assert.equal(
      maxTry,
      "55",
    );

    assert.equal(
      bindSeen,
      true,
    );

    assert.deepEqual(
      states,
      [
        "QUOTING",
        "ANCHOR_PENDING",
        "STELLAR_RECEIVED",
        "ESCROW_FUNDING",
      ],
    );

    assert.equal(
      funded.state,
      "FUNDED",
    );

    assert.equal(
      funded.retryable,
      false,
    );

    assert.deepEqual(
      funded.transaction,
      {
        hash:
          "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",

        ledger:
          54321,
      },
    );
  },
);

test(
  "records execution failure as retryable FAILED and permits frozen retry",
  async () => {
    let executeAttempts =
      0;

    const service =
      createStellarFundingService({
        assetIssuer:
          ISSUER,

        assetSac:
          SAC,

        generateFundingId:
          () =>
            "funding-retry",

        async getCanonicalAgreementReview() {
          return review();
        },

        async getCanonicalAgreementLifecycle() {
          return {
            reference:
              review().reference,

            status:
              "READY_TO_FUND",

            walletBindingComplete:
              true,
          };
        },

        async prepareEscrow() {
          return "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4";
        },

        async acquireTryToUsdc(
          input,
        ) {
          await input
            .onProgress(
              "QUOTING",
            );

          await input
            .onProgress(
              "ANCHOR_PENDING",
            );

          await input
            .onProgress(
              "STELLAR_RECEIVED",
            );

          return proof();
        },

        async bindAcquisition() {
          return;
        },

        async executeFunding() {
          executeAttempts +=
            1;

          if (
            executeAttempts ===
            1
          ) {
            throw new Error(
              "temporary RPC failure",
            );
          }

          return {
            transactionHash:
              "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",

            ledger:
              60000,
          };
        },
      });

    const prepared =
      await service
        .prepareFunding({
          agreementId:
            "agreement-1",

          partyAccessToken:
            "party-token",

          sourceAsset:
            "TRY",

          payerAccount:
            PAYER,

          recipientAccount:
            PAYEE,
        });

    const failed =
      await service
        .runFunding(
          prepared.fundingId,
        );

    assert.equal(
      failed.state,
      "FAILED",
    );

    assert.equal(
      failed.retryable,
      true,
    );

    const reset =
      await service
        .retryFunding({
          agreementId:
            "agreement-1",

          fundingId:
            prepared.fundingId,

          partyAccessToken:
            "party-token",
        });

    assert.equal(
      reset.state,
      "PREPARING",
    );

    const funded =
      await service
        .runFunding(
          prepared.fundingId,
        );

    assert.equal(
      funded.state,
      "FUNDED",
    );

    assert.equal(
      executeAttempts,
      2,
    );
  },
);

test(
  "rejects canonical lifecycle mismatch before any funding record is created",
  async () => {
    let acquisitionCalled =
      false;

    const service =
      createStellarFundingService({
        assetIssuer:
          ISSUER,

        assetSac:
          SAC,

        async getCanonicalAgreementReview() {
          return review();
        },

        async getCanonicalAgreementLifecycle() {
          return {
            reference: {
              ...review().reference,

              agreementVersion:
                999,
            },

            status:
              "READY_TO_FUND",

            walletBindingComplete:
              true,
          };
        },

        async prepareEscrow() {
          throw new Error(
            "must not run",
          );
        },

        async acquireTryToUsdc() {
          acquisitionCalled =
            true;

          throw new Error(
            "must not run",
          );
        },

        async bindAcquisition() {
          throw new Error(
            "must not run",
          );
        },

        async executeFunding() {
          throw new Error(
            "must not run",
          );
        },
      });

    await assert.rejects(
      service.prepareFunding({
        agreementId:
          "agreement-1",

        partyAccessToken:
          "party-token",

        sourceAsset:
          "TRY",

        payerAccount:
          PAYER,

        recipientAccount:
          PAYEE,
      }),
      /references do not match/,
    );

    assert.equal(
      acquisitionCalled,
      false,
    );
  },
);