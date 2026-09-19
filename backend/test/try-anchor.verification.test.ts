import assert
  from "node:assert/strict";

import test
  from "node:test";

import {
  TR_MOCK_ANCHOR_CONFIG,
} from "../src/try-anchor/config.js";

import {
  verifySpendableAcquisition,
} from "../src/try-anchor/proof.js";

import {
  stellarAssetId,
} from "../src/try-anchor/sep38.js";

import type {
  DepositExchangeInstructions,
  FetchLike,
  Sep38Quote,
  Sep6Transaction,
} from "../src/try-anchor/types.js";

const transactionHash =
  "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

const destinationAccount =
  "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF";

const quote:
  Sep38Quote = {
  id: "quote-1",
  expiresAt: "2099-01-01T00:00:00Z",
  sellAsset: "iso4217:TRY",
  sellAmount: "125.50",
  buyAsset: stellarAssetId(TR_MOCK_ANCHOR_CONFIG),
  buyAmount: "3.25",
  price: "0.0258705",
  totalPrice: "0.0258964",
};

const deposit:
  DepositExchangeInstructions = {
  anchorTransactionId: "anchor-tx-1",
  quoteId: "quote-1",
  destinationAccount,
};

const anchorTransaction:
  Sep6Transaction = {
  id: "anchor-tx-1",
  status: "completed",
  quoteId: "quote-1",
  amountIn: "125.5000000",
  amountInAsset: "iso4217:TRY",
  amountOut: "3.2500000",
  amountOutAsset: stellarAssetId(TR_MOCK_ANCHOR_CONFIG),
  stellarTransactionId: transactionHash,
};

function jsonResponse(
  value: unknown,
): Response {
  return new Response(
    JSON.stringify(value),
    {
      status: 200,
      headers: {
        "content-type": "application/json",
      },
    },
  );
}

function horizonFetch(
  balance = "4.0000000",
  sellingLiabilities = "0.5000000",
): FetchLike {
  return async (input) => {
    const url = new URL(input);

    if (url.pathname === `/transactions/${transactionHash}`) {
      return jsonResponse({
        hash: transactionHash,
        successful: true,
        ledger: 12345,
        created_at: "2026-09-19T10:00:00Z",
      });
    }

    if (url.pathname.endsWith("/operations")) {
      assert.equal(url.searchParams.get("limit"), "200");

      return jsonResponse({
        _embedded: {
          records: [
            {
              type: "payment",
              transaction_successful: true,
              transaction_hash: transactionHash,
              to: destinationAccount,
              asset_code: "USDC",
              asset_issuer:
                TR_MOCK_ANCHOR_CONFIG.settlementAsset.issuer,
              amount: "3.2500000",
            },
          ],
        },
      });
    }

    assert.equal(
      url.pathname,
      `/accounts/${destinationAccount}`,
    );

    return jsonResponse({
      account_id: destinationAccount,
      balances: [
        {
          asset_type: "credit_alphanum4",
          asset_code: "USDC",
          asset_issuer:
            TR_MOCK_ANCHOR_CONFIG.settlementAsset.issuer,
          balance,
          selling_liabilities: sellingLiabilities,
          buying_liabilities: "0.0000000",
          is_authorized: true,
          last_modified_ledger: 12345,
        },
      ],
    });
  };
}

test(
  "verifies the Stellar payment and emits a JWT-free acquisition proof",
  async () => {
    const proof = await verifySpendableAcquisition({
      config: TR_MOCK_ANCHOR_CONFIG,
      quote,
      deposit,
      transaction: anchorTransaction,
      fetchImpl: horizonFetch(),
      now: () => new Date("2026-09-19T10:01:00Z"),
    });

    assert.equal(proof.status, "verified");
    assert.equal(proof.provider, "tr-mock-anchor");
    assert.equal(proof.source.amount, "125.50");
    assert.equal(proof.settlement.amount, "3.25");
    assert.equal(proof.settlement.spendableBalance, "3.5");
    assert.equal(proof.references.ledger, 12345);
    assert.equal(
      proof.references.stellarTransactionHash,
      transactionHash,
    );

    const serialized = JSON.stringify(proof);
    assert.equal(serialized.includes("bearerToken"), false);
    assert.equal(serialized.includes("internal-jwt"), false);
    assert.equal(serialized.includes("first_name"), false);
    assert.equal(serialized.includes("bank"), false);
  },
);

test(
  "refuses claimable balances as spendable settlement",
  async () => {
    let fetchCalled = false;

    await assert.rejects(
      verifySpendableAcquisition({
        config: TR_MOCK_ANCHOR_CONFIG,
        quote,
        deposit,
        transaction: {
          ...anchorTransaction,
          claimableBalanceId: "claimable-balance-1",
        },
        fetchImpl: async () => {
          fetchCalled = true;
          throw new Error("Horizon must not be called");
        },
      }),
      {
        name: "TryAnchorError",
        code: "ASSET_NOT_SPENDABLE",
      },
    );

    assert.equal(fetchCalled, false);
  },
);

test(
  "refuses a verified payment when current USDC is not spendable",
  async () => {
    await assert.rejects(
      verifySpendableAcquisition({
        config: TR_MOCK_ANCHOR_CONFIG,
        quote,
        deposit,
        transaction: anchorTransaction,
        fetchImpl: horizonFetch("3.0000000", "0.0000000"),
      }),
      {
        name: "TryAnchorError",
        code: "ASSET_NOT_SPENDABLE",
      },
    );
  },
);
