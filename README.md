# hash256

Rust + Node.js PoW miner for the HASH256 token (`0xAC7b5d06fa1e77D08aea40d46cB7C5923A87A0cc`).

Brute-forces `keccak256(challenge || nonce) < difficulty`, submits valid nonces via `mine(uint256)` across 10 independent wallets in parallel.

## Why it exists

The browser miner on hash256.org runs at ~50 KH/s. That's too slow to be useful even at launch. This replaces it with a native Rust binary (~3.5 MH/s per core) fronted by a Node.js layer that handles wallet management and transaction submission.

## Structure

```
hash256-cli/       Node.js — RPC, wallet management, tx submission
  miner.js         original single-wallet JS miner
  launch.js        10-process JS launcher
  fast-launch.js   Rust + Node hybrid (what you actually want to run)
  check-state.js   reads miningState + genesisState from chain

hash256-miner/     Rust — keccak256 brute-forcer
  src/main.rs      reads challenge + difficulty from args, prints FOUND:<nonce_hex>
```

## Setup

```bash
# build the Rust binary first
cd hash256-miner && cargo build --release

# configure wallets
cp hash256-cli/.env.example hash256-cli/.env
# fill in PRIVATE_KEY through PRIVATE_KEY_10 and RPC_URL

# run
cd hash256-cli && node fast-launch.js
```

Each worker fetches its own challenge, spawns the Rust binary, and submits the mint tx when a valid nonce is found. Stats print every 2 minutes. Ctrl+C for a final summary.

## Performance

| Method | Hash rate |
|--------|-----------|
| Browser tab | ~50 KH/s |
| miner.js (1 worker) | ~120 KH/s |
| launch.js (10 JS workers) | ~1.2 MH/s |
| fast-launch.js (10 Rust workers) | ~35 MH/s |

## Current status — shelved

At the time of writing, difficulty sits at `2^50` expected hashes per mint. At 35 MH/s that's ~350 days per mint. The 1.89M HASH already minted was taken in the first few blocks when difficulty was near `2^256`. By the time this was deployed the window had closed.

The code is correct — encoding verified against on-chain expectations, transactions reach the mempool fine. It's a hashrate problem, not a software problem. Anything under ~10 GH/s isn't competitive at current difficulty.

The infrastructure is worth keeping for the next fair-launch PoW token. Being ready at block 0 is the only edge that matters.

## Notes

- Each worker randomises its start nonce using `time ^ pid` to avoid collisions
- `num_threads = 1` in the Rust binary is intentional — 10 single-threaded processes outperform 1 multi-threaded process on Apple Silicon due to memory bandwidth contention
- The Node.js layer retries automatically on RPC errors; failed mint txs are logged but don't crash the worker
