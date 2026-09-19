import {
  TryAnchorError,
} from "./error.js";

import {
  formatDecimalUnits,
  parseDecimalUnits,
} from "./amounts.js";

import {
  isJsonObject,
  resolveFetch,
  type JsonObject,
} from "./protocol.js";

import type {
  FetchLike,
  HorizonPaymentEvidence,
  HorizonOutboundPaymentEvidence,
  TryAnchorConfig,
} from "./types.js";

const STELLAR_DECIMALS = 7;

async function requireHorizonObject(
  response: Response,
  operation: string,
): Promise<JsonObject> {
  if (!response.ok) {
    throw new TryAnchorError(
      "HORIZON_REQUEST_FAILED",
      `${operation} failed with HTTP ${response.status}.`,
    );
  }

  const value: unknown = await response.json();

  if (!isJsonObject(value)) {
    throw new TryAnchorError(
      "HORIZON_TRANSACTION_INVALID",
      `${operation} returned a non-object response.`,
    );
  }

  return value;
}

function horizonUrl(
  baseUrl: string,
  path: string,
): URL {
  return new URL(
    `${baseUrl.replace(/\/$/, "")}/${path.replace(/^\//, "")}`,
  );
}

function requireBoolean(
  value: JsonObject,
  field: string,
): boolean {
  const candidate = value[field];

  if (typeof candidate !== "boolean") {
    throw new TryAnchorError(
      "HORIZON_TRANSACTION_INVALID",
      `Horizon field ${field} must be a boolean.`,
    );
  }

  return candidate;
}

function requireHorizonString(
  value: JsonObject,
  field: string,
): string {
  const candidate = value[field];

  if (typeof candidate !== "string" || candidate.length === 0) {
    throw new TryAnchorError(
      "HORIZON_TRANSACTION_INVALID",
      `Horizon response is missing ${field}.`,
    );
  }

  return candidate;
}

function requireLedger(
  value: JsonObject,
): number {
  const ledger = value["ledger"];

  if (
    typeof ledger !== "number" ||
    !Number.isSafeInteger(ledger) ||
    ledger <= 0
  ) {
    throw new TryAnchorError(
      "HORIZON_TRANSACTION_INVALID",
      "Horizon transaction has an invalid ledger sequence.",
    );
  }

  return ledger;
}

function embeddedRecords(
  value: JsonObject,
  operation: string,
): readonly JsonObject[] {
  const embedded = value["_embedded"];
  const records = isJsonObject(embedded)
    ? embedded["records"]
    : undefined;

  if (!Array.isArray(records)) {
    throw new TryAnchorError(
      "HORIZON_TRANSACTION_INVALID",
      `${operation} did not return embedded records.`,
    );
  }

  if (!records.every(isJsonObject)) {
    throw new TryAnchorError(
      "HORIZON_TRANSACTION_INVALID",
      `${operation} returned an invalid record.`,
    );
  }

  return records;
}

function findPayment(
  records: readonly JsonObject[],
  transactionHash: string,
  destinationAccount: string,
  assetCode: string,
  assetIssuer: string,
  expectedAmount: bigint,
): JsonObject | undefined {
  return records.find((record) => {
    if (
      record["type"] !== "payment" ||
      record["transaction_successful"] !== true ||
      record["transaction_hash"] !== transactionHash ||
      record["to"] !== destinationAccount ||
      record["asset_code"] !== assetCode ||
      record["asset_issuer"] !== assetIssuer ||
      typeof record["amount"] !== "string"
    ) {
      return false;
    }

    try {
      return parseDecimalUnits(
        record["amount"],
        STELLAR_DECIMALS,
        "Horizon payment amount",
        "HORIZON_TRANSACTION_INVALID",
      ) === expectedAmount;
    } catch {
      return false;
    }
  });
}

export interface VerifyHorizonPaymentInput {
  readonly config: TryAnchorConfig;
  readonly transactionHash: string;
  readonly destinationAccount: string;
  readonly expectedAmount: string;
  readonly fetchImpl?: FetchLike;
}

export async function verifyHorizonPayment(
  input: VerifyHorizonPaymentInput,
): Promise<HorizonPaymentEvidence> {
  if (!/^[0-9a-f]{64}$/i.test(input.transactionHash)) {
    throw new TryAnchorError(
      "HORIZON_TRANSACTION_INVALID",
      "Stellar transaction hash must be 64 hexadecimal characters.",
    );
  }

  const fetchImpl = resolveFetch(input.fetchImpl);
  const encodedHash = encodeURIComponent(input.transactionHash);
  const expectedAmount = parseDecimalUnits(
    input.expectedAmount,
    STELLAR_DECIMALS,
    "expected settlement amount",
    "HORIZON_TRANSACTION_INVALID",
  );

  const transaction = await requireHorizonObject(
    await fetchImpl(
      horizonUrl(
        input.config.horizonUrl,
        `transactions/${encodedHash}`,
      ),
    ),
    "Horizon transaction request",
  );

  if (
    requireHorizonString(transaction, "hash").toLowerCase() !==
      input.transactionHash.toLowerCase() ||
    !requireBoolean(transaction, "successful")
  ) {
    throw new TryAnchorError(
      "HORIZON_TRANSACTION_INVALID",
      "Horizon did not return the expected successful transaction.",
    );
  }

  const ledger = requireLedger(transaction);
  const createdAt = requireHorizonString(transaction, "created_at");

  const operations = await requireHorizonObject(
    await fetchImpl(
      horizonUrl(
        input.config.horizonUrl,
        `transactions/${encodedHash}/operations?limit=200`,
      ),
    ),
    "Horizon transaction operations request",
  );

  const payment = findPayment(
    embeddedRecords(operations, "Horizon operations request"),
    input.transactionHash,
    input.destinationAccount,
    input.config.settlementAsset.code,
    input.config.settlementAsset.issuer,
    expectedAmount,
  );

  if (payment === undefined) {
    throw new TryAnchorError(
      "HORIZON_TRANSACTION_INVALID",
      "Transaction does not contain the expected direct USDC payment.",
    );
  }

  const account = await requireHorizonObject(
    await fetchImpl(
      horizonUrl(
        input.config.horizonUrl,
        `accounts/${encodeURIComponent(input.destinationAccount)}`,
      ),
    ),
    "Horizon destination account request",
  );

  if (requireHorizonString(account, "account_id") !== input.destinationAccount) {
    throw new TryAnchorError(
      "HORIZON_TRANSACTION_INVALID",
      "Horizon returned an unexpected destination account.",
    );
  }

  const balances = account["balances"];

  if (!Array.isArray(balances) || !balances.every(isJsonObject)) {
    throw new TryAnchorError(
      "HORIZON_TRANSACTION_INVALID",
      "Horizon account balances are invalid.",
    );
  }

  const trustline = balances.find(
    (balance) =>
      balance["asset_code"] === input.config.settlementAsset.code &&
      balance["asset_issuer"] === input.config.settlementAsset.issuer,
  );

  if (trustline === undefined || trustline["is_authorized"] !== true) {
    throw new TryAnchorError(
      "ASSET_NOT_SPENDABLE",
      "Destination account has no authorized USDC trustline.",
    );
  }

  const lastModifiedLedger = trustline["last_modified_ledger"];

  if (
    typeof lastModifiedLedger !== "number" ||
    !Number.isSafeInteger(lastModifiedLedger) ||
    lastModifiedLedger < ledger
  ) {
    throw new TryAnchorError(
      "ASSET_NOT_SPENDABLE",
      "USDC trustline does not reflect the verified transaction ledger.",
    );
  }

  const balanceText = requireHorizonString(trustline, "balance");
  const liabilitiesText = requireHorizonString(
    trustline,
    "selling_liabilities",
  );
  const balance = parseDecimalUnits(
    balanceText,
    STELLAR_DECIMALS,
    "USDC trustline balance",
    "HORIZON_TRANSACTION_INVALID",
  );
  const sellingLiabilities = parseDecimalUnits(
    liabilitiesText,
    STELLAR_DECIMALS,
    "USDC selling liabilities",
    "HORIZON_TRANSACTION_INVALID",
  );
  const spendable = balance - sellingLiabilities;

  if (spendable < expectedAmount) {
    throw new TryAnchorError(
      "ASSET_NOT_SPENDABLE",
      "Destination account does not have enough spendable USDC.",
    );
  }

  return {
    transactionHash: input.transactionHash.toLowerCase(),
    ledger,
    createdAt,
    paymentAmount: requireHorizonString(payment, "amount"),
    trustlineBalance: balanceText,
    sellingLiabilities: liabilitiesText,
    spendableBalance: formatDecimalUnits(spendable, STELLAR_DECIMALS),
  };
}

function findOutboundPayment(
  records: readonly JsonObject[],
  transactionHash: string,
  sourceAccount: string,
  destinationAccount: string,
  assetCode: string,
  assetIssuer: string,
  expectedAmount: bigint,
): JsonObject | undefined {
  return records.find((record) => {
    if (
      record["type"] !== "payment" ||
      record["transaction_successful"] !== true ||
      record["transaction_hash"] !== transactionHash ||
      record["from"] !== sourceAccount ||
      record["to"] !== destinationAccount ||
      record["asset_code"] !== assetCode ||
      record["asset_issuer"] !== assetIssuer ||
      typeof record["amount"] !== "string"
    ) {
      return false;
    }

    try {
      return parseDecimalUnits(
        record["amount"],
        STELLAR_DECIMALS,
        "Horizon outbound payment amount",
        "HORIZON_TRANSACTION_INVALID",
      ) === expectedAmount;
    } catch {
      return false;
    }
  });
}

export interface VerifyHorizonOutboundPaymentInput {
  readonly config: TryAnchorConfig;
  readonly transactionHash: string;
  readonly sourceAccount: string;
  readonly destinationAccount: string;
  readonly expectedAmount: string;
  readonly memo: string;
  readonly fetchImpl?: FetchLike;
}

export async function verifyHorizonOutboundPayment(
  input: VerifyHorizonOutboundPaymentInput,
): Promise<HorizonOutboundPaymentEvidence> {
  if (!/^[0-9a-f]{64}$/i.test(input.transactionHash)) {
    throw new TryAnchorError(
      "HORIZON_TRANSACTION_INVALID",
      "Stellar transaction hash must be 64 hexadecimal characters.",
    );
  }

  if (!/^(0|[1-9]\d*)$/.test(input.memo)) {
    throw new TryAnchorError(
      "HORIZON_TRANSACTION_INVALID",
      "Stellar off-ramp memo must be a decimal MEMO_ID value.",
    );
  }

  const memoId =
    BigInt(
      input.memo,
    );

  if (
    memoId >
      18446744073709551615n
  ) {
    throw new TryAnchorError(
      "HORIZON_TRANSACTION_INVALID",
      "Stellar off-ramp MEMO_ID exceeds uint64.",
    );
  }

  const fetchImpl =
    resolveFetch(
      input.fetchImpl,
    );

  const encodedHash =
    encodeURIComponent(
      input.transactionHash,
    );

  const expectedAmount =
    parseDecimalUnits(
      input.expectedAmount,
      STELLAR_DECIMALS,
      "expected outbound settlement amount",
      "HORIZON_TRANSACTION_INVALID",
    );

  const transaction =
    await requireHorizonObject(
      await fetchImpl(
        horizonUrl(
          input.config.horizonUrl,
          `transactions/${encodedHash}`,
        ),
      ),
      "Horizon outbound transaction request",
    );

  if (
    requireHorizonString(
      transaction,
      "hash",
    ).toLowerCase() !==
      input.transactionHash.toLowerCase() ||
    !requireBoolean(
      transaction,
      "successful",
    )
  ) {
    throw new TryAnchorError(
      "HORIZON_TRANSACTION_INVALID",
      "Horizon did not return the expected successful outbound transaction.",
    );
  }

  if (
    requireHorizonString(
      transaction,
      "source_account",
    ) !==
      input.sourceAccount
  ) {
    throw new TryAnchorError(
      "HORIZON_TRANSACTION_INVALID",
      "Outbound Stellar transaction source does not match the released-USDC recipient.",
    );
  }

  if (
    requireHorizonString(
      transaction,
      "memo_type",
    ) !==
      "id" ||
    requireHorizonString(
      transaction,
      "memo",
    ) !==
      input.memo
  ) {
    throw new TryAnchorError(
      "HORIZON_TRANSACTION_INVALID",
      "Outbound Stellar transaction does not contain the exact required MEMO_ID.",
    );
  }

  const ledger =
    requireLedger(
      transaction,
    );

  const createdAt =
    requireHorizonString(
      transaction,
      "created_at",
    );

  const operations =
    await requireHorizonObject(
      await fetchImpl(
        horizonUrl(
          input.config.horizonUrl,
          `transactions/${encodedHash}/operations?limit=200`,
        ),
      ),
      "Horizon outbound transaction operations request",
    );

  const payment =
    findOutboundPayment(
      embeddedRecords(
        operations,
        "Horizon outbound operations request",
      ),
      input.transactionHash,
      input.sourceAccount,
      input.destinationAccount,
      input.config.settlementAsset.code,
      input.config.settlementAsset.issuer,
      expectedAmount,
    );

  if (payment === undefined) {
    throw new TryAnchorError(
      "HORIZON_TRANSACTION_INVALID",
      "Transaction does not contain the exact expected outbound USDC payment.",
    );
  }

  return {
    transactionHash:
      input.transactionHash.toLowerCase(),

    ledger,
    createdAt,

    sourceAccount:
      input.sourceAccount,

    destinationAccount:
      input.destinationAccount,

    paymentAmount:
      requireHorizonString(
        payment,
        "amount",
      ),

    memoType:
      "id",

    memo:
      input.memo,
  };
}