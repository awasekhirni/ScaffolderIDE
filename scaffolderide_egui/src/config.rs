//! Persistent application configuration.
//!
//! All user-tunable settings live in [`AppConfig`] and are (de)serialised to
//! JSON via `serde`, then stored in eframe's [`Storage`] backend so they
//! survive across restarts. On the very first launch (or after a corrupt
//! config) sensible defaults are used.
//!
//! ## Forward-compatibility
//!
//! Every field is annotated with `#[serde(default)]`. That means a config
//! file written by an older version (missing a field that was added later)
//! still deserialises successfully — the missing field just takes its
//! [`Default`] value. This is what lets us grow the schema without forcing
//! users to reset their preferences.

use serde::{Deserialize, Serialize};
use std::path::PathBuf;

/// All user-configurable settings, persisted to eframe `Storage`.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppConfig {
    /// Editor font size in pixels.
    #[serde(default = "default_font_size")]
    pub font_size: f32,

    /// Index into [`crate::app::EditorTheme::all`] — stored as a number so
    /// the theme can change name/variant without breaking old configs.
    #[serde(default)]
    pub theme_index: usize,

    /// Show the line-number gutter.
    #[serde(default = "default_true")]
    pub show_line_numbers: bool,

    /// Soft-wrap long lines. Note: the underlying `egui_code_editor` widget
    /// only honours wrap when line numbers are *off* — when both are on,
    /// line numbers win.
    #[serde(default)]
    pub word_wrap: bool,

    /// Auto-save every dirty tab when the window loses focus.
    #[serde(default)]
    pub auto_save: bool,

    /// Create a `.bak` copy before each save.
    #[serde(default = "default_true")]
    pub backup_on_save: bool,

    /// Recently opened file paths (most-recent-first, capped at 10).
    #[serde(default)]
    pub recent_files: Vec<PathBuf>,

    /// Paths of the tabs that were open at last shutdown — restored on the
    /// next launch.
    #[serde(default)]
    pub open_tabs: Vec<PathBuf>,

    /// Last window width in pixels (reserved for future restore).
    #[serde(default = "default_window_w")]
    pub window_width: f32,

    /// Last window height in pixels (reserved for future restore).
    #[serde(default = "default_window_h")]
    pub window_height: f32,
}

fn default_font_size() -> f32 {
    14.0
}
fn default_true() -> bool {
    true
}
fn default_window_w() -> f32 {
    1100.0
}
fn default_window_h() -> f32 {
    750.0
}

impl Default for AppConfig {
    fn default() -> Self {
        Self {
            font_size: default_font_size(),
            theme_index: 0,
            show_line_numbers: default_true(),
            word_wrap: false,
            auto_save: false,
            backup_on_save: default_true(),
            recent_files: Vec::new(),
            open_tabs: Vec::new(),
            window_width: default_window_w(),
            window_height: default_window_h(),
        }
    }
}

impl AppConfig {
    /// Storage key under which the JSON blob is saved.
    const STORAGE_KEY: &'static str = "scaffolder_ide_v1";

    /// Load configuration from eframe storage, falling back to defaults.
    ///
    /// Never panics: a missing backend, a missing key, or a corrupt JSON
    /// blob all log a warning and return [`AppConfig::default`].
    pub fn load(storage: Option<&dyn eframe::Storage>) -> Self {
        let Some(storage) = storage else {
            tracing::warn!("no storage backend available; using default config");
            return Self::default();
        };
        let Some(json) = storage.get_string(Self::STORAGE_KEY) else {
            tracing::info!("no stored config found; using defaults");
            return Self::default();
        };
        match serde_json::from_str::<AppConfig>(&json) {
            Ok(cfg) => {
                tracing::info!("configuration loaded successfully");
                cfg
            }
            Err(e) => {
                tracing::warn!("config parse failed ({e}); using defaults");
                Self::default()
            }
        }
    }

    /// Persist configuration to storage.
    ///
    /// Serialisation failures are logged but never propagated — losing the
    /// config on shutdown is annoying, not fatal.
    pub fn save(&self, storage: &mut dyn eframe::Storage) {
        match serde_json::to_string_pretty(self) {
            Ok(json) => {
                storage.set_string(Self::STORAGE_KEY, json);
                tracing::info!("configuration saved");
            }
            Err(e) => tracing::error!("config serialisation failed: {e}"),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn default_values_are_sane() {
        let c = AppConfig::default();
        assert!((c.font_size - 14.0).abs() < f32::EPSILON);
        assert!(c.show_line_numbers);
        assert!(c.backup_on_save);
        assert!(!c.word_wrap);
        assert!(c.recent_files.is_empty());
    }

    #[test]
    fn missing_field_falls_back_to_default() {
        // Simulate an old config that predates `word_wrap`.
        let json = r#"{"font_size":20.0,"theme_index":1,"show_line_numbers":true,"auto_save":false,"backup_on_save":true,"recent_files":[],"open_tabs":[],"window_width":1000.0,"window_height":600.0}"#;
        let c: AppConfig = serde_json::from_str(json).expect("must parse with defaults");
        assert!(!c.word_wrap, "word_wrap should default to false");
        assert!((c.font_size - 20.0).abs() < f32::EPSILON);
    }

    #[test]
    fn roundtrip_preserves_all_fields() {
        let c = AppConfig {
            font_size: 18.0,
            theme_index: 2,
            word_wrap: true,
            recent_files: vec![PathBuf::from("/tmp/x.rs")],
            ..Default::default()
        };
        let json = serde_json::to_string(&c).unwrap();
        let back: AppConfig = serde_json::from_str(&json).unwrap();
        assert_eq!(back.font_size, 18.0);
        assert_eq!(back.theme_index, 2);
        assert!(back.word_wrap);
        assert_eq!(back.recent_files, vec![PathBuf::from("/tmp/x.rs")]);
    }
}
