# PAI Soroban AgreementEscrow

This workspace contains PAI's Stellar/Soroban agreement-bound settlement contract.

## Deployment

- Network: Stellar Testnet
- Contract ID: `CAXZYU742IQ7SL7U645RT4PCKMD47DAJXLMMOZ6USKGY62QF22ADRYEG`
- WASM upload TX: `fd45c7941df35ea34bb6db281135f55e2dd0d9281ed7071b41c3b0437e8623c3`
- Deployment TX: `a60541245e3d3ec62d918adf01207996781069fa6ba1d789da5b725900f40029`
- Deployment ledger: `4758368`

## Current lifecycle

```text
ReadyToFund
-> Funded
-> Delivered
-> Completed
```

## Current Soroban test coverage

The public Soroban contract currently has one Rust test covering the full happy path:

```text
full_agreement_escrow_lifecycle
```

Run:

```bash
cargo test --manifest-path soroban/Cargo.toml
```

Current result:

```text
1 passed
0 failed
```

This is separate from PAI's focused backend Stellar integration suite.

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

## Current hardening boundary

The current hackathon contract does not yet claim:

- refund handling
- deadline / expiry handling
- dispute states
- contract events
- typed contract errors
- comprehensive negative-path Soroban tests

These are the next contract-hardening tasks.

## Verification terminology

- IMPLEMENTED: source is committed.
- TESTED: public tests reproduce the behavior.
- DEPLOYED: deployment identifiers are published.
- LIVE VERIFIED: live execution evidence has been independently checked.
