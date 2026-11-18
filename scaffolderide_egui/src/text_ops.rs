//! Pure text-transformation functions used by the *Edit* menu.
//!
//! Every function here is **pure**: it takes a `&str`, returns a new
//! `String`, and has no side effects. This makes them trivial to unit-test
//! (see the bottom of the file) and safe to call from anywhere.
//!
//! ## Why operate on the whole buffer?
//!
//! The underlying [`egui_code_editor::CodeEditor`] widget does not expose a
//! selection API, so we cannot restrict an operation to the highlighted
//! region. Instead each op transforms the entire buffer — which matches what
//! most "Edit → Sort Lines" / "Trim Whitespace" menu items do in other
//! editors when nothing is selected.
//!
//! ## Trailing-newline invariant
//!
//! A common bug in this kind of helper is silently dropping the file's
//! trailing newline (because `str::lines()` ignores it). Every function
//! below preserves the *presence or absence* of a trailing newline, so a
//! file that ended with `\n` still ends with `\n` after sorting.

/// Replace every occurrence of `needle` with `replacement`.
///
/// Returns the new text and the number of replacements performed.
/// An empty `needle` is a no-op (and returns a count of `0`).
pub fn replace_all(text: &str, needle: &str, replacement: &str) -> (String, usize) {
    if needle.is_empty() {
        return (text.to_string(), 0);
    }
    let count = text.matches(needle).count();
    let result = text.replace(needle, replacement);
    tracing::info!("replaced {count} occurrence(s) of {needle:?}");
    (result, count)
}

/// Sort the lines of `text` alphabetically.
///
/// `ascending` chooses direction. The sort is case-sensitive (uppercase
/// sorts before lowercase, matching ASCII byte order). The trailing-newline
/// invariant is preserved.
pub fn sort_lines(text: &str, ascending: bool) -> String {
    let had_trailing_newline = text.ends_with('\n');
    let mut lines: Vec<&str> = text.lines().collect();
    if ascending {
        lines.sort();
    } else {
        lines.sort_by(|a, b| b.cmp(a));
    }
    let mut result = lines.join("\n");
    if had_trailing_newline {
        result.push('\n');
    }
    tracing::info!(
        "sorted {} lines ({})",
        lines.len(),
        if ascending { "asc" } else { "desc" }
    );
    result
}

/// Reverse the order of the lines (preserves the trailing-newline invariant).
pub fn reverse_lines(text: &str) -> String {
    let had_trailing_newline = text.ends_with('\n');
    let mut lines: Vec<&str> = text.lines().collect();
    lines.reverse();
    let mut result = lines.join("\n");
    if had_trailing_newline {
        result.push('\n');
    }
    tracing::info!("reversed {} lines", lines.len());
    result
}

/// Remove trailing whitespace from every line.
///
/// Preserves the trailing-newline invariant.
pub fn trim_trailing_whitespace(text: &str) -> String {
    let had_trailing_newline = text.ends_with('\n');
    let trimmed: Vec<&str> = text.lines().map(|l| l.trim_end()).collect();
    let mut result = trimmed.join("\n");
    if had_trailing_newline {
        result.push('\n');
    }
    tracing::info!("trimmed trailing whitespace from {} lines", trimmed.len());
    result
}

/// Drop lines that are empty or contain only whitespace.
pub fn remove_empty_lines(text: &str) -> String {
    let had_trailing_newline = text.ends_with('\n');
    let kept: Vec<&str> = text
        .lines()
        .filter(|l| !l.trim().is_empty())
        .collect();
    let mut result = kept.join("\n");
    if had_trailing_newline && !kept.is_empty() {
        result.push('\n');
    }
    tracing::info!("removed empty lines; {} kept", kept.len());
    result
}

/// Remove consecutive duplicate lines (keeps the first of each run).
pub fn remove_duplicate_lines(text: &str) -> String {
    let had_trailing_newline = text.ends_with('\n');
    let mut kept: Vec<&str> = Vec::new();
    let mut last: Option<&str> = None;
    for line in text.lines() {
        if Some(line) != last {
            kept.push(line);
            last = Some(line);
        }
    }
    let mut result = kept.join("\n");
    if had_trailing_newline && !kept.is_empty() {
        result.push('\n');
    }
    tracing::info!("deduplicated lines; {} kept", kept.len());
    result
}

/// Number each line with a `1. `, `2. ` … prefix.
pub fn number_lines(text: &str) -> String {
    let had_trailing_newline = text.ends_with('\n');
    let mut result = String::with_capacity(text.len() + text.lines().count() * 4);
    for (i, line) in text.lines().enumerate() {
        result.push_str(&format!("{}. {line}", i + 1));
        result.push('\n');
    }
    if !had_trailing_newline && result.ends_with('\n') {
        result.pop();
    }
    tracing::info!("numbered lines");
    result
}

/// Uppercase every character.
pub fn to_uppercase(text: &str) -> String {
    tracing::info!("uppercased buffer");
    text.to_uppercase()
}

/// Lowercase every character.
pub fn to_lowercase(text: &str) -> String {
    tracing::info!("lowercased buffer");
    text.to_lowercase()
}

/// Convert indentation between tabs and spaces.
///
/// * `use_spaces = true`  — every `\t` becomes `width` spaces (literal
///   replace, applies to the whole buffer, not just leading indentation).
/// * `use_spaces = false` — *leading* spaces are grouped into tabs of
///   `width` columns each; any remainder stays as spaces. Only leading
///   whitespace is touched so that alignment in the middle of a line is
///   preserved.
///
/// This asymmetry matches what virtually every editor does: "Tabs → Spaces"
/// is a literal character substitution, while "Spaces → Tabs" only makes
/// sense for indentation (converting all spaces to tabs would scramble
/// padding inside strings and tables).
pub fn convert_indentation(text: &str, use_spaces: bool, width: usize) -> String {
    let width = width.max(1);
    if use_spaces {
        let spaces = " ".repeat(width);
        let result = text.replace('\t', &spaces);
        tracing::info!("converted tabs to {width} spaces");
        result
    } else {
        let mut result = String::with_capacity(text.len());
        for line in text.lines() {
            let mut indent = 0usize;
            let mut rest_start = 0usize;
            for (i, c) in line.char_indices() {
                if c == ' ' {
                    indent += 1;
                    rest_start = i + c.len_utf8();
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
            result.push_str(&line[rest_start..]);
            result.push('\n');
        }
        // `lines()` strips a trailing newline; restore it iff the original
        // had one, and never add a spurious one if the original didn't.
        if !text.ends_with('\n') && result.ends_with('\n') {
            result.pop();
        }
        tracing::info!("converted leading spaces to tabs (width={width})");
        result
    }
}

/// Append the current UTC date and time to `text`.
///
/// The timestamp is derived from [`std::time::SystemTime`] without pulling
/// in a date crate, using Howard Hinnant's civil-from-days algorithm. A
/// leading newline is added when the buffer is non-empty and does not
/// already end with one, so the timestamp always starts on its own line.
pub fn insert_datetime(text: &str) -> String {
    let secs = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    let days = secs / 86_400;
    let time_secs = secs % 86_400;
    let hh = time_secs / 3600;
    let mm = (time_secs % 3600) / 60;
    let ss = time_secs % 60;
    let (year, month, day) = epoch_days_to_ymd(days);
    let stamp = format!("{year:04}-{month:02}-{day:02} {hh:02}:{mm:02}:{ss:02} UTC");

    let mut result = String::with_capacity(text.len() + stamp.len() + 1);
    result.push_str(text);
    if !text.is_empty() && !text.ends_with('\n') {
        result.push('\n');
    }
    result.push_str(&stamp);
    tracing::info!("inserted timestamp: {stamp}");
    result
}

/// Convert epoch days (days since 1970-01-01) to a (year, month, day) triple.
///
/// Implements Howard Hinnant's `civil_from_days` algorithm — exact for all
/// proleptic-Gregorian dates, no lookup tables.
fn epoch_days_to_ymd(days: u64) -> (u64, u64, u64) {
    let z = days + 719_468; // days since 0000-03-01
    let era = z / 146_097;
    let doe = z - era * 146_097; // [0, 146097)
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365; // [0, 399]
    let y = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100); // [0, 365]
    let mp = (5 * doy + 2) / 153; // [0, 11]
    let d = doy - (153 * mp + 2) / 5 + 1; // [1, 31]
    let m = if mp < 10 { mp + 3 } else { mp - 9 }; // [1, 12]
    (y + if m <= 2 { 1 } else { 0 }, m, d)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn replace_all_counts_and_replaces() {
        let (out, n) = replace_all("a.b.c", ".", "-");
        assert_eq!(out, "a-b-c");
        assert_eq!(n, 2);
    }

    #[test]
    fn replace_all_empty_needle_is_noop() {
        let (out, n) = replace_all("hello", "", "x");
        assert_eq!(out, "hello");
        assert_eq!(n, 0);
    }

    #[test]
    fn sort_lines_preserves_trailing_newline() {
        assert_eq!(sort_lines("c\na\nb\n", true), "a\nb\nc\n");
        assert_eq!(sort_lines("c\na\nb", true), "a\nb\nc"); // no trailing newline
    }

    #[test]
    fn sort_lines_descending() {
        assert_eq!(sort_lines("a\nb\nc", false), "c\nb\na");
    }

    #[test]
    fn reverse_lines_works() {
        assert_eq!(reverse_lines("1\n2\n3\n"), "3\n2\n1\n");
    }

    #[test]
    fn trim_trailing_whitespace_preserves_newline() {
        assert_eq!(trim_trailing_whitespace("a  \nb \n"), "a\nb\n");
    }

    #[test]
    fn remove_empty_lines_drops_blanks() {
        assert_eq!(remove_empty_lines("a\n\n  \nb\n"), "a\nb\n");
        assert_eq!(remove_empty_lines("a\nb"), "a\nb");
    }

    #[test]
    fn remove_duplicate_lines_collapses_runs() {
        assert_eq!(remove_duplicate_lines("a\na\nb\na\n"), "a\nb\na\n");
    }

    #[test]
    fn number_lines_adds_prefix() {
        assert_eq!(number_lines("x\ny\n"), "1. x\n2. y\n");
        assert_eq!(number_lines("x\ny"), "1. x\n2. y");
    }

    #[test]
    fn case_conversions() {
        assert_eq!(to_uppercase("Hello World"), "HELLO WORLD");
        assert_eq!(to_lowercase("Hello World"), "hello world");
    }

    #[test]
    fn tabs_to_spaces_literal() {
        assert_eq!(convert_indentation("\tx", true, 4), "    x");
    }

    #[test]
    fn spaces_to_tabs_leading_only() {
        // 6 leading spaces → 1 tab + 2 spaces (width 4), inner spaces kept.
        assert_eq!(convert_indentation("      a b", false, 4), "\t  a b");
    }

    #[test]
    fn insert_datetime_starts_on_new_line() {
        let out = insert_datetime("hello");
        assert!(out.starts_with("hello\n"));
        assert!(out.contains(" UTC"));
    }

    #[test]
    fn epoch_days_to_ymd_known_dates() {
        assert_eq!(epoch_days_to_ymd(0), (1970, 1, 1)); // Unix epoch
        // Verified against Python: date(1970,1,1) + timedelta(days=19238).
        assert_eq!(epoch_days_to_ymd(19_238), (2022, 9, 3));
    }
}
