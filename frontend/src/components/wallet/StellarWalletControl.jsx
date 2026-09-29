import {
    useStellarWallet,
} from "../../hooks/useStellarWallet.js";

import "./WalletControl.css";

function shortAddress(address) {
    if (!address) {
        return "";
    }

    return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function signingButtonText(status) {
    if (status === "preparing") {
        return "Preparing proof...";
    }

    if (status === "awaiting-signature") {
        return "Approve in Freighter...";
    }

    if (status === "submitting") {
        return "Submitting proof...";
    }

    return "Verify Stellar signing";
}

export default function StellarWalletControl() {
    const {
        address,

        isConnected,
        isConnecting,
        walletError,

        signingProof,

        connectStellarWallet,
        disconnectStellarWallet,
        submitStellarSigningProof,
        clearStellarSigningProof,
    } = useStellarWallet();

    const handleConnect =
        async () => {
            try {
                await connectStellarWallet();
            } catch {
                // StellarWalletContext owns the visible error.
            }
        };

    const handleDisconnect =
        async () => {
            try {
                await disconnectStellarWallet();
            } catch {
                // Disconnect still clears local wallet state.
            }
        };

    const handleSigningProof =
        async () => {
            clearStellarSigningProof();

            try {
                await submitStellarSigningProof();
            } catch {
                // StellarWalletContext owns the visible error.
            }
        };

    const proofPending =
        signingProof.status === "preparing" ||
        signingProof.status === "awaiting-signature" ||
        signingProof.status === "submitting";

    if (!isConnected) {
        return (
            <div className="walletControl">
                <button
                    type="button"
                    className="walletButton"
                    onClick={handleConnect}
                    disabled={isConnecting}
                    title="Connect Freighter on Stellar Testnet"
                >
                    <span
                        className="walletButtonDot"
                        aria-hidden="true"
                    />

                    {isConnecting
                        ? "Connecting Stellar..."
                        : "Connect Stellar"}
                </button>

                {walletError && (
                    <span
                        className="walletInlineStatus error"
                        role="alert"
                        title={walletError}
                    >
                        {walletError}
                    </span>
                )}
            </div>
        );
    }

    return (
        <div className="walletControl">
            <div
                className="walletIdentityCard authenticated"
                title={`${address} - Stellar Testnet / Freighter`}
            >
                <span
                    className="walletConnectionDot"
                    aria-hidden="true"
                />

                <div className="walletIdentity">
                    <strong>
                        {shortAddress(address)}
                    </strong>

                    <small>
                        Stellar Testnet / Freighter
                    </small>
                </div>
            </div>

            <button
                type="button"
                className="walletAuthButton"
                onClick={handleSigningProof}
                disabled={proofPending}
                title="Sign and submit a 1-stroop XLM payment back to this same Testnet account"
            >
                {signingButtonText(
                    signingProof.status
                )}
            </button>

            {signingProof.status ===
                "success" && (
                <span
                    className="walletInlineStatus"
                    title={
                        signingProof.transactionHash
                    }
                >
                    Signing verified{" "}
                    {shortAddress(
                        signingProof.transactionHash
                    )}
                </span>
            )}

            {signingProof.status ===
                "error" &&
                signingProof.error && (
                <span
                    className="walletInlineStatus error"
                    role="alert"
                    title={
                        signingProof.error
                    }
                >
                    {signingProof.error}
                </span>
            )}

            <button
                type="button"
                className="walletLogoutButton"
                onClick={handleDisconnect}
                disabled={proofPending}
            >
                Disconnect Stellar
            </button>

            {walletError && (
                <span
                    className="walletInlineStatus error"
                    role="alert"
                    title={walletError}
                >
                    {walletError}
                </span>
            )}
        </div>
    );
}
