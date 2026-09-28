import {
    createContext,
    useCallback,
    useMemo,
    useState,
} from "react";

import { Networks } from "@stellar/stellar-sdk";

import {
    StellarWalletsKit,
} from "@creit-tech/stellar-wallets-kit/sdk";

import {
    FreighterModule,
} from "@creit-tech/stellar-wallets-kit/modules/freighter";

// eslint-disable-next-line react-refresh/only-export-components
export const StellarWalletContext =
    createContext(null);

let kitInitialized = false;

function ensureKitInitialized() {
    if (kitInitialized) {
        return;
    }

    StellarWalletsKit.init({
        modules: [
            new FreighterModule(),
        ],
    });

    StellarWalletsKit.setNetwork(
        Networks.TESTNET
    );

    kitInitialized = true;
}

function getErrorMessage(error) {
    return (
        error?.message ||
        "Unexpected Stellar wallet error."
    );
}

async function requireTestnet() {
    const network =
        await StellarWalletsKit.getNetwork();

    if (
        network?.networkPassphrase !==
        Networks.TESTNET
    ) {
        throw new Error(
            "Freighter must be connected to Stellar Testnet."
        );
    }

    return network;
}

export function StellarWalletProvider({
    children,
}) {
    const [address, setAddress] =
        useState("");

    const [
        isConnecting,
        setIsConnecting,
    ] = useState(false);

    const [walletError, setWalletError] =
        useState("");

    const connectStellarWallet =
        useCallback(async () => {
            ensureKitInitialized();

            setIsConnecting(true);
            setWalletError("");

            try {
                const result =
                    await StellarWalletsKit.authModal({
                        showInstallLabel: true,
                        hideUnsupportedWallets: false,
                    });

                await requireTestnet();

                const nextAddress =
                    result?.address?.trim();

                if (!nextAddress) {
                    throw new Error(
                        "Freighter did not return a Stellar address."
                    );
                }

                setAddress(nextAddress);

                return nextAddress;
            } catch (error) {
                const message =
                    getErrorMessage(error);

                setAddress("");
                setWalletError(message);

                throw error;
            } finally {
                setIsConnecting(false);
            }
        }, []);

    const disconnectStellarWallet =
        useCallback(async () => {
            ensureKitInitialized();

            try {
                await StellarWalletsKit.disconnect();
            } finally {
                setAddress("");
                setWalletError("");
            }
        }, []);

    const refreshStellarWallet =
        useCallback(async () => {
            ensureKitInitialized();

            if (!address) {
                return "";
            }

            try {
                await requireTestnet();

                const result =
                    await StellarWalletsKit.getAddress();

                const nextAddress =
                    result?.address?.trim();

                if (!nextAddress) {
                    throw new Error(
                        "Unable to read the active Stellar wallet."
                    );
                }

                setAddress(nextAddress);
                setWalletError("");

                return nextAddress;
            } catch (error) {
                const message =
                    getErrorMessage(error);

                setWalletError(message);

                throw error;
            }
        }, [address]);

    const signStellarTransactionXdr =
        useCallback(
            async (
                transactionXdr
            ) => {
                ensureKitInitialized();

                if (!address) {
                    throw new Error(
                        "Connect Freighter before signing."
                    );
                }

                if (
                    typeof transactionXdr !==
                        "string" ||
                    transactionXdr.trim().length ===
                        0
                ) {
                    throw new Error(
                        "A Stellar transaction XDR is required."
                    );
                }

                await requireTestnet();

                const {
                    signedTxXdr,
                } =
                    await StellarWalletsKit.signTransaction(
                        transactionXdr,
                        {
                            networkPassphrase:
                                Networks.TESTNET,

                            address,
                        }
                    );

                if (
                    typeof signedTxXdr !==
                        "string" ||
                    signedTxXdr.length ===
                        0
                ) {
                    throw new Error(
                        "Freighter did not return a signed transaction."
                    );
                }

                return signedTxXdr;
            },
            [address]
        );

    const value =
        useMemo(
            () => ({
                address,

                isConnected:
                    Boolean(address),

                isConnecting,

                walletError,

                networkPassphrase:
                    Networks.TESTNET,

                connectStellarWallet,

                disconnectStellarWallet,

                refreshStellarWallet,

                signStellarTransactionXdr,
            }),
            [
                address,
                isConnecting,
                walletError,
                connectStellarWallet,
                disconnectStellarWallet,
                refreshStellarWallet,
                signStellarTransactionXdr,
            ]
        );

    return (
        <StellarWalletContext.Provider
            value={value}
        >
            {children}
        </StellarWalletContext.Provider>
    );
}
