export type TryAnchorErrorCode =
  | "ANCHOR_DISCOVERY_FAILED"
  | "ANCHOR_RESPONSE_INVALID"
  | "SEP10_CHALLENGE_INVALID"
  | "SEP10_SIGNING_FAILED"
  | "SEP10_AUTHENTICATION_FAILED"
  | "SEP12_REQUEST_FAILED"
  | "KYC_REQUIRED"
  | "KYC_PENDING"
  | "KYC_REJECTED"
  | "SEP38_QUOTE_FAILED"
  | "QUOTE_INVALID"
  | "QUOTE_EXPIRED"
  | "SEP6_DEPOSIT_FAILED"
  | "SEP6_TRANSACTION_FAILED"
  | "ACQUISITION_NOT_READY"
  | "HORIZON_REQUEST_FAILED"
  | "HORIZON_TRANSACTION_INVALID"
  | "ASSET_NOT_SPENDABLE";

export class TryAnchorError
  extends Error {
  constructor(
    readonly code:
      TryAnchorErrorCode,
    message:
      string,
  ) {
    super(
      message,
    );

    this.name =
      "TryAnchorError";
  }
}
