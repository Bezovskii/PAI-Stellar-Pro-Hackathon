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
  TR_MOCK_ANCHOR_CONFIG,
} from "../src/try-anchor/config.js";

import {
  authenticateSep10,
} from "../src/try-anchor/sep10.js";

import type {
  AnchorDiscovery,
  FetchLike,
  Sep10Signer,
} from "../src/try-anchor/types.js";

const homeDomain =
  "tr-mock-anchor.fly.dev";

const webAuthEndpoint =
  `https://${homeDomain}/auth`;

function createDiscovery(
  signingKey:
    string,
): AnchorDiscovery {
  return {
    homeDomain,
    signingKey,
    webAuthEndpoint,
    transferServerSep6:
      `https://${homeDomain}/sep6`,
    kycServer:
      `https://${homeDomain}/sep12`,
    anchorQuoteServer:
      `https://${homeDomain}/sep38`,
  };
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
  "validates, signs, and exchanges a SEP-10 challenge",
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

          return new Response(
            JSON.stringify({
              token:
                "test-jwt",
            }),
            {
              status:
                200,
              headers: {
                "content-type":
                  "application/json",
              },
            },
          );
        }

        assert.equal(
          url.searchParams.get(
            "account",
          ),
          client.publicKey(),
        );

        return new Response(
          JSON.stringify({
            transaction:
              challenge,
            network_passphrase:
              Networks.TESTNET,
          }),
          {
            status:
              200,
            headers: {
              "content-type":
                "application/json",
            },
          },
        );
      };

    const session =
      await authenticateSep10({
        config:
          TR_MOCK_ANCHOR_CONFIG,
        signer:
          createSigner(
            client,
          ),
        discovery:
          createDiscovery(
            server.publicKey(),
          ),
        fetchImpl,
      });

    assert.equal(
      tokenRequestSeen,
      true,
    );

    assert.equal(
      session.accountId,
      client.publicKey(),
    );

    assert.equal(
      session.bearerToken,
      "test-jwt",
    );
  },
);

test(
  "rejects an unexpected network passphrase before signing",
  async () => {
    const server =
      Keypair.random();

    const client =
      Keypair.random();

    let signerCalled =
      false;

    const signer:
      Sep10Signer = {
      accountId:
        client.publicKey(),

      async signChallenge() {
        signerCalled =
          true;

        return "";
      },
    };

    const fetchImpl:
      FetchLike =
      async () =>
        new Response(
          JSON.stringify({
            transaction:
              "not-used",
            network_passphrase:
              Networks.PUBLIC,
          }),
          {
            status:
              200,
            headers: {
              "content-type":
                "application/json",
            },
          },
        );

    await assert.rejects(
      authenticateSep10({
        config:
          TR_MOCK_ANCHOR_CONFIG,
        signer,
        discovery:
          createDiscovery(
            server.publicKey(),
          ),
        fetchImpl,
      }),
      {
        name:
          "TryAnchorError",
        code:
          "SEP10_CHALLENGE_INVALID",
      },
    );

    assert.equal(
      signerCalled,
      false,
    );
  },
);
