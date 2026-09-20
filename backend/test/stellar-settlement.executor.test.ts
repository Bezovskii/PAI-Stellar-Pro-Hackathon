import assert from "node:assert/strict";
import test from "node:test";

import type {
  VerifiedAssetAcquisitionProof,
} from "../src/try-anchor/types.js";

import {
  bindVerifiedAcquisitionToIntent,
} from "../src/stellar-settlement/acquisition.js";

import {
  executeStellarFunding,
  type StellarFundingTransport,
} from "../src/stellar-settlement/executor.js";

import {
  createStellarSettlementIntent,
} from "../src/stellar-settlement/intent.js";

const PAYER =
  "GC4CKF3TLUAXUG5CR7WIQTRXEQYQOV76TT4FTZHIEY7SET7A75OF3KRV";

const PAYEE =
  "GBJKQCGXP5PYCXA25HQNYJB63BJ7HMDAFNM6AFZARGBP7P7JBSLO2L6S";

const ISSUER =
  "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5";

const SAC =
  "CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA";

const CONTRACT =
  "CCQT2E3VWMINEKN5VQPTGUTI37CG6K7DXQMNVCOT2FVZY7MMXKFPDFPX";

const TX_HASH =
  "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";

const intent =
  createStellarSettlementIntent({
    paiAgreementId:
      "agreement-123",

    agreementVersion:
      "7",

    agreementHash:
      "1b9ef4a68698069e9f40be0a21ec619627f772ddad40a75a3c99cdfc30816043",

    payerAccount:
      PAYER,

    recipientAccount:
      PAYEE,

    assetIssuer:
      ISSUER,

    assetSac:
      SAC,

    amountBaseUnits:
      "10000000",
  });

const proof:
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
          ISSUER,
      },

      amount:
        "1.0000000",

      destinationAccount:
        PAYER,

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

const binding =
  bindVerifiedAcquisitionToIntent(
    intent,
    proof,
  );

function fundedState(
  overrides:
    Readonly<Record<string, unknown>> =
      {},
): Readonly<Record<string, unknown>> {
  return {
    amount:
      10000000n,

    canonical_agreement_hash:
      Buffer.from(
        intent.agreementHash,
        "hex",
      ),

    evidence_hash:
      undefined,

    execution_binding_hash:
      Buffer.from(
        intent.executionBindingHash,
        "hex",
      ),

    payee:
      PAYEE,

    payer:
      PAYER,

    status:
      [
        "Funded",
      ],

    token:
      SAC,

    ...overrides,
  };
}

function transportWithState(
  state:
    unknown,
): StellarFundingTransport {
  return {
    async fund() {
      return {
        transactionHash:
          TX_HASH,

        ledger:
          4762000,
      };
    },

    async readEscrow() {
      return state;
    },
  };
}

test(
  "marks funding complete only after confirmed transaction and matching Funded escrow state",
  async () => {
    const result =
      await executeStellarFunding({
        contractId:
          CONTRACT,

        binding,

        transport:
          transportWithState(
            fundedState(),
          ),
      });

    assert.equal(
      result.status,
      "FUNDED",
    );

    assert.equal(
      result.transactionHash,
      TX_HASH,
    );

    assert.equal(
      result.ledger,
      4762000,
    );

    assert.equal(
      result.agreementHash,
      intent.agreementHash,
    );

    assert.equal(
      result.executionBindingHash,
      intent.executionBindingHash,
    );

    assert.equal(
      result.escrow.amountBaseUnits,
      "10000000",
    );
  },
);

test(
  "rejects a transaction when escrow did not reach Funded",
  async () => {
    await assert.rejects(
      executeStellarFunding({
        contractId:
          CONTRACT,

        binding,

        transport:
          transportWithState(
            fundedState({
              status:
                [
                  "ReadyToFund",
                ],
            }),
          ),
      }),
      /not Funded/,
    );
  },
);

test(
  "rejects a funded escrow with a different canonical agreement hash",
  async () => {
    await assert.rejects(
      executeStellarFunding({
        contractId:
          CONTRACT,

        binding,

        transport:
          transportWithState(
            fundedState({
              canonical_agreement_hash:
                Buffer.alloc(
                  32,
                  0xff,
                ),
            }),
          ),
      }),
      /canonical agreement hash does not match/,
    );
  },
);

test(
  "rejects a funded escrow with a different execution binding hash",
  async () => {
    await assert.rejects(
      executeStellarFunding({
        contractId:
          CONTRACT,

        binding,

        transport:
          transportWithState(
            fundedState({
              execution_binding_hash:
                Buffer.alloc(
                  32,
                  0xee,
                ),
            }),
          ),
      }),
      /execution binding hash does not match/,
    );
  },
);

test(
  "rejects a funded escrow with a different amount",
  async () => {
    await assert.rejects(
      executeStellarFunding({
        contractId:
          CONTRACT,

        binding,

        transport:
          transportWithState(
            fundedState({
              amount:
                9999999n,
            }),
          ),
      }),
      /amount does not match/,
    );
  },
);

test(
  "rejects a funded escrow with a different token contract",
  async () => {
    await assert.rejects(
      executeStellarFunding({
        contractId:
          CONTRACT,

        binding,

        transport:
          transportWithState(
            fundedState({
              token:
                CONTRACT,
            }),
          ),
      }),
      /token contract does not match/,
    );
  },
);