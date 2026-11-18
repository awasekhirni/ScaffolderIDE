//! Pure text transformation functions used by menu actions.
//!
//! All functions operate on the entire buffer because `egui_code_editor`
//! does not expose selection APIs. Each returns a new `String`.

/// Replace all occurrences of `needle` with `replacement`.
///
/// Returns the new text and the number of replacements made.
pub fn replace_all(text: &str, needle: &str, replacement: &str) -> (String, usize) {
    if needle.is_empty() {
        return (text.to_string(), 0);
    }
    let count = text.matches(needle).count();
    let result = text.replace(needle, replacement);
    tracing::info!("Replaced {count} occurrence(s) of '{}'", needle);
    (result, count)
}

/// Sort lines alphabetically (case-sensitive).
pub fn sort_lines(text: &str, ascending: bool) -> String {
    let mut lines: Vec<&str> = text.lines().collect();
    if ascending {
        lines.sort();
    } else {
        lines.sort_by(|a, b| b.cmp(a));
    }
    let result = lines.join("\n");
    tracing::info!(
        "Sorted {} lines ({})",
        lines.len(),
        if ascending { "asc" } else { "desc" }
    );
    result
}

/// Remove trailing whitespace from every line.
pub fn trim_trailing_whitespace(text: &str) -> String {
    let result: Vec<&str> = text.lines().map(|l| l.trim_end()).collect();
    tracing::info!("Trimmed trailing whitespace from {} lines", result.len());
    result.join("\n")
}

/// Convert indentation between tabs and spaces.
///
/// # Arguments
/// * `use_spaces` - If true, tabs become `width` spaces; otherwise leading spaces become tabs.
/// * `width` - Number of spaces per tab level.
pub fn convert_indentation(text: &str, use_spaces: bool, width: usize) -> String {
    if use_spaces {
        let spaces = " ".repeat(width);
        let result = text.replace('\t', &spaces);
        tracing::info!("Converted tabs to {width} spaces");
        result
    } else {
        let mut result = String::with_capacity(text.len());
        for line in text.lines() {
            let mut indent = 0usize;
            let mut chars = line.chars().peekable();
            while let Some(&c) = chars.peek() {
                if c == ' ' {
                    indent += 1;
                    chars.next();
                } else {
                    break;
                }
            }
            let tabs = indent / width;
            let remainder = indent % width;
            for _ in 0..tabs {
                result.push('\t');
            }
            for _ in 0..remainder {
                result.push(' ');
            }
            result.extend(chars);
            result.push('\n');
        }
        if !text.ends_with('\n') && result.ends_with('\n') {
            result.pop();
        }
        tracing::info!("Converted leading spaces to tabs (width={width})");
        result
    }
}

/// Append the current local date and time to `text`.
pub fn insert_datetime(text: &str) -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let secs = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    // Simple UTC date derivation (no external crate).
    let days = secs / 86_400;
    let time_secs = secs % 86_400;
    let hh = time_secs / 3600;
    let mm = (time_secs % 3600) / 60;
    let ss = time_secs % 60;
    // Approximate date from epoch days (accurate enough for insertion).
    let (year, month, day) = epoch_days_to_ymd(days);
    let stamp = format!("{year:04}-{month:02}-{day:02} {hh:02}:{mm:02}:{ss:02} UTC");
    tracing::info!("Inserted timestamp: {stamp}");
    format!("{text}{stamp}")
}

/// Convert epoch days to (year, month, day). Simplified algorithm.
fn epoch_days_to_ymd(days: u64) -> (u64, u64, u64) {
    // Civil-from-days algorithm (Howard Hinnant).
    let z = days + 719_468;
    let era = z / 146_097;
    let doe = z - era * 146_097;
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let y = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    (y + if m <= 2 { 1 } else { 0 }, m, d)
}
