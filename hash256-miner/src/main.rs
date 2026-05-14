/**
 * hash256 Native Rust Miner
 * ─────────────────────────────────────────────────────────────
 * Brute-forces keccak256(challenge || nonce) < difficulty
 * Uses all CPU cores via rayon for maximum throughput.
 *
 * Output (stdout, one line when found):
 *   FOUND:<nonce_hex>
 *
 * Usage:
 *   ./miner <challenge_hex> <difficulty_hex> [start_nonce]
 *
 * The Node.js launcher reads stdout and submits the mint tx.
 * ─────────────────────────────────────────────────────────────
 */

use std::env;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::Arc;
use std::time::{Duration, Instant};
use tiny_keccak::{Hasher, Keccak};
use rayon::prelude::*;

fn keccak256(data: &[u8]) -> [u8; 32] {
    let mut hasher = Keccak::v256();
    let mut output = [0u8; 32];
    hasher.update(data);
    hasher.finalize(&mut output);
    output
}

/// Encode (bytes32, uint256) as Solidity solidityPackedKeccak256 does:
/// bytes32 is raw 32 bytes, uint256 is big-endian 32 bytes
fn encode_packed(challenge: &[u8; 32], nonce: u128) -> Vec<u8> {
    let mut buf = Vec::with_capacity(64);
    buf.extend_from_slice(challenge);
    // uint256 big-endian 32 bytes (nonce fits in u128 = 16 bytes, pad left)
    buf.extend_from_slice(&[0u8; 16]);
    buf.extend_from_slice(&nonce.to_be_bytes());
    buf
}

fn hex_to_bytes32(s: &str) -> [u8; 32] {
    let s = s.trim_start_matches("0x");
    let bytes = hex::decode(s).expect("Invalid hex for challenge");
    let mut arr = [0u8; 32];
    let len = bytes.len().min(32);
    arr[32 - len..].copy_from_slice(&bytes[..len]);
    arr
}

fn hex_to_u256_bytes(s: &str) -> [u8; 32] {
    let s = s.trim_start_matches("0x");
    let padded = format!("{:0>64}", s);
    let bytes = hex::decode(&padded).expect("Invalid hex for difficulty");
    let mut arr = [0u8; 32];
    arr.copy_from_slice(&bytes);
    arr
}

fn bytes_lt(a: &[u8; 32], b: &[u8; 32]) -> bool {
    for i in 0..32 {
        if a[i] < b[i] { return true; }
        if a[i] > b[i] { return false; }
    }
    false
}

fn main() {
    let args: Vec<String> = env::args().collect();
    if args.len() < 3 {
        eprintln!("Usage: miner <challenge_hex> <difficulty_hex> [start_nonce]");
        std::process::exit(1);
    }

    let challenge = hex_to_bytes32(&args[1]);
    let difficulty = hex_to_u256_bytes(&args[2]);
    let start_nonce: u128 = if args.len() > 3 {
        args[3].parse().unwrap_or(0)
    } else {
        // Randomise start to avoid workers colliding
        let r: u128 = rand_start();
        r
    };

    let num_threads = 1;
    eprintln!("Threads: {}", num_threads);
    eprintln!("Challenge: 0x{}", hex::encode(challenge));
    eprintln!("Start nonce: {}", start_nonce);

    let found = Arc::new(AtomicBool::new(false));
    let hash_count = Arc::new(AtomicU64::new(0));
    let start_time = Instant::now();

    // Print hash rate every 5 seconds to stderr
    {
        let found_clone = Arc::clone(&found);
        let count_clone = Arc::clone(&hash_count);
        std::thread::spawn(move || {
            let mut last = 0u64;
            let mut last_t = Instant::now();
            loop {
                std::thread::sleep(Duration::from_secs(5));
                if found_clone.load(Ordering::Relaxed) { break; }
                let now_count = count_clone.load(Ordering::Relaxed);
                let elapsed = last_t.elapsed().as_secs_f64();
                let rate = (now_count - last) as f64 / elapsed;
                eprintln!("Hash rate: {:.2} MH/s | Total: {}M hashes", rate / 1_000_000.0, now_count / 1_000_000);
                last = now_count;
                last_t = Instant::now();
            }
        });
    }

    // Split nonce space across threads using rayon
    // Each thread gets a chunk of 10_000_000 nonces, loops chunks
    let chunk_size: u128 = 10_000_000;
    let found_ref = &found;
    let count_ref = &hash_count;

    rayon::ThreadPoolBuilder::new().num_threads(1).build_global().unwrap();
        (0u128..u128::MAX / chunk_size).into_par_iter().find_any(|&chunk_idx| {
        if found_ref.load(Ordering::Relaxed) { return true; }

        let base = start_nonce.wrapping_add(chunk_idx.wrapping_mul(chunk_size));

        for i in 0..chunk_size {
            if i % 100_000 == 0 {
                count_ref.fetch_add(100_000, Ordering::Relaxed);
                if found_ref.load(Ordering::Relaxed) { return true; }
            }

            let nonce = base.wrapping_add(i);
            let packed = encode_packed(&challenge, nonce);
            let hash = keccak256(&packed);

            if bytes_lt(&hash, &difficulty) {
                found_ref.store(true, Ordering::Relaxed);
                // Print result to stdout for Node.js to capture
                println!("FOUND:{:032x}", nonce);
                let elapsed = start_time.elapsed().as_secs_f64();
                let total = count_ref.load(Ordering::Relaxed);
                eprintln!("Found nonce {} in {:.1}s ({:.2}M hashes)", nonce, elapsed, total as f64 / 1_000_000.0);
                return true;
            }
        }
        false
    });
}

/// Simple random start using system time to avoid nonce collisions between workers
fn rand_start() -> u128 {
    use std::time::{SystemTime, UNIX_EPOCH};
    let t = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .subsec_nanos() as u128;
    let pid = std::process::id() as u128;
    (t ^ (pid * 6364136223846793005)) % (u128::MAX / 2)
}

#[cfg(test)]
mod tests {
    use tiny_keccak::{Hasher, Keccak};

    fn keccak256(data: &[u8]) -> [u8; 32] {
        let mut hasher = Keccak::v256();
        let mut output = [0u8; 32];
        hasher.update(data);
        hasher.finalize(&mut output);
        output
    }

    #[test]
    fn test_encoding() {
        let challenge = hex::decode("78cb025cd843eb8b3f1736038490c4e632373cb75dc9f49338b9c7d798142869").unwrap();
        let nonce: u128 = 12345;
        let mut buf = Vec::with_capacity(64);
        buf.extend_from_slice(&challenge);
        buf.extend_from_slice(&[0u8; 16]);
        buf.extend_from_slice(&nonce.to_be_bytes());
        let hash = keccak256(&buf);
        println!("Rust hash: 0x{}", hex::encode(hash));
        assert_eq!(hex::encode(hash), "c45edd9721ac1ccb02099b461ea1a7ae901e5bd8cbc17d6d44cf19fc2581a638", "Encoding mismatch!");
    }
}
