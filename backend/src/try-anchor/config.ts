import type {
  TryAnchorConfig,
} from "./types.js";

export const STELLAR_TESTNET_PASSPHRASE =
  "Test SDF Network ; September 2015";

export const TR_MOCK_ANCHOR_CONFIG:
  TryAnchorConfig = {
  homeDomain:
    "tr-mock-anchor.fly.dev",

  networkPassphrase:
    STELLAR_TESTNET_PASSPHRASE,

  horizonUrl:
    "https://horizon-testnet.stellar.org",

  settlementAsset: {
    code:
      "USDC",
    issuer:
      "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5",
  },

  limits: {
    minimumTry: "50",
    maximumTry: "3000",
  },
};
