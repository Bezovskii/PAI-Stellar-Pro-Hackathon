#![cfg(test)]

use super::*;

use soroban_sdk::{
    testutils::{Address as _, Events as _, Ledger as _},
    token, Address, BytesN, Env,
};

const NOW: u64 = 1_000;
const DEADLINE: u64 = 1_100;
const AMOUNT: i128 = 25_000_000;

type Setup = (
    Env,
    Address,
    Address,
    Address,
    Address,
    BytesN<32>,
    BytesN<32>,
);

fn setup() -> Setup {
    let env = Env::default();
    env.ledger().set_timestamp(NOW);
    env.mock_all_auths();

    let issuer = Address::generate(&env);
    let payer = Address::generate(&env);
    let payee = Address::generate(&env);

    let sac = env.register_stellar_asset_contract_v2(issuer);
    let token_address = sac.address();
    let token_admin = token::StellarAssetClient::new(&env, &token_address);
    token_admin.mint(&payer, &AMOUNT);

    let canonical_agreement_hash = BytesN::from_array(&env, &[0x11; 32]);
    let execution_binding_hash = BytesN::from_array(&env, &[0x22; 32]);

    let contract_id = env.register(
        AgreementEscrow,
        (
            payer.clone(),
            payee.clone(),
            token_address.clone(),
            AMOUNT,
            DEADLINE,
            canonical_agreement_hash.clone(),
            execution_binding_hash.clone(),
        ),
    );

    (
        env,
        payer,
        payee,
        token_address,
        contract_id,
        canonical_agreement_hash,
        execution_binding_hash,
    )
}

#[test]
fn full_agreement_escrow_lifecycle() {
    let (
        env,
        payer,
        payee,
        token_address,
        contract_id,
        canonical_agreement_hash,
        execution_binding_hash,
    ) = setup();

    let token_client = token::Client::new(&env, &token_address);
    let client = AgreementEscrowClient::new(&env, &contract_id);

    assert_eq!(
        env.events().all().filter_by_contract(&contract_id),
        [EscrowInitialized {
            canonical_agreement_hash: canonical_agreement_hash.clone(),
            execution_binding_hash: execution_binding_hash.clone(),
            payer: payer.clone(),
            payee: payee.clone(),
            token: token_address.clone(),
            amount: AMOUNT,
            deadline: DEADLINE,
        }
        .to_xdr(&env, &contract_id)]
    );

    let initial = client.get_escrow();
    assert_eq!(initial.status, EscrowStatus::ReadyToFund);
    assert_eq!(initial.canonical_agreement_hash, canonical_agreement_hash);
    assert_eq!(initial.execution_binding_hash, execution_binding_hash);
    assert_eq!(initial.amount, AMOUNT);
    assert_eq!(initial.deadline, DEADLINE);
    assert_eq!(token_client.balance(&payer), AMOUNT);

    let funded = client.fund();
    assert_eq!(funded.status, EscrowStatus::Funded);
    assert_eq!(
        env.events().all().filter_by_contract(&contract_id),
        [EscrowFunded {
            canonical_agreement_hash: canonical_agreement_hash.clone(),
            amount: AMOUNT,
        }
        .to_xdr(&env, &contract_id)]
    );
    assert_eq!(token_client.balance(&contract_id), AMOUNT);
    assert_eq!(token_client.balance(&payer), 0);

    let evidence_hash = BytesN::from_array(&env, &[0x33; 32]);
    let delivered = client.mark_delivered(&evidence_hash);
    assert_eq!(delivered.status, EscrowStatus::Delivered);
    assert_eq!(delivered.evidence_hash, Some(evidence_hash.clone()));
    assert_eq!(
        env.events().all().filter_by_contract(&contract_id),
        [DeliveryRecorded {
            canonical_agreement_hash: canonical_agreement_hash.clone(),
            evidence_hash,
        }
        .to_xdr(&env, &contract_id)]
    );

    let completed = client.release();
    assert_eq!(completed.status, EscrowStatus::Completed);
    assert_eq!(
        env.events().all().filter_by_contract(&contract_id),
        [EscrowReleased {
            canonical_agreement_hash,
            amount: AMOUNT,
        }
        .to_xdr(&env, &contract_id)]
    );
    assert_eq!(token_client.balance(&contract_id), 0);
    assert_eq!(token_client.balance(&payee), AMOUNT);
}

#[test]
fn refund_after_deadline_returns_funds_to_payer() {
    let (env, payer, _payee, token_address, contract_id, canonical_agreement_hash, _) = setup();
    let token_client = token::Client::new(&env, &token_address);
    let client = AgreementEscrowClient::new(&env, &contract_id);

    client.fund();
    env.ledger().set_timestamp(DEADLINE);

    let refunded = client.refund();

    assert_eq!(refunded.status, EscrowStatus::Refunded);
    assert_eq!(
        env.events().all().filter_by_contract(&contract_id),
        [EscrowRefunded {
            canonical_agreement_hash,
            amount: AMOUNT,
        }
        .to_xdr(&env, &contract_id)]
    );
    assert_eq!(token_client.balance(&contract_id), 0);
    assert_eq!(token_client.balance(&payer), AMOUNT);
}

#[test]
fn refund_before_deadline_is_rejected() {
    let (env, _payer, _payee, _token, contract_id, _, _) = setup();
    let client = AgreementEscrowClient::new(&env, &contract_id);
    client.fund();

    assert_eq!(
        client.try_refund(),
        Err(Ok(EscrowError::DeadlineNotReached))
    );
}

#[test]
fn delivery_at_or_after_deadline_is_rejected() {
    let (env, _payer, _payee, _token, contract_id, _, _) = setup();
    let client = AgreementEscrowClient::new(&env, &contract_id);
    client.fund();
    env.ledger().set_timestamp(DEADLINE);

    let evidence_hash = BytesN::from_array(&env, &[0x33; 32]);

    assert_eq!(
        client.try_mark_delivered(&evidence_hash),
        Err(Ok(EscrowError::DeadlinePassed))
    );
}

#[test]
fn funding_at_or_after_deadline_is_rejected() {
    let (env, _payer, _payee, _token, contract_id, _, _) = setup();
    let client = AgreementEscrowClient::new(&env, &contract_id);
    env.ledger().set_timestamp(DEADLINE);

    assert_eq!(client.try_fund(), Err(Ok(EscrowError::DeadlinePassed)));
}

#[test]
fn cannot_fund_twice() {
    let (env, _payer, _payee, _token, contract_id, _, _) = setup();
    let client = AgreementEscrowClient::new(&env, &contract_id);
    client.fund();

    assert_eq!(client.try_fund(), Err(Ok(EscrowError::NotReadyToFund)));
}

#[test]
fn cannot_release_before_delivery() {
    let (env, _payer, _payee, _token, contract_id, _, _) = setup();
    let client = AgreementEscrowClient::new(&env, &contract_id);
    client.fund();

    assert_eq!(
        client.try_release(),
        Err(Ok(EscrowError::DeliveryNotRecorded))
    );
}

#[test]
fn cannot_refund_after_delivery() {
    let (env, _payer, _payee, _token, contract_id, _, _) = setup();
    let client = AgreementEscrowClient::new(&env, &contract_id);
    client.fund();

    let evidence_hash = BytesN::from_array(&env, &[0x33; 32]);
    client.mark_delivered(&evidence_hash);
    env.ledger().set_timestamp(DEADLINE);

    assert_eq!(
        client.try_refund(),
        Err(Ok(EscrowError::RefundNotAvailable))
    );
}

#[test]
fn cannot_deliver_before_funding() {
    let (env, _payer, _payee, _token, contract_id, _, _) = setup();
    let client = AgreementEscrowClient::new(&env, &contract_id);
    let evidence_hash = BytesN::from_array(&env, &[0x33; 32]);

    assert_eq!(
        client.try_mark_delivered(&evidence_hash),
        Err(Ok(EscrowError::NotFunded))
    );
}
