import assert from "node:assert/strict";
import test from "node:test";

import type {
  CanonicalAgreementTerms,
} from "@pai/agreement-contract";

import {
  computeCanonicalAgreementHash,
} from "../src/agreements/canonical.js";

import {
  createStellarIntentFromCanonicalAgreement,
  stellarDecimalToBaseUnits,
} from "../src/stellar-settlement/canonical-intent.js";

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
      "Stellar settlement proof",

    description:
      "Client hires contractor for the agreed deliverable.",

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
          "Deliver the agreed work.",

        acceptanceCriteria:
          "Client confirms delivery.",

        deadline:
          null,
      },
    ],
  };

const AGREEMENT_HASH =
  computeCanonicalAgreementHash(
    TERMS,
  );

function makeInput(
  overrides: {
    readonly terms?:
      CanonicalAgreementTerms;

    readonly status?:
      string;

    readonly walletBindingComplete?:
      boolean;

    readonly agreementHash?:
      string;
  } = {},
) {
  const terms =
    overrides.terms ??
    TERMS;

  return {
    reference: {
      agreementId:
        "pai-stellar-proof-1",

      agreementVersion:
        3,

      agreementHash:
        overrides.agreementHash ??
        computeCanonicalAgreementHash(
          terms,
        ),
    },

    terms,

    lifecycle: {
      status:
        overrides.status ??
        "READY_TO_FUND",

      walletBindingComplete:
        overrides.walletBindingComplete ??
        true,
    },

    payerAccount:
      PAYER,

    recipientAccount:
      PAYEE,

    assetIssuer:
      ISSUER,

    assetSac:
      SAC,
  };
}

test(
  "creates Stellar settlement intent from canonical READY_TO_FUND agreement",
  () => {
    const intent =
      createStellarIntentFromCanonicalAgreement(
        makeInput(),
      );

    assert.equal(
      intent.paiAgreementId,
      "pai-stellar-proof-1",
    );

    assert.equal(
      intent.agreementVersion,
      "3",
    );

    assert.equal(
      intent.agreementHash,
      AGREEMENT_HASH
        .replace(
          /^0x/i,
          "",
        )
        .toLowerCase(),
    );

    assert.equal(
      intent.amountBaseUnits,
      "10000000",
    );

    assert.equal(
      intent.settlementAsset.code,
      "USDC",
    );

    assert.equal(
      intent.payerAccount,
      PAYER,
    );

    assert.equal(
      intent.recipientAccount,
      PAYEE,
    );
  },
);

test(
  "converts canonical decimal USDC value exactly to Stellar base units",
  () => {
    assert.equal(
      stellarDecimalToBaseUnits(
        "1",
      ),
      "10000000",
    );

    assert.equal(
      stellarDecimalToBaseUnits(
        "1.25",
      ),
      "12500000",
    );

    assert.equal(
      stellarDecimalToBaseUnits(
        "0.0000001",
      ),
      "1",
    );
  },
);

test(
  "rejects canonical agreement before READY_TO_FUND",
  () => {
    assert.throws(
      () =>
        createStellarIntentFromCanonicalAgreement(
          makeInput({
            status:
              "ACCEPTED",
          }),
        ),
      /must be READY_TO_FUND/,
    );
  },
);

test(
  "rejects incomplete canonical wallet binding",
  () => {
    assert.throws(
      () =>
        createStellarIntentFromCanonicalAgreement(
          makeInput({
            walletBindingComplete:
              false,
          }),
        ),
      /wallet binding must be complete/,
    );
  },
);

test(
  "rejects canonical terms that no longer match agreementHash",
  () => {
    assert.throws(
      () =>
        createStellarIntentFromCanonicalAgreement(
          makeInput({
            agreementHash:
              "ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
          }),
        ),
      /terms do not match/,
    );
  },
);

test(
  "rejects non-USDC canonical settlement asset",
  () => {
    const terms = {
      ...TERMS,

      settlementAsset:
        "EUR",
    };

    assert.throws(
      () =>
        createStellarIntentFromCanonicalAgreement(
          makeInput({
            terms,
          }),
        ),
      /requires canonical settlementAsset USDC/,
    );
  },
);

test(
  "rejects missing, zero, or over-precision canonical totalValue",
  () => {
    assert.throws(
      () =>
        createStellarIntentFromCanonicalAgreement(
          makeInput({
            terms: {
              ...TERMS,

              totalValue:
                null,
            },
          }),
        ),
      /totalValue is required/,
    );

    assert.throws(
      () =>
        stellarDecimalToBaseUnits(
          "0",
        ),
      /greater than zero/,
    );

    assert.throws(
      () =>
        stellarDecimalToBaseUnits(
          "1.00000001",
        ),
      /exceeds 7 decimal places/,
    );
  },
);