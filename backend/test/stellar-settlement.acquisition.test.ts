import assert from "node:assert/strict";
import test from "node:test";

import type {
  VerifiedAssetAcquisitionProof,
} from "../src/try-anchor/types.js";

import {
  bindVerifiedAcquisitionToIntent,
} from "../src/stellar-settlement/acquisition.js";

import {
  createStellarSettlementIntent,
} from "../src/stellar-settlement/intent.js";

const intent =
  createStellarSettlementIntent({
    paiAgreementId:
      "agreement-123",

    agreementVersion:
      "7",

    agreementHash:
      "1b9ef4a68698069e9f40be0a21ec619627f772ddad40a75a3c99cdfc30816043",

    payerAccount:
      "GC4CKF3TLUAXUG5CR7WIQTRXEQYQOV76TT4FTZHIEY7SET7A75OF3KRV",

    recipientAccount:
      "GBJKQCGXP5PYCXA25HQNYJB63BJ7HMDAFNM6AFZARGBP7P7JBSLO2L6S",

    assetIssuer:
      "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5",

    assetSac:
      "CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA",

    amountBaseUnits:
      "10000000",
  });

const BASE_PROOF:
  VerifiedAssetAcquisitionProof = {
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
        "38.4500000",
    },

    settlement: {
      network:
        "stellar-testnet",

      asset: {
        code:
          "USDC",

        issuer:
          "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5",
      },

      amount:
        "1.0000000",

      destinationAccount:
        "GC4CKF3TLUAXUG5CR7WIQTRXEQYQOV76TT4FTZHIEY7SET7A75OF3KRV",

      spendableBalance:
        "20.0198045",
    },

    references: {
      quoteId:
        "quote-1",

      anchorTransactionId:
        "anchor-1",

      stellarTransactionHash:
        "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",

      ledger:
        4761000,
    },

    verifiedAt:
      "2026-09-19T14:00:00.000Z",
  };

test(
  "binds independently verified TRY acquisition to the exact Stellar settlement intent",
  () => {
    const binding =
      bindVerifiedAcquisitionToIntent(
        intent,
        BASE_PROOF,
      );

    assert.equal(
      binding.version,
      "pai.stellar-acquisition-binding.v1",
    );

    assert.equal(
      binding.acquiredAmountBaseUnits,
      "10000000",
    );

    assert.equal(
      binding.spendableBalanceBaseUnits,
      "200198045",
    );

    assert.equal(
      binding.intent.executionBindingHash,
      intent.executionBindingHash,
    );

    assert.equal(
      binding.ledger,
      4761000,
    );
  },
);

test(
  "rejects acquisition delivered to a different Stellar account",
  () => {
    assert.throws(
      () =>
        bindVerifiedAcquisitionToIntent(
          intent,
          {
            ...BASE_PROOF,

            settlement: {
              ...BASE_PROOF.settlement,

              destinationAccount:
                "GBJKQCGXP5PYCXA25HQNYJB63BJ7HMDAFNM6AFZARGBP7P7JBSLO2L6S",
            },
          },
        ),
      /destination must be the settlement payer account/,
    );
  },
);

test(
  "rejects a different USDC issuer",
  () => {
    assert.throws(
      () =>
        bindVerifiedAcquisitionToIntent(
          intent,
          {
            ...BASE_PROOF,

            settlement: {
              ...BASE_PROOF.settlement,

              asset: {
                ...BASE_PROOF.settlement.asset,

                issuer:
                  "GC4CKF3TLUAXUG5CR7WIQTRXEQYQOV76TT4FTZHIEY7SET7A75OF3KRV",
              },
            },
          },
        ),
      /issuer does not match/,
    );
  },
);

test(
  "rejects an acquired amount that differs from the canonical settlement amount",
  () => {
    assert.throws(
      () =>
        bindVerifiedAcquisitionToIntent(
          intent,
          {
            ...BASE_PROOF,

            settlement: {
              ...BASE_PROOF.settlement,

              amount:
                "0.9999999",
            },
          },
        ),
      /does not exactly match/,
    );
  },
);

test(
  "rejects insufficient spendable USDC even after a verified anchor transaction",
  () => {
    assert.throws(
      () =>
        bindVerifiedAcquisitionToIntent(
          intent,
          {
            ...BASE_PROOF,

            settlement: {
              ...BASE_PROOF.settlement,

              spendableBalance:
                "0.9999999",
            },
          },
        ),
      /insufficient for escrow funding/,
    );
  },
);