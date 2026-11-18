//! Watches open files for external modifications.

use notify::{RecursiveMode, Watcher, recommended_watcher};
use std::path::PathBuf;
use std::sync::mpsc::{Receiver, channel};

/// A running file watcher tied to a channel.
pub struct FileWatcher {
    _watcher: notify::RecommendedWatcher,
    rx: Receiver<PathBuf>,
}

impl FileWatcher {
    /// Start watching the given paths for modifications.
    ///
    /// # Errors
    /// Returns `notify::Error` if watcher creation or path watching fails.
    pub fn new(paths: &[PathBuf]) -> notify::Result<Self> {
        let (tx, rx) = channel();
        let mut watcher = recommended_watcher(move |res: notify::Result<notify::Event>| {
            if let Ok(event) = res {
                for path in event.paths {
                    let _ = tx.send(path);
                }
            }
        })?;
        for path in paths {
            if path.exists() {
                watcher.watch(path, RecursiveMode::NonRecursive)?;
                tracing::info!("Watching {:?}", path);
            }
        }
        Ok(Self {
            _watcher: watcher,
            rx,
        })
    }

    /// Non-blocking check for modified paths.
    pub fn poll(&self) -> Vec<PathBuf> {
        let mut hits = Vec::new();
        while let Ok(p) = self.rx.try_recv() {
            hits.push(p);
        }
        hits
    }
}
