import {
  finalizeCompletedOfframp,
  offrampTryFromStellarUsdc,
} from "../src/try-anchor/offramp.js";
import {
  verifyHorizonOutboundPayment,
} from "../src/try-anchor/horizon.js";
import assert from "node:assert/strict";
import test from "node:test";

import {
  TR_MOCK_ANCHOR_CONFIG,
} from "../src/try-anchor/config.js";

import {
  createOfframpFirmQuote,
  stellarAssetId,
} from "../src/try-anchor/sep38.js";

import {
  createWithdrawExchange,
  getSep6Transaction,
} from "../src/try-anchor/sep6.js";

import type {
  AnchorDiscovery,
  Sep10Session,
} from "../src/try-anchor/types.js";

const discovery: AnchorDiscovery = {
  homeDomain:
    "tr-mock-anchor.fly.dev",

  webAuthEndpoint:
    "https://anchor.example/auth",

  signingKey:
    "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF",

  transferServerSep6:
    "https://anchor.example/sep6",

  kycServer:
    "https://anchor.example/kyc",

  anchorQuoteServer:
    "https://anchor.example/sep38",
};

const session: Sep10Session = {
  accountId:
    "GC4CKF3TLUAXUG5CR7WIQTRXEQYQOV76TT4FTZHIEY7SET7A75OF3KRV",

  bearerToken:
    "test-token",
};

function response(
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

test(
  "requests deterministic USDC to TRY off-ramp firm quote",
  async () => {
    let body:
      Readonly<Record<string, unknown>> |
      undefined;

    const quote =
      await createOfframpFirmQuote({
        config:
          TR_MOCK_ANCHOR_CONFIG,

        discovery,
        session,

        sellAmountUsdc:
          "2.0000000",

        now:
          () =>
            new Date(
              "2026-09-19T00:00:00Z",
            ),

        fetchImpl:
          async (
            _input,
            init,
          ) => {
            body =
              JSON.parse(
                String(
                  init?.body,
                ),
              ) as Readonly<
                Record<string, unknown>
              >;

            return response(
              {
                id:
                  "quote-offramp-1",

                expires_at:
                  "2099-01-01T00:00:00Z",

                sell_asset:
                  stellarAssetId(
                    TR_MOCK_ANCHOR_CONFIG,
                  ),

                sell_amount:
                  "2.0000000",

                buy_asset:
                  "iso4217:TRY",

                buy_amount:
                  "97.08",

                price:
                  "48.54",

                total_price:
                  "0.0206015",
              },
              201,
            );
          },
      });

    assert.equal(
      body?.["sell_asset"],
      stellarAssetId(
        TR_MOCK_ANCHOR_CONFIG,
      ),
    );

    assert.equal(
      body?.["buy_asset"],
      "iso4217:TRY",
    );

    assert.equal(
      body?.["sell_amount"],
      "2.0000000",
    );

    assert.equal(
      body?.["buy_delivery_method"],
      "bank_account",
    );

    assert.equal(
      "sell_delivery_method" in
        (body ?? {}),
      false,
    );

    assert.equal(
      quote.buyAmount,
      "97.08",
    );
  },
);

test(
  "creates SEP-6 withdraw-exchange using short USDC asset and exact quote",
  async () => {
    let requestedUrl:
      URL |
      undefined;

    const quote = {
      id:
        "quote-offramp-2",

      expiresAt:
        "2099-01-01T00:00:00Z",

      sellAsset:
        stellarAssetId(
          TR_MOCK_ANCHOR_CONFIG,
        ),

      sellAmount:
        "2.0000000",

      buyAsset:
        "iso4217:TRY",

      buyAmount:
        "97.08",

      price:
        "48.54",

      totalPrice:
        "0.0206015",
    } as const;

    const withdrawal =
      await createWithdrawExchange({
        config:
          TR_MOCK_ANCHOR_CONFIG,

        discovery,
        session,

        kyc: {
          status:
            "ACCEPTED",

          customerId:
            "cus_test",
        },

        quote,

        now:
          () =>
            new Date(
              "2026-09-19T00:00:00Z",
            ),

        fetchImpl:
          async (
            input,
          ) => {
            requestedUrl =
              new URL(
                String(input),
              );

            return response({
              account_id:
                "GCLCZEQZ2THTEDAOFI66LACNPLY4OBKN7VKLEZFMBIHYKYQOW2W7T3Z6",

              memo_type:
                "id",

              memo:
                "730044582216",

              id:
                "sep_offramp_1",

              eta:
                10,
            });
          },
      });

    assert.equal(
      requestedUrl?.searchParams.get(
        "source_asset",
      ),
      "USDC",
    );

    assert.equal(
      requestedUrl?.searchParams.get(
        "destination_asset",
      ),
      "iso4217:TRY",
    );

    assert.equal(
      requestedUrl?.searchParams.get(
        "amount",
      ),
      "2.0000000",
    );

    assert.equal(
      requestedUrl?.searchParams.get(
        "quote_id",
      ),
      quote.id,
    );

    assert.equal(
      withdrawal.memoType,
      "id",
    );

    assert.equal(
      withdrawal.memo,
      "730044582216",
    );
  },
);

test(
  "parses wrapped completed off-ramp transaction evidence",
  async () => {
    const transaction =
      await getSep6Transaction(
        discovery,
        session,
        "sep_offramp_1",
        async () =>
          response({
            transaction: {
              id:
                "sep_offramp_1",

              status:
                "completed",

              quote_id:
                "quote-offramp-2",

              amount_in:
                "2.0000000",

              amount_in_asset:
                stellarAssetId(
                  TR_MOCK_ANCHOR_CONFIG,
                ),

              amount_out:
                "97.08",

              amount_out_asset:
                "iso4217:TRY",

              stellar_transaction_id:
                "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",

              external_transaction_id:
                "FAST-SANDBOX-123",

              to:
                "TR000000000000000000000000",
            },
          }),
      );

    assert.equal(
      transaction.externalTransactionId,
      "FAST-SANDBOX-123",
    );

    assert.equal(
      transaction.to,
      "TR000000000000000000000000",
    );

    assert.equal(
      transaction.stellarTransactionId,
      "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    );
  },
);

function outboundHorizonFetch(
  transactionHash: string,
  overrides: {
    readonly transaction?: Readonly<Record<string, unknown>>;
    readonly payment?: Readonly<Record<string, unknown>>;
  } = {},
): typeof fetch {
  return (async (
    input: string | URL,
  ): Promise<Response> => {
    const url =
      String(
        input,
      );

    if (
      url.includes(
        "/operations",
      )
    ) {
      return response({
        _embedded: {
          records: [
            {
              type:
                "payment",

              transaction_successful:
                true,

              transaction_hash:
                transactionHash,

              from:
                session.accountId,

              to:
                "GCLCZEQZ2THTEDAOFI66LACNPLY4OBKN7VKLEZFMBIHYKYQOW2W7T3Z6",

              asset_code:
                "USDC",

              asset_issuer:
                TR_MOCK_ANCHOR_CONFIG
                  .settlementAsset
                  .issuer,

              amount:
                "2.0000000",

              ...(
                overrides.payment ??
                {}
              ),
            },
          ],
        },
      });
    }

    return response({
      hash:
        transactionHash,

      successful:
        true,

      source_account:
        session.accountId,

      memo_type:
        "id",

      memo:
        "730044582216",

      ledger:
        5000000,

      created_at:
        "2026-09-19T17:30:00Z",

      ...(
        overrides.transaction ??
        {}
      ),
    });
  }) as typeof fetch;
}

test(
  "independently verifies exact outbound USDC payment and MEMO_ID",
  async () => {
    const hash =
      "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";

    const proof =
      await verifyHorizonOutboundPayment({
        config:
          TR_MOCK_ANCHOR_CONFIG,

        transactionHash:
          hash,

        sourceAccount:
          session.accountId,

        destinationAccount:
          "GCLCZEQZ2THTEDAOFI66LACNPLY4OBKN7VKLEZFMBIHYKYQOW2W7T3Z6",

        expectedAmount:
          "2.0000000",

        memo:
          "730044582216",

        fetchImpl:
          outboundHorizonFetch(
            hash,
          ),
      });

    assert.equal(
      proof.transactionHash,
      hash,
    );

    assert.equal(
      proof.sourceAccount,
      session.accountId,
    );

    assert.equal(
      proof.destinationAccount,
      "GCLCZEQZ2THTEDAOFI66LACNPLY4OBKN7VKLEZFMBIHYKYQOW2W7T3Z6",
    );

    assert.equal(
      proof.paymentAmount,
      "2.0000000",
    );

    assert.equal(
      proof.memoType,
      "id",
    );

    assert.equal(
      proof.memo,
      "730044582216",
    );
  },
);

test(
  "rejects outbound proof when transaction source is not recipient",
  async () => {
    const hash =
      "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc";

    await assert.rejects(
      verifyHorizonOutboundPayment({
        config:
          TR_MOCK_ANCHOR_CONFIG,

        transactionHash:
          hash,

        sourceAccount:
          session.accountId,

        destinationAccount:
          "GCLCZEQZ2THTEDAOFI66LACNPLY4OBKN7VKLEZFMBIHYKYQOW2W7T3Z6",

        expectedAmount:
          "2.0000000",

        memo:
          "730044582216",

        fetchImpl:
          outboundHorizonFetch(
            hash,
            {
              transaction: {
                source_account:
                  "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF",
              },
            },
          ),
      }),
      /source does not match/,
    );
  },
);

test(
  "rejects outbound proof when transaction memo differs",
  async () => {
    const hash =
      "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd";

    await assert.rejects(
      verifyHorizonOutboundPayment({
        config:
          TR_MOCK_ANCHOR_CONFIG,

        transactionHash:
          hash,

        sourceAccount:
          session.accountId,

        destinationAccount:
          "GCLCZEQZ2THTEDAOFI66LACNPLY4OBKN7VKLEZFMBIHYKYQOW2W7T3Z6",

        expectedAmount:
          "2.0000000",

        memo:
          "730044582216",

        fetchImpl:
          outboundHorizonFetch(
            hash,
            {
              transaction: {
                memo:
                  "730044582217",
              },
            },
          ),
      }),
      /exact required MEMO_ID/,
    );
  },
);

test(
  "rejects outbound proof when payment destination differs",
  async () => {
    const hash =
      "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee";

    await assert.rejects(
      verifyHorizonOutboundPayment({
        config:
          TR_MOCK_ANCHOR_CONFIG,

        transactionHash:
          hash,

        sourceAccount:
          session.accountId,

        destinationAccount:
          "GCLCZEQZ2THTEDAOFI66LACNPLY4OBKN7VKLEZFMBIHYKYQOW2W7T3Z6",

        expectedAmount:
          "2.0000000",

        memo:
          "730044582216",

        fetchImpl:
          outboundHorizonFetch(
            hash,
            {
              payment: {
                to:
                  "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF",
              },
            },
          ),
      }),
      /exact expected outbound USDC payment/,
    );
  },
);
test(
  "requires both completed Anchor evidence and matching independent Horizon proof",
  () => {
    const hash =
      "ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff";

    const quote = {
      id:
        "quote-final-1",

      expiresAt:
        "2099-01-01T00:00:00Z",

      sellAsset:
        stellarAssetId(
          TR_MOCK_ANCHOR_CONFIG,
        ),

      sellAmount:
        "2.0000000",

      buyAsset:
        "iso4217:TRY",

      buyAmount:
        "97.08",

      price:
        "48.54",

      totalPrice:
        "0.0206015",
    } as const;

    const withdrawal = {
      anchorTransactionId:
        "sep-final-1",

      quoteId:
        quote.id,

      destinationAccount:
        "GCLCZEQZ2THTEDAOFI66LACNPLY4OBKN7VKLEZFMBIHYKYQOW2W7T3Z6",

      memoType:
        "id",

      memo:
        "730044582216",
    } as const;

    const horizon = {
      transactionHash:
        hash,

      ledger:
        5000001,

      createdAt:
        "2026-09-19T17:40:00Z",

      sourceAccount:
        session.accountId,

      destinationAccount:
        withdrawal.destinationAccount,

      paymentAmount:
        "2.0000000",

      memoType:
        "id",

      memo:
        withdrawal.memo,
    } as const;

    const proof =
      finalizeCompletedOfframp({
        config:
          TR_MOCK_ANCHOR_CONFIG,

        sourceAccount:
          session.accountId,

        quote,
        withdrawal,
        horizon,

        transaction: {
          id:
            withdrawal.anchorTransactionId,

          status:
            "completed",

          quoteId:
            quote.id,

          amountIn:
            "2.0000000",

          amountOut:
            "97.08",

          amountOutAsset:
            "iso4217:TRY",

          stellarTransactionId:
            hash,

          externalTransactionId:
            "FAST-SANDBOX-456",

          to:
            "TR000000000000000000000000",
        },

        now:
          () =>
            new Date(
              "2026-09-19T17:41:00Z",
            ),
      });

    assert.equal(
      proof.status,
      "verified",
    );

    assert.equal(
      proof.destination
        .payoutReference,
      "FAST-SANDBOX-456",
    );

    assert.equal(
      JSON.stringify(
        proof,
      ).includes(
        "TR000000000000000000000000",
      ),
      false,
    );
  },
);

test(
  "rejects Anchor completed when provider Stellar hash differs from independent proof",
  () => {
    const quote = {
      id: "quote-final-2",
      expiresAt: "2099-01-01T00:00:00Z",
      sellAsset: stellarAssetId(TR_MOCK_ANCHOR_CONFIG),
      sellAmount: "2.0000000",
      buyAsset: "iso4217:TRY",
      buyAmount: "97.08",
      price: "48.54",
      totalPrice: "0.0206015",
    } as const;

    const withdrawal = {
      anchorTransactionId: "sep-final-2",
      quoteId: quote.id,
      destinationAccount:
        "GCLCZEQZ2THTEDAOFI66LACNPLY4OBKN7VKLEZFMBIHYKYQOW2W7T3Z6",
      memoType: "id",
      memo: "730044582216",
    } as const;

    assert.throws(
      () =>
        finalizeCompletedOfframp({
          config:
            TR_MOCK_ANCHOR_CONFIG,

          sourceAccount:
            session.accountId,

          quote,
          withdrawal,

          horizon: {
            transactionHash:
              "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
            ledger:
              5000002,
            createdAt:
              "2026-09-19T17:40:00Z",
            sourceAccount:
              session.accountId,
            destinationAccount:
              withdrawal.destinationAccount,
            paymentAmount:
              "2.0000000",
            memoType:
              "id",
            memo:
              withdrawal.memo,
          },

          transaction: {
            id:
              withdrawal.anchorTransactionId,
            status:
              "completed",
            quoteId:
              quote.id,
            amountIn:
              "2.0000000",
            amountOut:
              "97.08",
            amountOutAsset:
              "iso4217:TRY",
            stellarTransactionId:
              "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
            externalTransactionId:
              "FAST-SANDBOX-789",
          },
        }),
      /does not match independently verified Horizon evidence/,
    );
  },
);

test(
  "rejects valid Horizon evidence while Anchor payout is still pending",
  () => {
    const quote = {
      id: "quote-final-3",
      expiresAt: "2099-01-01T00:00:00Z",
      sellAsset: stellarAssetId(TR_MOCK_ANCHOR_CONFIG),
      sellAmount: "2.0000000",
      buyAsset: "iso4217:TRY",
      buyAmount: "97.08",
      price: "48.54",
      totalPrice: "0.0206015",
    } as const;

    const withdrawal = {
      anchorTransactionId: "sep-final-3",
      quoteId: quote.id,
      destinationAccount:
        "GCLCZEQZ2THTEDAOFI66LACNPLY4OBKN7VKLEZFMBIHYKYQOW2W7T3Z6",
      memoType: "id",
      memo: "730044582216",
    } as const;

    assert.throws(
      () =>
        finalizeCompletedOfframp({
          config:
            TR_MOCK_ANCHOR_CONFIG,

          sourceAccount:
            session.accountId,

          quote,
          withdrawal,

          horizon: {
            transactionHash:
              "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
            ledger:
              5000003,
            createdAt:
              "2026-09-19T17:40:00Z",
            sourceAccount:
              session.accountId,
            destinationAccount:
              withdrawal.destinationAccount,
            paymentAmount:
              "2.0000000",
            memoType:
              "id",
            memo:
              withdrawal.memo,
          },

          transaction: {
            id:
              withdrawal.anchorTransactionId,
            status:
              "pending_external",
            quoteId:
              quote.id,
          },
        }),
      /not completed/,
    );
  },
);

test(
  "rejects payment authorizer that is not the released-USDC recipient before network work",
  async () => {
    let fetched =
      false;

    await assert.rejects(
      offrampTryFromStellarUsdc({
        config:
          TR_MOCK_ANCHOR_CONFIG,

        sourceAccount:
          session.accountId,

        sellAmountUsdc:
          "2.0000000",

        signer: {
          accountId:
            session.accountId,

          async signChallenge() {
            throw new Error(
              "must not be reached",
            );
          },
        },

        paymentAuthorizer: {
          accountId:
            "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF",

          async submitPayment() {
            throw new Error(
              "must not be reached",
            );
          },
        },

        fetchImpl:
          async () => {
            fetched =
              true;

            throw new Error(
              "must not be reached",
            );
          },
      }),
      /payment authorizer must be the released-USDC recipient/,
    );

    assert.equal(
      fetched,
      false,
    );
  },
);