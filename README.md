# hash256

Rust + Node.js miner for the HASH256 token (`0xAC7b5d06fa1e77D08aea40d46cB7C5923A87A0cc`).

The token uses a proof-of-work mechanic — to mint, you brute-force a nonce where
`keccak256(challenge || nonce) < difficulty`, then submit it on-chain via `mine(uint256)`.
The challenge is per-wallet, so running multiple wallets in parallel means independent
search spaces with no collision.

---

## why this exists

the browser miner on hash256.org runs at around 50 KH/s. that's not enough to be useful
at any reasonable difficulty. this replaces it with a native Rust binary doing the hashing
(keccak256 at ~3.5 MH/s per core) while Node.js handles everything else — fetching
challenges, managing wallets, submitting txs, retrying on RPC errors.

with 10 workers running the Rust binary, you're at around 35 MH/s total.

---

## structure

```
hash256-cli/          Node.js — RPC, wallet management, tx submission
  miner.js            original single-wallet JS miner
  launch.js           10-process JS launcher (pure JS, ~1.2 MH/s)
  fast-launch.js      Rust + Node hybrid — what you actually want to run
  check-state.js      reads miningState + genesisState from chain

hash256-miner/        Rust — keccak256 brute-forcer
  src/main.rs         takes challenge + difficulty as args, prints FOUND:<nonce_hex>
```

---

## setup

```bash
# build the Rust binary first
cd hash256-miner && cargo build --release

# configure wallets
cp hash256-cli/.env.example hash256-cli/.env
# fill in RPC_URL and PRIVATE_KEY through PRIVATE_KEY_10

# run
cd hash256-cli && node fast-launch.js
```

each worker fetches its own challenge, spawns the Rust binary, and submits the mint tx
when a valid nonce comes back. stats print every 2 minutes. Ctrl+C gives a final summary.

---

## performance

| method | hash rate |
|--------|-----------|
| browser tab | ~50 KH/s |
| miner.js (1 JS worker) | ~120 KH/s |
| launch.js (10 JS workers) | ~1.2 MH/s |
| fast-launch.js (10 Rust workers) | ~35 MH/s |

a few things worth knowing:
- `num_threads = 1` in the Rust binary is intentional. 10 single-threaded processes
  consistently outperform 1 multi-threaded process on Apple Silicon because of memory
  bandwidth contention with keccak256
- each worker randomises its start nonce using `time ^ pid` so they're not overlapping
- failed mint txs are logged and skipped, they don't crash the worker

---

## current status — shelved

difficulty is sitting at `2^50` expected hashes per mint. at 35 MH/s that's somewhere
around 350 days per mint, which isn't competitive.

the 1.89M HASH already minted was taken in the first few blocks when difficulty was near
`2^256` and barely anyone was mining. by the time this was built and deployed, the window
had already closed.

the code is correct. encoding verified against on-chain expectations, transactions land
in the mempool fine. the problem is pure hashrate — you'd need something in the range of
10 GH/s to be competitive at current difficulty.

keeping it around for the next fair-launch PoW token. being ready at block 0 is the only
edge that matters.
