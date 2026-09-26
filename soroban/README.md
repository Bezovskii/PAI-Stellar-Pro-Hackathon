# PAI Soroban AgreementEscrow

This workspace contains PAI's Stellar/Soroban agreement-bound settlement contract.

## Deployment

### Hackathon deployment (pre-hardening)

- Network: Stellar Testnet
- Contract ID: `CAXZYU742IQ7SL7U645RT4PCKMD47DAJXLMMOZ6USKGY62QF22ADRYEG`
- WASM upload TX: `fd45c7941df35ea34bb6db281135f55e2dd0d9281ed7071b41c3b0437e8623c3`
- Deployment TX: `a60541245e3d3ec62d918adf01207996781069fa6ba1d789da5b725900f40029`
- Deployment ledger: `4758368`

These deployment identifiers refer to the original hackathon contract. Gate 2A and Gate 2B hardening are implemented and tested on the `instawards-hardening` branch and have not been redeployed yet.

## Hardened lifecycle

```text
ReadyToFund
   -> Funded
      -> Delivered
         -> Completed
         -> Disputed
      -> Disputed
      -> Refunded (payer, at/after deadline while still Funded)

Disputed
   -> Resolved -> PayPayer
   -> Resolved -> PayPayee
```

## Gate 2A

IMPLEMENTED + TESTED:

- typed contract errors for lifecycle failures
- lifecycle events
- deadline / expiry enforcement
- payer refund after deadline while still Funded
- negative-path lifecycle tests

## Gate 2B

IMPLEMENTED + TESTED:

- arbiter address bound at contract construction
- dispute initiation by payer or payee
- dispute evidence hash stored on-chain
- dispute raiser stored on-chain
- dispute from Funded or Delivered
- deadline guard for Funded disputes
- explicit arbiter authorization for resolution
- `Resolution::PayPayer`
- `Resolution::PayPayee`
- dispute and resolution events
- release/refund blocked while Disputed
- resolution is terminal
- third-party dispute rejection
- non-arbiter resolution rejection

Not yet claimed:

- deployment of the hardened contract
- live testnet verification of the hardened dispute lifecycle
- browser Stellar wallet signing

## Soroban test coverage

Run:

```bash
cargo test --manifest-path soroban/Cargo.toml
```

Current hardened contract suite:

```text
21 tests
21 passed
0 failed
```

The suite includes:

- full agreement escrow lifecycle
- refund after deadline
- funding rejected at/after deadline
- delivery rejected at/after deadline
- invalid lifecycle transitions
- payer dispute from Funded
- payee dispute from Funded
- payer dispute after Delivered
- third-party dispute rejection
- dispute deadline enforcement
- resolution without dispute rejection
- non-arbiter resolution rejection
- arbiter resolution to payer
- arbiter resolution to payee
- release/refund blocked while disputed
- resolved dispute terminality

Soroban test snapshots are committed with the tests so observable contract behavior can be reviewed across changes.

## Backend Stellar verification

Run:

```bash
npm --prefix backend run typecheck
npm --prefix backend run test:stellar
```

Current focused Stellar suite:

```text
28 tests
28 passed
0 failed
```

## Verification terminology

- IMPLEMENTED: source is committed.
- TESTED: public tests reproduce the behavior.
- DEPLOYED: deployment identifiers are published.
- LIVE VERIFIED: live execution evidence has been independently checked.
