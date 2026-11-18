//! 2025-26 Beta ORI Inc. Canada. All Rights Reserved.
//! Syed Awase Khirni
//! Persistent application configuration.
//!
//! Settings survive restarts via eframe's Storage trait.

use serde::{Deserialize, Serialize};
use std::path::PathBuf;

/// All user-configurable settings.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppConfig {
    /// Editor font size in pixels.
    pub font_size: f32,
    /// Index into `EditorTheme::all()`.
    pub theme_index: usize,
    /// Show line number gutter.
    pub show_line_numbers: bool,
    /// Auto-save when window loses focus.
    pub auto_save: bool,
    /// Create a `.bak` file before each save.
    pub backup_on_save: bool,
    /// Recently opened file paths.
    pub recent_files: Vec<PathBuf>,
    /// Paths of tabs open at last shutdown.
    pub open_tabs: Vec<PathBuf>,
    /// Window dimensions.
    pub window_width: f32,
    pub window_height: f32,
}

impl Default for AppConfig {
    fn default() -> Self {
        Self {
            font_size: 14.0,
            theme_index: 0,
            show_line_numbers: true,
            auto_save: false,
            backup_on_save: true,
            recent_files: Vec::new(),
            open_tabs: Vec::new(),
            window_width: 1100.0,
            window_height: 750.0,
        }
    }
}

impl AppConfig {
    const STORAGE_KEY: &'static str = "scaffolder_ide_v1";

    /// Load configuration from storage, falling back to defaults.
    ///
    /// # Errors
    /// Returns defaults if storage is `None` or JSON is malformed.
    /// Failures are logged at `warn` level, never panicked.
    pub fn load(storage: Option<&dyn eframe::Storage>) -> Self {
        let Some(storage) = storage else {
            tracing::warn!("No storage backend; using default config");
            return Self::default();
        };
        let Some(json) = storage.get_string(Self::STORAGE_KEY) else {
            tracing::info!("No stored config; using defaults");
            return Self::default();
        };
        match serde_json::from_str(&json) {
            Ok(cfg) => {
                tracing::info!("Configuration loaded");
                cfg
            }
            Err(e) => {
                tracing::warn!("Config parse failed ({e}); using defaults");
                Self::default()
            }
        }
    }

    /// Persist configuration to storage.
    ///
    /// # Errors
    /// Serialization failures are logged but do not panic.
    pub fn save(&self, storage: &mut dyn eframe::Storage) {
        match serde_json::to_string(self) {
            Ok(json) => {
                storage.set_string(Self::STORAGE_KEY, json);
                tracing::info!("Configuration saved");
            }
            Err(e) => tracing::error!("Config serialization failed: {e}"),
        }
    }
}
