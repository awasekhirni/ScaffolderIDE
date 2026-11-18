//! 2025-26 Beta ORI Inc. Canada. All Rights Reserved.
//! Syed Awase Khirni
//! A single open document with encoding, line endings, and dirty state.

use crate::encoding::{DecodedFile, decode_file};
use crate::error::{FileError, FileResult};
use crate::line_endings::{self, LineEnding};
use egui_code_editor::{Completer, Syntax};
use std::fs;
use std::path::PathBuf;

/// One open file buffer.
pub struct Document {
    /// Current text (always UTF-8 internally).
    pub text: String,
    /// Path on disk (`None` for untitled).
    pub path: Option<PathBuf>,
    /// Last saved snapshot for dirty detection.
    pub last_saved: String,
    /// Source encoding name (e.g. "UTF-8").
    pub encoding: String,
    /// Dominant line ending at load time.
    pub line_ending: LineEnding,
    /// Syntax definition.
    pub syntax: Syntax,
    /// Auto-completer.
    pub completer: Completer,
    /// Language display name.
    pub language: String,
    /// Whether the file was modified externally.
    pub externally_modified: bool,
}

impl Document {
    /// Create a new empty untitled document.
    pub fn new() -> Self {
        tracing::info!("Creating new untitled document");
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
    /// # Errors
    /// Returns `FileError::Read` if the file cannot be read.
    /// Encoding detection failures are logged and fall back to UTF-8.
    pub fn open(path: PathBuf) -> FileResult<Self> {
        tracing::info!("Opening {:?}", path);
        let bytes = fs::read(&path).map_err(|source| FileError::Read {
            path: path.clone(),
            source,
        })?;

        let decoded: DecodedFile = match decode_file(&bytes, &path) {
            Ok(d) => d,
            Err(e) => {
                tracing::warn!("Encoding detection failed for {:?}: {e}", path);
                DecodedFile {
                    encoding_name: "UTF-8 (fallback)".to_string(),
                    text: String::from_utf8_lossy(&bytes).into_owned(),
                }
            }
        };

        let line_ending = line_endings::detect(&decoded.text);
        let (syntax, language) = detect_syntax(&path);
        let completer = Completer::new_with_syntax(&syntax).with_user_words();

        tracing::info!(
            "Opened {:?}: encoding={}, line_ending={}, language={}",
            path,
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

    /// Save to the existing path, optionally creating a `.bak` first.
    ///
    /// # Errors
    /// Returns `FileError::Write` if writing fails.
    /// Returns `FileError::Backup` if backup copy fails (save is aborted).
    pub fn save(&mut self, backup: bool) -> FileResult<()> {
        let Some(path) = self.path.clone() else {
            return Err(FileError::Write {
                path: PathBuf::from("<untitled>"),
                source: std::io::Error::new(std::io::ErrorKind::NotFound, "No path; use Save As"),
            });
        };

        if backup && path.exists() {
            let bak = path.with_extension(format!(
                "{}.bak",
                path.extension().and_then(|e| e.to_str()).unwrap_or("txt")
            ));
            fs::copy(&path, &bak).map_err(|source| FileError::Backup {
                path: path.clone(),
                source,
            })?;
            tracing::info!("Backup created: {:?}", bak);
        }

        fs::write(&path, self.text.as_bytes()).map_err(|source| FileError::Write {
            path: path.clone(),
            source,
        })?;

        self.last_saved = self.text.clone();
        self.externally_modified = false;
        tracing::info!("Saved {:?}", path);
        Ok(())
    }

    /// Save to a new path, updating syntax and metadata.
    ///
    /// # Errors
    /// Returns `FileError::Write` if writing fails.
    pub fn save_as(&mut self, path: PathBuf, backup: bool) -> FileResult<()> {
        self.path = Some(path.clone());
        let (syntax, language) = detect_syntax(&path);
        self.syntax = syntax;
        self.language = language;
        self.completer = Completer::new_with_syntax(&self.syntax).with_user_words();
        self.save(backup)
    }

    /// Whether the buffer differs from its last saved state.
    pub fn is_dirty(&self) -> bool {
        self.text != self.last_saved
    }

    /// Display name for tabs.
    pub fn display_name(&self) -> String {
        self.path
            .as_ref()
            .and_then(|p| p.file_name())
            .and_then(|n| n.to_str())
            .unwrap_or("Untitled")
            .to_string()
    }

    /// Reload the file from disk (used by file watcher).
    ///
    /// # Errors
    /// Returns `FileError::Read` if reading fails.
    pub fn reload(&mut self) -> FileResult<()> {
        let Some(path) = self.path.clone() else {
            return Ok(());
        };
        let bytes = fs::read(&path).map_err(|source| FileError::Read {
            path: path.clone(),
            source,
        })?;
        let decoded = decode_file(&bytes, &path).unwrap_or_else(|_| DecodedFile {
            encoding_name: "UTF-8".to_string(),
            text: String::from_utf8_lossy(&bytes).into_owned(),
        });
        self.text = decoded.text.clone();
        self.last_saved = decoded.text;
        self.encoding = decoded.encoding_name;
        self.line_ending = line_endings::detect(&self.text);
        self.externally_modified = false;
        tracing::info!("Reloaded {:?}", path);
        Ok(())
    }
}

/// Map a file extension to a syntax definition and language label.
fn detect_syntax(path: &PathBuf) -> (Syntax, String) {
    let ext = path.extension().and_then(|s| s.to_str()).unwrap_or("txt");
    match ext {
        "rs" => (Syntax::rust(), "Rust".to_string()),
        "toml" => (Syntax::toml(), "TOML".to_string()),
        "md" => (Syntax::markdown(), "Markdown".to_string()),
        "json" => (Syntax::json(), "JSON".to_string()),
        _ => (Syntax::rust(), "Plain Text".to_string()),
    }
}
