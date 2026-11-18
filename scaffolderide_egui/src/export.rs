//! HTML export and line-level diff computation.
//!
//! These are *output-only* helpers: they never touch the live editor
//! buffer, they just produce a representation of it (an HTML file, or a list
//! of diff lines) for the *File → Export HTML* and *Edit → Diff vs Saved*
//! features.

use similar::{ChangeTag, TextDiff};

/// Escape the five XML/HTML special characters: `&`, `<`, `>`, `"`, `'`.
///
/// Used both for the body text and for the `<title>`, so a file containing
/// `<script>` is rendered as literal text rather than executed.
fn escape_html(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    for c in s.chars() {
        match c {
            '&' => out.push_str("&amp;"),
            '<' => out.push_str("&lt;"),
            '>' => out.push_str("&gt;"),
            '"' => out.push_str("&quot;"),
            '\'' => out.push_str("&#39;"),
            _ => out.push(c),
        }
    }
    out
}

/// Generate a standalone HTML document from `text`.
///
/// The body is wrapped in `<pre>` so whitespace and indentation are
/// preserved exactly. Both the `title` and the body content are HTML-escaped
/// to prevent broken or hostile content from breaking the page.
pub fn to_html(text: &str, title: &str) -> String {
    let body = escape_html(text);
    let title = escape_html(title);
    let html = format!(
        "<!DOCTYPE html>\n\
         <html lang=\"en\">\n\
         <head>\n\
         <meta charset=\"utf-8\">\n\
         <meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">\n\
         <title>{title}</title>\n\
         <style>\n\
         body {{ font-family: 'Noto Sans Mono','DejaVu Sans Mono',monospace;\n\
                white-space: pre-wrap; background: #1e1e1e; color: #d4d4d4;\n\
                padding: 1.5em; line-height: 1.4; }}\n\
         </style>\n\
         </head>\n\
         <body><pre>{body}</pre></body>\n\
         </html>"
    );
    tracing::info!("exported HTML ({} bytes)", html.len());
    html
}

/// A single line in a diff result.
///
/// `tag` says whether the line is unchanged, an insertion, or a deletion;
/// `content` is the line's text (without its trailing newline).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DiffLine {
    pub tag: ChangeTag,
    pub content: String,
}

/// Compute a line-level diff between `old` and `new`.
///
/// Uses [`similar::TextDiff::from_lines`] (Myers algorithm) so the diff is
/// minimal and intuitive for humans to read.
pub fn compute_diff(old: &str, new: &str) -> Vec<DiffLine> {
    let diff = TextDiff::from_lines(old, new);
    let mut out = Vec::new();
    for change in diff.iter_all_changes() {
        out.push(DiffLine {
            tag: change.tag(),
            content: change.to_string(),
        });
    }
    tracing::info!("computed diff: {} change lines", out.len());
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn escape_html_handles_all_special_chars() {
        assert_eq!(escape_html("a&b<c>d\"e'f"), "a&amp;b&lt;c&gt;d&quot;e&#39;f");
    }

    #[test]
    fn to_html_escapes_title_and_body() {
        let html = to_html("<script>alert(1)</script>", "<title>x</title>");
        assert!(html.contains("&lt;script&gt;"));
        assert!(html.contains("<title>&lt;title&gt;x&lt;/title&gt;</title>"));
        assert!(html.contains("<!DOCTYPE html>"));
    }

    #[test]
    fn diff_detects_insertions_and_deletions() {
        let d = compute_diff("a\nb\nc", "a\nB\nc");
        // `similar` includes the trailing newline in each change's text.
        let inserted = d
            .iter()
            .any(|l| l.tag == ChangeTag::Insert && l.content.trim_end() == "B");
        let deleted = d
            .iter()
            .any(|l| l.tag == ChangeTag::Delete && l.content.trim_end() == "b");
        assert!(inserted && deleted, "diff must contain both sides: {d:?}");
    }

    #[test]
    fn diff_identical_text_is_all_equal() {
        let d = compute_diff("x\ny", "x\ny");
        assert!(d.iter().all(|l| l.tag == ChangeTag::Equal));
    }
}
