#![no_std]

use soroban_sdk::{
    contract, contracterror, contractevent, contractimpl, contracttype, panic_with_error, token,
    Address, BytesN, Env, Event,
};

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum EscrowStatus {
    ReadyToFund,
    Funded,
    Delivered,
    Completed,
    Refunded,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct EscrowState {
    pub canonical_agreement_hash: BytesN<32>,
    pub execution_binding_hash: BytesN<32>,
    pub payer: Address,
    pub payee: Address,
    pub token: Address,
    pub amount: i128,
    pub deadline: u64,
    pub status: EscrowStatus,
    pub evidence_hash: Option<BytesN<32>>,
}

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum EscrowError {
    AmountMustBePositive = 1,
    UnsupportedTokenDecimals = 2,
    InvalidDeadline = 3,
    StateMissing = 4,
    NotReadyToFund = 5,
    NotFunded = 6,
    DeadlinePassed = 7,
    DeliveryNotRecorded = 8,
    RefundNotAvailable = 9,
    DeadlineNotReached = 10,
    InsufficientEscrowBalance = 11,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct EscrowInitialized {
    #[topic]
    pub canonical_agreement_hash: BytesN<32>,
    pub execution_binding_hash: BytesN<32>,
    pub payer: Address,
    pub payee: Address,
    pub token: Address,
    pub amount: i128,
    pub deadline: u64,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct EscrowFunded {
    #[topic]
    pub canonical_agreement_hash: BytesN<32>,
    pub amount: i128,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct DeliveryRecorded {
    #[topic]
    pub canonical_agreement_hash: BytesN<32>,
    pub evidence_hash: BytesN<32>,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct EscrowReleased {
    #[topic]
    pub canonical_agreement_hash: BytesN<32>,
    pub amount: i128,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct EscrowRefunded {
    #[topic]
    pub canonical_agreement_hash: BytesN<32>,
    pub amount: i128,
}

#[contracttype]
enum DataKey {
    Escrow,
}

#[contract]
pub struct AgreementEscrow;

fn read_state(env: &Env) -> Result<EscrowState, EscrowError> {
    env.storage()
        .instance()
        .get(&DataKey::Escrow)
        .ok_or(EscrowError::StateMissing)
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
        deadline: u64,
        canonical_agreement_hash: BytesN<32>,
        execution_binding_hash: BytesN<32>,
    ) {
        if amount <= 0 {
            panic_with_error!(&env, EscrowError::AmountMustBePositive);
        }

        if deadline <= env.ledger().timestamp() {
            panic_with_error!(&env, EscrowError::InvalidDeadline);
        }

        payer.require_auth();

        let token_client = token::Client::new(&env, &token);

        if token_client.decimals() != 7 {
            panic_with_error!(&env, EscrowError::UnsupportedTokenDecimals);
        }

        let state = EscrowState {
            canonical_agreement_hash: canonical_agreement_hash.clone(),
            execution_binding_hash: execution_binding_hash.clone(),
            payer: payer.clone(),
            payee: payee.clone(),
            token: token.clone(),
            amount,
            deadline,
            status: EscrowStatus::ReadyToFund,
            evidence_hash: None,
        };

        write_state(&env, &state);

        EscrowInitialized {
            canonical_agreement_hash,
            execution_binding_hash,
            payer,
            payee,
            token,
            amount,
            deadline,
        }
        .publish(&env);
    }

    pub fn get_escrow(env: Env) -> Result<EscrowState, EscrowError> {
        read_state(&env)
    }

    pub fn fund(env: Env) -> Result<EscrowState, EscrowError> {
        let mut state = read_state(&env)?;

        if state.status != EscrowStatus::ReadyToFund {
            return Err(EscrowError::NotReadyToFund);
        }

        if env.ledger().timestamp() >= state.deadline {
            return Err(EscrowError::DeadlinePassed);
        }

        state.payer.require_auth();

        let escrow_address = env.current_contract_address();
        let token_client = token::Client::new(&env, &state.token);

        token_client.transfer(&state.payer, &escrow_address, &state.amount);

        if token_client.balance(&escrow_address) < state.amount {
            return Err(EscrowError::InsufficientEscrowBalance);
        }

        state.status = EscrowStatus::Funded;
        write_state(&env, &state);

        EscrowFunded {
            canonical_agreement_hash: state.canonical_agreement_hash.clone(),
            amount: state.amount,
        }
        .publish(&env);

        Ok(state)
    }

    pub fn mark_delivered(env: Env, evidence_hash: BytesN<32>) -> Result<EscrowState, EscrowError> {
        let mut state = read_state(&env)?;

        if state.status != EscrowStatus::Funded {
            return Err(EscrowError::NotFunded);
        }

        if env.ledger().timestamp() >= state.deadline {
            return Err(EscrowError::DeadlinePassed);
        }

        state.payee.require_auth();
        state.evidence_hash = Some(evidence_hash.clone());
        state.status = EscrowStatus::Delivered;
        write_state(&env, &state);

        DeliveryRecorded {
            canonical_agreement_hash: state.canonical_agreement_hash.clone(),
            evidence_hash,
        }
        .publish(&env);

        Ok(state)
    }

    pub fn release(env: Env) -> Result<EscrowState, EscrowError> {
        let mut state = read_state(&env)?;

        if state.status != EscrowStatus::Delivered {
            return Err(EscrowError::DeliveryNotRecorded);
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

        EscrowReleased {
            canonical_agreement_hash: state.canonical_agreement_hash.clone(),
            amount: state.amount,
        }
        .publish(&env);

        Ok(state)
    }

    pub fn refund(env: Env) -> Result<EscrowState, EscrowError> {
        let mut state = read_state(&env)?;

        if state.status != EscrowStatus::Funded {
            return Err(EscrowError::RefundNotAvailable);
        }

        if env.ledger().timestamp() < state.deadline {
            return Err(EscrowError::DeadlineNotReached);
        }

        state.payer.require_auth();

        let escrow_address = env.current_contract_address();

        token::Client::new(&env, &state.token).transfer(
            &escrow_address,
            &state.payer,
            &state.amount,
        );

        state.status = EscrowStatus::Refunded;
        write_state(&env, &state);

        EscrowRefunded {
            canonical_agreement_hash: state.canonical_agreement_hash.clone(),
            amount: state.amount,
        }
        .publish(&env);

        Ok(state)
    }
}

mod test;
