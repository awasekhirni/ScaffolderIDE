//! Detect and convert line endings (LF / CRLF / CR / Mixed).
//!
//! Internally the editor normalises everything to LF (`\n`) inside the
//! `Document::text` buffer — this keeps all text operations simple. The
//! *original* line-ending style is remembered so the status bar can report
//! it, and the *Edit → Endings → Convert to …* menu re-encodes the buffer
//! on demand before saving.
//!
//! ## Why a `Mixed` variant?
//!
//! Real-world files (especially those edited on multiple platforms or
//! pasted from various sources) often contain more than one style. Reporting
//! `Mixed` is more honest than silently picking a "winner".

/// The dominant line-ending style found in a buffer.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Default)]
pub enum LineEnding {
    /// Unix: `\n`. Used by Linux, macOS (since 10.0), modern editors.
    #[default]
    Lf,
    /// Windows: `\r\n`. Used by Windows and many network protocols.
    CrLf,
    /// Classic Mac: `\r`. Rare today, but still encountered in legacy data.
    Cr,
    /// More than one style is present in the same file.
    Mixed,
}

impl LineEnding {
    /// Short label for the status bar / properties dialog.
    pub fn label(self) -> &'static str {
        match self {
            LineEnding::Lf => "LF",
            LineEnding::CrLf => "CRLF",
            LineEnding::Cr => "CR",
            LineEnding::Mixed => "Mixed",
        }
    }
}

/// Detect the dominant line ending in `text`.
///
/// Counts occurrences of CRLF, bare LF, and bare CR by scanning the bytes
/// directly (rather than splitting on `\n`, which would hide CR). Returns
/// [`LineEnding::Mixed`] when more than one style is present.
pub fn detect(text: &str) -> LineEnding {
    let mut crlf = 0usize;
    let mut lf = 0usize;
    let mut cr = 0usize;
    let bytes = text.as_bytes();
    let mut i = 0;
    while i < bytes.len() {
        match bytes[i] {
            b'\r' if i + 1 < bytes.len() && bytes[i + 1] == b'\n' => {
                crlf += 1;
                i += 2;
            }
            b'\r' => {
                cr += 1;
                i += 1;
            }
            b'\n' => {
                lf += 1;
                i += 1;
            }
            _ => i += 1,
        }
    }
    tracing::trace!("line-ending counts: CRLF={crlf} LF={lf} CR={cr}");
    let styles_present = [crlf > 0, lf > 0, cr > 0]
        .iter()
        .filter(|&&b| b)
        .count();
    if styles_present > 1 {
        return LineEnding::Mixed;
    }
    if crlf > 0 {
        LineEnding::CrLf
    } else if lf > 0 {
        LineEnding::Lf
    } else if cr > 0 {
        LineEnding::Cr
    } else {
        // Empty / single-line file with no terminator — default to LF.
        LineEnding::Lf
    }
}

/// Convert *every* line ending in `text` to `target`.
///
/// Normalises to LF first (so CRLF and bare CR both become LF), then
/// re-encodes to the target sequence. This guarantees a clean, single-style
/// result even for `Mixed` input.
pub fn convert(text: &str, target: LineEnding) -> String {
    // First pass: normalise everything to LF.
    let normalized = text.replace("\r\n", "\n").replace('\r', "\n");
    match target {
        LineEnding::Lf | LineEnding::Mixed => normalized,
        LineEnding::CrLf => normalized.replace('\n', "\r\n"),
        LineEnding::Cr => normalized.replace('\n', "\r"),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn detects_lf() {
        assert_eq!(detect("a\nb\nc"), LineEnding::Lf);
    }

    #[test]
    fn detects_crlf() {
        assert_eq!(detect("a\r\nb\r\nc"), LineEnding::CrLf);
    }

    #[test]
    fn detects_cr() {
        assert_eq!(detect("a\rb\rc"), LineEnding::Cr);
    }

    #[test]
    fn detects_mixed() {
        assert_eq!(detect("a\nb\r\nc"), LineEnding::Mixed);
    }

    #[test]
    fn detects_empty_as_lf() {
        assert_eq!(detect(""), LineEnding::Lf);
    }

    #[test]
    fn convert_normalises_then_re_encodes() {
        let mixed = "a\r\nb\rc\nd";
        assert_eq!(convert(mixed, LineEnding::Lf), "a\nb\nc\nd");
        assert_eq!(convert(mixed, LineEnding::CrLf), "a\r\nb\r\nc\r\nd");
        assert_eq!(convert(mixed, LineEnding::Cr), "a\rb\rc\rd");
    }

    #[test]
    fn convert_idempotent_for_lf() {
        let s = "x\ny\nz";
        assert_eq!(convert(s, LineEnding::Lf), s);
    }
}
