//! HTML export and diff computation.

use similar::{ChangeTag, TextDiff};

/// Generate a standalone HTML document from `text`.
///
/// Escapes HTML entities and wraps lines in `<pre>`.
pub fn to_html(text: &str, title: &str) -> String {
    let escaped = text
        .replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;");
    let html = format!(
        "<!DOCTYPE html>\n<html><head><meta charset=\"utf-8\">\
         <title>{title}</title>\
         <style>body{{font-family:monospace;white-space:pre-wrap;padding:2em;}}</style>\
         </head><body><pre>{escaped}</pre></body></html>"
    );
    tracing::info!("Exported HTML ({} bytes)", html.len());
    html
}

/// A single line in a diff result.
pub struct DiffLine {
    pub tag: ChangeTag,
    pub content: String,
}

/// Compute a line-level diff between `old` and `new`.
pub fn compute_diff(old: &str, new: &str) -> Vec<DiffLine> {
    let diff = TextDiff::from_lines(old, new);
    let mut out = Vec::new();
    for change in diff.iter_all_changes() {
        out.push(DiffLine {
            tag: change.tag(),
            content: change.to_string(),
        });
    }
    tracing::info!("Computed diff: {} change lines", out.len());
    out
}
