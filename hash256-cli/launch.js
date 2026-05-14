const { spawn } = require("child_process");
const path = require("path");
const os = require("os");

const NUM_WORKERS = parseInt(process.argv[2]) || os.cpus().length;
const MINER_PATH = path.join(__dirname, "miner.js");
const RESTART_DELAY_MS = 3000;

const colors = [
  "\x1b[36m", // cyan
  "\x1b[32m", // green
  "\x1b[33m", // yellow
  "\x1b[35m", // magenta
  "\x1b[34m", // blue
  "\x1b[91m", // bright red
  "\x1b[92m", // bright green
  "\x1b[93m", // bright yellow
  "\x1b[94m", // bright blue
  "\x1b[95m", // bright magenta
];
const RESET = "\x1b[0m";
const BOLD = "\x1b[1m";

let stats = Array.from({ length: NUM_WORKERS }, () => ({
  mints: 0,
  fails: 0,
  startTime: Date.now(),
}));

function timestamp() {
  return new Date().toISOString().substring(11, 19);
}

function printStats() {
  const now = Date.now();
  console.log(`\n${BOLD}═══════════════════ STATS [${timestamp()}] ═══════════════════${RESET}`);
  let totalMints = 0;
  let totalFails = 0;
  stats.forEach((s, i) => {
    const elapsed = ((now - s.startTime) / 60000).toFixed(1);
    const rate = s.mints > 0 ? (s.mints / ((now - s.startTime) / 3600000)).toFixed(2) : "0.00";
    totalMints += s.mints;
    totalFails += s.fails;
    console.log(
      `${colors[i % colors.length]}Worker ${String(i + 1).padStart(2)}${RESET}` +
      ` | Mints: ${BOLD}${String(s.mints).padStart(4)}${RESET}` +
      ` | Fails: ${String(s.fails).padStart(3)}` +
      ` | Rate: ${rate}/hr` +
      ` | Up: ${elapsed}m`
    );
  });
  const totalElapsed = (now - stats[0].startTime) / 3600000;
  const totalRate = totalElapsed > 0 ? (totalMints / totalElapsed).toFixed(2) : "0.00";
  console.log(`${BOLD}─────────────────────────────────────────────────────────────${RESET}`);
  console.log(`${BOLD}TOTAL${RESET} | Mints: ${BOLD}${totalMints}${RESET} | Fails: ${totalFails} | Rate: ${BOLD}${totalRate}/hr${RESET} | Workers: ${NUM_WORKERS}`);
  console.log(`${BOLD}═════════════════════════════════════════════════════════════${RESET}\n`);
}

function spawnWorker(id) {
  const color = colors[id % colors.length];
  const label = `${color}[Worker ${String(id + 1).padStart(2)}]${RESET}`;

  const child = spawn("node", [MINER_PATH], {
    env: { ...process.env },
    stdio: ["ignore", "pipe", "pipe"],
  });

  child.stdout.on("data", (data) => {
    const lines = data.toString().split("\n").filter((l) => l.trim());
    lines.forEach((line) => {
      // Track mints and fails
      if (line.includes("Success block:")) stats[id].mints++;
      if (line.includes("TX failed:")) stats[id].fails++;
      // Suppress repetitive dot lines but show everything else
      if (!line.match(/^\.+$/)) {
        console.log(`${label} ${line}`);
      } else {
        process.stdout.write(`${color}.${RESET}`);
      }
    });
  });

  child.stderr.on("data", (data) => {
    const lines = data.toString().split("\n").filter((l) => l.trim());
    lines.forEach((line) => {
      console.log(`${label} \x1b[31m[ERR] ${line}${RESET}`);
    });
  });

  child.on("exit", (code) => {
    console.log(`\n${label} \x1b[31mExited (code ${code}). Restarting in ${RESTART_DELAY_MS / 1000}s...${RESET}`);
    stats[id].startTime = Date.now();
    setTimeout(() => spawnWorker(id), RESTART_DELAY_MS);
  });

  return child;
}

// ── Main ──────────────────────────────────────────────────────────────────────

console.log(`${BOLD}`);
console.log(`╔═══════════════════════════════════════════════╗`);
console.log(`║       HASH256 MULTI-CORE LAUNCHER             ║`);
console.log(`║       Workers: ${String(NUM_WORKERS).padEnd(4)} │ PID: ${String(process.pid).padEnd(10)}       ║`);
console.log(`╚═══════════════════════════════════════════════╝${RESET}`);
console.log(`Starting ${NUM_WORKERS} workers from: ${MINER_PATH}\n`);

for (let i = 0; i < NUM_WORKERS; i++) {
  setTimeout(() => {
    console.log(`${colors[i % colors.length]}[Worker ${i + 1}] Starting...${RESET}`);
    spawnWorker(i);
  }, i * 300); // stagger starts by 300ms to avoid RPC flood
}

// Print stats every 2 minutes
setInterval(printStats, 2 * 60 * 1000);

// Graceful shutdown
process.on("SIGINT", () => {
  console.log(`\n${BOLD}Shutting down all workers...${RESET}`);
  printStats();
  process.exit(0);
});