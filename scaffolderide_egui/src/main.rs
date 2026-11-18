//! 2025-26 Beta ORI Inc. Canada. All Rights Reserved.
//! Syed Awase Khirni
//! Scaffolder IDE — entry point.
//!
//! Initializes dual logging (console + rolling file), sets up the native
//! window, and runs the egui event loop.

mod app;
mod config;
mod document;
mod encoding;
mod error;
mod export;
mod line_endings;
mod text_ops;
mod watcher;

use tracing_subscriber::{EnvFilter, fmt, prelude::*};

/// Application entry point.
///
/// Logging is written to both stderr and a daily-rotated file under
/// `./logs/scaffolder-ide.log.YYYY-MM-DD`.
fn main() -> eframe::Result<()> {
    // ── File logging ──────────────────────────────────────────────
    let file_appender = tracing_appender::rolling::daily("./logs", "scaffolder-ide.log");
    let (non_blocking, _guard) = tracing_appender::non_blocking(file_appender);

    tracing_subscriber::registry()
        .with(EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new("info")))
        .with(fmt::layer().with_writer(std::io::stderr))
        .with(fmt::layer().with_writer(non_blocking).with_ansi(false))
        .init();

    tracing::info!("=== Scaffolder IDE v1.0 starting ===");

    let options = eframe::NativeOptions {
        viewport: egui::ViewportBuilder::default()
            .with_inner_size([1100.0, 750.0])
            .with_min_inner_size([600.0, 400.0]),
        ..Default::default()
    };

    eframe::run_native(
        "Scaffolder IDE",
        options,
        Box::new(|cc| Ok(Box::new(app::ScaffolderIDE::new(cc)))),
    )
}
