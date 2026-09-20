import {
    useEffect,
    useState,
} from "react";

import {
    getStellarFundingStatus,
    retryStellarFunding,
    startOrResumeStellarFunding,
} from "../../api/stellarFunding.js";

const STATUS_LABELS = Object.freeze({
    PREPARING: "Preparing settlement",
    QUOTING: "Getting TRY / USDC quote",
    ANCHOR_PENDING: "Waiting for TRY funding",
    STELLAR_RECEIVED: "USDC verified on Stellar",
    ESCROW_FUNDING: "Funding programmable escrow",
    FUNDED: "Agreement funded",
    FAILED: "Funding failed",
});

const TERMINAL_STATUSES =
    new Set([
        "FUNDED",
        "FAILED",
    ]);

function shortValue(value) {
    if (
        typeof value !== "string" ||
        value.length <= 18
    ) {
        return value || "-";
    }

    return `${value.slice(0, 10)}...${value.slice(-8)}`;
}

function normalizedEqual(left, right) {
    if (
        typeof left !== "string" ||
        typeof right !== "string" ||
        !left ||
        !right
    ) {
        return null;
    }

    return (
        left.trim().toLowerCase() ===
        right.trim().toLowerCase()
    );
}

function stellarExplorerUrl(transactionHash) {
    if (
        typeof transactionHash !== "string" ||
        transactionHash.trim().length === 0
    ) {
        return "";
    }

    return `https://stellar.expert/explorer/testnet/tx/${encodeURIComponent(
        transactionHash.trim()
    )}`;
}

function ProofComparison({
    label,
    leftLabel,
    leftValue,
    rightLabel,
    rightValue,
}) {
    const match =
        normalizedEqual(
            leftValue,
            rightValue
        );

    return (
        <section className="dashboardProtocolCard">
            <div className="dashboardCardHeader">
                <div>
                    <span className="eyebrow">
                        {label}
                    </span>

                    <h2>
                        Execution integrity
                    </h2>
                </div>

                {match !== null && (
                    <span
                        className={
                            match
                                ? "statusPill active"
                                : "statusPill"
                        }
                    >
                        {match
                            ? "MATCH"
                            : "MISMATCH"}
                    </span>
                )}
            </div>

            <div className="sessionGrid">
                <div>
                    <span>
                        {leftLabel}
                    </span>

                    <strong
                        className="mono"
                        title={leftValue || ""}
                    >
                        {shortValue(
                            leftValue
                        )}
                    </strong>
                </div>

                <div>
                    <span>
                        Equality
                    </span>

                    <strong>
                        {match === null
                            ? "Waiting for on-chain value"
                            : match
                                ? "=="
                                : "!="}
                    </strong>
                </div>

                <div>
                    <span>
                        {rightLabel}
                    </span>

                    <strong
                        className="mono"
                        title={rightValue || ""}
                    >
                        {shortValue(
                            rightValue
                        )}
                    </strong>
                </div>
            </div>
        </section>
    );
}

export default function StellarFundingPanel({
    agreementId: agreementIdProp,
}) {
    const agreementId =
        agreementIdProp ||
        new URLSearchParams(
            window.location.search
        )
            .get("agreementId")
            ?.trim() ||
        "";
    const [
        payerAccount,
        setPayerAccount,
    ] = useState("");

    const [
        recipientAccount,
        setRecipientAccount,
    ] = useState("");

    const [
        maxSourceAmountTry,
        setMaxSourceAmountTry,
    ] = useState("");

    const [
        operation,
        setOperation,
    ] = useState(null);

    const [
        requestState,
        setRequestState,
    ] = useState("idle");

    const [
        localError,
        setLocalError,
    ] = useState("");

    const [
        apiUnavailable,
        setApiUnavailable,
    ] = useState(false);

    const status =
        operation?.status || null;

    useEffect(
        () => {
            if (
                !agreementId ||
                !operation?.fundingId ||
                apiUnavailable ||
                TERMINAL_STATUSES.has(
                    operation.status
                )
            ) {
                return undefined;
            }

            let cancelled = false;
            let inFlight = false;

            const poll =
                async () => {
                    if (
                        cancelled ||
                        inFlight
                    ) {
                        return;
                    }

                    inFlight = true;

                    try {
                        const latest =
                            await getStellarFundingStatus({
                                agreementId,
                                fundingId:
                                    operation.fundingId,
                            });

                        if (!cancelled) {
                            setOperation(
                                latest
                            );

                            setLocalError(
                                ""
                            );
                        }
                    } catch (error) {
                        if (cancelled) {
                            return;
                        }

                        if (
                            error?.unavailable ===
                            true
                        ) {
                            setApiUnavailable(
                                true
                            );
                        }

                        setLocalError(
                            error?.message ||
                                "Unable to read Stellar funding status."
                        );
                    } finally {
                        inFlight = false;
                    }
                };

            const intervalId =
                window.setInterval(
                    poll,
                    2000
                );

            return () => {
                cancelled = true;

                window.clearInterval(
                    intervalId
                );
            };
        },
        [
            agreementId,
            operation?.fundingId,
            operation?.status,
            apiUnavailable,
        ]
    );

    async function handleStart() {
        setLocalError("");
        setApiUnavailable(false);
        setRequestState("starting");

        try {
            const next =
                await startOrResumeStellarFunding({
                    agreementId,
                    payerAccount,
                    recipientAccount,
                    maxSourceAmountTry,
                });

            setOperation(next);
            setRequestState("idle");
        } catch (error) {
            if (
                error?.unavailable === true
            ) {
                setApiUnavailable(true);
            }

            setLocalError(
                error?.message ||
                    "Unable to start Stellar funding."
            );

            setRequestState("idle");
        }
    }

    async function handleRetry() {
        if (
            operation?.status !==
                "FAILED" ||
            operation?.retryable !== true
        ) {
            return;
        }

        setLocalError("");
        setApiUnavailable(false);
        setRequestState("retrying");

        try {
            const next =
                await retryStellarFunding({
                    agreementId,
                    fundingId:
                        operation.fundingId,
                });

            setOperation(next);
        } catch (error) {
            if (
                error?.unavailable === true
            ) {
                setApiUnavailable(true);
            }

            setLocalError(
                error?.message ||
                    "Unable to retry Stellar funding."
            );
        } finally {
            setRequestState("idle");
        }
    }

    const agreementHashMatch =
        normalizedEqual(
            operation?.agreementHash,
            operation?.escrow
                ?.escrowAgreementHash
        );

    const executionBindingHashMatch =
        normalizedEqual(
            operation
                ?.executionBindingHash,
            operation?.escrow
                ?.escrowExecutionBindingHash
        );

    const stellarExplorer =
        stellarExplorerUrl(
            operation?.stellar
                ?.transactionHash
        );

    return (
        <div className="rolePage">
            <div className="pageHeading">
                <div>
                    <span className="eyebrow">
                        Stellar / Funding
                    </span>

                    <h1>
                        Fund with Turkish Lira
                    </h1>

                    <p>
                        PAI Core owns settlement
                        state. This page displays
                        only backend-authoritative
                        progress.
                    </p>
                </div>

                {status && (
                    <span
                        className={
                            status === "FAILED"
                                ? "statusPill"
                                : "statusPill active"
                        }
                    >
                        {status}
                    </span>
                )}
            </div>

            <section className="dashboardProtocolCard">
                <div className="dashboardCardHeader">
                    <div>
                        <span className="eyebrow">
                            Canonical agreement
                        </span>

                        <h2>
                            Funding request
                        </h2>
                    </div>
                </div>

                <div className="sessionGrid">
                    <div>
                        <span>
                            Agreement
                        </span>

                        <strong
                            className="mono"
                            title={
                                agreementId ||
                                ""
                            }
                        >
                            {shortValue(
                                agreementId
                            )}
                        </strong>
                    </div>

                    {operation && (
                        <>
                            <div>
                                <span>
                                    Version
                                </span>

                                <strong>
                                    {
                                        operation.agreementVersion
                                    }
                                </strong>
                            </div>

                            <div>
                                <span>
                                    Funding ID
                                </span>

                                <strong
                                    className="mono"
                                    title={
                                        operation.fundingId
                                    }
                                >
                                    {shortValue(
                                        operation.fundingId
                                    )}
                                </strong>
                            </div>
                        </>
                    )}
                </div>

                {!operation &&
                    !apiUnavailable && (
                        <>
                            <div className="paymentFormGrid">
                                <div className="fullField">
                                    <label htmlFor="stellar-payer">
                                        Stellar payer account
                                    </label>

                                    <input
                                        id="stellar-payer"
                                        type="text"
                                        placeholder="G..."
                                        value={
                                            payerAccount
                                        }
                                        onChange={(
                                            event
                                        ) =>
                                            setPayerAccount(
                                                event.target.value.trim()
                                            )
                                        }
                                    />
                                </div>

                                <div className="fullField">
                                    <label htmlFor="stellar-recipient">
                                        Stellar recipient account
                                    </label>

                                    <input
                                        id="stellar-recipient"
                                        type="text"
                                        placeholder="G..."
                                        value={
                                            recipientAccount
                                        }
                                        onChange={(
                                            event
                                        ) =>
                                            setRecipientAccount(
                                                event.target.value.trim()
                                            )
                                        }
                                    />
                                </div>

                                <div className="fullField">
                                    <label htmlFor="stellar-max-try">
                                        Maximum TRY amount
                                        (optional)
                                    </label>

                                    <input
                                        id="stellar-max-try"
                                        type="text"
                                        inputMode="decimal"
                                        placeholder="1000.00"
                                        value={
                                            maxSourceAmountTry
                                        }
                                        onChange={(
                                            event
                                        ) =>
                                            setMaxSourceAmountTry(
                                                event.target.value
                                            )
                                        }
                                    />
                                </div>
                            </div>

                            <div className="paymentActions">
                                <button
                                    type="button"
                                    className="primary"
                                    disabled={
                                        requestState ===
                                            "starting" ||
                                        !agreementId ||
                                        !payerAccount ||
                                        !recipientAccount
                                    }
                                    onClick={
                                        handleStart
                                    }
                                >
                                    {requestState ===
                                    "starting"
                                        ? "Preparing..."
                                        : "Fund with Turkish Lira"}
                                </button>
                            </div>
                        </>
                    )}
            </section>

            {apiUnavailable && (
                <section
                    className="dashboardProtocolCard"
                    role="status"
                >
                    <span className="eyebrow">
                        Development state
                    </span>

                    <h2>
                        Stellar funding API unavailable
                    </h2>

                    <p>
                        The configured backend does
                        not currently expose the
                        frozen Stellar funding route.
                        No funding state has been
                        advanced locally.
                    </p>
                </section>
            )}

            {localError && (
                <section
                    className="dashboardProtocolCard"
                    role="alert"
                >
                    <span className="eyebrow">
                        Funding error
                    </span>

                    <h2>
                        Request could not be completed
                    </h2>

                    <p>
                        {localError}
                    </p>
                </section>
            )}

            {operation && (
                <>
                    <section className="dashboardProtocolCard">
                        <div className="dashboardCardHeader">
                            <div>
                                <span className="eyebrow">
                                    Backend-authoritative state
                                </span>

                                <h2>
                                    {STATUS_LABELS[
                                        operation.status
                                    ] ||
                                        operation.status}
                                </h2>
                            </div>
                        </div>

                        <ol>
                            {[
                                "PREPARING",
                                "QUOTING",
                                "ANCHOR_PENDING",
                                "STELLAR_RECEIVED",
                                "ESCROW_FUNDING",
                                "FUNDED",
                            ].map(
                                (
                                    item
                                ) => (
                                    <li
                                        key={
                                            item
                                        }
                                    >
                                        <strong>
                                            {
                                                STATUS_LABELS[
                                                    item
                                                ]
                                            }
                                        </strong>

                                        {operation.status ===
                                            item &&
                                            " — CURRENT"}
                                    </li>
                                )
                            )}
                        </ol>

                        {operation.quote && (
                            <div className="sessionGrid">
                                <div>
                                    <span>
                                        Source
                                    </span>

                                    <strong>
                                        {
                                            operation
                                                .quote
                                                .sourceAmount
                                        }{" "}
                                        TRY
                                    </strong>
                                </div>

                                <div>
                                    <span>
                                        Settlement
                                    </span>

                                    <strong>
                                        {
                                            operation
                                                .quote
                                                .settlementAmount
                                        }{" "}
                                        USDC
                                    </strong>
                                </div>

                                <div>
                                    <span>
                                        Quote expires
                                    </span>

                                    <strong>
                                        {
                                            operation
                                                .quote
                                                .expiresAt
                                        }
                                    </strong>
                                </div>
                            </div>
                        )}
                    </section>

                    {operation.stellar && (
                        <section className="dashboardProtocolCard">
                            <div className="dashboardCardHeader">
                                <div>
                                    <span className="eyebrow">
                                        Stellar proof
                                    </span>

                                    <h2>
                                        USDC verified on Stellar
                                    </h2>
                                </div>

                                {operation.stellar
                                    .verified ===
                                    true && (
                                    <span className="statusPill active">
                                        VERIFIED
                                    </span>
                                )}
                            </div>

                            <div className="sessionGrid">
                                <div>
                                    <span>
                                        Network
                                    </span>

                                    <strong>
                                        {
                                            operation
                                                .stellar
                                                .network
                                        }
                                    </strong>
                                </div>

                                <div>
                                    <span>
                                        Asset
                                    </span>

                                    <strong>
                                        {
                                            operation
                                                .stellar
                                                .assetCode
                                        }
                                    </strong>
                                </div>

                                <div>
                                    <span>
                                        Amount
                                    </span>

                                    <strong className="mono">
                                        {
                                            operation
                                                .stellar
                                                .amountBaseUnits
                                        }{" "}
                                        base units
                                    </strong>
                                </div>

                                <div>
                                    <span>
                                        Ledger
                                    </span>

                                    <strong>
                                        {
                                            operation
                                                .stellar
                                                .ledger
                                        }
                                    </strong>
                                </div>

                                <div>
                                    <span>
                                        Transaction
                                    </span>

                                    <strong
                                        className="mono"
                                        title={
                                            operation
                                                .stellar
                                                .transactionHash
                                        }
                                    >
                                        {shortValue(
                                            operation
                                                .stellar
                                                .transactionHash
                                        )}
                                    </strong>
                                </div>
                            </div>

                            {stellarExplorer && (
                                <p>
                                    <a
                                        href={
                                            stellarExplorer
                                        }
                                        target="_blank"
                                        rel="noreferrer"
                                    >
                                        View transaction on Stellar Testnet Explorer ↗
                                    </a>
                                </p>
                            )}
                        </section>
                    )}

                    {operation.status ===
                        "FAILED" && (
                        <section
                            className="dashboardProtocolCard"
                            role="alert"
                        >
                            <span className="eyebrow">
                                Backend failure
                            </span>

                            <h2>
                                {
                                    operation
                                        .failure
                                        ?.stage ||
                                    "Funding"
                                }
                            </h2>

                            <p>
                                {
                                    operation
                                        .failure
                                        ?.message ||
                                    "The backend reported a failed funding operation."
                                }
                            </p>

                            {operation.failure
                                ?.code && (
                                <p className="mono">
                                    {
                                        operation
                                            .failure
                                            .code
                                    }
                                </p>
                            )}

                            {operation.retryable ===
                                true && (
                                <button
                                    type="button"
                                    className="walletAuthButton"
                                    disabled={
                                        requestState ===
                                        "retrying"
                                    }
                                    onClick={
                                        handleRetry
                                    }
                                >
                                    {requestState ===
                                    "retrying"
                                        ? "Retrying..."
                                        : "Retry funding"}
                                </button>
                            )}
                        </section>
                    )}

                    {operation.status ===
                        "FUNDED" && (
                        <>
                            <ProofComparison
                                label="Canonical agreement proof"
                                leftLabel="PAI agreement hash"
                                leftValue={
                                    operation.agreementHash
                                }
                                rightLabel="Stellar escrow agreement hash"
                                rightValue={
                                    operation
                                        .escrow
                                        ?.escrowAgreementHash
                                }
                            />

                            <ProofComparison
                                label="Execution binding proof"
                                leftLabel="PAI execution binding hash"
                                leftValue={
                                    operation.executionBindingHash
                                }
                                rightLabel="Escrow execution binding hash"
                                rightValue={
                                    operation
                                        .escrow
                                        ?.escrowExecutionBindingHash
                                }
                            />

                            <section className="dashboardProtocolCard">
                                <div className="sessionGrid">
                                    <div>
                                        <span>
                                            Agreement hash result
                                        </span>

                                        <strong>
                                            {agreementHashMatch ===
                                            null
                                                ? "On-chain value unavailable"
                                                : agreementHashMatch
                                                    ? "MATCH"
                                                    : "MISMATCH"}
                                        </strong>
                                    </div>

                                    <div>
                                        <span>
                                            Execution binding result
                                        </span>

                                        <strong>
                                            {executionBindingHashMatch ===
                                            null
                                                ? "On-chain value unavailable"
                                                : executionBindingHashMatch
                                                    ? "MATCH"
                                                    : "MISMATCH"}
                                        </strong>
                                    </div>

                                    <div>
                                        <span>
                                            Escrow state
                                        </span>

                                        <strong>
                                            {operation
                                                .escrow
                                                ?.state ||
                                                "-"}
                                        </strong>
                                    </div>
                                </div>
                            </section>
                        </>
                    )}
                </>
            )}
        </div>
    );
}
