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

## Hardened Testnet deployment — 2026-09-26

Status:

- IMPLEMENTED ✅
- TESTED: 21/21 Soroban tests ✅
- CI VERIFIED ✅
- DEPLOYED ✅
- LIVE VERIFIED ✅

### Hardened contract

- Network: Stellar Testnet
- Source commit: `eabb76a`
- Contract ID: `CB3YGK5I5NXH7NAJ7ZSDSD3HYVBEXICTNULRVWVEJ2RL5EUPTPT7GZ26`
- WASM hash: `aaa6c0226fa5b8f474ca8df597951e809e7417e95a2c259c71911ab6108ff82c`
- WASM upload TX: `f0a2a339fa11ea62abbe8b41c86dee6b7afdc9ca1fdbe351d25f46675771a61d`
- Deployment TX: `d0082d622c9e7a381d1aae460cd4bb72db3308e177cda16ac723441e2a82a4c6`

The deployed contract code hash was independently read from Testnet and matched the local hardened WASM hash exactly.

### Agreement binding

- Canonical agreement hash: `cdaab16a6e4ba61e9a4f46273f88e9925c218934f224c5f112fc1791d6319096`
- Execution binding hash: `9b7132937ede2a6c3d9796ef615d71265da3ef18949940dc5804bf7ff4c414ba`
- Asset: Testnet USDC
- USDC contract: `CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA`
- Amount: `1.0000000 USDC`
- Amount base units: `10000000`
- Deadline: `1793048002` (`2026-10-26 20:53:22 UTC`)

### Bound roles

- Payer: `GC4CKF3TLUAXUG5CR7WIQTRXEQYQOV76TT4FTZHIEY7SET7A75OF3KRV`
- Payee: `GBJKQCGXP5PYCXA25HQNYJB63BJ7HMDAFNM6AFZARGBP7P7JBSLO2L6S`
- Arbiter: `GA2NQEY5H5ULZUEHPZOQIA3PFPATSKA4G2IWRMVVI4PTSFABNS73YB4G`

### Live dispute lifecycle proof

Observed lifecycle:

```text
ReadyToFund
→ Funded
→ Disputed
→ Resolved
```

Live transactions:

- Fund 1 USDC: `2a99aece577c6d7d55f36301bf5e66c1728fa0f4296bc780c9df38c4a9687765`
- Payee raises dispute: `212d27926c6075c986d93009de346a766e1e8b26838057d7fa1580ae10fe5f1e`
- Arbiter resolves to payee: `8991cf8377c27e1534ae2410161168c5237cc0c5d03f8fd94402326551df318e`

Dispute evidence hash:

`09c76752e4947007ad5b09287015d0e2153bc3f4d14f3f9dd796e87e7c08e7e9`

Final contract state:

- status: `Resolved`
- resolution: `PayPayee`
- dispute raiser: payee
- escrow balance: `0`

Balance reconciliation:

```text
payer before:    170198045
payer after:     160198045
payer delta:     -10000000

payee before:    10000000
payee after:     20000000
payee delta:     +10000000

escrow before:   0
escrow funded:   10000000
escrow disputed: 10000000
escrow final:    0
```

Therefore the live hardened path is VERIFIED:

```text
agreement binding
→ payer-funded 1.0000000 USDC
→ funds held by Soroban escrow
→ payee raises dispute with evidence hash
→ funds remain locked while disputed
→ explicitly bound arbiter authenticates
→ arbiter resolves PayPayee
→ payee receives exactly 1.0000000 USDC
→ escrow final balance = 0
→ terminal state = Resolved
```

The original hackathon contract remains documented separately as the pre-hardening deployment.
