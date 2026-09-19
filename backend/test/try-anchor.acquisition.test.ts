import assert
  from "node:assert/strict";

import test
  from "node:test";

import {
  TR_MOCK_ANCHOR_CONFIG,
} from "../src/try-anchor/config.js";

import {
  createDepositExchange,
  getSep6Transaction,
  simulateSandboxBankTransfer,
} from "../src/try-anchor/sep6.js";

import {
  ensureKycAccepted,
} from "../src/try-anchor/sep12.js";

import {
  createFirmQuote,
  stellarAssetId,
} from "../src/try-anchor/sep38.js";

import type {
  AnchorDiscovery,
  FetchLike,
  Sep10Session,
  Sep38Quote,
} from "../src/try-anchor/types.js";

const discovery:
  AnchorDiscovery = {
  homeDomain:
    "tr-mock-anchor.fly.dev",
  webAuthEndpoint:
    "https://tr-mock-anchor.fly.dev/auth",
  signingKey:
    "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF",
  transferServerSep6:
    "https://tr-mock-anchor.fly.dev/sep6",
  kycServer:
    "https://tr-mock-anchor.fly.dev/sep12",
  anchorQuoteServer:
    "https://tr-mock-anchor.fly.dev/sep38",
};

const session:
  Sep10Session = {
  accountId:
    "GCLIENT",
  bearerToken:
    "internal-jwt",
};

function jsonResponse(
  value: unknown,
  status = 200,
): Response {
  return new Response(
    JSON.stringify(value),
    {
      status,
      headers: {
        "content-type":
          "application/json",
      },
    },
  );
}

function authorization(
  init?: RequestInit,
): string | null {
  return new Headers(init?.headers).get("authorization");
}

test(
  "submits required SEP-12 fields and returns only accepted KYC state",
  async () => {
    let requestNumber = 0;

    const fetchImpl:
      FetchLike =
      async (
        input,
        init,
      ) => {
        requestNumber += 1;
        const url = new URL(input);

        assert.equal(
          authorization(init),
          "Bearer internal-jwt",
        );

        if (requestNumber === 1) {
          assert.equal(init?.method, undefined);
          assert.equal(url.searchParams.get("account"), "GCLIENT");
          assert.equal(url.searchParams.get("type"), "sep6");

          return jsonResponse({
            status: "NEEDS_INFO",
            id: "customer-1",
            fields: {
              first_name: {
                optional: false,
              },
              email_address: {
                optional: false,
              },
              memo: {
                optional: true,
              },
            },
          });
        }

        if (requestNumber === 2) {
          assert.equal(init?.method, "PUT");

          const body = JSON.parse(String(init?.body)) as
            Record<string, unknown>;

          assert.deepEqual(
            body,
            {
              account: "GCLIENT",
              type: "sep6",
              id: "customer-1",
              first_name: "Ada",
              email_address: "ada@example.test",
            },
          );

          return jsonResponse({
            id: "customer-1",
          });
        }

        assert.equal(url.searchParams.get("id"), "customer-1");
        assert.equal(url.searchParams.get("type"), "sep6");

        return jsonResponse({
          status: "ACCEPTED",
          id: "customer-1",
        });
      };

    const kyc = await ensureKycAccepted({
      discovery,
      session,
      fields: {
        first_name: "Ada",
        email_address: "ada@example.test",
      },
      fetchImpl,
    });

    assert.deepEqual(
      kyc,
      {
        status: "ACCEPTED",
        customerId: "customer-1",
      },
    );

    assert.equal(
      "bearerToken" in kyc,
      false,
    );
  },
);

test(
  "creates a bounded SEP-38 firm TRY to Stellar USDC quote",
  async () => {
    const buyAsset = stellarAssetId(TR_MOCK_ANCHOR_CONFIG);

    const fetchImpl:
      FetchLike =
      async (
        input,
        init,
      ) => {
        assert.equal(
          String(input),
          "https://tr-mock-anchor.fly.dev/sep38/quote",
        );
        assert.equal(init?.method, "POST");
        assert.equal(
          authorization(init),
          "Bearer internal-jwt",
        );

        assert.deepEqual(
          JSON.parse(String(init?.body)),
          {
            sell_asset: "iso4217:TRY",
            buy_asset: buyAsset,
            sell_amount: "125.50",
            sell_delivery_method: "bank_account",
            country_code: "TUR",
            context: "sep6",
          },
        );

        return jsonResponse(
          {
            id: "quote-1",
            expires_at: "2099-01-01T00:00:00Z",
            sell_asset: "iso4217:TRY",
            sell_amount: "125.50",
            buy_asset: buyAsset,
            buy_amount: "3.25",
            price: "0.0258705",
            total_price: "0.0258964",
            fee: {
              total: "0.125",
              asset: "iso4217:TRY",
            },
          },
          201,
        );
      };

    const quote = await createFirmQuote({
      config: TR_MOCK_ANCHOR_CONFIG,
      discovery,
      session,
      sellAmountTry: "125.50",
      fetchImpl,
      now: () => new Date("2026-09-19T00:00:00Z"),
    });

    assert.equal(quote.id, "quote-1");
    assert.equal(quote.buyAmount, "3.25");
    assert.equal(quote.fee?.total, "0.125");
  },
);

test(
  "rejects TRY quote requests outside the configured limits",
  async () => {
    await assert.rejects(
      createFirmQuote({
        config: TR_MOCK_ANCHOR_CONFIG,
        discovery,
        session,
        sellAmountTry: "49.99",
        fetchImpl: async () => {
          throw new Error("fetch must not run");
        },
      }),
      {
        name: "TryAnchorError",
        code: "QUOTE_INVALID",
      },
    );
  },
);

test(
  "creates, simulates, and reads a SEP-6 deposit exchange",
  async () => {
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

    let requestNumber = 0;

    const fetchImpl:
      FetchLike =
      async (
        input,
        init,
      ) => {
        requestNumber += 1;
        const url = new URL(input);

        assert.equal(
          authorization(init),
          "Bearer internal-jwt",
        );

        if (requestNumber === 1) {
          assert.equal(url.pathname, "/sep6/deposit-exchange");
          assert.equal(url.searchParams.get("destination_asset"), "USDC");
          assert.equal(url.searchParams.get("source_asset"), "iso4217:TRY");
          assert.equal(url.searchParams.get("amount"), "125.50");
          assert.equal(url.searchParams.get("funding_method"), "bank_account");
          assert.equal(url.searchParams.get("account"), "GDESTINATION");
          assert.equal(url.searchParams.get("quote_id"), "quote-1");
          assert.equal(url.searchParams.get("country_code"), "TUR");
          assert.equal(url.searchParams.get("customer_id"), "customer-1");
          assert.equal(
            url.searchParams.get("claimable_balance_supported"),
            "false",
          );

          return jsonResponse({
            id: "anchor-tx-1",
            how: "Send a sandbox TRY bank transfer",
            eta: 30,
            min_amount: 50,
            max_amount: 3000,
            extra_info: {
              reference: "PAI-123",
            },
          });
        }

        if (requestNumber === 2) {
          assert.equal(init?.method, "POST");
          assert.equal(
            url.pathname,
            "/sep6/tx/anchor-tx-1/simulate-bank-transfer",
          );

          return jsonResponse({
            status: "ok",
          });
        }

        assert.equal(url.pathname, "/sep6/transaction");
        assert.equal(url.searchParams.get("id"), "anchor-tx-1");

        return jsonResponse({
          id: "anchor-tx-1",
          status: "completed",
          quote_id: "quote-1",
          amount_in: "125.50",
          amount_in_asset: "iso4217:TRY",
          amount_out: "3.25",
          amount_out_asset: stellarAssetId(TR_MOCK_ANCHOR_CONFIG),
          stellar_transaction_id: "stellar-tx-hash",
          completed_at: "2026-09-19T00:00:00Z",
        });
      };

    const instructions = await createDepositExchange({
      config: TR_MOCK_ANCHOR_CONFIG,
      discovery,
      session,
      kyc: {
        status: "ACCEPTED",
        customerId: "customer-1",
      },
      quote,
      destinationAccount: "GDESTINATION",
      fetchImpl,
    });

    assert.equal(instructions.anchorTransactionId, "anchor-tx-1");
    assert.equal(instructions.extraInfo?.["reference"], "PAI-123");

    await simulateSandboxBankTransfer(
      discovery,
      session,
      instructions.anchorTransactionId,
      fetchImpl,
    );

    const transaction = await getSep6Transaction(
      discovery,
      session,
      instructions.anchorTransactionId,
      fetchImpl,
    );

    assert.equal(transaction.status, "completed");
    assert.equal(transaction.stellarTransactionId, "stellar-tx-hash");
    assert.equal(transaction.claimableBalanceId, undefined);
  },
);

test(
  "reads the live wrapped SEP-6 transaction response shape",
  async () => {
    const fetchImpl:
      FetchLike =
      async (
        input,
        init,
      ) => {
        const url =
          new URL(input);

        assert.equal(
          authorization(init),
          "Bearer internal-jwt",
        );

        assert.equal(
          url.pathname,
          "/sep6/transaction",
        );

        assert.equal(
          url.searchParams.get("id"),
          "anchor-live-1",
        );

        return jsonResponse({
          transaction: {
            id:
              "anchor-live-1",

            kind:
              "deposit",

            status:
              "completed",

            quote_id:
              "quote-live-1",

            amount_in:
              "50.00",

            amount_in_asset:
              "iso4217:TRY",

            amount_out:
              "1.0198045",

            amount_out_asset:
              stellarAssetId(
                TR_MOCK_ANCHOR_CONFIG,
              ),

            stellar_transaction_id:
              "live-stellar-tx-hash",

            claimable_balance_id:
              null,

            completed_at:
              "2026-09-19T11:13:02.793Z",
          },
        });
      };

    const transaction =
      await getSep6Transaction(
        discovery,
        session,
        "anchor-live-1",
        fetchImpl,
      );

    assert.equal(
      transaction.id,
      "anchor-live-1",
    );

    assert.equal(
      transaction.status,
      "completed",
    );

    assert.equal(
      transaction.quoteId,
      "quote-live-1",
    );

    assert.equal(
      transaction.amountIn,
      "50.00",
    );

    assert.equal(
      transaction.amountOut,
      "1.0198045",
    );

    assert.equal(
      transaction.stellarTransactionId,
      "live-stellar-tx-hash",
    );

    assert.equal(
      transaction.claimableBalanceId,
      undefined,
    );
  },
);
