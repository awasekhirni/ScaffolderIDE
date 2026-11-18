//! Core editor state and operations.
//!
//! All public methods log their actions via `tracing` for observability.

use crate::config::AppConfig;
use crate::error::{FileError, FileResult};
use egui_code_editor::{CodeEditor, ColorTheme, Completer, Syntax};
use std::fs;
use std::path::PathBuf;

/// Supported editor themes.
#[derive(Debug, Clone, Copy, PartialEq)]
pub enum EditorTheme {
    Gruvbox,
    GithubDark,
    Sonokai,
}

impl EditorTheme {
    /// Convert to the `egui_code_editor` color theme.
    pub fn to_color_theme(self) -> ColorTheme {
        match self {
            EditorTheme::Gruvbox => ColorTheme::GRUVBOX,
            EditorTheme::GithubDark => ColorTheme::GITHUB_DARK,
            EditorTheme::Sonokai => ColorTheme::SONOKAI,
        }
    }

    /// Human-readable name for UI display.
    pub fn name(self) -> &'static str {
        match self {
            EditorTheme::Gruvbox => "Gruvbox",
            EditorTheme::GithubDark => "GitHub Dark",
            EditorTheme::Sonokai => "Sonokai",
        }
    }

    /// All available themes.
    pub fn all() -> [EditorTheme; 3] {
        [
            EditorTheme::Gruvbox,
            EditorTheme::GithubDark,
            EditorTheme::Sonokai,
        ]
    }

    /// Reconstruct from stored index.
    pub fn from_index(index: usize) -> Self {
        Self::all()
            .get(index)
            .copied()
            .unwrap_or(EditorTheme::Gruvbox)
    }

    /// Index for storage.
    pub fn to_index(self) -> usize {
        match self {
            EditorTheme::Gruvbox => 0,
            EditorTheme::GithubDark => 1,
            EditorTheme::Sonokai => 2,
        }
    }
}

/// The editor document state.
pub struct Document {
    /// Current text content.
    pub code: String,
    /// Path to the file on disk, if saved.
    pub file_path: Option<PathBuf>,
    /// Last content that was saved (for dirty detection).
    pub last_saved: String,
    /// Current syntax definition.
    pub syntax: Syntax,
    /// Auto-completer instance.
    pub completer: Completer,
    /// Display name for the detected language.
    pub language_name: String,
}

impl Default for Document {
    fn default() -> Self {
        let syntax = Syntax::rust();
        let completer = Completer::new_with_syntax(&syntax).with_user_words();
        Self {
            code: String::new(),
            file_path: None,
            last_saved: String::new(),
            syntax,
            completer,
            language_name: String::from("Rust"),
        }
    }
}

impl Document {
    /// Create a new empty document.
    pub fn new() -> Self {
        tracing::info!("Created new document");
        Self::default()
    }

    /// Open a file from disk.
    ///
    /// # Errors
    /// Returns `FileError::Read` if the file cannot be read.
    /// Returns `FileError::UnsupportedExtension` if the extension is not recognized.
    pub fn open(path: PathBuf) -> FileResult<Self> {
        tracing::info!("Opening file: {:?}", path);
        let content = fs::read_to_string(&path).map_err(|source| FileError::Read {
            path: path.clone(),
            source,
        })?;

        let (syntax, language_name) = Self::detect_syntax(&path);
        let completer = Completer::new_with_syntax(&syntax).with_user_words();

        tracing::info!(
            "Opened file: {:?} ({} bytes, {})",
            path,
            content.len(),
            language_name
        );

        Ok(Self {
            code: content.clone(),
            file_path: Some(path),
            last_saved: content,
            syntax,
            completer,
            language_name,
        })
    }

    /// Save the document to its current path.
    ///
    /// # Errors
    /// Returns `FileError::Write` if writing fails.
    /// Returns `FileError::Read` (as a proxy) if no path is set.
    pub fn save(&mut self) -> FileResult<()> {
        match &self.file_path {
            Some(path) => {
                fs::write(path, &self.code).map_err(|source| FileError::Write {
                    path: path.clone(),
                    source,
                })?;
                self.last_saved = self.code.clone();
                tracing::info!("Saved file: {:?}", path);
                Ok(())
            }
            None => {
                tracing::warn!("Save called on document without path");
                Err(FileError::Write {
                    path: PathBuf::from("<unsaved>"),
                    source: std::io::Error::new(
                        std::io::ErrorKind::NotFound,
                        "No file path set; use Save As",
                    ),
                })
            }
        }
    }

    /// Save to a new path.
    ///
    /// # Errors
    /// Returns `FileError::Write` if writing fails.
    pub fn save_as(&mut self, path: PathBuf) -> FileResult<()> {
        fs::write(&path, &self.code).map_err(|source| FileError::Write {
            path: path.clone(),
            source,
        })?;
        self.last_saved = self.code.clone();
        self.file_path = Some(path.clone());
        let (syntax, lang) = Self::detect_syntax(&path);
        self.syntax = syntax;
        self.language_name = lang;
        self.completer = Completer::new_with_syntax(&self.syntax).with_user_words();
        tracing::info!("Saved file as: {:?}", path);
        Ok(())
    }

    /// Check if content differs from last saved state.
    pub fn is_dirty(&self) -> bool {
        self.code != self.last_saved
    }

    /// Get the display name for the current file.
    pub fn display_name(&self) -> String {
        self.file_path
            .as_ref()
            .and_then(|p| p.file_name())
            .and_then(|n| n.to_str())
            .unwrap_or("Untitled")
            .to_string()
    }

    /// Detect syntax from file extension.
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

    /// Render the editor widget and return whether content changed.
    ///
    /// # Arguments
    /// * `ui` - The egui UI context
    /// * `font_size` - Current font size in pixels
    /// * `theme` - Current color theme
    /// * `show_line_numbers` - Whether to show the line number gutter
    pub fn show(
        &mut self,
        ui: &mut egui::Ui,
        font_size: f32,
        theme: EditorTheme,
        show_line_numbers: bool,
    ) -> egui::Response {
        CodeEditor::default()
            .id_source("main_editor")
            .with_rows(20)
            .with_fontsize(font_size)
            .with_theme(theme.to_color_theme())
            .with_syntax(self.syntax.to_owned())
            .with_numlines(show_line_numbers)
            .show_with_completer(ui, &mut self.code, &mut self.completer)
    }
}

/// Document statistics for the status bar.
pub struct DocStats {
    pub lines: usize,
    pub chars: usize,
    pub words: usize,
}

impl DocStats {
    /// Compute statistics from text content.
    pub fn from_text(text: &str) -> Self {
        Self {
            lines: text.lines().count().max(1),
            chars: text.len(),
            words: text.split_whitespace().count(),
        }
    }
}
