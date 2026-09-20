#![no_std]

use soroban_sdk::{contract, contractimpl, contracttype, token, Address, BytesN, Env};

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum EscrowStatus {
    ReadyToFund,
    Funded,
    Delivered,
    Completed,
}

#[contracttype]
#[derive(Clone, Eq, PartialEq)]
pub struct EscrowState {
    pub canonical_agreement_hash: BytesN<32>,
    pub execution_binding_hash: BytesN<32>,
    pub payer: Address,
    pub payee: Address,
    pub token: Address,
    pub amount: i128,
    pub status: EscrowStatus,
    pub evidence_hash: Option<BytesN<32>>,
}

#[contracttype]
enum DataKey {
    Escrow,
}

#[contract]
pub struct AgreementEscrow;

fn read_state(env: &Env) -> EscrowState {
    env.storage()
        .instance()
        .get(&DataKey::Escrow)
        .expect("escrow state missing")
}

fn write_state(env: &Env, state: &EscrowState) {
    env.storage().instance().set(&DataKey::Escrow, state);
}

#[contractimpl]
impl AgreementEscrow {
    pub fn __constructor(
        env: Env,
        payer: Address,
        payee: Address,
        token: Address,
        amount: i128,
        canonical_agreement_hash: BytesN<32>,
        execution_binding_hash: BytesN<32>,
    ) {
        if amount <= 0 {
            panic!("amount must be positive");
        }

        payer.require_auth();

        let token_client = token::Client::new(&env, &token);

        if token_client.decimals() != 7 {
            panic!("settlement token must use 7 decimals");
        }

        let state = EscrowState {
            canonical_agreement_hash,
            execution_binding_hash,
            payer,
            payee,
            token,
            amount,
            status: EscrowStatus::ReadyToFund,
            evidence_hash: None,
        };

        write_state(&env, &state);
    }

    pub fn get_escrow(env: Env) -> EscrowState {
        read_state(&env)
    }

    pub fn fund(env: Env) -> EscrowState {
        let mut state = read_state(&env);

        if state.status != EscrowStatus::ReadyToFund {
            panic!("escrow is not ready to fund");
        }

        state.payer.require_auth();

        let escrow_address = env.current_contract_address();

        let token_client = token::Client::new(&env, &state.token);

        token_client.transfer(&state.payer, &escrow_address, &state.amount);

        if token_client.balance(&escrow_address) < state.amount {
            panic!("escrow funding balance is insufficient");
        }

        state.status = EscrowStatus::Funded;

        write_state(&env, &state);

        state
    }

    pub fn mark_delivered(env: Env, evidence_hash: BytesN<32>) -> EscrowState {
        let mut state = read_state(&env);

        if state.status != EscrowStatus::Funded {
            panic!("escrow is not funded");
        }

        state.payee.require_auth();

        state.evidence_hash = Some(evidence_hash);

        state.status = EscrowStatus::Delivered;

        write_state(&env, &state);

        state
    }

    pub fn release(env: Env) -> EscrowState {
        let mut state = read_state(&env);

        if state.status != EscrowStatus::Delivered {
            panic!("delivery has not been recorded");
        }

        state.payer.require_auth();

        let escrow_address = env.current_contract_address();

        token::Client::new(&env, &state.token).transfer(
            &escrow_address,
            &state.payee,
            &state.amount,
        );

        state.status = EscrowStatus::Completed;

        write_state(&env, &state);

        state
    }
}

mod test;
