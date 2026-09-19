import assert from "node:assert/strict";
import test from "node:test";

import {
  decidePaymentRoute,
  type PaymentRouteDecision,
  type PaymentRouteInput,
} from "../src/stellar-settlement/payment-intelligence.js";

interface RouteCase {
  readonly name:
    string;

  readonly input:
    PaymentRouteInput;

  readonly expected:
    PaymentRouteDecision;
}

const ROUTE_CASES:
  readonly RouteCase[] = [
    {
      name:
        "selects DIRECT_STELLAR for Stellar USDC funding",

      input: {
        direction:
          "FUNDING",

        sourceAsset:
          "STELLAR_USDC",

        targetAsset:
          "STELLAR_USDC",

        sourceRail:
          "STELLAR",

        targetRail:
          "STELLAR",

        tryOnrampAvailable:
          false,

        tryOfframpAvailable:
          false,
      },

      expected: {
        route:
          "DIRECT_STELLAR",

        reason:
          "SOURCE_ALREADY_STELLAR_USDC",

        executionTarget:
          "STELLAR",
      },
    },
    {
      name:
        "selects DIRECT_STELLAR when payout remains in Stellar USDC",

      input: {
        direction:
          "PAYOUT",

        sourceAsset:
          "STELLAR_USDC",

        targetAsset:
          "STELLAR_USDC",

        sourceRail:
          "STELLAR",

        targetRail:
          "STELLAR",

        tryOnrampAvailable:
          false,

        tryOfframpAvailable:
          false,
      },

      expected: {
        route:
          "DIRECT_STELLAR",

        reason:
          "SOURCE_ALREADY_STELLAR_USDC",

        executionTarget:
          "STELLAR",
      },
    },
    {
      name:
        "selects TRY_ONRAMP when funding capability is available",

      input: {
        direction:
          "FUNDING",

        sourceAsset:
          "TRY",

        targetAsset:
          "STELLAR_USDC",

        sourceRail:
          "BANK_TRY",

        targetRail:
          "STELLAR",

        tryOnrampAvailable:
          true,

        tryOfframpAvailable:
          false,
      },

      expected: {
        route:
          "TRY_ONRAMP",

        reason:
          "TRY_TO_STELLAR_USDC",

        executionTarget:
          "TRY_ANCHOR",
      },
    },
    {
      name:
        "returns NO_ROUTE when TRY on-ramp is unavailable",

      input: {
        direction:
          "FUNDING",

        sourceAsset:
          "TRY",

        targetAsset:
          "STELLAR_USDC",

        sourceRail:
          "BANK_TRY",

        targetRail:
          "STELLAR",

        tryOnrampAvailable:
          false,

        tryOfframpAvailable:
          false,
      },

      expected: {
        route:
          "NO_ROUTE",

        reason:
          "ONRAMP_UNAVAILABLE",

        executionTarget:
          null,
      },
    },
    {
      name:
        "selects TRY_OFFRAMP when payout capability is available",

      input: {
        direction:
          "PAYOUT",

        sourceAsset:
          "STELLAR_USDC",

        targetAsset:
          "TRY",

        sourceRail:
          "STELLAR",

        targetRail:
          "BANK_TRY",

        tryOnrampAvailable:
          false,

        tryOfframpAvailable:
          true,
      },

      expected: {
        route:
          "TRY_OFFRAMP",

        reason:
          "STELLAR_USDC_TO_TRY",

        executionTarget:
          "TRY_ANCHOR",
      },
    },
    {
      name:
        "returns NO_ROUTE when TRY off-ramp is unavailable",

      input: {
        direction:
          "PAYOUT",

        sourceAsset:
          "STELLAR_USDC",

        targetAsset:
          "TRY",

        sourceRail:
          "STELLAR",

        targetRail:
          "BANK_TRY",

        tryOnrampAvailable:
          false,

        tryOfframpAvailable:
          false,
      },

      expected: {
        route:
          "NO_ROUTE",

        reason:
          "OFFRAMP_UNAVAILABLE",

        executionTarget:
          null,
      },
    },
    {
      name:
        "rejects TRY to TRY as unsupported",

      input: {
        direction:
          "FUNDING",

        sourceAsset:
          "TRY",

        targetAsset:
          "TRY",

        sourceRail:
          "BANK_TRY",

        targetRail:
          "BANK_TRY",

        tryOnrampAvailable:
          true,

        tryOfframpAvailable:
          true,
      },

      expected: {
        route:
          "NO_ROUTE",

        reason:
          "UNSUPPORTED_COMBINATION",

        executionTarget:
          null,
      },
    },
    {
      name:
        "rejects mismatched asset and rail",

      input: {
        direction:
          "FUNDING",

        sourceAsset:
          "TRY",

        targetAsset:
          "STELLAR_USDC",

        sourceRail:
          "STELLAR",

        targetRail:
          "STELLAR",

        tryOnrampAvailable:
          true,

        tryOfframpAvailable:
          true,
      },

      expected: {
        route:
          "NO_ROUTE",

        reason:
          "UNSUPPORTED_COMBINATION",

        executionTarget:
          null,
      },
    },
    {
      name:
        "rejects an on-ramp-shaped route in the PAYOUT direction",

      input: {
        direction:
          "PAYOUT",

        sourceAsset:
          "TRY",

        targetAsset:
          "STELLAR_USDC",

        sourceRail:
          "BANK_TRY",

        targetRail:
          "STELLAR",

        tryOnrampAvailable:
          true,

        tryOfframpAvailable:
          true,
      },

      expected: {
        route:
          "NO_ROUTE",

        reason:
          "UNSUPPORTED_COMBINATION",

        executionTarget:
          null,
      },
    },
  ];

for (
  const routeCase of
    ROUTE_CASES
) {
  test(
    routeCase.name,
    () => {
      assert.deepEqual(
        decidePaymentRoute(
          routeCase.input,
        ),
        routeCase.expected,
      );
    },
  );
}

test(
  "returns the exact same decision for the same input",
  () => {
    const input:
      PaymentRouteInput = {
        direction:
          "PAYOUT",

        sourceAsset:
          "STELLAR_USDC",

        targetAsset:
          "TRY",

        sourceRail:
          "STELLAR",

        targetRail:
          "BANK_TRY",

        tryOnrampAvailable:
          false,

        tryOfframpAvailable:
          true,
      };

    assert.deepEqual(
      decidePaymentRoute(
        input,
      ),
      decidePaymentRoute(
        input,
      ),
    );
  },
);