import assert from "node:assert/strict";
import test from "node:test";

import {
  canonicalStellarExecutionBinding,
  createStellarSettlementIntent,
} from "../src/stellar-settlement/intent.js";

const BASE_INPUT = {
  paiAgreementId:
    "agreement-123",

  agreementVersion:
    "7",

  agreementHash:
    "0x1b9ef4a68698069e9f40be0a21ec619627f772ddad40a75a3c99cdfc30816043",

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
} as const;

test(
  "creates a deterministic Stellar settlement intent",
  () => {
    const intent =
      createStellarSettlementIntent(
        BASE_INPUT,
      );

    assert.equal(
      intent.version,
      "pai.stellar-settlement-intent.v1",
    );

    assert.equal(
      intent.network,
      "stellar-testnet",
    );

    assert.equal(
      intent.agreementHash,
      "1b9ef4a68698069e9f40be0a21ec619627f772ddad40a75a3c99cdfc30816043",
    );

    assert.equal(
      intent.settlementAsset.code,
      "USDC",
    );

    assert.equal(
      intent.settlementAsset.decimals,
      7,
    );

    assert.equal(
      intent.amountBaseUnits,
      "10000000",
    );

    assert.equal(
      intent.executionBindingHash,
      "4a2781d3c9e9dc8c8b7b667e3511a0e2409731ec5b2901913aab5c8989c80196",
    );
  },
);

test(
  "execution binding covers the exact execution tuple",
  () => {
    const original =
      createStellarSettlementIntent(
        BASE_INPUT,
      );

    const changedAmount =
      createStellarSettlementIntent({
        ...BASE_INPUT,
        amountBaseUnits:
          "10000001",
      });

    const changedRecipient =
      createStellarSettlementIntent({
        ...BASE_INPUT,
        recipientAccount:
          "GC4CKF3TLUAXUG5CR7WIQTRXEQYQOV76TT4FTZHIEY7SET7A75OF3KRV",
      });

    assert.notEqual(
      original.executionBindingHash,
      changedAmount.executionBindingHash,
    );

    assert.notEqual(
      original.executionBindingHash,
      changedRecipient.executionBindingHash,
    );

    const canonical =
      canonicalStellarExecutionBinding({
        network:
          original.network,

        paiAgreementId:
          original.paiAgreementId,

        agreementVersion:
          original.agreementVersion,

        agreementHash:
          original.agreementHash,

        payerAccount:
          original.payerAccount,

        recipientAccount:
          original.recipientAccount,

        assetCode:
          original.settlementAsset.code,

        assetIssuer:
          original.settlementAsset.issuer,

        assetSac:
          original.settlementAsset.sac,

        amountBaseUnits:
          original.amountBaseUnits,
      });

    assert.match(
      canonical,
      /"version":"pai\.stellar-execution-binding\.v1"/,
    );
  },
);

test(
  "rejects malformed or zero-value execution inputs",
  () => {
    assert.throws(
      () =>
        createStellarSettlementIntent({
          ...BASE_INPUT,
          amountBaseUnits:
            "0",
        }),
      /amountBaseUnits must be a positive integer string/,
    );

    assert.throws(
      () =>
        createStellarSettlementIntent({
          ...BASE_INPUT,
          payerAccount:
            "not-a-stellar-account",
        }),
      /payerAccount must be a Stellar G-account/,
    );

    assert.throws(
      () =>
        createStellarSettlementIntent({
          ...BASE_INPUT,
          agreementHash:
            "1234",
        }),
      /agreementHash must be a 32-byte hex value/,
    );
  },
);
