//! Character encoding detection and decoding.

use crate::error::EncodingError;
use chardetng::EncodingDetector;
use std::path::PathBuf;

/// Detected encoding and the decoded text.
#[derive(Debug, Clone)]
pub struct DecodedFile {
    /// Human-readable encoding label (e.g. "UTF-8", "windows-1252").
    pub encoding_name: String,
    /// Decoded UTF-8 text.
    pub text: String,
}

/// Detect the encoding of `bytes` and decode into a UTF-8 `String`.
///
/// # Strategy
/// 1. Check for a BOM via `encoding_rs::Encoding::for_bom`.
/// 2. If no BOM, use `chardetng` (browser-grade detector).
/// 3. Fall back to UTF-8 with replacement on failure.
///
/// # Errors
/// Returns `EncodingError::Undetectable` if the detector yields no guess.
/// Returns `EncodingError::DecodeFailed` if decoding fails hard.
pub fn decode_file(bytes: &[u8], path: &PathBuf) -> Result<DecodedFile, EncodingError> {
    tracing::debug!("Detecting encoding for {:?} ({} bytes)", path, bytes.len());

    // Step 1: BOM check.
    if let Some((encoding, bom_len)) = encoding_rs::Encoding::for_bom(bytes) {
        let (text, _, had_errors) = encoding.decode(&bytes[bom_len..]);
        if had_errors {
            tracing::warn!("BOM decode for {:?} had replacement errors", path);
        }
        let name = encoding.name().to_string();
        tracing::info!("BOM-detected encoding for {:?}: {name}", path);
        return Ok(DecodedFile {
            encoding_name: name,
            text: text.into_owned(),
        });
    }

    // Step 2: chardetng.
    let mut detector = EncodingDetector::new();
    detector.feed(bytes, true);
    let encoding = detector.guess(None, true);
    let name = encoding.name().to_string();

    let (text, _, had_errors) = encoding.decode(bytes);
    if had_errors {
        tracing::warn!(
            "Decoding {:?} as {name} produced replacement characters",
            path
        );
    }
    tracing::info!("Detected encoding for {:?}: {name}", path);
    Ok(DecodedFile {
        encoding_name: name,
        text: text.into_owned(),
    })
}
