# HASH256 Mining Operation — Agent Progress Log

**Last updated:** 2026-05-14
**Status:** 🔴 SHELVED — uneconomic at current difficulty

---

## Mission

Set up a maximum-efficiency $HASH PoW mining operation on a MacBook Pro M-series (10 cores), using a native Rust keccak256 miner feeding into Node.js transaction submission, across 10 independent wallets to maximise parallel minting in Era 0 (100 HASH per mint).

---

## Why It Was Shelved

`mine()` is open (confirmed via `InsufficientWork()` error on bad nonces). The blocker is pure economics:

| Metric | Value |
|--------|-------|
| Difficulty | 2^50 expected hashes per mint |
| CPU hashrate (10 workers) | ~37 MH/s |
| Expected time per mint | ~352 days |
| Hashrate needed for 1 mint/day | ~13 GH/s |

The 1.89M HASH already minted was taken by bots/GPU farms in the first few blocks when difficulty was trivially low. The browser miner on hash256.org/mine requires ~714 years per tab at current difficulty — it is effectively non-functional for regular users.

**Shutdown actions taken (2026-05-14):**
- All 10 miners killed
- ETH from W2–W10 swept back to W1 (~0.00833 ETH total)

---

## What Has Been Built

### File Structure

```
~/hash256/
├── hash256-cli/              # Node.js layer
│   ├── .env                  # 10 private keys + RPC URL
│   ├── miner.js              # Original JS miner (single wallet)
│   ├── launch.js             # Multi-process JS launcher (10 workers)
│   ├── fast-launch.js        # ★ ACTIVE — Rust + Node.js launcher
│   ├── consolidate.js        # L2 dust sweeper + bridge to mainnet
│   └── node_modules/
│
└── hash256-miner/            # Rust native miner
    ├── Cargo.toml
    ├── src/main.rs           # keccak256 brute-forcer, 1 thread per process
    └── target/release/miner  # ★ Compiled binary — 30 MH/s standalone
```

---

## Completed Steps

| Step | Status | Notes |
|------|--------|-------|
| Clone hash256-cli repo | ✅ Done | `~/hash256/hash256-cli` |
| npm install | ✅ Done | ethers, dotenv |
| Configure .env | ✅ Done | 10 private keys + RPC URL |
| Test original miner.js | ✅ Done | Working, single wallet |
| Build launch.js (JS multi-worker) | ✅ Done | 10 workers, same wallet |
| Build fast-launch.js (Rust+Node) | ✅ Done | 10 workers, 10 wallets |
| Install Rust toolchain | ✅ Done | rustc 1.95.0 |
| Write Rust keccak256 miner | ✅ Done | src/main.rs |
| Compile Rust binary | ✅ Done | `cargo build --release` |
| Verify encoding matches JS | ✅ Done | Test passed — hashes identical |
| Generate 9 new wallets | ✅ Done | Wallets 2–10 created |
| Fund all 10 wallets | ✅ Done | ~0.0008 ETH each (tight, needs top-up) |
| Distribute ETH to wallets | ✅ Done | Auto-distributed via Node.js script |
| Add all keys to .env | ✅ Done | PRIVATE_KEY through PRIVATE_KEY_10 |
| Run fast-launch.js | ✅ Done | 10 workers active, ~25 MH/s total |
| Diagnose 0 mints issue | ✅ Done | mine() reverts — seedPool() not called |
| Write consolidate.js | ✅ Done | Scans Base/Optimism/Arbitrum, swaps + bridges |
| Write README.md | ✅ Done | Full setup guide |

---

## Current Mining State (last checked)

| Parameter | Value |
|-----------|-------|
| Contract | `0xAC7b5d06fa1e77D08aea40d46cB7C5923A87A0cc` |
| Era | 0 (100 HASH per mint) |
| Minted so far | 1,890,400 HASH |
| Remaining | 17,009,600 HASH |
| Difficulty | 102,844,034,832,575,377,634,685,573,909,834,406,561,420,991,602,098,741,459,288,063 |
| Genesis complete | ✅ true |
| seedPool called | ❌ false — **THIS IS THE BLOCKER** |
| mine() callable | ❌ reverts with unknown custom error |
| Active workers | 10 (fast-launch.js running) |
| Hash rate | ~25 MH/s total across 10 wallets |
| Mints | 0 (all blocked by seedPool) |

---

## Wallet Summary

| Wallet | Address | ETH Balance | Status |
|--------|---------|-------------|--------|
| W1 (main) | `0xf326194AE21274d62fe6c399995048BEe9f495Dc` | ~0.001 ETH | Active |
| W2 | `0x59E411e3bf8f4b2473a12Fa6B7e6cCa56F6db50E` | ~0.0008 ETH | Active |
| W3 | `0x2916c16D8F233C5e3a9Dcf8A9737896d494DDaA0` | ~0.0008 ETH | Active |
| W4 | `0x6d1B5Db41077fe9307C2C1b4B3A60D7Ad9583B30` | ~0.0008 ETH | Active |
| W5 | `0x1187dB2b2A18544B2B294D969bf9a3294FF81A46` | ~0.0008 ETH | Active |
| W6 | `0x6D05ba51AdB4bFE6E69Cb8596df182179a264BA9` | ~0.0008 ETH | Active |
| W7 | `0xF2Bc2fbE23F4BADA8849c9C0D5EBFB917dc45C3e` | ~0.0008 ETH | Active |
| W8 | `0x34E2B1225c448f6068A1e9ea5fdf431750E51FB0` | ~0.0008 ETH | Active |
| W9 | `0x2c940Bb741a73b863c634D0013C4AcA58e3E928C` | ~0.0008 ETH | Active |
| W10 | `0xa121A220d1FD3cFE0442A31162d5d5Ea979FC033` | ~0.0008 ETH | Active |

⚠️ **Wallets are low on ETH.** At ~0.000068 ETH per mint, each wallet has ~11 mints of runway. Top up to 0.005 ETH each before or immediately after seedPool() is called.

---

## Performance Summary

| Method | Hash rate | vs baseline |
|--------|-----------|-------------|
| Browser tab | ~50 KH/s | 1x |
| Original miner.js (1 worker) | ~118 KH/s | 2.4x |
| launch.js (10 JS workers) | ~1.2 MH/s | 24x |
| **fast-launch.js (10 Rust workers)** | **~25 MH/s** | **500x** |

Rust binary tested at **30 MH/s standalone** (single process, 10 threads).  
When split across 10 single-threaded workers: ~2.5 MH/s each = ~25 MH/s total.

---

## Immediate Next Actions (in order)

1. **Call `seedPool()`** — run the command in the blocker section above
2. **Verify mining opens** — watch for `FOUND nonce` + `TX sent` in fast-launch.js output
3. **Top up wallet gas** — add 0.005 ETH to each of the 10 wallets ASAP
4. **Monitor mint rate** — stats print every 2 minutes in fast-launch.js
5. **Run consolidate.js** — sweep L2 dust to fund ongoing gas costs

---

## Known Issues & Decisions

| Issue | Resolution |
|-------|-----------|
| miner.js used `index.js` — not found | Entry point is `miner.js` |
| launch.js looked for miner in wrong dir | Must run from inside `hash256-cli/` |
| JS miner: 118 KH/s — too slow | Replaced with Rust binary (253x faster) |
| 10 Rust processes × 10 threads = contention | Set `num_threads = 1` in Rust — 1 thread per process |
| Encoding mismatch risk | Verified — Rust and JS produce identical hashes |
| 0 mints after 9+ hours | Root cause: `seedPool()` not called, `mine()` reverts |
| Wallets low on ETH | Need top-up before active mining begins |

---

## How to Resume (for next agent)

1. Check if `seedPool()` has been called:
```bash
cd ~/hash256/hash256-cli
node -e "
require('dotenv').config();
const {ethers} = require('ethers');
const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
const contract = new ethers.Contract(
  '0xAC7b5d06fa1e77D08aea40d46cB7C5923A87A0cc',
  ['function genesisComplete() view returns (bool)', 'function mine(uint256) external'],
  provider
);
(async () => {
  console.log('genesisComplete:', await contract.genesisComplete());
  try {
    await provider.estimateGas({ to: contract.target, data: contract.interface.encodeFunctionData('mine', [12345n]) });
    console.log('mine() is OPEN');
  } catch(e) {
    console.log('mine() still reverts:', e.shortMessage);
  }
})();
"
```

2. If still blocked, call `seedPool()` using the command in the blocker section.

3. If mining is open, check fast-launch.js is running:
```bash
ps aux | grep fast-launch
```

4. If not running:
```bash
cd ~/hash256/hash256-cli
node fast-launch.js
```

5. Check wallet balances and top up if below 0.002 ETH each.

---

## References

- Contract: https://etherscan.io/address/0xAC7b5d06fa1e77D08aea40d46cB7C5923A87A0cc
- Whitepaper: https://hash256.org/whitepaper
- Mine page: https://hash256.org/mine
- JS miner repo: https://github.com/mrfunntastiic/hash256-cli