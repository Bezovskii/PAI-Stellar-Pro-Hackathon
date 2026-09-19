import {
  TryAnchorError,
} from "./error.js";

import {
  appendPath,
  bearerHeaders,
  isJsonObject,
  requireJsonObject,
  requireString,
  resolveFetch,
} from "./protocol.js";

import type {
  AnchorDiscovery,
  FetchLike,
  Sep10Session,
  Sep38Quote,
  TryAnchorConfig,
} from "./types.js";

export const TRY_ASSET = "iso4217:TRY";
export const BANK_ACCOUNT_METHOD = "bank_account";

const USDC_DECIMALS = 7;

export function stellarAssetId(
  config: TryAnchorConfig,
): string {
  return `stellar:${config.settlementAsset.code}:${config.settlementAsset.issuer}`;
}

function parseTryMinorUnits(
  value: string,
  field: string,
): bigint {
  const match = /^(0|[1-9]\d*)(?:\.(\d{1,2}))?$/.exec(value);

  if (match === null) {
    throw new TryAnchorError(
      "QUOTE_INVALID",
      `${field} must be a non-negative TRY amount with at most 2 decimals.`,
    );
  }

  const whole = match[1] ?? "0";
  const fraction = (match[2] ?? "").padEnd(2, "0");
  return BigInt(whole) * 100n + BigInt(fraction || "0");
}

function parseUsdcBaseUnits(
  value: string,
  field: string,
): bigint {
  const match =
    /^(0|[1-9]\d*)(?:\.(\d{1,7}))?$/.exec(
      value,
    );

  if (match === null) {
    throw new TryAnchorError(
      "QUOTE_INVALID",
      `${field} must be a non-negative USDC amount with at most ${USDC_DECIMALS} decimals.`,
    );
  }

  const whole =
    match[1] ??
    "0";

  const fraction =
    (
      match[2] ??
      ""
    ).padEnd(
      USDC_DECIMALS,
      "0",
    );

  return (
    BigInt(
      whole,
    ) *
      (
        10n **
        BigInt(
          USDC_DECIMALS,
        )
      ) +
    BigInt(
      fraction ||
      "0",
    )
  );
}

function requireTryWithinLimits(
  amount: string,
  config: TryAnchorConfig,
): void {
  const value = parseTryMinorUnits(amount, "sellAmountTry");
  const minimum = parseTryMinorUnits(config.limits.minimumTry, "minimumTry");
  const maximum = parseTryMinorUnits(config.limits.maximumTry, "maximumTry");

  if (value < minimum || value > maximum) {
    throw new TryAnchorError(
      "QUOTE_INVALID",
      `TRY amount must be between ${config.limits.minimumTry} and ${config.limits.maximumTry}.`,
    );
  }
}

export interface CreateFirmQuoteInput {
  readonly config: TryAnchorConfig;
  readonly discovery: AnchorDiscovery;
  readonly session: Sep10Session;
  readonly sellAmountTry: string;
  readonly fetchImpl?: FetchLike;
  readonly now?: () => Date;
}

export async function createFirmQuote(
  input: CreateFirmQuoteInput,
): Promise<Sep38Quote> {
  requireTryWithinLimits(input.sellAmountTry, input.config);

  const sellAsset = TRY_ASSET;
  const buyAsset = stellarAssetId(input.config);
  const quoteUrl = appendPath(input.discovery.anchorQuoteServer, "quote");

  const value = await requireJsonObject(
    await resolveFetch(input.fetchImpl)(quoteUrl, {
      method: "POST",
      headers: {
        ...bearerHeaders(input.session.bearerToken),
        "content-type": "application/json",
      },
      body: JSON.stringify({
        sell_asset: sellAsset,
        buy_asset: buyAsset,
        sell_amount: input.sellAmountTry,
        sell_delivery_method: BANK_ACCOUNT_METHOD,
        country_code: "TUR",
        context: "sep6",
      }),
    }),
    "SEP-38 firm quote request",
    "SEP38_QUOTE_FAILED",
  );

  const expiresAt = requireString(value, "expires_at");
  const expiration = Date.parse(expiresAt);

  if (!Number.isFinite(expiration)) {
    throw new TryAnchorError(
      "QUOTE_INVALID",
      "SEP-38 quote has an invalid expiration timestamp.",
    );
  }

  if (expiration <= (input.now ?? (() => new Date()))().getTime()) {
    throw new TryAnchorError(
      "QUOTE_EXPIRED",
      "SEP-38 quote is already expired.",
    );
  }

  const returnedSellAsset = requireString(value, "sell_asset");
  const returnedBuyAsset = requireString(value, "buy_asset");

  if (returnedSellAsset !== sellAsset || returnedBuyAsset !== buyAsset) {
    throw new TryAnchorError(
      "QUOTE_INVALID",
      "SEP-38 quote returned an unexpected asset pair.",
    );
  }

  const sellAmount = requireString(value, "sell_amount");
  requireTryWithinLimits(sellAmount, input.config);

  const feeValue = value["fee"];
  const fee = feeValue === undefined
    ? undefined
    : isJsonObject(feeValue)
      ? {
          total: requireString(feeValue, "total"),
          asset: requireString(feeValue, "asset"),
        }
      : (() => {
          throw new TryAnchorError(
            "ANCHOR_RESPONSE_INVALID",
            "SEP-38 quote fee must be an object.",
          );
        })();

  return {
    id: requireString(value, "id"),
    expiresAt,
    sellAsset: returnedSellAsset,
    sellAmount,
    buyAsset: returnedBuyAsset,
    buyAmount: requireString(value, "buy_amount"),
    price: requireString(value, "price"),
    totalPrice: requireString(value, "total_price"),
    ...(fee === undefined ? {} : { fee }),
  };
}

export interface CreateOfframpFirmQuoteInput {
  readonly config: TryAnchorConfig;
  readonly discovery: AnchorDiscovery;
  readonly session: Sep10Session;
  readonly sellAmountUsdc: string;
  readonly fetchImpl?: FetchLike;
  readonly now?: () => Date;
}

export async function createOfframpFirmQuote(
  input: CreateOfframpFirmQuoteInput,
): Promise<Sep38Quote> {
  const requestedSellBaseUnits =
    parseUsdcBaseUnits(
      input.sellAmountUsdc,
      "sellAmountUsdc",
    );

  if (requestedSellBaseUnits <= 0n) {
    throw new TryAnchorError(
      "QUOTE_INVALID",
      "sellAmountUsdc must be greater than zero.",
    );
  }

  const sellAsset =
    stellarAssetId(
      input.config,
    );

  const buyAsset =
    TRY_ASSET;

  const quoteUrl =
    appendPath(
      input.discovery.anchorQuoteServer,
      "quote",
    );

  const value =
    await requireJsonObject(
      await resolveFetch(
        input.fetchImpl,
      )(
        quoteUrl,
        {
          method:
            "POST",

          headers: {
            ...bearerHeaders(
              input.session.bearerToken,
            ),

            "content-type":
              "application/json",
          },

          body:
            JSON.stringify({
              sell_asset:
                sellAsset,

              buy_asset:
                buyAsset,

              sell_amount:
                input.sellAmountUsdc,

              buy_delivery_method:
                BANK_ACCOUNT_METHOD,

              country_code:
                "TUR",

              context:
                "sep6",
            }),
        },
      ),
      "SEP-38 off-ramp firm quote request",
      "SEP38_QUOTE_FAILED",
    );

  const expiresAt =
    requireString(
      value,
      "expires_at",
    );

  const expiration =
    Date.parse(
      expiresAt,
    );

  if (!Number.isFinite(expiration)) {
    throw new TryAnchorError(
      "QUOTE_INVALID",
      "SEP-38 off-ramp quote has an invalid expiration timestamp.",
    );
  }

  if (
    expiration <=
      (
        input.now ??
        (() => new Date())
      )().getTime()
  ) {
    throw new TryAnchorError(
      "QUOTE_EXPIRED",
      "SEP-38 off-ramp quote is already expired.",
    );
  }

  const returnedSellAsset =
    requireString(
      value,
      "sell_asset",
    );

  const returnedBuyAsset =
    requireString(
      value,
      "buy_asset",
    );

  if (
    returnedSellAsset !==
      sellAsset ||
    returnedBuyAsset !==
      buyAsset
  ) {
    throw new TryAnchorError(
      "QUOTE_INVALID",
      "SEP-38 off-ramp quote returned an unexpected asset pair.",
    );
  }

  const sellAmount =
    requireString(
      value,
      "sell_amount",
    );

  const returnedSellBaseUnits =
    parseUsdcBaseUnits(
      sellAmount,
      "returned sell_amount",
    );

  if (
    returnedSellBaseUnits !==
      requestedSellBaseUnits
  ) {
    throw new TryAnchorError(
      "QUOTE_INVALID",
      "SEP-38 off-ramp quote does not preserve the exact requested USDC amount.",
    );
  }

  const buyAmount =
    requireString(
      value,
      "buy_amount",
    );

  requireTryWithinLimits(
    buyAmount,
    input.config,
  );

  const feeValue =
    value["fee"];

  const fee =
    feeValue === undefined
      ? undefined
      : isJsonObject(feeValue)
        ? {
            total:
              requireString(
                feeValue,
                "total",
              ),

            asset:
              requireString(
                feeValue,
                "asset",
              ),
          }
        : (() => {
            throw new TryAnchorError(
              "ANCHOR_RESPONSE_INVALID",
              "SEP-38 off-ramp quote fee must be an object.",
            );
          })();

  return {
    id:
      requireString(
        value,
        "id",
      ),

    expiresAt,

    sellAsset:
      returnedSellAsset,

    sellAmount,

    buyAsset:
      returnedBuyAsset,

    buyAmount,

    price:
      requireString(
        value,
        "price",
      ),

    totalPrice:
      requireString(
        value,
        "total_price",
      ),

    ...(fee === undefined
      ? {}
      : { fee }),
  };
}
