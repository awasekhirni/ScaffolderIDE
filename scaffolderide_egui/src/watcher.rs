//! Watches open files for external modifications.
//!
//! When a file is open in the editor and another program (a formatter, a
//! teammate's editor, `git pull`, …) overwrites it on disk, we want to tell
//! the user instead of silently letting them edit a stale buffer. This
//! module wraps [`notify`] to do exactly that.
//!
//! ## How it is used
//!
//! `ScaffolderIDE` owns a single `Option<FileWatcher>`. Whenever the set of
//! open tabs changes (open / close / save-as), [`ScaffolderIDE::restart_watcher`]
//! rebuilds it from scratch. Each frame, [`FileWatcher::poll`] is called to
//! drain any events that arrived since the last frame; for each modified
//! path we set `Document::externally_modified = true` and surface a warning
//! toast, after which the user can pick *Edit → Reload from Disk* to
//! discard their buffer and reload, or *Save* to overwrite the external
//! change.
//!
//! ## Why a channel?
//!
//! `notify` delivers events on a background thread. We cannot touch egui
//! state from that thread, so the callback forwards paths through a
//! `std::sync::mpsc::channel` and the main thread drains it on `poll`.

use notify::{RecommendedWatcher, RecursiveMode, Watcher, recommended_watcher};
use std::path::PathBuf;
use std::sync::mpsc::{Receiver, channel};

/// A running file watcher tied to an mpsc channel.
///
/// The watcher itself is held in `_watcher` so it lives as long as this
/// struct; dropping it stops watching.
pub struct FileWatcher {
    _watcher: RecommendedWatcher,
    rx: Receiver<PathBuf>,
}

impl FileWatcher {
    /// Start watching the given paths for modifications.
    ///
    /// Paths that do not currently exist are silently skipped (they may be
    /// created later — the caller is expected to rebuild the watcher when
    /// the open-tab set changes, which will pick them up).
    ///
    /// # Errors
    /// Returns [`notify::Error`] if the underlying watcher cannot be
    /// created, or if watching a specific existing path fails.
    pub fn new(paths: &[PathBuf]) -> notify::Result<Self> {
        let (tx, rx) = channel();
        let mut watcher = recommended_watcher(move |res: notify::Result<notify::Event>| {
            if let Ok(event) = res {
                for path in event.paths {
                    // `send` fails only if the receiver was dropped, which
                    // means the app is shutting down — safe to ignore.
                    let _ = tx.send(path);
                }
            }
        })?;

        for path in paths {
            if path.exists() {
                watcher.watch(path, RecursiveMode::NonRecursive)?;
                tracing::info!("watching {path:?}");
            }
        }

        Ok(Self {
            _watcher: watcher,
            rx,
        })
    }

    /// Non-blocking drain of all modified paths queued since the last call.
    ///
    /// Returns each distinct path at most once per call, even if the
    /// watcher fired multiple events for it (editors that save by
    /// "write-temp-then-rename" can easily produce 3+ events for one save).
    pub fn poll(&self) -> Vec<PathBuf> {
        use std::collections::HashSet;
        let mut seen: HashSet<PathBuf> = HashSet::new();
        while let Ok(p) = self.rx.try_recv() {
            seen.insert(p);
        }
        let mut hits: Vec<PathBuf> = seen.into_iter().collect();
        hits.sort();
        hits
    }
}
