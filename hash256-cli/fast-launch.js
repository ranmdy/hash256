/**
 * fast-launch.js
 * ──────────────────────────────────────────────────────────────
 * Spawns the native Rust miner for hashing (50-100x faster than JS)
 * and handles all Ethereum interaction in Node.js.
 *
 * Usage:
 *   node fast-launch.js
 *   node fast-launch.js 6     ← use 6 cores instead of all
 * ──────────────────────────────────────────────────────────────
 */

require("dotenv").config();
const { ethers } = require("ethers");
const { spawn } = require("child_process");
const path = require("path");
const os = require("os");

const MINER_BIN = path.join(__dirname, "..", "hash256-miner", "target", "release", "miner");
const NUM_WORKERS = parseInt(process.argv[2]) || 1; // Rust uses all cores internally
const CONTRACT_ADDRESS = "0xAC7b5d06fa1e77D08aea40d46cB7C5923A87A0cc";
const ABI = [
  "function getChallenge(address miner) view returns (bytes32)",
  "function miningState() view returns (uint256 era, uint256 reward, uint256 difficulty, uint256 minted, uint256 remaining, uint256 epoch, uint256 epochBlocksLeft_)",
  "function mine(uint256 nonce)",
];

const colors = ["\x1b[36m","\x1b[32m","\x1b[33m","\x1b[35m","\x1b[34m","\x1b[91m","\x1b[92m","\x1b[93m","\x1b[94m","\x1b[95m"];
const RESET = "\x1b[0m";
const BOLD = "\x1b[1m";
const GREEN = "\x1b[32m";
const RED = "\x1b[31m";

// Support multiple wallets: PRIVATE_KEY, PRIVATE_KEY_2 ... PRIVATE_KEY_10
function loadWallets(provider) {
  const wallets = [];
  const key1 = process.env.PRIVATE_KEY;
  if (key1) wallets.push(new ethers.Wallet(key1, provider));
  for (let i = 2; i <= 10; i++) {
    const key = process.env[`PRIVATE_KEY_${i}`];
    if (key) wallets.push(new ethers.Wallet(key, provider));
  }
  return wallets;
}

let stats = [];
let totalMints = 0;

function timestamp() {
  return new Date().toISOString().substring(11, 19);
}

function printStats() {
  console.log(`\n${BOLD}═══════════════════ STATS [${timestamp()}] ═══════════════════${RESET}`);
  stats.forEach((s, i) => {
    const color = colors[i % colors.length];
    const elapsed = ((Date.now() - s.startTime) / 3600000);
    const rate = elapsed > 0 ? (s.mints / elapsed).toFixed(2) : "0.00";
    console.log(
      `${color}Worker ${String(i+1).padStart(2)}${RESET}` +
      ` | Mints: ${BOLD}${String(s.mints).padStart(4)}${RESET}` +
      ` | Fails: ${s.fails}` +
      ` | Rate: ${rate}/hr` +
      ` | MH/s: ${s.hashrate || "..."}`
    );
  });
  console.log(`${BOLD}─────────────────────────────────────────────────────────────${RESET}`);
  console.log(`${BOLD}TOTAL Mints: ${totalMints} | Workers: ${stats.length}${RESET}\n`);
}

async function runWorker(id, wallet, contract) {
  const color = colors[id % colors.length];
  const label = `${color}[W${String(id+1).padStart(2)}]${RESET}`;
  stats[id] = { mints: 0, fails: 0, startTime: Date.now(), hashrate: "..." };

  while (true) {
    try {
      // Fetch challenge + difficulty
      const [state, challenge] = await Promise.all([
        contract.miningState(),
        contract.getChallenge(wallet.address),
      ]);

      const difficulty = state.difficulty;
      const diffHex = "0x" + difficulty.toString(16).padStart(64, "0");

      console.log(`${label} Era:${state.era} Reward:${ethers.formatUnits(state.reward,18)} HASH | Challenge:${challenge.substring(0,12)}...`);

      // Spawn Rust binary
      const rustProc = spawn(MINER_BIN, [challenge, diffHex], {
        stdio: ["ignore", "pipe", "pipe"],
      });

      let found = false;

      // Parse stderr for hash rate
      rustProc.stderr.on("data", (data) => {
        const lines = data.toString().split("\n").filter(l => l.trim());
        lines.forEach(line => {
          if (line.includes("Hash rate:")) {
            const match = line.match(/([\d.]+) MH\/s/);
            if (match) stats[id].hashrate = match[1] + " MH/s";
          }
          console.log(`${label} ${line}`);
        });
      });

      // Parse stdout for FOUND result
      const nonce = await new Promise((resolve, reject) => {
        let buf = "";
        rustProc.stdout.on("data", (data) => {
          buf += data.toString();
          const lines = buf.split("\n");
          for (const line of lines) {
            if (line.startsWith("FOUND:")) {
              const nonceHex = line.replace("FOUND:", "").trim();
              resolve(BigInt("0x" + nonceHex));
            }
          }
        });
        rustProc.on("exit", (code) => {
          if (!found && code !== 0) reject(new Error("Rust miner exited with code " + code));
        });
        rustProc.on("error", reject);
      });

      found = true;
      rustProc.kill();

      console.log(`${label} ${GREEN}FOUND nonce: ${nonce}${RESET}`);

      // Submit mint transaction
      try {
        const tx = await contract.mine(nonce);
        console.log(`${label} TX sent: ${tx.hash}`);
        const receipt = await tx.wait();
        console.log(`${label} ${GREEN}✓ Minted! Block: ${receipt.blockNumber}${RESET}`);
        stats[id].mints++;
        totalMints++;
      } catch (err) {
        console.log(`${label} ${RED}TX failed: ${err.shortMessage || err.message}${RESET}`);
        stats[id].fails++;
      }

      // Small delay before next round
      await new Promise(r => setTimeout(r, 1000));

    } catch (err) {
      console.log(`${label} ${RED}Error: ${err.message} — retrying in 5s${RESET}`);
      await new Promise(r => setTimeout(r, 5000));
    }
  }
}

async function main() {
  if (!process.env.PRIVATE_KEY) {
    console.error(`${RED}PRIVATE_KEY not set in .env${RESET}`);
    process.exit(1);
  }

  // Check binary exists
  const fs = require("fs");
  if (!fs.existsSync(MINER_BIN)) {
    console.error(`${RED}Rust binary not found at: ${MINER_BIN}${RESET}`);
    console.error(`Build it first:\n  cd hash256-miner && cargo build --release`);
    process.exit(1);
  }

  const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
  const wallets = loadWallets(provider);

  console.log(`${BOLD}`);
  console.log(`╔═══════════════════════════════════════════════╗`);
  console.log(`║     HASH256 FAST MINER (Rust + Node.js)       ║`);
  console.log(`║     Wallets: ${String(wallets.length).padEnd(4)} │ PID: ${String(process.pid).padEnd(10)}      ║`);
  console.log(`╚═══════════════════════════════════════════════╝${RESET}`);

  wallets.forEach((w, i) => {
    console.log(`${colors[i % colors.length]}Wallet ${i+1}: ${w.address}${RESET}`);
  });
  console.log();

  // Each wallet gets its own worker
  const contracts = wallets.map(w => new ethers.Contract(CONTRACT_ADDRESS, ABI, w));

  // Start all workers
  wallets.forEach((wallet, i) => {
    runWorker(i, wallet, contracts[i]);
  });

  // Stats every 2 minutes
  setInterval(printStats, 2 * 60 * 1000);

  process.on("SIGINT", () => {
    printStats();
    process.exit(0);
  });
}

main().catch(e => {
  console.error(e.message || e);
  process.exit(1);
});
