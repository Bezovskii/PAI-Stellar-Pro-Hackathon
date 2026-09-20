import assert from "node:assert/strict";
import test from "node:test";

import {
  TR_MOCK_ANCHOR_CONFIG,
} from "../src/try-anchor/config.js";

import {
  createFirmQuote,
  stellarAssetId,
} from "../src/try-anchor/sep38.js";

import type {
  AnchorDiscovery,
  Sep10Session,
} from "../src/try-anchor/types.js";

const discovery:
  AnchorDiscovery = {
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

const session:
  Sep10Session = {
  accountId:
    "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF",

  bearerToken:
    "test-token",
};

function quoteResponse(
  overrides:
    Readonly<Record<string, unknown>> =
      {},
): Response {
  return new Response(
    JSON.stringify({
      id:
        "quote-target-1",

      expires_at:
        "2099-01-01T00:00:00Z",

      sell_asset:
        "iso4217:TRY",

      sell_amount:
        "125.50",

      buy_asset:
        stellarAssetId(
          TR_MOCK_ANCHOR_CONFIG,
        ),

      buy_amount:
        "3.2500000",

      price:
        "38.6153846",

      total_price:
        "38.6153846",

      ...overrides,
    }),
    {
      status:
        201,

      headers: {
        "content-type":
          "application/json",
      },
    },
  );
}

test(
  "requests a firm quote by exact target USDC amount without sending sell_amount",
  async () => {
    let capturedBody:
      Readonly<Record<string, unknown>> |
      undefined;

    const quote =
      await createFirmQuote({
        config:
          TR_MOCK_ANCHOR_CONFIG,

        discovery,
        session,

        buyAmountUsdc:
          "3.25",

        maxSourceAmountTry:
          "130",

        fetchImpl:
          async (
            _input,
            init,
          ) => {
            capturedBody =
              JSON.parse(
                String(
                  init?.body,
                ),
              ) as Readonly<
                Record<
                  string,
                  unknown
                >
              >;

            return quoteResponse();
          },

        now:
          () =>
            new Date(
              "2026-09-19T00:00:00Z",
            ),
      });

    assert.equal(
      capturedBody?.[
        "buy_amount"
      ],
      "3.25",
    );

    assert.equal(
      "sell_amount" in
        (
          capturedBody ??
          {}
        ),
      false,
    );

    assert.equal(
      quote.buyAmount,
      "3.2500000",
    );

    assert.equal(
      quote.sellAmount,
      "125.50",
    );
  },
);

test(
  "rejects target quote when anchor returns a different USDC amount",
  async () => {
    await assert.rejects(
      createFirmQuote({
        config:
          TR_MOCK_ANCHOR_CONFIG,

        discovery,
        session,

        buyAmountUsdc:
          "3.25",

        fetchImpl:
          async () =>
            quoteResponse({
              buy_amount:
                "3.2499999",
            }),

        now:
          () =>
            new Date(
              "2026-09-19T00:00:00Z",
            ),
      }),
      /does not satisfy the exact requested USDC amount/,
    );
  },
);

test(
  "rejects target quote when required TRY exceeds payer ceiling",
  async () => {
    await assert.rejects(
      createFirmQuote({
        config:
          TR_MOCK_ANCHOR_CONFIG,

        discovery,
        session,

        buyAmountUsdc:
          "3.25",

        maxSourceAmountTry:
          "125.49",

        fetchImpl:
          async () =>
            quoteResponse(),

        now:
          () =>
            new Date(
              "2026-09-19T00:00:00Z",
            ),
      }),
      /exceeds maxSourceAmountTry/,
    );
  },
);

test(
  "preserves existing sell-side firm quote mode",
  async () => {
    let capturedBody:
      Readonly<Record<string, unknown>> |
      undefined;

    await createFirmQuote({
      config:
        TR_MOCK_ANCHOR_CONFIG,

      discovery,
      session,

      sellAmountTry:
        "125.50",

      fetchImpl:
        async (
          _input,
          init,
        ) => {
          capturedBody =
            JSON.parse(
              String(
                init?.body,
              ),
            ) as Readonly<
              Record<
                string,
                unknown
              >
            >;

          return quoteResponse();
        },

      now:
        () =>
          new Date(
            "2026-09-19T00:00:00Z",
          ),
    });

    assert.equal(
      capturedBody?.[
        "sell_amount"
      ],
      "125.50",
    );

    assert.equal(
      "buy_amount" in
        (
          capturedBody ??
          {}
        ),
      false,
    );
  },
);