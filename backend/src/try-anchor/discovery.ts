import {
  TryAnchorError,
} from "./error.js";

import type {
  AnchorDiscovery,
  FetchLike,
  TryAnchorConfig,
} from "./types.js";

function readTomlString(
  toml:
    string,
  key:
    string,
): string {
  const escapedKey =
    key.replace(
      /[.*+?^${}()|[\]\\]/g,
      "\\$&",
    );

  const match =
    toml.match(
      new RegExp(
        `^\\s*${escapedKey}\\s*=\\s*["']([^"'\\r\\n]+)["']\\s*$`,
        "m",
      ),
    );

  if (
    match?.[1] ===
    undefined
  ) {
    throw new TryAnchorError(
      "ANCHOR_DISCOVERY_FAILED",
      `stellar.toml is missing ${key}.`,
    );
  }

  return match[1];
}

function requireHttpsUrl(
  value:
    string,
  field:
    string,
): string {
  const parsed =
    new URL(
      value,
    );

  if (
    parsed.protocol !==
    "https:"
  ) {
    throw new TryAnchorError(
      "ANCHOR_DISCOVERY_FAILED",
      `${field} must use HTTPS.`,
    );
  }

  return parsed.toString();
}

export async function discoverAnchor(
  config:
    TryAnchorConfig,
  fetchImpl:
    FetchLike = globalThis.fetch,
): Promise<AnchorDiscovery> {
  const response =
    await fetchImpl(
      `https://${config.homeDomain}/.well-known/stellar.toml`,
    );

  if (
    !response.ok
  ) {
    throw new TryAnchorError(
      "ANCHOR_DISCOVERY_FAILED",
      `stellar.toml request failed with HTTP ${response.status}.`,
    );
  }

  const toml =
    await response.text();

  return {
    homeDomain:
      config.homeDomain,

    webAuthEndpoint:
      requireHttpsUrl(
        readTomlString(
          toml,
          "WEB_AUTH_ENDPOINT",
        ),
        "WEB_AUTH_ENDPOINT",
      ),

    signingKey:
      readTomlString(
        toml,
        "SIGNING_KEY",
      ),

    transferServerSep6:
      requireHttpsUrl(
        readTomlString(
          toml,
          "TRANSFER_SERVER",
        ),
        "TRANSFER_SERVER",
      ),

    kycServer:
      requireHttpsUrl(
        readTomlString(
          toml,
          "KYC_SERVER",
        ),
        "KYC_SERVER",
      ),

    anchorQuoteServer:
      requireHttpsUrl(
        readTomlString(
          toml,
          "ANCHOR_QUOTE_SERVER",
        ),
        "ANCHOR_QUOTE_SERVER",
      ),
  };
}
