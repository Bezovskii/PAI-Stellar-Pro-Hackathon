export const STELLAR_FUNDING_SCHEMA_VERSION =
    "pai.stellar-funding.v1";

export const STELLAR_FUNDING_STATUSES = Object.freeze([
    "PREPARING",
    "QUOTING",
    "ANCHOR_PENDING",
    "STELLAR_RECEIVED",
    "ESCROW_FUNDING",
    "FUNDED",
    "FAILED",
]);

/**
 * @typedef {"PREPARING"|"QUOTING"|"ANCHOR_PENDING"|"STELLAR_RECEIVED"|"ESCROW_FUNDING"|"FUNDED"|"FAILED"} StellarFundingStatus
 */

/**
 * @typedef {Object} StellarFundingQuote
 * @property {string} quoteId
 * @property {"TRY"} sourceAsset
 * @property {string} sourceAmount
 * @property {"USDC"} settlementAsset
 * @property {string} settlementAmount
 * @property {string} expiresAt
 */

/**
 * @typedef {Object} StellarFundingTransaction
 * @property {"stellar-testnet"} network
 * @property {string} transactionHash
 * @property {number} ledger
 * @property {string} destinationAccount
 * @property {"USDC"} assetCode
 * @property {string} assetIssuer
 * @property {string} amountBaseUnits
 * @property {true} verified
 */

/**
 * @typedef {Object} StellarFundingEscrow
 * @property {string} contractId
 * @property {"CREATED"|"FUNDED"} state
 * @property {string|null} initializationTransactionHash
 * @property {string|null} fundingTransactionHash
 * @property {number|null} ledger
 * @property {string|null} escrowAgreementHash
 * @property {string|null} escrowExecutionBindingHash
 */

/**
 * @typedef {Object} StellarFundingFailure
 * @property {string} code
 * @property {"PREPARING"|"QUOTING"|"ANCHOR"|"STELLAR_VERIFICATION"|"ESCROW_INITIALIZATION"|"ESCROW_FUNDING"} stage
 * @property {string} message
 * @property {boolean} retryable
 */

/**
 * @typedef {Object} StellarFundingOperation
 * @property {"pai.stellar-funding.v1"} schemaVersion
 * @property {string} fundingId
 * @property {string} agreementId
 * @property {string} agreementVersion
 * @property {string} agreementHash
 * @property {string} executionBindingHash
 * @property {StellarFundingStatus} status
 * @property {boolean} retryable
 * @property {StellarFundingQuote|null} quote
 * @property {StellarFundingTransaction|null} stellar
 * @property {StellarFundingEscrow|null} escrow
 * @property {StellarFundingFailure|null} failure
 * @property {string} createdAt
 * @property {string} updatedAt
 */

async function readJson(response) {
    try {
        return await response.json();
    } catch {
        return null;
    }
}

function requireNonEmptyString(value, name) {
    if (
        typeof value !== "string" ||
        value.trim().length === 0
    ) {
        throw new Error(`${name} is required.`);
    }

    return value.trim();
}

function createApiError(response, payload) {
    const message =
        payload?.failure?.message ||
        payload?.message ||
        payload?.error ||
        `Stellar funding request failed with HTTP ${response.status}.`;

    const error = new Error(message);

    error.status = response.status;
    error.code =
        response.status === 404
            ? "STELLAR_FUNDING_API_UNAVAILABLE"
            : payload?.failure?.code ||
              payload?.code ||
              "STELLAR_FUNDING_API_ERROR";

    error.unavailable =
        response.status === 404;

    error.retryable =
        payload?.retryable === true ||
        payload?.failure?.retryable === true;

    error.payload = payload;

    return error;
}

function validateFundingOperation(payload) {
    if (
        !payload ||
        payload.schemaVersion !==
            STELLAR_FUNDING_SCHEMA_VERSION
    ) {
        throw new Error(
            "Backend returned an unsupported Stellar funding response."
        );
    }

    if (
        !STELLAR_FUNDING_STATUSES.includes(
            payload.status
        )
    ) {
        throw new Error(
            "Backend returned an unknown Stellar funding status."
        );
    }

    return payload;
}

async function requestFundingApi(
    endpoint,
    options = {}
) {
    const response =
        await fetch(endpoint, {
            credentials: "include",
            ...options,
        });

    const payload =
        await readJson(response);

    if (!response.ok) {
        throw createApiError(
            response,
            payload
        );
    }

    return validateFundingOperation(
        payload
    );
}

/**
 * Create or resume the backend-owned TRY -> USDC -> Soroban operation.
 *
 * The frontend intentionally does not submit agreement amount,
 * settlement amount, hashes, issuer, SAC, or Soroban contract ID.
 *
 * @returns {Promise<StellarFundingOperation>}
 */
export async function startOrResumeStellarFunding({
    agreementId,
    payerAccount,
    recipientAccount,
    maxSourceAmountTry,
}) {
    const resolvedAgreementId =
        requireNonEmptyString(
            agreementId,
            "agreementId"
        );

    const resolvedPayerAccount =
        requireNonEmptyString(
            payerAccount,
            "payerAccount"
        );

    const resolvedRecipientAccount =
        requireNonEmptyString(
            recipientAccount,
            "recipientAccount"
        );

    const body = {
        sourceAsset: "TRY",
        payerAccount:
            resolvedPayerAccount,
        recipientAccount:
            resolvedRecipientAccount,
    };

    if (
        typeof maxSourceAmountTry === "string" &&
        maxSourceAmountTry.trim().length > 0
    ) {
        body.maxSourceAmountTry =
            maxSourceAmountTry.trim();
    }

    return requestFundingApi(
        `/api/v1/agreements/${encodeURIComponent(
            resolvedAgreementId
        )}/stellar-funding`,
        {
            method: "POST",
            headers: {
                "Content-Type":
                    "application/json",
            },
            body: JSON.stringify(body),
        }
    );
}

/**
 * This endpoint is the sole authority for progress.
 *
 * @returns {Promise<StellarFundingOperation>}
 */
export async function getStellarFundingStatus({
    agreementId,
    fundingId,
}) {
    const resolvedAgreementId =
        requireNonEmptyString(
            agreementId,
            "agreementId"
        );

    const resolvedFundingId =
        requireNonEmptyString(
            fundingId,
            "fundingId"
        );

    return requestFundingApi(
        `/api/v1/agreements/${encodeURIComponent(
            resolvedAgreementId
        )}/stellar-funding/${encodeURIComponent(
            resolvedFundingId
        )}`
    );
}

/**
 * Retry is requested only for a backend-declared retryable FAILED operation.
 *
 * @returns {Promise<StellarFundingOperation>}
 */
export async function retryStellarFunding({
    agreementId,
    fundingId,
}) {
    const resolvedAgreementId =
        requireNonEmptyString(
            agreementId,
            "agreementId"
        );

    const resolvedFundingId =
        requireNonEmptyString(
            fundingId,
            "fundingId"
        );

    return requestFundingApi(
        `/api/v1/agreements/${encodeURIComponent(
            resolvedAgreementId
        )}/stellar-funding/${encodeURIComponent(
            resolvedFundingId
        )}/retry`,
        {
            method: "POST",
        }
    );
}

