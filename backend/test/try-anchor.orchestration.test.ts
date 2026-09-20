import assert
  from "node:assert/strict";

import test
  from "node:test";

import {
  Keypair,
  Networks,
  TransactionBuilder,
  WebAuth,
} from "@stellar/stellar-sdk";

import {
  acquireTryToStellarUsdc,
} from "../src/try-anchor/acquire.js";

import {
  TR_MOCK_ANCHOR_CONFIG,
} from "../src/try-anchor/config.js";

import {
  stellarAssetId,
} from "../src/try-anchor/sep38.js";

import type {
  FetchLike,
  Sep10Signer,
} from "../src/try-anchor/types.js";

const homeDomain =
  "tr-mock-anchor.fly.dev";

const destinationAccount =
  "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF";

const transactionHash =
  "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

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

function createSigner(
  client:
    Keypair,
): Sep10Signer {
  return {
    accountId:
      client.publicKey(),

    async signChallenge(
      challengeXdr,
      networkPassphrase,
    ) {
      const transaction =
        TransactionBuilder.fromXDR(
          challengeXdr,
          networkPassphrase,
        );

      transaction.sign(
        client,
      );

      return transaction
        .toEnvelope()
        .toXDR(
          "base64",
        )
        .toString();
    },
  };
}

test(
  "orchestrates exact-target TRY acquisition through independently verified Stellar USDC",
  async () => {
    const server =
      Keypair.random();

    const client =
      Keypair.random();

    const challenge =
      WebAuth.buildChallengeTx(
        server,
        client.publicKey(),
        homeDomain,
        300,
        Networks.TESTNET,
        homeDomain,
      );

    let tokenRequestSeen =
      false;

    let kycStatusSeen =
      false;

    let quoteSeen =
      false;

    let depositSeen =
      false;

    let bankSimulationSeen =
      false;

    let transactionStatusSeen =
      false;

    let horizonTransactionSeen =
      false;

    let horizonOperationsSeen =
      false;

    let horizonAccountSeen =
      false;

    const fetchImpl:
      FetchLike =
      async (
        input,
        init,
      ) => {
        const url =
          new URL(
            input,
          );

        if (
          url.hostname ===
            homeDomain &&
          url.pathname ===
            "/.well-known/stellar.toml"
        ) {
          return new Response(
            [
              `WEB_AUTH_ENDPOINT="https://${homeDomain}/auth"`,
              `SIGNING_KEY="${server.publicKey()}"`,
              `TRANSFER_SERVER="https://${homeDomain}/sep6"`,
              `KYC_SERVER="https://${homeDomain}/sep12"`,
              `ANCHOR_QUOTE_SERVER="https://${homeDomain}/sep38"`,
            ].join(
              "\n",
            ),
            {
              status:
                200,
            },
          );
        }

        if (
          url.hostname ===
            homeDomain &&
          url.pathname ===
            "/auth" &&
          init?.method !==
            "POST"
        ) {
          assert.equal(
            url.searchParams.get(
              "account",
            ),
            client.publicKey(),
          );

          assert.equal(
            url.searchParams.get(
              "home_domain",
            ),
            homeDomain,
          );

          return jsonResponse({
            transaction:
              challenge,

            network_passphrase:
              Networks.TESTNET,
          });
        }

        if (
          url.hostname ===
            homeDomain &&
          url.pathname ===
            "/auth" &&
          init?.method ===
            "POST"
        ) {
          tokenRequestSeen =
            true;

          const body =
            JSON.parse(
              String(
                init.body,
              ),
            ) as {
              transaction:
                string;
            };

          assert.deepEqual(
            WebAuth.verifyChallengeTxSigners(
              body.transaction,
              server.publicKey(),
              Networks.TESTNET,
              [
                client.publicKey(),
              ],
              homeDomain,
              homeDomain,
            ),
            [
              client.publicKey(),
            ],
          );

          return jsonResponse({
            token:
              "test-jwt",
          });
        }

        if (
          url.hostname ===
            homeDomain &&
          url.pathname ===
            "/sep12/customer"
        ) {
          kycStatusSeen =
            true;

          assert.equal(
            url.searchParams.get(
              "account",
            ),
            client.publicKey(),
          );

          assert.equal(
            url.searchParams.get(
              "type",
            ),
            "sep6",
          );

          return jsonResponse({
            id:
              "customer-1",

            status:
              "ACCEPTED",
          });
        }

        if (
          url.hostname ===
            homeDomain &&
          url.pathname ===
            "/sep38/quote"
        ) {
          quoteSeen =
            true;

          assert.equal(
            init?.method,
            "POST",
          );

          const body =
            JSON.parse(
              String(
                init?.body,
              ),
            ) as {
              sell_asset:
                string;
              buy_asset:
                string;
              buy_amount:
                string;
              sell_delivery_method:
                string;
              country_code:
                string;
              context:
                string;
            };

          assert.deepEqual(
            body,
            {
              sell_asset:
                "iso4217:TRY",

              buy_asset:
                stellarAssetId(
                  TR_MOCK_ANCHOR_CONFIG,
                ),

              buy_amount:
                "3.25",

              sell_delivery_method:
                "bank_account",

              country_code:
                "TUR",

              context:
                "sep6",
            },
          );

          return jsonResponse(
            {
              id:
                "quote-1",

              expires_at:
                "2099-01-01T00:00:00Z",

              sell_asset:
                "iso4217:TRY",

              sell_amount:
                "50",

              buy_asset:
                stellarAssetId(
                  TR_MOCK_ANCHOR_CONFIG,
                ),

              buy_amount:
                "3.25",

              price:
                "0.065",

              total_price:
                "0.065",
            },
            201,
          );
        }

        if (
          url.hostname ===
            homeDomain &&
          url.pathname ===
            "/sep6/deposit-exchange"
        ) {
          depositSeen =
            true;

          assert.equal(
            url.searchParams.get(
              "account",
            ),
            destinationAccount,
          );

          assert.equal(
            url.searchParams.get(
              "quote_id",
            ),
            "quote-1",
          );

          assert.equal(
            url.searchParams.get(
              "claimable_balance_supported",
            ),
            "false",
          );

          return jsonResponse({
            id:
              "anchor-tx-1",

            how:
              "Send sandbox TRY",
          });
        }

        if (
          url.hostname ===
            homeDomain &&
          url.pathname ===
            "/sep6/tx/anchor-tx-1/simulate-bank-transfer"
        ) {
          bankSimulationSeen =
            true;

          assert.equal(
            init?.method,
            "POST",
          );

          return jsonResponse({
            status:
              "ok",
          });
        }

        if (
          url.hostname ===
            homeDomain &&
          url.pathname ===
            "/sep6/transaction"
        ) {
          transactionStatusSeen =
            true;

          assert.equal(
            url.searchParams.get(
              "id",
            ),
            "anchor-tx-1",
          );

          return jsonResponse({
            id:
              "anchor-tx-1",

            status:
              "completed",

            quote_id:
              "quote-1",

            amount_in:
              "50.0000000",

            amount_in_asset:
              "iso4217:TRY",

            amount_out:
              "3.2500000",

            amount_out_asset:
              stellarAssetId(
                TR_MOCK_ANCHOR_CONFIG,
              ),

            stellar_transaction_id:
              transactionHash,

            completed_at:
              "2026-09-19T10:00:00Z",
          });
        }

        if (
          url.hostname ===
            "horizon-testnet.stellar.org" &&
          url.pathname ===
            `/transactions/${transactionHash}`
        ) {
          horizonTransactionSeen =
            true;

          return jsonResponse({
            hash:
              transactionHash,

            successful:
              true,

            ledger:
              12345,

            created_at:
              "2026-09-19T10:00:00Z",
          });
        }

        if (
          url.hostname ===
            "horizon-testnet.stellar.org" &&
          url.pathname ===
            `/transactions/${transactionHash}/operations`
        ) {
          horizonOperationsSeen =
            true;

          assert.equal(
            url.searchParams.get(
              "limit",
            ),
            "200",
          );

          return jsonResponse({
            _embedded: {
              records: [
                {
                  type:
                    "payment",

                  transaction_successful:
                    true,

                  transaction_hash:
                    transactionHash,

                  to:
                    destinationAccount,

                  asset_code:
                    "USDC",

                  asset_issuer:
                    TR_MOCK_ANCHOR_CONFIG
                      .settlementAsset
                      .issuer,

                  amount:
                    "3.2500000",
                },
              ],
            },
          });
        }

        if (
          url.hostname ===
            "horizon-testnet.stellar.org" &&
          url.pathname ===
            `/accounts/${destinationAccount}`
        ) {
          horizonAccountSeen =
            true;

          return jsonResponse({
            account_id:
              destinationAccount,

            balances: [
              {
                asset_type:
                  "credit_alphanum4",

                asset_code:
                  "USDC",

                asset_issuer:
                  TR_MOCK_ANCHOR_CONFIG
                    .settlementAsset
                    .issuer,

                balance:
                  "4.0000000",

                selling_liabilities:
                  "0.5000000",

                buying_liabilities:
                  "0.0000000",

                is_authorized:
                  true,

                last_modified_ledger:
                  12345,
              },
            ],
          });
        }

        throw new Error(
          `Unexpected fetch: ${init?.method ?? "GET"} ${url.toString()}`,
        );
      };

    const proof =
      await acquireTryToStellarUsdc({
        config:
          TR_MOCK_ANCHOR_CONFIG,

        signer:
          createSigner(
            client,
          ),

        targetBuyAmountUsdc:
          "3.25",

        maxSourceAmountTry:
          "50",

        destinationAccount,

        fetchImpl,

        now:
          () =>
            new Date(
              "2026-09-19T10:01:00Z",
            ),
      });

    assert.equal(
      tokenRequestSeen,
      true,
    );

    assert.equal(
      kycStatusSeen,
      true,
    );

    assert.equal(
      quoteSeen,
      true,
    );

    assert.equal(
      depositSeen,
      true,
    );

    assert.equal(
      bankSimulationSeen,
      true,
    );

    assert.equal(
      transactionStatusSeen,
      true,
    );

    assert.equal(
      horizonTransactionSeen,
      true,
    );

    assert.equal(
      horizonOperationsSeen,
      true,
    );

    assert.equal(
      horizonAccountSeen,
      true,
    );

    assert.equal(
      proof.status,
      "verified",
    );

    assert.equal(
      proof.provider,
      "tr-mock-anchor",
    );

    assert.equal(
      proof.source.amount,
      "50",
    );

    assert.equal(
      proof.settlement.amount,
      "3.25",
    );

    assert.equal(
      proof.settlement.destinationAccount,
      destinationAccount,
    );

    assert.equal(
      proof.settlement.spendableBalance,
      "3.5",
    );

    assert.equal(
      proof.references.quoteId,
      "quote-1",
    );

    assert.equal(
      proof.references.anchorTransactionId,
      "anchor-tx-1",
    );

    assert.equal(
      proof.references.stellarTransactionHash,
      transactionHash,
    );

    assert.equal(
      proof.references.ledger,
      12345,
    );

    const serialized =
      JSON.stringify(
        proof,
      );

    assert.equal(
      serialized.includes(
        "test-jwt",
      ),
      false,
    );

    assert.equal(
      serialized.includes(
        "bank",
      ),
      false,
    );
  },
);
