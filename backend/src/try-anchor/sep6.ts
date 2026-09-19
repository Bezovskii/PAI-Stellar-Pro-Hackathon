import {
  TryAnchorError,
} from "./error.js";

import {
  appendPath,
  bearerHeaders,
  isJsonObject,
  optionalString,
  requireJsonObject,
  requireString,
  resolveFetch,
} from "./protocol.js";

import {
  BANK_ACCOUNT_METHOD,
  TRY_ASSET,
  stellarAssetId,
} from "./sep38.js";

import type {
  AcceptedKyc,
  AnchorDiscovery,
  DepositExchangeInstructions,
  FetchLike,
  Sep10Session,
  Sep38Quote,
  Sep6Transaction,
  TryAnchorConfig,
  WithdrawalExchangeInstructions,
} from "./types.js";

export interface CreateDepositExchangeInput {
  readonly config: TryAnchorConfig;
  readonly discovery: AnchorDiscovery;
  readonly session: Sep10Session;
  readonly kyc: AcceptedKyc;
  readonly quote: Sep38Quote;
  readonly destinationAccount: string;
  readonly fetchImpl?: FetchLike;
}

function optionalNumber(
  value: Readonly<Record<string, unknown>>,
  field: string,
): number | undefined {
  const candidate = value[field];

  if (candidate === undefined || candidate === null) {
    return undefined;
  }

  if (typeof candidate !== "number" || !Number.isFinite(candidate)) {
    throw new TryAnchorError(
      "ANCHOR_RESPONSE_INVALID",
      `Anchor response field ${field} must be a finite number.`,
    );
  }

  return candidate;
}

export async function createDepositExchange(
  input: CreateDepositExchangeInput,
): Promise<DepositExchangeInstructions> {
  if (input.kyc.status !== "ACCEPTED") {
    throw new TryAnchorError(
      "KYC_REQUIRED",
      "SEP-6 deposit exchange requires accepted KYC.",
    );
  }

  if (
    input.quote.sellAsset !== TRY_ASSET ||
    input.quote.buyAsset !== stellarAssetId(input.config)
  ) {
    throw new TryAnchorError(
      "QUOTE_INVALID",
      "SEP-6 deposit exchange received an incompatible quote.",
    );
  }

  const quoteExpiration = Date.parse(input.quote.expiresAt);

  if (
    !Number.isFinite(quoteExpiration) ||
    quoteExpiration <= Date.now()
  ) {
    throw new TryAnchorError(
      "QUOTE_EXPIRED",
      "SEP-38 quote expired before deposit creation.",
    );
  }

  const url = appendPath(
    input.discovery.transferServerSep6,
    "deposit-exchange",
  );

  url.searchParams.set("destination_asset", input.config.settlementAsset.code);
  url.searchParams.set("source_asset", input.quote.sellAsset);
  url.searchParams.set("amount", input.quote.sellAmount);
  url.searchParams.set("funding_method", BANK_ACCOUNT_METHOD);
  url.searchParams.set("account", input.destinationAccount);
  url.searchParams.set("quote_id", input.quote.id);
  url.searchParams.set("country_code", "TUR");
  url.searchParams.set("claimable_balance_supported", "false");

  if (input.kyc.customerId !== undefined) {
    url.searchParams.set("customer_id", input.kyc.customerId);
  }

  const value = await requireJsonObject(
    await resolveFetch(input.fetchImpl)(url, {
      headers: bearerHeaders(input.session.bearerToken),
    }),
    "SEP-6 deposit-exchange request",
    "SEP6_DEPOSIT_FAILED",
  );

  const extraInfoValue = value["extra_info"];
  const extraInfo = extraInfoValue === undefined
    ? undefined
    : isJsonObject(extraInfoValue)
      ? extraInfoValue
      : (() => {
          throw new TryAnchorError(
            "ANCHOR_RESPONSE_INVALID",
            "SEP-6 extra_info must be an object.",
          );
        })();

  const how = optionalString(value, "how");
  const etaSeconds = optionalNumber(value, "eta");

  return {
    anchorTransactionId: requireString(value, "id"),
    quoteId: input.quote.id,
    destinationAccount: input.destinationAccount,
    ...(how === undefined ? {} : { how }),
    ...(etaSeconds === undefined ? {} : { etaSeconds }),
    ...(value["min_amount"] === undefined
      ? {}
      : { minAmount: String(value["min_amount"]) }),
    ...(value["max_amount"] === undefined
      ? {}
      : { maxAmount: String(value["max_amount"]) }),
    ...(extraInfo === undefined ? {} : { extraInfo }),
  };
}

export async function simulateSandboxBankTransfer(
  discovery: AnchorDiscovery,
  session: Sep10Session,
  anchorTransactionId: string,
  fetchImpl?: FetchLike,
): Promise<void> {
  if (discovery.homeDomain !== "tr-mock-anchor.fly.dev") {
    throw new TryAnchorError(
      "SEP6_DEPOSIT_FAILED",
      "Bank-transfer simulation is restricted to the TR mock anchor sandbox.",
    );
  }

  const url = appendPath(
    discovery.transferServerSep6,
    `tx/${encodeURIComponent(anchorTransactionId)}/simulate-bank-transfer`,
  );

  await requireJsonObject(
    await resolveFetch(fetchImpl)(url, {
      method: "POST",
      headers: bearerHeaders(session.bearerToken),
    }),
    "Sandbox bank-transfer simulation",
    "SEP6_DEPOSIT_FAILED",
  );
}

export async function getSep6Transaction(
  discovery: AnchorDiscovery,
  session: Sep10Session,
  anchorTransactionId: string,
  fetchImpl?: FetchLike,
): Promise<Sep6Transaction> {
  const url = appendPath(discovery.transferServerSep6, "transaction");
  url.searchParams.set("id", anchorTransactionId);

  const responseValue = await requireJsonObject(
    await resolveFetch(fetchImpl)(url, {
      headers: bearerHeaders(session.bearerToken),
    }),
    "SEP-6 transaction status request",
    "SEP6_TRANSACTION_FAILED",
  );

  const wrappedTransaction =
    responseValue["transaction"];

  const value =
    wrappedTransaction === undefined
      ? responseValue
      : isJsonObject(wrappedTransaction)
        ? wrappedTransaction
        : (() => {
            throw new TryAnchorError(
              "ANCHOR_RESPONSE_INVALID",
              "SEP-6 transaction wrapper must contain an object.",
            );
          })();

  const returnedId = requireString(value, "id");

  if (returnedId !== anchorTransactionId) {
    throw new TryAnchorError(
      "ANCHOR_RESPONSE_INVALID",
      "SEP-6 transaction response returned an unexpected id.",
    );
  }

  const quoteId = optionalString(value, "quote_id");
  const amountIn = optionalString(value, "amount_in");
  const amountInAsset = optionalString(value, "amount_in_asset");
  const amountOut = optionalString(value, "amount_out");
  const amountOutAsset = optionalString(value, "amount_out_asset");
  const stellarTransactionId = optionalString(value, "stellar_transaction_id");
  const externalTransactionId = optionalString(value, "external_transaction_id");
  const to = optionalString(value, "to");
  const claimableBalanceId = optionalString(value, "claimable_balance_id");
  const startedAt = optionalString(value, "started_at");
  const updatedAt = optionalString(value, "updated_at");
  const completedAt = optionalString(value, "completed_at");
  const message = optionalString(value, "message");

  return {
    id: returnedId,
    status: requireString(value, "status"),
    ...(quoteId === undefined ? {} : { quoteId }),
    ...(amountIn === undefined ? {} : { amountIn }),
    ...(amountInAsset === undefined ? {} : { amountInAsset }),
    ...(amountOut === undefined ? {} : { amountOut }),
    ...(amountOutAsset === undefined ? {} : { amountOutAsset }),
    ...(stellarTransactionId === undefined ? {} : { stellarTransactionId }),
    ...(externalTransactionId === undefined ? {} : { externalTransactionId }),
    ...(to === undefined ? {} : { to }),
    ...(claimableBalanceId === undefined ? {} : { claimableBalanceId }),
    ...(startedAt === undefined ? {} : { startedAt }),
    ...(updatedAt === undefined ? {} : { updatedAt }),
    ...(completedAt === undefined ? {} : { completedAt }),
    ...(message === undefined ? {} : { message }),
  };
}

export interface CreateWithdrawExchangeInput {
  readonly config: TryAnchorConfig;
  readonly discovery: AnchorDiscovery;
  readonly session: Sep10Session;
  readonly kyc: AcceptedKyc;
  readonly quote: Sep38Quote;
  readonly fetchImpl?: FetchLike;
  readonly now?: () => Date;
}

export async function createWithdrawExchange(
  input: CreateWithdrawExchangeInput,
): Promise<WithdrawalExchangeInstructions> {
  if (input.kyc.status !== "ACCEPTED") {
    throw new TryAnchorError(
      "KYC_REQUIRED",
      "SEP-6 withdrawal requires accepted KYC.",
    );
  }

  const expectedSellAsset =
    stellarAssetId(input.config);

  if (
    input.quote.sellAsset !== expectedSellAsset ||
    input.quote.buyAsset !== TRY_ASSET
  ) {
    throw new TryAnchorError(
      "QUOTE_INVALID",
      "SEP-38 quote does not match the USDC to TRY off-ramp pair.",
    );
  }

  const expiresAt =
    Date.parse(input.quote.expiresAt);

  if (
    !Number.isFinite(expiresAt) ||
    expiresAt <=
      (input.now ?? (() => new Date()))().getTime()
  ) {
    throw new TryAnchorError(
      "QUOTE_EXPIRED",
      "SEP-38 off-ramp quote is expired.",
    );
  }

  const url =
    appendPath(
      input.discovery.transferServerSep6,
      "withdraw-exchange",
    );

  // Verified against deployed sandbox on 2026-09-19:
  // SEP-6 expects "USDC"; SEP-38 uses stellar:USDC:<issuer>.
  url.searchParams.set(
    "source_asset",
    input.config.settlementAsset.code,
  );
  url.searchParams.set(
    "destination_asset",
    TRY_ASSET,
  );
  url.searchParams.set(
    "amount",
    input.quote.sellAmount,
  );
  url.searchParams.set(
    "funding_method",
    BANK_ACCOUNT_METHOD,
  );
  url.searchParams.set(
    "type",
    BANK_ACCOUNT_METHOD,
  );
  url.searchParams.set(
    "quote_id",
    input.quote.id,
  );
  url.searchParams.set(
    "country_code",
    "TUR",
  );

  if (input.kyc.customerId !== undefined) {
    url.searchParams.set(
      "customer_id",
      input.kyc.customerId,
    );
  }

  const value =
    await requireJsonObject(
      await resolveFetch(input.fetchImpl)(
        url,
        {
          headers:
            bearerHeaders(
              input.session.bearerToken,
            ),
        },
      ),
      "SEP-6 withdraw-exchange request",
      "SEP6_WITHDRAW_FAILED",
    );

  const memoType =
    requireString(
      value,
      "memo_type",
    );

  if (memoType !== "id") {
    throw new TryAnchorError(
      "ANCHOR_RESPONSE_INVALID",
      "SEP-6 withdrawal must use memo_type id.",
    );
  }

  const anchorTransactionId =
    requireString(value, "id");

  const destinationAccount =
    requireString(
      value,
      "account_id",
    );

  const memo =
    requireString(
      value,
      "memo",
    );

  const etaValue =
    value["eta"];

  const etaSeconds =
    typeof etaValue === "number" &&
    Number.isSafeInteger(etaValue) &&
    etaValue >= 0
      ? etaValue
      : undefined;

  const extraInfoValue =
    value["extra_info"];

  const extraInfo =
    extraInfoValue === undefined
      ? undefined
      : isJsonObject(extraInfoValue)
        ? extraInfoValue
        : (() => {
            throw new TryAnchorError(
              "ANCHOR_RESPONSE_INVALID",
              "SEP-6 withdrawal extra_info must be an object.",
            );
          })();

  return {
    anchorTransactionId,
    quoteId:
      input.quote.id,
    destinationAccount,
    memoType: "id",
    memo,

    ...(etaSeconds === undefined
      ? {}
      : { etaSeconds }),

    ...(extraInfo === undefined
      ? {}
      : { extraInfo }),
  };
}