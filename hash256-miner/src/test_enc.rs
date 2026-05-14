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
