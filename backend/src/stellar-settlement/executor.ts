import type {
  VerifiedStellarAcquisitionBinding,
} from "./acquisition.js";

export const STELLAR_FUNDING_EXECUTION_VERSION =
  "pai.stellar-funding-execution.v1" as const;

const HASH_32_PATTERN =
  /^(?:0x)?[0-9a-fA-F]{64}$/;

const STELLAR_CONTRACT_PATTERN =
  /^C[A-Z2-7]{55}$/;

export interface StellarEscrowSnapshot {
  readonly status:
    "Funded";

  readonly amountBaseUnits:
    string;

  readonly canonicalAgreementHash:
    string;

  readonly executionBindingHash:
    string;

  readonly payerAccount:
    string;

  readonly recipientAccount:
    string;

  readonly tokenContract:
    string;
}

export interface StellarFundingSubmission {
  readonly transactionHash:
    string;

  readonly ledger:
    number;
}

export interface StellarFundingTransport {
  fund(
    input: {
      readonly contractId:
        string;

      readonly binding:
        VerifiedStellarAcquisitionBinding;
    },
  ): Promise<StellarFundingSubmission>;

  readEscrow(
    input: {
      readonly contractId:
        string;

      readonly sourceAccount:
        string;
    },
  ): Promise<unknown>;
}

export interface ExecuteStellarFundingInput {
  readonly contractId:
    string;

  readonly binding:
    VerifiedStellarAcquisitionBinding;

  readonly transport:
    StellarFundingTransport;
}

export interface StellarFundingExecutionResult {
  readonly version:
    typeof STELLAR_FUNDING_EXECUTION_VERSION;

  readonly status:
    "FUNDED";

  readonly contractId:
    string;

  readonly agreementHash:
    string;

  readonly executionBindingHash:
    string;

  readonly amountBaseUnits:
    string;

  readonly transactionHash:
    string;

  readonly ledger:
    number;

  readonly escrow:
    StellarEscrowSnapshot;
}

function requireContractId(
  value: string,
): string {
  const normalized =
    value.trim();

  if (
    !STELLAR_CONTRACT_PATTERN.test(
      normalized,
    )
  ) {
    throw new Error(
      "contractId must be a Stellar contract ID.",
    );
  }

  return normalized;
}

function normalizeHash32(
  value: unknown,
  field: string,
): string {
  if (
    typeof value ===
    "string"
  ) {
    const normalized =
      value.trim();

    if (
      !HASH_32_PATTERN.test(
        normalized,
      )
    ) {
      throw new Error(
        `${field} must be a 32-byte hex value.`,
      );
    }

    return normalized
      .replace(
        /^0x/i,
        "",
      )
      .toLowerCase();
  }

  if (
    value instanceof
    Uint8Array
  ) {
    if (
      value.byteLength !==
      32
    ) {
      throw new Error(
        `${field} must contain exactly 32 bytes.`,
      );
    }

    return Buffer
      .from(
        value,
      )
      .toString(
        "hex",
      );
  }

  if (
    Array.isArray(
      value,
    ) &&
    value.length ===
      32 &&
    value.every(
      (entry) =>
        Number.isInteger(
          entry,
        ) &&
        Number(entry) >= 0 &&
        Number(entry) <= 255,
    )
  ) {
    return Buffer
      .from(
        value as number[],
      )
      .toString(
        "hex",
      );
  }

  throw new Error(
    `${field} has an unsupported representation.`,
  );
}

function normalizeAmount(
  value: unknown,
): string {
  if (
    typeof value ===
    "bigint"
  ) {
    if (value <= 0n) {
      throw new Error(
        "Escrow amount must be positive.",
      );
    }

    return value.toString();
  }

  if (
    typeof value ===
      "number" &&
    Number.isSafeInteger(
      value,
    ) &&
    value > 0
  ) {
    return String(
      value,
    );
  }

  if (
    typeof value ===
      "string" &&
    /^[1-9][0-9]*$/.test(
      value,
    )
  ) {
    return value;
  }

  throw new Error(
    "Escrow amount has an unsupported representation.",
  );
}

function normalizeAddress(
  value: unknown,
  field: string,
): string {
  if (
    typeof value ===
    "string"
  ) {
    const normalized =
      value.trim();

    if (
      normalized.length >
      0
    ) {
      return normalized;
    }
  }

  if (
    typeof value ===
      "object" &&
    value !== null &&
    "toString" in value &&
    typeof value.toString ===
      "function"
  ) {
    const normalized =
      value
        .toString()
        .trim();

    if (
      normalized.length >
        0 &&
      normalized !==
        "[object Object]"
    ) {
      return normalized;
    }
  }

  throw new Error(
    `${field} has an unsupported representation.`,
  );
}

function normalizeStatus(
  value: unknown,
): string {
  if (
    typeof value ===
    "string"
  ) {
    return value;
  }

  if (
    Array.isArray(
      value,
    ) &&
    value.length >
      0
  ) {
    return normalizeStatus(
      value[0],
    );
  }

  if (
    typeof value ===
      "object" &&
    value !== null
  ) {
    const record =
      value as
        Readonly<Record<string, unknown>>;

    for (
      const key of [
        "tag",
        "status",
        "value",
      ] as const
    ) {
      if (
        key in record
      ) {
        return normalizeStatus(
          record[key],
        );
      }
    }
  }

  throw new Error(
    "Escrow status has an unsupported representation.",
  );
}

function readField(
  value: unknown,
  field: string,
): unknown {
  if (
    value instanceof
    Map
  ) {
    if (
      value.has(
        field,
      )
    ) {
      return value.get(
        field,
      );
    }
  }

  if (
    typeof value ===
      "object" &&
    value !== null &&
    field in value
  ) {
    return (
      value as
        Readonly<Record<string, unknown>>
    )[field];
  }

  throw new Error(
    `Escrow state is missing ${field}.`,
  );
}

export function normalizeStellarEscrowSnapshot(
  value: unknown,
): StellarEscrowSnapshot {
  const status =
    normalizeStatus(
      readField(
        value,
        "status",
      ),
    );

  if (
    status !==
    "Funded"
  ) {
    throw new Error(
      `Escrow is ${status}, not Funded.`,
    );
  }

  return {
    status:
      "Funded",

    amountBaseUnits:
      normalizeAmount(
        readField(
          value,
          "amount",
        ),
      ),

    canonicalAgreementHash:
      normalizeHash32(
        readField(
          value,
          "canonical_agreement_hash",
        ),
        "canonical_agreement_hash",
      ),

    executionBindingHash:
      normalizeHash32(
        readField(
          value,
          "execution_binding_hash",
        ),
        "execution_binding_hash",
      ),

    payerAccount:
      normalizeAddress(
        readField(
          value,
          "payer",
        ),
        "payer",
      ),

    recipientAccount:
      normalizeAddress(
        readField(
          value,
          "payee",
        ),
        "payee",
      ),

    tokenContract:
      normalizeAddress(
        readField(
          value,
          "token",
        ),
        "token",
      ),
  };
}

function requireSubmission(
  submission:
    StellarFundingSubmission,
): StellarFundingSubmission {
  if (
    !/^[0-9a-fA-F]{64}$/.test(
      submission.transactionHash,
    )
  ) {
    throw new Error(
      "Funding transaction hash must be a 32-byte hex value.",
    );
  }

  if (
    !Number.isSafeInteger(
      submission.ledger,
    ) ||
    submission.ledger <=
      0
  ) {
    throw new Error(
      "Funding ledger must be a positive safe integer.",
    );
  }

  return {
    transactionHash:
      submission.transactionHash.toLowerCase(),

    ledger:
      submission.ledger,
  };
}

export async function executeStellarFunding(
  input:
    ExecuteStellarFundingInput,
): Promise<StellarFundingExecutionResult> {
  const contractId =
    requireContractId(
      input.contractId,
    );

  const intent =
    input.binding.intent;

  if (
    input.binding.acquiredAmountBaseUnits !==
    intent.amountBaseUnits
  ) {
    throw new Error(
      "Acquisition binding amount no longer matches the Stellar settlement intent.",
    );
  }

  if (
    BigInt(
      input.binding.spendableBalanceBaseUnits,
    ) <
    BigInt(
      intent.amountBaseUnits,
    )
  ) {
    throw new Error(
      "Acquisition binding no longer proves sufficient spendable USDC.",
    );
  }

  const submission =
    requireSubmission(
      await input.transport.fund({
        contractId,
        binding:
          input.binding,
      }),
    );

  const escrow =
    normalizeStellarEscrowSnapshot(
      await input.transport.readEscrow({
        contractId,
        sourceAccount:
          intent.payerAccount,
      }),
    );

  if (
    escrow.amountBaseUnits !==
    intent.amountBaseUnits
  ) {
    throw new Error(
      "Funded escrow amount does not match the Stellar settlement intent.",
    );
  }

  if (
    escrow.canonicalAgreementHash !==
    intent.agreementHash
  ) {
    throw new Error(
      "Funded escrow canonical agreement hash does not match the Stellar settlement intent.",
    );
  }

  if (
    escrow.executionBindingHash !==
    intent.executionBindingHash
  ) {
    throw new Error(
      "Funded escrow execution binding hash does not match the Stellar settlement intent.",
    );
  }

  if (
    escrow.payerAccount !==
    intent.payerAccount
  ) {
    throw new Error(
      "Funded escrow payer does not match the Stellar settlement intent.",
    );
  }

  if (
    escrow.recipientAccount !==
    intent.recipientAccount
  ) {
    throw new Error(
      "Funded escrow payee does not match the Stellar settlement intent.",
    );
  }

  if (
    escrow.tokenContract !==
    intent.settlementAsset.sac
  ) {
    throw new Error(
      "Funded escrow token contract does not match the Stellar settlement intent.",
    );
  }

  return {
    version:
      STELLAR_FUNDING_EXECUTION_VERSION,

    status:
      "FUNDED",

    contractId,

    agreementHash:
      intent.agreementHash,

    executionBindingHash:
      intent.executionBindingHash,

    amountBaseUnits:
      intent.amountBaseUnits,

    transactionHash:
      submission.transactionHash,

    ledger:
      submission.ledger,

    escrow,
  };
}