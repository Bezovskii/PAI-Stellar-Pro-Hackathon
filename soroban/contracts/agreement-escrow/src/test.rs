#![cfg(test)]

use super::*;

use soroban_sdk::{testutils::Address as _, token, Address, BytesN, Env};

#[test]
fn full_agreement_escrow_lifecycle() {
    let env = Env::default();

    env.mock_all_auths();

    let issuer = Address::generate(&env);

    let payer = Address::generate(&env);

    let payee = Address::generate(&env);

    let sac = env.register_stellar_asset_contract_v2(issuer);

    let token_address = sac.address();

    let token_client = token::Client::new(&env, &token_address);

    let token_admin = token::StellarAssetClient::new(&env, &token_address);

    let amount: i128 = 25_000_000;

    token_admin.mint(&payer, &amount);

    let canonical_agreement_hash = BytesN::from_array(&env, &[0x11; 32]);

    let execution_binding_hash = BytesN::from_array(&env, &[0x22; 32]);

    let contract_id = env.register(
        AgreementEscrow,
        (
            payer.clone(),
            payee.clone(),
            token_address.clone(),
            amount,
            canonical_agreement_hash.clone(),
            execution_binding_hash.clone(),
        ),
    );

    let client = AgreementEscrowClient::new(&env, &contract_id);

    let initial = client.get_escrow();

    assert_eq!(initial.status, EscrowStatus::ReadyToFund,);

    assert_eq!(initial.canonical_agreement_hash, canonical_agreement_hash,);

    assert_eq!(initial.execution_binding_hash, execution_binding_hash,);

    assert_eq!(initial.amount, amount,);

    assert_eq!(token_client.balance(&payer), amount,);

    let funded = client.fund();

    assert_eq!(funded.status, EscrowStatus::Funded,);

    assert_eq!(token_client.balance(&contract_id,), amount,);

    assert_eq!(token_client.balance(&payer), 0,);

    let evidence_hash = BytesN::from_array(&env, &[0x33; 32]);

    let delivered = client.mark_delivered(&evidence_hash);

    assert_eq!(delivered.status, EscrowStatus::Delivered,);

    assert_eq!(delivered.evidence_hash, Some(evidence_hash),);

    let completed = client.release();

    assert_eq!(completed.status, EscrowStatus::Completed,);

    assert_eq!(completed.canonical_agreement_hash, canonical_agreement_hash,);

    assert_eq!(completed.execution_binding_hash, execution_binding_hash,);

    assert_eq!(token_client.balance(&contract_id,), 0,);

    assert_eq!(token_client.balance(&payee), amount,);
}
