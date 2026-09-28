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

export default function StellarWalletControl() {
    const {
        address,

        isConnected,
        isConnecting,
        walletError,

        connectStellarWallet,
        disconnectStellarWallet,
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
                className="walletLogoutButton"
                onClick={handleDisconnect}
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
