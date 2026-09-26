# PAI Soroban AgreementEscrow

This workspace contains PAI's Stellar/Soroban agreement-bound settlement contract.

## Deployment

### Hackathon deployment (pre-hardening)

- Network: Stellar Testnet
- Contract ID: `CAXZYU742IQ7SL7U645RT4PCKMD47DAJXLMMOZ6USKGY62QF22ADRYEG`
- WASM upload TX: `fd45c7941df35ea34bb6db281135f55e2dd0d9281ed7071b41c3b0437e8623c3`
- Deployment TX: `a60541245e3d3ec62d918adf01207996781069fa6ba1d789da5b725900f40029`
- Deployment ledger: `4758368`

These deployment identifiers refer to the original hackathon contract. Gate 2A hardening is implemented and tested on the `instawards-hardening` branch and has not been redeployed yet.

## Gate 2A lifecycle

```text
ReadyToFund
-> Funded
   -> Delivered
      -> Completed
   -> Refunded (payer, at/after deadline while still Funded)
```

Funding and delivery are rejected at or after the configured deadline.

## Soroban test coverage

Run:

```bash
cargo test --manifest-path soroban/Cargo.toml
```

Current Gate 2A result:

```text
9 tests
9 passed
0 failed
```

The suite covers:

- full agreement escrow lifecycle
- funding rejected at/after deadline
- delivery rejected at/after deadline
- refund rejected before deadline
- refund after deadline returns funds to payer
- double funding rejected
- release before delivery rejected
- refund after delivery rejected
- delivery before funding rejected

Soroban test snapshots are committed with the tests so contract behavior can be reviewed across changes.

## Gate 2A hardening

IMPLEMENTED + TESTED:

- typed contract errors for lifecycle failures
- contract lifecycle events
- deadline / expiry enforcement
- payer refund after deadline while still funded
- negative-path lifecycle tests

Not yet claimed:

- dispute state
- arbiter binding
- dispute resolution
- authorization-specific negative-path tests
- redeployment of the hardened contract

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
