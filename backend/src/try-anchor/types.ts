export interface FetchLike {
  (
    input: string | URL,
    init?: RequestInit,
  ): Promise<Response>;
}

export interface TryAnchorConfig {
  readonly homeDomain: string;
  readonly networkPassphrase: string;
  readonly horizonUrl: string;

  readonly settlementAsset: {
    readonly code: "USDC";
    readonly issuer: string;
  };

  readonly limits: {
    readonly minimumTry: string;
    readonly maximumTry: string;
  };
}

export interface AnchorDiscovery {
  readonly homeDomain: string;
  readonly webAuthEndpoint: string;
  readonly signingKey: string;
  readonly transferServerSep6: string;
  readonly kycServer: string;
  readonly anchorQuoteServer: string;
}

export interface Sep10Signer {
  readonly accountId: string;

  signChallenge(
    challengeXdr: string,
    networkPassphrase: string,
  ): Promise<string>;
}

/**
 * Internal session only. It must never be included in the normalized
 * acquisition proof returned to the Settlement Router.
 */
export interface Sep10Session {
  readonly accountId: string;
  readonly bearerToken: string;
}

export type KycFieldValues =
  Readonly<Record<string, string>>;

export interface AcceptedKyc {
  readonly status: "ACCEPTED";
  readonly customerId?: string;
}

export interface Sep38Quote {
  readonly id: string;
  readonly expiresAt: string;
  readonly sellAsset: string;
  readonly sellAmount: string;
  readonly buyAsset: string;
  readonly buyAmount: string;
  readonly price: string;
  readonly totalPrice: string;
  readonly fee?: {
    readonly total: string;
    readonly asset: string;
  };
}

export interface DepositExchangeInstructions {
  readonly anchorTransactionId: string;
  readonly quoteId: string;
  readonly destinationAccount: string;
  readonly how?: string;
  readonly etaSeconds?: number;
  readonly minAmount?: string;
  readonly maxAmount?: string;
  readonly extraInfo?: Readonly<Record<string, unknown>>;
}

export interface WithdrawalExchangeInstructions {
  readonly anchorTransactionId: string;
  readonly quoteId: string;
  readonly destinationAccount: string;
  readonly memoType: "id";
  readonly memo: string;
  readonly etaSeconds?: number;
  readonly extraInfo?: Readonly<Record<string, unknown>>;
}
export interface Sep6Transaction {
  readonly id: string;
  readonly status: string;
  readonly quoteId?: string;
  readonly amountIn?: string;
  readonly amountInAsset?: string;
  readonly amountOut?: string;
  readonly amountOutAsset?: string;
  readonly stellarTransactionId?: string;
  readonly externalTransactionId?: string;
  readonly to?: string;
  readonly claimableBalanceId?: string;
  readonly startedAt?: string;
  readonly updatedAt?: string;
  readonly completedAt?: string;
  readonly message?: string;
}

export interface HorizonPaymentEvidence {
  readonly transactionHash: string;
  readonly ledger: number;
  readonly createdAt: string;
  readonly paymentAmount: string;
  readonly trustlineBalance: string;
  readonly sellingLiabilities: string;
  readonly spendableBalance: string;
}

/**
 * Safe to expose outside the anchor integration. Authentication tokens,
 * KYC fields, and bank instructions are deliberately excluded.
 */
export interface HorizonOutboundPaymentEvidence {
  readonly transactionHash: string;
  readonly ledger: number;
  readonly createdAt: string;
  readonly sourceAccount: string;
  readonly destinationAccount: string;
  readonly paymentAmount: string;
  readonly memoType: "id";
  readonly memo: string;
}
export interface StellarPaymentAuthorizationRequest {
  readonly sourceAccount: string;
  readonly destinationAccount: string;
  readonly asset: {
    readonly code: "USDC";
    readonly issuer: string;
  };
  readonly amount: string;
  readonly memoType: "id";
  readonly memo: string;
  readonly networkPassphrase: string;
}

export interface StellarPaymentAuthorizer {
  readonly accountId: string;

  submitPayment(
    request: StellarPaymentAuthorizationRequest,
  ): Promise<{
    readonly transactionHash: string;
  }>;
}

export interface VerifiedTryOfframpProof {
  readonly version: "pai.try-offramp-proof.v1";
  readonly status: "verified";
  readonly provider: "tr-mock-anchor";
  readonly environment: "stellar-testnet";
  readonly rail: "sep6-withdraw-exchange";

  readonly source: {
    readonly network: "stellar-testnet";
    readonly asset: {
      readonly code: "USDC";
      readonly issuer: string;
    };
    readonly amount: string;
    readonly account: string;
  };

  readonly destination: {
    readonly asset: "iso4217:TRY";
    readonly amount: string;
    readonly payoutReference: string;
  };

  readonly references: {
    readonly quoteId: string;
    readonly anchorTransactionId: string;
    readonly stellarTransactionHash: string;
    readonly ledger: number;
  };

  readonly verifiedAt: string;
}
export interface VerifiedAssetAcquisitionProof {
  readonly version: "pai.asset-acquisition-proof.v1";
  readonly status: "verified";
  readonly provider: "tr-mock-anchor";
  readonly environment: "stellar-testnet";
  readonly rail: "sep6-deposit-exchange";
  readonly source: {
    readonly asset: "iso4217:TRY";
    readonly amount: string;
  };
  readonly settlement: {
    readonly network: "stellar-testnet";
    readonly asset: {
      readonly code: "USDC";
      readonly issuer: string;
    };
    readonly amount: string;
    readonly destinationAccount: string;
    readonly spendableBalance: string;
  };
  readonly references: {
    readonly quoteId: string;
    readonly anchorTransactionId: string;
    readonly stellarTransactionHash: string;
    readonly ledger: number;
  };
  readonly verifiedAt: string;
}
