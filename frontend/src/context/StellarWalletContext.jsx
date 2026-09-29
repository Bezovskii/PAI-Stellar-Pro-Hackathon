import {
    createContext,
    useCallback,
    useMemo,
    useState,
} from "react";

import {
    Asset,
    BASE_FEE,
    Horizon,
    Networks,
    Operation,
    TransactionBuilder,
} from "@stellar/stellar-sdk";

import {
    StellarWalletsKit,
} from "@creit-tech/stellar-wallets-kit/sdk";

import {
    FreighterModule,
} from "@creit-tech/stellar-wallets-kit/modules/freighter";

// eslint-disable-next-line react-refresh/only-export-components
export const StellarWalletContext =
    createContext(null);

const HORIZON_TESTNET_URL =
    "https://horizon-testnet.stellar.org";

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
        error?.response?.data?.detail ||
        error?.response?.data?.title ||
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

function emptySigningProof() {
    return {
        status: "idle",
        transactionHash: "",
        error: "",
    };
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

    const [
        signingProof,
        setSigningProof,
    ] = useState(
        emptySigningProof
    );

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
                setSigningProof(
                    emptySigningProof()
                );

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
                setSigningProof(
                    emptySigningProof()
                );
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

    const submitStellarSigningProof =
        useCallback(async () => {
            ensureKitInitialized();

            if (!address) {
                throw new Error(
                    "Connect Freighter before creating a signing proof."
                );
            }

            setSigningProof({
                status:
                    "preparing",

                transactionHash:
                    "",

                error:
                    "",
            });

            try {
                await requireTestnet();

                const server =
                    new Horizon.Server(
                        HORIZON_TESTNET_URL
                    );

                let sourceAccount;

                try {
                    sourceAccount =
                        await server.loadAccount(
                            address
                        );
                } catch (error) {
                    if (
                        error?.response?.status ===
                        404
                    ) {
                        throw new Error(
                            "The connected Stellar Testnet account is not funded yet.",
                            { cause: error }
                        );
                    }

                    throw error;
                }

                const transaction =
                    new TransactionBuilder(
                        sourceAccount,
                        {
                            fee:
                                BASE_FEE,

                            networkPassphrase:
                                Networks.TESTNET,
                        }
                    )
                        .addOperation(
                            Operation.payment({
                                destination:
                                    address,

                                asset:
                                    Asset.native(),

                                amount:
                                    "0.0000001",
                            })
                        )
                        .setTimeout(
                            60
                        )
                        .build();

                setSigningProof({
                    status:
                        "awaiting-signature",

                    transactionHash:
                        "",

                    error:
                        "",
                });

                const signedTxXdr =
                    await signStellarTransactionXdr(
                        transaction.toXdr(
                            "base64"
                        )
                    );

                const signedTransaction =
                    TransactionBuilder.fromXdr(
                        signedTxXdr,
                        Networks.TESTNET
                    );

                setSigningProof({
                    status:
                        "submitting",

                    transactionHash:
                        "",

                    error:
                        "",
                });

                const submitted =
                    await server.submitTransaction(
                        signedTransaction
                    );

                const transactionHash =
                    submitted?.hash?.trim();

                if (!transactionHash) {
                    throw new Error(
                        "Stellar accepted the transaction but did not return a transaction hash."
                    );
                }

                setSigningProof({
                    status:
                        "success",

                    transactionHash,

                    error:
                        "",
                });

                return {
                    transactionHash,
                };
            } catch (error) {
                const message =
                    getErrorMessage(
                        error
                    );

                setSigningProof({
                    status:
                        "error",

                    transactionHash:
                        "",

                    error:
                        message,
                });

                throw error;
            }
        }, [
            address,
            signStellarTransactionXdr,
        ]);

    const clearStellarSigningProof =
        useCallback(() => {
            setSigningProof(
                emptySigningProof()
            );
        }, []);

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

                signingProof,

                connectStellarWallet,

                disconnectStellarWallet,

                refreshStellarWallet,

                signStellarTransactionXdr,

                submitStellarSigningProof,

                clearStellarSigningProof,
            }),
            [
                address,
                isConnecting,
                walletError,
                signingProof,
                connectStellarWallet,
                disconnectStellarWallet,
                refreshStellarWallet,
                signStellarTransactionXdr,
                submitStellarSigningProof,
                clearStellarSigningProof,
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
