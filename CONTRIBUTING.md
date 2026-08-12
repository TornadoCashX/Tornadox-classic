# Working on web-react

## Package manager: yarn only

This project uses **yarn** (`yarn.lock` is committed; the repo's `.gitignore` deliberately ignores
`package-lock.json`). Install and add dependencies with `yarn` / `yarn add` — running `npm install`
here creates an ignored `package-lock.json` and leaves `yarn.lock` stale, so different people end
up with different dependency trees.

```bash
yarn install --frozen-lockfile
yarn test
yarn build
yarn audit:high                    # fail only on high/critical production advisories
```

## Runtime architecture

The application has three explicit runtime boundaries:

| Stack | Used for | Where |
| --- | --- | --- |
| **wagmi / RainbowKit** | wallet discovery, WalletConnect sessions, chain switching and transaction submission | `src/wagmi.ts`, `src/hooks/useWallet.ts` |
| **viem** | public RPC reads, contracts, logs, Multicall, receipts, ENS and ABI encoding | `src/lib/`, `src/services/` |
| **legacy proof runtime** | the pinned Websnark/SnarkJS proof implementation required by the deployed Tornado circuits | `src/services/legacyProofRuntime.ts`, `public/legacy-proof/` |

Do not add Web3 providers, contracts, BN wrappers or ABI encoders back into application code.
Use viem primitives and the existing named functions in `src/lib/` so RPC retry and network
selection stay centralized.

The only raw wallet RPC methods are `eth_getEncryptionPublicKey` and `eth_decrypt`. They are
MetaMask-compatible extensions used by the optional Note Account backup flow, are isolated in
`src/hooks/useWallet.ts`, and must not be used for normal deposits or withdrawals.

The old proof implementation is intentionally not imported by React, deposit, RPC or event code.
It runs behind `legacyProofRuntime.ts`, with pinned versions and SHA-256 checks for its runtime,
circuit and proving key. Changes to those files require:

- updating `src/config/legacyProofManifest.ts`;
- giving changed immutable assets new content-hashed filenames;
- running `yarn test:proof-fixture` against Sepolia before release.
