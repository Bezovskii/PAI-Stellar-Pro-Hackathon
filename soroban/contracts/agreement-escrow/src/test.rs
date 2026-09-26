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
    Address,
);

fn setup() -> Setup {
    let env = Env::default();
    env.ledger().set_timestamp(NOW);
    env.mock_all_auths();

    let issuer = Address::generate(&env);
    let payer = Address::generate(&env);
    let payee = Address::generate(&env);
    let arbiter = Address::generate(&env);

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
            arbiter.clone(),
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
        arbiter,
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
        arbiter,
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
            arbiter: arbiter.clone(),
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
    assert_eq!(initial.arbiter, arbiter);
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
    let (env, payer, _payee, token_address, contract_id, canonical_agreement_hash, _, _) = setup();
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
    let (env, _payer, _payee, _token, contract_id, _, _, _) = setup();
    let client = AgreementEscrowClient::new(&env, &contract_id);
    client.fund();

    assert_eq!(
        client.try_refund(),
        Err(Ok(EscrowError::DeadlineNotReached))
    );
}

#[test]
fn delivery_at_or_after_deadline_is_rejected() {
    let (env, _payer, _payee, _token, contract_id, _, _, _) = setup();
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
    let (env, _payer, _payee, _token, contract_id, _, _, _) = setup();
    let client = AgreementEscrowClient::new(&env, &contract_id);
    env.ledger().set_timestamp(DEADLINE);

    assert_eq!(client.try_fund(), Err(Ok(EscrowError::DeadlinePassed)));
}

#[test]
fn cannot_fund_twice() {
    let (env, _payer, _payee, _token, contract_id, _, _, _) = setup();
    let client = AgreementEscrowClient::new(&env, &contract_id);
    client.fund();

    assert_eq!(client.try_fund(), Err(Ok(EscrowError::NotReadyToFund)));
}

#[test]
fn cannot_release_before_delivery() {
    let (env, _payer, _payee, _token, contract_id, _, _, _) = setup();
    let client = AgreementEscrowClient::new(&env, &contract_id);
    client.fund();

    assert_eq!(
        client.try_release(),
        Err(Ok(EscrowError::DeliveryNotRecorded))
    );
}

#[test]
fn cannot_refund_after_delivery() {
    let (env, _payer, _payee, _token, contract_id, _, _, _) = setup();
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
    let (env, _payer, _payee, _token, contract_id, _, _, _) = setup();
    let client = AgreementEscrowClient::new(&env, &contract_id);
    let evidence_hash = BytesN::from_array(&env, &[0x33; 32]);

    assert_eq!(
        client.try_mark_delivered(&evidence_hash),
        Err(Ok(EscrowError::NotFunded))
    );
}

#[test]
fn payer_can_raise_dispute_from_funded() {
    let (env, payer, _payee, _token, contract_id, canonical_agreement_hash, _, _) = setup();
    let client = AgreementEscrowClient::new(&env, &contract_id);
    client.fund();

    let dispute_evidence_hash = BytesN::from_array(&env, &[0x44; 32]);
    let disputed = client.raise_dispute(&payer, &dispute_evidence_hash);

    assert_eq!(disputed.status, EscrowStatus::Disputed);
    assert_eq!(disputed.dispute_raised_by, Some(payer.clone()));
    assert_eq!(
        disputed.dispute_evidence_hash,
        Some(dispute_evidence_hash.clone())
    );
    assert_eq!(
        env.events().all().filter_by_contract(&contract_id),
        [DisputeRaised {
            canonical_agreement_hash,
            raised_by: payer,
            dispute_evidence_hash,
            prior_status: EscrowStatus::Funded,
        }
        .to_xdr(&env, &contract_id)]
    );
}

#[test]
fn payee_can_raise_dispute_from_funded() {
    let (env, _payer, payee, _token, contract_id, _, _, _) = setup();
    let client = AgreementEscrowClient::new(&env, &contract_id);
    client.fund();

    let dispute_evidence_hash = BytesN::from_array(&env, &[0x45; 32]);
    let disputed = client.raise_dispute(&payee, &dispute_evidence_hash);

    assert_eq!(disputed.status, EscrowStatus::Disputed);
    assert_eq!(disputed.dispute_raised_by, Some(payee));
    assert_eq!(disputed.dispute_evidence_hash, Some(dispute_evidence_hash));
}

#[test]
fn payer_can_raise_dispute_after_delivery() {
    let (env, payer, _payee, _token, contract_id, canonical_agreement_hash, _, _) = setup();
    let client = AgreementEscrowClient::new(&env, &contract_id);
    client.fund();

    let delivery_evidence_hash = BytesN::from_array(&env, &[0x33; 32]);
    client.mark_delivered(&delivery_evidence_hash);

    let dispute_evidence_hash = BytesN::from_array(&env, &[0x46; 32]);
    let disputed = client.raise_dispute(&payer, &dispute_evidence_hash);

    assert_eq!(disputed.status, EscrowStatus::Disputed);
    assert_eq!(
        env.events().all().filter_by_contract(&contract_id),
        [DisputeRaised {
            canonical_agreement_hash,
            raised_by: payer,
            dispute_evidence_hash,
            prior_status: EscrowStatus::Delivered,
        }
        .to_xdr(&env, &contract_id)]
    );
}

#[test]
fn third_party_cannot_raise_dispute() {
    let (env, _payer, _payee, _token, contract_id, _, _, _) = setup();
    let client = AgreementEscrowClient::new(&env, &contract_id);
    client.fund();

    let third_party = Address::generate(&env);
    let dispute_evidence_hash = BytesN::from_array(&env, &[0x47; 32]);

    assert_eq!(
        client.try_raise_dispute(&third_party, &dispute_evidence_hash),
        Err(Ok(EscrowError::InvalidDisputeActor))
    );
}

#[test]
fn cannot_dispute_before_funding() {
    let (env, payer, _payee, _token, contract_id, _, _, _) = setup();
    let client = AgreementEscrowClient::new(&env, &contract_id);
    let dispute_evidence_hash = BytesN::from_array(&env, &[0x48; 32]);

    assert_eq!(
        client.try_raise_dispute(&payer, &dispute_evidence_hash),
        Err(Ok(EscrowError::DisputeNotAvailable))
    );
}

#[test]
fn funded_dispute_at_or_after_deadline_is_rejected() {
    let (env, payer, _payee, _token, contract_id, _, _, _) = setup();
    let client = AgreementEscrowClient::new(&env, &contract_id);
    client.fund();
    env.ledger().set_timestamp(DEADLINE);

    let dispute_evidence_hash = BytesN::from_array(&env, &[0x49; 32]);

    assert_eq!(
        client.try_raise_dispute(&payer, &dispute_evidence_hash),
        Err(Ok(EscrowError::DeadlinePassed))
    );
}

#[test]
fn arbiter_can_resolve_dispute_to_payee() {
    let (env, payer, payee, token_address, contract_id, canonical_agreement_hash, _, arbiter) =
        setup();
    let token_client = token::Client::new(&env, &token_address);
    let client = AgreementEscrowClient::new(&env, &contract_id);

    client.fund();
    let dispute_evidence_hash = BytesN::from_array(&env, &[0x50; 32]);
    client.raise_dispute(&payer, &dispute_evidence_hash);

    let resolved = client.resolve_dispute(&arbiter, &Resolution::PayPayee);

    assert_eq!(resolved.status, EscrowStatus::Resolved);
    assert_eq!(resolved.resolution, Resolution::PayPayee);
    assert_eq!(
        env.events().all().filter_by_contract(&contract_id),
        [DisputeResolved {
            canonical_agreement_hash,
            arbiter,
            resolution: Resolution::PayPayee,
            amount: AMOUNT,
        }
        .to_xdr(&env, &contract_id)]
    );
    assert_eq!(token_client.balance(&contract_id), 0);
    assert_eq!(token_client.balance(&payer), 0);
    assert_eq!(token_client.balance(&payee), AMOUNT);
}

#[test]
fn arbiter_can_resolve_dispute_to_payer() {
    let (env, payer, payee, token_address, contract_id, _, _, arbiter) = setup();
    let token_client = token::Client::new(&env, &token_address);
    let client = AgreementEscrowClient::new(&env, &contract_id);

    client.fund();
    let dispute_evidence_hash = BytesN::from_array(&env, &[0x51; 32]);
    client.raise_dispute(&payee, &dispute_evidence_hash);

    let resolved = client.resolve_dispute(&arbiter, &Resolution::PayPayer);

    assert_eq!(resolved.status, EscrowStatus::Resolved);
    assert_eq!(resolved.resolution, Resolution::PayPayer);
    assert_eq!(token_client.balance(&contract_id), 0);
    assert_eq!(token_client.balance(&payer), AMOUNT);
    assert_eq!(token_client.balance(&payee), 0);
}

#[test]
fn non_arbiter_cannot_resolve_dispute() {
    let (env, payer, _payee, _token, contract_id, _, _, _) = setup();
    let client = AgreementEscrowClient::new(&env, &contract_id);

    client.fund();
    let dispute_evidence_hash = BytesN::from_array(&env, &[0x52; 32]);
    client.raise_dispute(&payer, &dispute_evidence_hash);

    assert_eq!(
        client.try_resolve_dispute(&payer, &Resolution::PayPayer),
        Err(Ok(EscrowError::NotArbiter))
    );
}

#[test]
fn cannot_resolve_without_active_dispute() {
    let (env, _payer, _payee, _token, contract_id, _, _, arbiter) = setup();
    let client = AgreementEscrowClient::new(&env, &contract_id);
    client.fund();

    assert_eq!(
        client.try_resolve_dispute(&arbiter, &Resolution::PayPayee),
        Err(Ok(EscrowError::DisputeNotActive))
    );
}

#[test]
fn release_and_refund_are_blocked_while_disputed() {
    let (env, payer, _payee, _token, contract_id, _, _, _) = setup();
    let client = AgreementEscrowClient::new(&env, &contract_id);
    client.fund();

    let delivery_evidence_hash = BytesN::from_array(&env, &[0x33; 32]);
    client.mark_delivered(&delivery_evidence_hash);

    let dispute_evidence_hash = BytesN::from_array(&env, &[0x53; 32]);
    client.raise_dispute(&payer, &dispute_evidence_hash);

    assert_eq!(
        client.try_release(),
        Err(Ok(EscrowError::DeliveryNotRecorded))
    );
    assert_eq!(
        client.try_refund(),
        Err(Ok(EscrowError::RefundNotAvailable))
    );
}

#[test]
fn resolved_dispute_is_terminal() {
    let (env, payer, _payee, _token, contract_id, _, _, arbiter) = setup();
    let client = AgreementEscrowClient::new(&env, &contract_id);
    client.fund();

    let dispute_evidence_hash = BytesN::from_array(&env, &[0x54; 32]);
    client.raise_dispute(&payer, &dispute_evidence_hash);
    client.resolve_dispute(&arbiter, &Resolution::PayPayer);

    let second_dispute_hash = BytesN::from_array(&env, &[0x55; 32]);

    assert_eq!(
        client.try_raise_dispute(&payer, &second_dispute_hash),
        Err(Ok(EscrowError::DisputeNotAvailable))
    );
    assert_eq!(
        client.try_release(),
        Err(Ok(EscrowError::DeliveryNotRecorded))
    );
    assert_eq!(
        client.try_refund(),
        Err(Ok(EscrowError::RefundNotAvailable))
    );
}
