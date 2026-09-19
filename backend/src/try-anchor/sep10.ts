import {
  WebAuth,
} from "@stellar/stellar-sdk";

import {
  discoverAnchor,
} from "./discovery.js";

import {
  TryAnchorError,
} from "./error.js";

import type {
  AnchorDiscovery,
  FetchLike,
  Sep10Session,
  Sep10Signer,
  TryAnchorConfig,
} from "./types.js";

interface JsonObject {
  readonly [key: string]:
    unknown;
}

function isJsonObject(
  value:
    unknown,
): value is JsonObject {
  return (
    typeof value ===
      "object" &&
    value !==
      null &&
    !Array.isArray(
      value,
    )
  );
}

async function requireJsonObject(
  response:
    Response,
  operation:
    string,
): Promise<JsonObject> {
  if (
    !response.ok
  ) {
    throw new TryAnchorError(
      "SEP10_AUTHENTICATION_FAILED",
      `${operation} failed with HTTP ${response.status}.`,
    );
  }

  const value:
    unknown =
    await response.json();

  if (
    !isJsonObject(
      value,
    )
  ) {
    throw new TryAnchorError(
      "ANCHOR_RESPONSE_INVALID",
      `${operation} returned a non-object response.`,
    );
  }

  return value;
}

function requireString(
  object:
    JsonObject,
  field:
    string,
): string {
  const value =
    object[field];

  if (
    typeof value !==
      "string" ||
    value.length ===
      0
  ) {
    throw new TryAnchorError(
      "ANCHOR_RESPONSE_INVALID",
      `Anchor response is missing ${field}.`,
    );
  }

  return value;
}

export interface AuthenticateSep10Input {
  readonly config:
    TryAnchorConfig;

  readonly signer:
    Sep10Signer;

  readonly discovery?:
    AnchorDiscovery;

  readonly fetchImpl?:
    FetchLike;
}

export async function authenticateSep10(
  input:
    AuthenticateSep10Input,
): Promise<Sep10Session> {
  const fetchImpl =
    input.fetchImpl ??
    globalThis.fetch;

  const discovery =
    input.discovery ??
    await discoverAnchor(
      input.config,
      fetchImpl,
    );

  const challengeUrl =
    new URL(
      discovery.webAuthEndpoint,
    );

  challengeUrl.searchParams.set(
    "account",
    input.signer.accountId,
  );

  challengeUrl.searchParams.set(
    "home_domain",
    discovery.homeDomain,
  );

  const challengeResponse =
    await requireJsonObject(
      await fetchImpl(
        challengeUrl,
      ),
      "SEP-10 challenge request",
    );

  const challengeXdr =
    requireString(
      challengeResponse,
      "transaction",
    );

  const returnedPassphrase =
    challengeResponse[
      "network_passphrase"
    ];

  if (
    returnedPassphrase !==
      undefined &&
    returnedPassphrase !==
      input.config.networkPassphrase
  ) {
    throw new TryAnchorError(
      "SEP10_CHALLENGE_INVALID",
      "Anchor returned an unexpected network passphrase.",
    );
  }

  const webAuthDomain =
    new URL(
      discovery.webAuthEndpoint,
    ).hostname;

  let clientAccountId:
    string;

  try {
    const challenge =
      WebAuth.readChallengeTx(
        challengeXdr,
        discovery.signingKey,
        input.config.networkPassphrase,
        discovery.homeDomain,
        webAuthDomain,
      );

    clientAccountId =
      challenge.clientAccountID;
  } catch {
    throw new TryAnchorError(
      "SEP10_CHALLENGE_INVALID",
      "SEP-10 challenge validation failed.",
    );
  }

  if (
    clientAccountId !==
    input.signer.accountId
  ) {
    throw new TryAnchorError(
      "SEP10_CHALLENGE_INVALID",
      "SEP-10 challenge targets a different account.",
    );
  }

  let signedChallenge:
    string;

  try {
    signedChallenge =
      await input.signer.signChallenge(
        challengeXdr,
        input.config.networkPassphrase,
      );

    WebAuth.verifyChallengeTxSigners(
      signedChallenge,
      discovery.signingKey,
      input.config.networkPassphrase,
      [
        input.signer.accountId,
      ],
      discovery.homeDomain,
      webAuthDomain,
    );
  } catch {
    throw new TryAnchorError(
      "SEP10_SIGNING_FAILED",
      "SEP-10 challenge was not correctly signed by the client account.",
    );
  }

  const tokenResponse =
    await requireJsonObject(
      await fetchImpl(
        discovery.webAuthEndpoint,
        {
          method:
            "POST",
          headers: {
            "content-type":
              "application/json",
          },
          body:
            JSON.stringify({
              transaction:
                signedChallenge,
            }),
        },
      ),
      "SEP-10 token request",
    );

  return {
    accountId:
      input.signer.accountId,

    bearerToken:
      requireString(
        tokenResponse,
        "token",
      ),
  };
}
