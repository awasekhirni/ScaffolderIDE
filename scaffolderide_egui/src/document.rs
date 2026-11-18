//! A single open document: text, encoding, line endings, dirty state.
//!
//! Each tab in the dock holds one [`Document`]. A document is created either
//! empty (`Document::new`) for an untitled buffer, or by reading a file from
//! disk (`Document::open`). Internally the buffer is always a UTF-8
//! [`String`]; the original byte encoding and line-ending style are
//! remembered as metadata so the status bar can report them and the
//! *Endings → Convert* menu can re-encode on demand.

use crate::encoding::{DecodedFile, decode_file};
use crate::error::{FileError, FileResult};
use crate::line_endings::{self, LineEnding};
use egui_code_editor::{Completer, Syntax};
use std::fs;
use std::path::{Path, PathBuf};

/// One open file buffer.
pub struct Document {
    /// Current text content (always UTF-8, normalised to LF internally).
    pub text: String,
    /// Path on disk. `None` means an untitled buffer that has never been saved.
    pub path: Option<PathBuf>,
    /// Snapshot of the buffer at the last successful save, used by
    /// [`Document::is_dirty`] and the *Diff vs Saved* view.
    pub last_saved: String,
    /// Human-readable source encoding name (e.g. `"UTF-8"`, `"windows-1252"`).
    pub encoding: String,
    /// Dominant line ending at load time.
    pub line_ending: LineEnding,
    /// Syntax-highlighting definition for the `egui_code_editor` widget.
    pub syntax: Syntax,
    /// Auto-completer instance, tied to [`Document::syntax`].
    pub completer: Completer,
    /// Display name for the detected language (shown in the status bar).
    pub language: String,
    /// `true` once the file watcher has reported an external change to
    /// `path`. Reset on save or explicit reload.
    pub externally_modified: bool,
}

impl Document {
    /// Create a new empty, untitled document.
    pub fn new() -> Self {
        tracing::info!("creating new untitled document");
        let syntax = Syntax::rust();
        let completer = Completer::new_with_syntax(&syntax).with_user_words();
        Self {
            text: String::new(),
            path: None,
            last_saved: String::new(),
            encoding: "UTF-8".to_string(),
            line_ending: LineEnding::Lf,
            syntax,
            completer,
            language: "Rust".to_string(),
            externally_modified: false,
        }
    }

    /// Open and decode a file from disk.
    ///
    /// Encoding detection failures are impossible (see [`decode_file`]) so
    /// this only returns an error if the file cannot be read.
    ///
    /// # Errors
    /// Returns [`FileError::Read`] if the file cannot be read.
    pub fn open(path: PathBuf) -> FileResult<Self> {
        tracing::info!("opening {path:?}");
        let bytes = fs::read(&path).map_err(|source| FileError::Read {
            path: path.clone(),
            source,
        })?;

        let decoded: DecodedFile = decode_file(&bytes, &path);

        let line_ending = line_endings::detect(&decoded.text);
        let (syntax, language) = detect_syntax(&path);
        let completer = Completer::new_with_syntax(&syntax).with_user_words();

        tracing::info!(
            "opened {path:?}: encoding={}, line_ending={}, language={}",
            decoded.encoding_name,
            line_ending.label(),
            language
        );

        Ok(Self {
            text: decoded.text.clone(),
            last_saved: decoded.text,
            path: Some(path),
            encoding: decoded.encoding_name,
            line_ending,
            syntax,
            completer,
            language,
            externally_modified: false,
        })
    }

    /// Save the buffer to its existing path, optionally creating a `.bak`
    /// backup copy first.
    ///
    /// If `backup` is `true` **and** the file already exists, a copy is made
    /// at `<file>.<ext>.bak` before the write. If the backup fails the save
    /// is aborted (so the original is never overwritten without its backup).
    ///
    /// # Errors
    /// Returns [`FileError::Backup`] if the backup copy fails.
    /// Returns [`FileError::Write`] if the final write fails.
    /// Returns [`FileError::Write`] with a `NotFound` cause if there is no
    /// `path` (call [`Document::save_as`] instead).
    pub fn save(&mut self, backup: bool) -> FileResult<()> {
        let Some(path) = self.path.clone() else {
            return Err(FileError::Write {
                path: PathBuf::from("<untitled>"),
                source: std::io::Error::new(
                    std::io::ErrorKind::NotFound,
                    "no path set; use Save As",
                ),
            });
        };

        if backup && path.exists() {
            let bak = backup_path(&path);
            fs::copy(&path, &bak).map_err(|source| FileError::Backup {
                path: path.clone(),
                source,
            })?;
            tracing::info!("backup created at {bak:?}");
        }

        fs::write(&path, self.text.as_bytes()).map_err(|source| FileError::Write {
            path: path.clone(),
            source,
        })?;

        self.last_saved = self.text.clone();
        self.externally_modified = false;
        tracing::info!("saved {path:?}");
        Ok(())
    }

    /// Save the buffer to a *new* path, updating syntax/language metadata,
    /// then delegating to [`Document::save`] for the actual write.
    ///
    /// # Errors
    /// See [`Document::save`].
    pub fn save_as(&mut self, path: PathBuf, backup: bool) -> FileResult<()> {
        self.path = Some(path.clone());
        let (syntax, language) = detect_syntax(&path);
        self.syntax = syntax;
        self.language = language;
        self.completer = Completer::new_with_syntax(&self.syntax).with_user_words();
        self.save(backup)
    }

    /// `true` iff the buffer differs from its last saved snapshot.
    pub fn is_dirty(&self) -> bool {
        self.text != self.last_saved
    }

    /// Tab-title / status-bar display name for this document.
    pub fn display_name(&self) -> String {
        self.path
            .as_ref()
            .and_then(|p| p.file_name())
            .and_then(|n| n.to_str())
            .unwrap_or("Untitled")
            .to_string()
    }

    /// Reload the buffer from disk, discarding unsaved edits.
    ///
    /// Used by *Edit → Reload from Disk* after the file watcher reports an
    /// external modification. A no-op (returns `Ok(())`) if the document
    /// has no path.
    ///
    /// # Errors
    /// Returns [`FileError::Read`] if the file can no longer be read
    /// (deleted/moved/permission-lost).
    pub fn reload(&mut self) -> FileResult<()> {
        let Some(path) = self.path.clone() else {
            return Ok(());
        };
        let bytes = fs::read(&path).map_err(|source| FileError::Read {
            path: path.clone(),
            source,
        })?;
        let decoded = decode_file(&bytes, &path);
        self.text = decoded.text.clone();
        self.last_saved = decoded.text;
        self.encoding = decoded.encoding_name;
        self.line_ending = line_endings::detect(&self.text);
        self.externally_modified = false;
        tracing::info!("reloaded {path:?}");
        Ok(())
    }

    /// Quick line/char/word statistics for the status bar.
    pub fn stats(&self) -> DocStats {
        DocStats::from_text(&self.text)
    }
}

impl Default for Document {
    fn default() -> Self {
        Self::new()
    }
}

/// Backup-file path helper: `foo.rs` → `foo.rs.bak`, `README` → `README.bak`.
fn backup_path(path: &Path) -> PathBuf {
    let mut s = path.as_os_str().to_owned();
    s.push(".bak");
    PathBuf::from(s)
}

/// Line/character/word statistics for the status bar.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct DocStats {
    /// Number of lines (counting a trailing empty line if the buffer ends
    /// with `\n`).
    pub lines: usize,
    /// Total UTF-8 byte length of the buffer.
    pub chars: usize,
    /// Number of whitespace-separated tokens.
    pub words: usize,
}

impl DocStats {
    /// Compute statistics from a text buffer.
    pub fn from_text(text: &str) -> Self {
        // `str::lines` ignores a trailing newline, so a buffer that is just
        // "a\n" reports 1 line — but conventionally that is "1 line plus an
        // empty line after it", i.e. 2. Match the common editor convention
        // by counting the trailing newline as an extra line.
        let mut lines = text.lines().count();
        if text.ends_with('\n') {
            lines += 1;
        }
        lines = lines.max(1);
        Self {
            lines,
            chars: text.len(),
            words: text.split_whitespace().count(),
        }
    }
}

/// Map a file extension to a syntax definition and a human-readable label.
///
/// Only the syntaxes that `egui_code_editor` actually ships constructors for
/// are used directly (`rust`, `python`, `lua`, `shell`, `sql`, `asm`).
/// Everything else falls back to [`Syntax::new`] with the language name,
/// which gives clean string/number/comment highlighting without injecting
/// bogus keywords from an unrelated language.
pub fn detect_syntax(path: &Path) -> (Syntax, String) {
    let ext = path
        .extension()
        .and_then(|s| s.to_str())
        .map(|s| s.to_ascii_lowercase())
        .unwrap_or_default();
    let ext = ext.as_str();
    let (syntax, language) = match ext {
        // First-class syntaxes provided by egui_code_editor.
        "rs" => (Syntax::rust(), "Rust"),
        "py" | "pyw" => (Syntax::python(), "Python"),
        "lua" => (Syntax::lua(), "Lua"),
        "sh" | "bash" | "zsh" | "ksh" => (Syntax::shell(), "Shell"),
        "sql" => (Syntax::sql(), "SQL"),
        "asm" | "s" => (Syntax::asm(), "Assembly"),
        // Config / data formats with `#` comments.
        "toml" | "ini" | "cfg" | "conf" | "properties" | "yaml" | "yml" => {
            (Syntax::simple("#"), ext_to_label(ext))
        }
        // Markup / data without a dedicated highlighter.
        "json" => (Syntax::new("JSON"), "JSON"),
        "md" | "markdown" => (Syntax::new("Markdown"), "Markdown"),
        "xml" => (Syntax::new("XML"), "XML"),
        "html" | "htm" => (Syntax::new("HTML"), "HTML"),
        "css" => (Syntax::new("CSS"), "CSS"),
        "js" | "mjs" | "cjs" => (Syntax::new("JavaScript"), "JavaScript"),
        "ts" | "tsx" => (Syntax::new("TypeScript"), "TypeScript"),
        "c" | "h" => (Syntax::new("C"), "C"),
        "cpp" | "cc" | "cxx" | "hpp" | "hh" => (Syntax::new("C++"), "C++"),
        "go" => (Syntax::new("Go"), "Go"),
        "java" => (Syntax::new("Java"), "Java"),
        "php" => (Syntax::new("PHP"), "PHP"),
        "txt" => (Syntax::new("Plain Text"), "Plain Text"),
        // Anything else: generic, no keywords.
        _ => (Syntax::new("Plain Text"), "Plain Text"),
    };
    (syntax, language.to_string())
}

/// Turn a known config-file extension into a label, e.g. `"toml"` → `"TOML"`.
///
/// Returns `&'static str` so the `detect_syntax` match arms all agree on the
/// type `(Syntax, &'static str)`. Only called with the extensions in the
/// config group of `detect_syntax`; the `_` fallback is unreachable in
/// practice but kept for exhaustiveness.
fn ext_to_label(ext: &str) -> &'static str {
    match ext {
        "yml" => "YAML",
        "yaml" => "YAML",
        "ini" => "INI",
        "toml" => "TOML",
        "cfg" | "conf" => "Config",
        "properties" => "Properties",
        _ => "Config",
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    #[test]
    fn backup_path_appends_bak() {
        assert_eq!(
            backup_path(&PathBuf::from("/tmp/foo.rs")),
            PathBuf::from("/tmp/foo.rs.bak")
        );
        assert_eq!(
            backup_path(&PathBuf::from("README")),
            PathBuf::from("README.bak")
        );
    }

    #[test]
    fn new_document_is_untitled_and_clean() {
        let d = Document::new();
        assert!(d.path.is_none());
        assert!(!d.is_dirty());
        assert_eq!(d.display_name(), "Untitled");
        assert_eq!(d.language, "Rust");
    }

    #[test]
    fn save_without_path_errors() {
        let mut d = Document::new();
        let err = d.save(false).unwrap_err();
        assert!(matches!(err, FileError::Write { .. }));
    }

    #[test]
    fn detect_syntax_known_extensions() {
        assert_eq!(detect_syntax(&PathBuf::from("a.rs")).1, "Rust");
        assert_eq!(detect_syntax(&PathBuf::from("a.py")).1, "Python");
        assert_eq!(detect_syntax(&PathBuf::from("a.lua")).1, "Lua");
        assert_eq!(detect_syntax(&PathBuf::from("a.sh")).1, "Shell");
        assert_eq!(detect_syntax(&PathBuf::from("a.sql")).1, "SQL");
        assert_eq!(detect_syntax(&PathBuf::from("a.asm")).1, "Assembly");
        assert_eq!(detect_syntax(&PathBuf::from("a.toml")).1, "TOML");
        assert_eq!(detect_syntax(&PathBuf::from("a.yml")).1, "YAML");
        assert_eq!(detect_syntax(&PathBuf::from("a.json")).1, "JSON");
        assert_eq!(detect_syntax(&PathBuf::from("a.md")).1, "Markdown");
        assert_eq!(detect_syntax(&PathBuf::from("a.cpp")).1, "C++");
    }

    #[test]
    fn detect_syntax_unknown_falls_back_to_plain_text() {
        assert_eq!(
            detect_syntax(&PathBuf::from("a.xyz")).1,
            "Plain Text"
        );
        assert_eq!(
            detect_syntax(&PathBuf::from("README")).1,
            "Plain Text"
        );
    }

    #[test]
    fn detect_syntax_is_case_insensitive() {
        assert_eq!(detect_syntax(&PathBuf::from("a.RS")).1, "Rust");
        assert_eq!(detect_syntax(&PathBuf::from("a.PY")).1, "Python");
    }

    #[test]
    fn stats_count_lines_chars_words() {
        let s = DocStats::from_text("hello world\nfoo");
        assert_eq!(s.lines, 2);
        assert_eq!(s.chars, "hello world\nfoo".len());
        assert_eq!(s.words, 3);
    }

    #[test]
    fn stats_trailing_newline_counts_as_extra_line() {
        // "a\n" conventionally shows as 2 lines in editors.
        let s = DocStats::from_text("a\n");
        assert_eq!(s.lines, 2);
        let s = DocStats::from_text("a");
        assert_eq!(s.lines, 1);
        let s = DocStats::from_text("");
        assert_eq!(s.lines, 1); // never report 0 lines
    }
}
