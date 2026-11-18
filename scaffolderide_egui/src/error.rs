//! Structured error types for all fallible operations.
//!
//! Every error carries contextual information (the path that was being
//! touched, the underlying [`std::io::Error`], …) so that callers and the
//! `tracing` log output can diagnose failures without guesswork.
//!
//! All errors are deliberately non-fatal: the editor never panics on a file
//! system problem — it surfaces the error as a toast and keeps running.
//!
//! [`thiserror::Error`] is used so that `?` works seamlessly across the
//! codebase and `Display`/`Error` impls are derived automatically.

use std::path::PathBuf;
use thiserror::Error;

/// Errors raised by file-system operations (open / save / backup / stat).
///
/// Each variant records the `path` that was being operated on so the user
/// can see *which* file failed, not just *that* something failed.
#[derive(Debug, Error)]
pub enum FileError {
    /// The file could not be read from disk.
    #[error("cannot read {path}: {source}")]
    Read {
        path: PathBuf,
        #[source]
        source: std::io::Error,
    },

    /// The buffer could not be written to disk.
    #[error("cannot write {path}: {source}")]
    Write {
        path: PathBuf,
        #[source]
        source: std::io::Error,
    },

    /// File metadata (size, mtime, permissions) could not be read.
    ///
    /// Used by the *File Properties* dialog.
    #[error("cannot read metadata for {path}: {source}")]
    Metadata {
        path: PathBuf,
        #[source]
        source: std::io::Error,
    },

    /// A `.bak` backup copy could not be created. When this happens the
    /// save itself is **aborted** so the original file is never overwritten
    /// without its backup.
    #[error("backup of {path} failed: {source}")]
    Backup {
        path: PathBuf,
        #[source]
        source: std::io::Error,
    },
}

/// Convenience `Result` alias used by every fallible file operation.
pub type FileResult<T> = Result<T, FileError>;

#[cfg(test)]
mod tests {
    use super::*;

    /// `Display` output must mention the path so logs are actionable.
    #[test]
    fn display_includes_path() {
        let err = FileError::Read {
            path: PathBuf::from("/tmp/missing.txt"),
            source: std::io::Error::from(std::io::ErrorKind::NotFound),
        };
        let s = format!("{err}");
        assert!(s.contains("/tmp/missing.txt"));
        assert!(s.contains("read"));
    }
}
