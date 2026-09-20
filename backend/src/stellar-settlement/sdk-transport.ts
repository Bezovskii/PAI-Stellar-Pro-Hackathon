import {
  BASE_FEE,
  Contract,
  Networks,
  Transaction,
  TransactionBuilder,
  rpc,
  scValToNative,
} from "@stellar/stellar-sdk";

import type {
  StellarFundingTransport,
} from "./executor.js";

export interface StellarTransactionSigner {
  readonly accountId:
    string;

  signTransaction(
    transaction:
      Transaction,
  ): Promise<void>;
}

export interface CreateStellarSdkFundingTransportInput {
  readonly rpcUrl:
    string;

  readonly signer:
    StellarTransactionSigner;
}

function requireRpcUrl(
  value: string,
): string {
  const normalized =
    value.trim();

  const url =
    new URL(
      normalized,
    );

  if (
    url.protocol !==
    "https:"
  ) {
    throw new Error(
      "Stellar RPC URL must use HTTPS.",
    );
  }

  return normalized;
}

export function createStellarSdkFundingTransport(
  input:
    CreateStellarSdkFundingTransportInput,
): StellarFundingTransport {
  const server =
    new rpc.Server(
      requireRpcUrl(
        input.rpcUrl,
      ),
    );

  return {
    async fund(
      request,
    ) {
      const intent =
        request.binding.intent;

      if (
        input.signer.accountId !==
        intent.payerAccount
      ) {
        throw new Error(
          "Stellar funding signer must be the settlement payer account.",
        );
      }

      const sourceAccount =
        await server.getAccount(
          intent.payerAccount,
        );

      const contract =
        new Contract(
          request.contractId,
        );

      const transaction =
        new TransactionBuilder(
          sourceAccount,
          {
            fee:
              BASE_FEE,

            networkPassphrase:
              Networks.TESTNET,
          },
        )
          .addOperation(
            contract.call(
              "fund",
            ),
          )
          .setTimeout(
            60,
          )
          .build();

      const prepared =
        await server.prepareTransaction(
          transaction,
        );

      await input.signer.signTransaction(
        prepared,
      );

      const submitted =
        await server.sendTransaction(
          prepared,
        );

      if (
        submitted.status !==
          "PENDING" &&
        submitted.status !==
          "DUPLICATE"
      ) {
        throw new Error(
          `Stellar funding submission was rejected with status ${submitted.status}.`,
        );
      }

      const confirmed =
        await server.pollTransaction(
          submitted.hash,
        );

      if (
        confirmed.status !==
        rpc.Api.GetTransactionStatus.SUCCESS
      ) {
        throw new Error(
          `Stellar funding transaction finished with status ${confirmed.status}.`,
        );
      }

      return {
        transactionHash:
          confirmed.txHash,

        ledger:
          confirmed.ledger,
      };
    },

    async readEscrow(
      request,
    ) {
      const sourceAccount =
        await server.getAccount(
          request.sourceAccount,
        );

      const contract =
        new Contract(
          request.contractId,
        );

      const transaction =
        new TransactionBuilder(
          sourceAccount,
          {
            fee:
              BASE_FEE,

            networkPassphrase:
              Networks.TESTNET,
          },
        )
          .addOperation(
            contract.call(
              "get_escrow",
            ),
          )
          .setTimeout(
            60,
          )
          .build();

      const simulation =
        await server.simulateTransaction(
          transaction,
        );

      if (
        !("result" in simulation) ||
        simulation.result ===
          undefined
      ) {
        throw new Error(
          "Unable to read AgreementEscrow state from Stellar RPC.",
        );
      }

      return scValToNative(
        simulation.result.retval,
      );
    },
  };
}