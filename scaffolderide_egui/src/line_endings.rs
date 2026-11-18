//! Detect and convert line endings (CRLF / LF / CR).

/// Detected dominant line ending style.
#[derive(Debug, Clone, Copy, PartialEq)]
pub enum LineEnding {
    Lf,
    CrLf,
    Cr,
    Mixed,
}

impl LineEnding {
    /// Human-readable label for the status bar.
    pub fn label(self) -> &'static str {
        match self {
            LineEnding::Lf => "LF",
            LineEnding::CrLf => "CRLF",
            LineEnding::Cr => "CR",
            LineEnding::Mixed => "Mixed",
        }
    }

    /// The literal string representation.
    pub fn as_str(self) -> &'static str {
        match self {
            LineEnding::Lf => "\n",
            LineEnding::CrLf => "\r\n",
            LineEnding::Cr => "\r",
            LineEnding::Mixed => "\n",
        }
    }
}

/// Detect the dominant line ending in `text`.
///
/// Counts occurrences of CRLF, bare LF, and bare CR.
/// Returns `Mixed` if more than one style is present.
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
    tracing::trace!("Line ending counts: CRLF={crlf} LF={lf} CR={cr}");
    let styles = [crlf > 0, lf > 0, cr > 0].iter().filter(|&&b| b).count();
    if styles > 1 {
        return LineEnding::Mixed;
    }
    if crlf > 0 {
        LineEnding::CrLf
    } else if lf > 0 {
        LineEnding::Lf
    } else if cr > 0 {
        LineEnding::Cr
    } else {
        LineEnding::Lf
    }
}

/// Convert all line endings in `text` to `target`.
///
/// Normalizes to LF first, then replaces with the target sequence.
pub fn convert(text: &str, target: LineEnding) -> String {
    let normalized = text.replace("\r\n", "\n").replace('\r', "\n");
    match target {
        LineEnding::Lf => normalized,
        LineEnding::CrLf => normalized.replace('\n', "\r\n"),
        LineEnding::Cr => normalized.replace('\n', "\r"),
        LineEnding::Mixed => normalized,
    }
}
