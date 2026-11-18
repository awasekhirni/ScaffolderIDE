//! Character-encoding detection and decoding.
//!
//! Files on disk are not always UTF-8 — they may be UTF-16 (with or without
//! a BOM), Windows-1252, GB2312, Shift-JIS, etc. This module turns an
//! arbitrary `&[u8]` into a UTF-8 `String` plus a human-readable encoding
//! label, so the rest of the editor can always work in UTF-8.
//!
//! ## Strategy
//!
//! 1. **BOM check** — if the bytes start with a Byte-Order Mark we trust it
//!    unconditionally (it is the single most reliable signal).
//! 2. **`chardetng`** — a browser-grade statistical detector (the same
//!    algorithm Firefox uses for pages without a declared charset).
//! 3. The result is decoded with [`encoding_rs`], which *never* hard-fails:
//!    bytes that are invalid for the guessed encoding become U+FFFD
//!    replacement characters instead. We log a warning when that happens so
//!    the user knows the decoding was lossy.
//!
//! Because of step 3 this function is infallible — there is always *some*
//! decoded `String` to show. (An earlier version returned an `EncodingError`
//! enum, but those variants were unreachable in practice and have been
//! removed to avoid misleading callers.)

use chardetng::EncodingDetector;
use std::path::Path;

/// The result of decoding a file: the UTF-8 text plus the name of the
/// encoding it was decoded as (e.g. `"UTF-8"`, `"windows-1252"`).
#[derive(Debug, Clone)]
pub struct DecodedFile {
    /// Human-readable encoding label, as reported by `encoding_rs`.
    pub encoding_name: String,
    /// The fully-decoded UTF-8 text. Invalid bytes were replaced with U+FFFD.
    pub text: String,
}

/// Detect the encoding of `bytes` and decode them into a UTF-8 `String`.
///
/// `path` is only used for log messages — it is never read.
///
/// This function always succeeds: see the module docs for why.
pub fn decode_file(bytes: &[u8], path: &Path) -> DecodedFile {
    tracing::debug!("detecting encoding for {path:?} ({} bytes)", bytes.len());

    // Step 1: BOM check. A BOM is authoritative — never second-guess it.
    if let Some((encoding, bom_len)) = encoding_rs::Encoding::for_bom(bytes) {
        let (cow, _encoding_used, had_errors) = encoding.decode(&bytes[bom_len..]);
        if had_errors {
            tracing::warn!("BOM decode for {path:?} produced replacement characters");
        }
        let name = encoding.name().to_string();
        tracing::info!("BOM-detected encoding for {path:?}: {name}");
        return DecodedFile {
            encoding_name: name,
            text: cow.into_owned(),
        };
    }

    // Step 2: statistical detection via chardetng. `guess(None, true)` asks
    // for the UTF-8-first preference that web browsers use for top-level
    // documents (no declared encoding hint, prefer UTF-8).
    let mut detector = EncodingDetector::new();
    detector.feed(bytes, true);
    let encoding = detector.guess(None, true);
    let name = encoding.name().to_string();

    let (cow, _encoding_used, had_errors) = encoding.decode(bytes);
    if had_errors {
        tracing::warn!(
            "decoding {path:?} as {name} produced replacement characters — \
             the file may be in an unusual encoding"
        );
    } else {
        tracing::info!("detected encoding for {path:?}: {name}");
    }

    DecodedFile {
        encoding_name: name,
        text: cow.into_owned(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn decodes_utf8_without_bom() {
        let bytes = b"hello, \xe4\xb8\x96\xe7\x95\x8c"; // "hello, 世界"
        let d = decode_file(bytes, std::path::Path::new("x.txt"));
        assert_eq!(d.text, "hello, 世界");
        assert!(d.encoding_name.to_ascii_uppercase().contains("UTF"));
    }

    #[test]
    fn decodes_utf8_with_bom() {
        let bytes = [0xEF, 0xBB, 0xBF, b'h', b'i'];
        let d = decode_file(&bytes, std::path::Path::new("x.txt"));
        assert_eq!(d.text, "hi");
        // BOM path returns the encoding name from encoding_rs.
        assert!(!d.encoding_name.is_empty());
    }

    #[test]
    fn decodes_invalid_bytes_without_panicking() {
        // A lone continuation byte is invalid UTF-8. `decode_file` must not
        // panic: it always returns *some* decoded string (chardetng may pick
        // a single-byte encoding where 0x80 is a valid codepoint, e.g.
        // windows-1252 maps it to `€`, so we do NOT assert a specific glyph —
        // only that decoding succeeds and yields at least one character).
        let bytes = [0b1000_0000];
        let d = decode_file(&bytes, std::path::Path::new("x.txt"));
        assert!(d.text.chars().count() >= 1, "must decode to non-empty text");
        assert!(!d.encoding_name.is_empty());
    }
}
