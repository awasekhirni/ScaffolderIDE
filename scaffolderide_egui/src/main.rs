//! Scaffolder IDE — application entry point.
//!
//! Responsibilities of this file (and only this file):
//!
//! 1. Set up dual logging: structured output to **stderr** (for terminal
//!    runs) and to a **daily-rotated file** under `./logs/scaffolder-ide.log`
//!    (for post-mortem analysis). The `WorkerGuard` returned by
//!    `tracing_appender::non_blocking` is kept alive for the whole process
//!    so buffered log lines are flushed on exit.
//! 2. Configure the native eframe window (size, minimum size, title).
//! 3. Hand control to `eframe::run_native`, which builds the
//!    [`ScaffolderIDE`] app and runs the event loop.
//!
//! Everything else — tabs, menus, dialogs, file IO — lives in [`app`].
//!
//! # Logging levels
//!
//! Override the level with the standard `RUST_LOG` env var, e.g.
//! `RUST_LOG=debug cargo run` or `RUST_LOG=scaffolder_ide=trace`. The
//! default is `info`.

mod app;
mod config;
mod document;
mod encoding;
mod error;
mod export;
mod line_endings;
mod markdown;
mod text_ops;
mod watcher;

use tracing_subscriber::{EnvFilter, fmt, prelude::*};

/// Application entry point.
///
/// Returns [`eframe::Result`], which on success is `()` and on failure
/// carries the underlying `Box<dyn Error>` from `eframe`.
fn main() -> eframe::Result<()> {
    // ── File logging ──────────────────────────────────────────────────
    // Daily rotation produces files like `scaffolder-ide.log.2026-11-18`.
    let file_appender = tracing_appender::rolling::daily("./logs", "scaffolder-ide.log");
    let (non_blocking, _guard) = tracing_appender::non_blocking(file_appender);
    // `_guard` must live until the process exits — keep it bound here.

    // Two `fmt` layers share the same registry: one to stderr (coloured),
    // one to the rolling file (plain text, no ANSI escapes).
    tracing_subscriber::registry()
        .with(EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new("info")))
        .with(fmt::layer().with_writer(std::io::stderr))
        .with(fmt::layer().with_writer(non_blocking).with_ansi(false))
        .init();

    tracing::info!("=== Scaffolder IDE v{} starting ===", env!("CARGO_PKG_VERSION"));

    let options = eframe::NativeOptions {
        viewport: egui::ViewportBuilder::default()
            .with_inner_size([1100.0, 750.0])
            .with_min_inner_size([600.0, 400.0])
            .with_active(true),
        ..Default::default()
    };

    eframe::run_native(
        "Scaffolder IDE",
        options,
        Box::new(|cc| Ok(Box::new(app::ScaffolderIDE::new(cc)))),
    )
}
