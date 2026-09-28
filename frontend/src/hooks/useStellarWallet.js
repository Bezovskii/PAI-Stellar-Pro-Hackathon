import {
    useContext,
} from "react";

import {
    StellarWalletContext,
} from "../context/StellarWalletContext.jsx";

export function useStellarWallet() {
    const value =
        useContext(
            StellarWalletContext
        );

    if (!value) {
        throw new Error(
            "useStellarWallet must be used inside StellarWalletProvider."
        );
    }

    return value;
}
