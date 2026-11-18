//! Structured error types for all fallible operations.
//!
//! Every error carries contextual information (path, line number, etc.)
//! so that callers and logs can diagnose failures without guesswork.

use std::path::PathBuf;
use thiserror::Error;

/// Errors from file system operations.
#[derive(Debug, Error)]
pub enum FileError {
    #[error("Cannot read '{path}': {source}")]
    Read {
        path: PathBuf,
        #[source]
        source: std::io::Error,
    },

    #[error("Cannot write '{path}': {source}")]
    Write {
        path: PathBuf,
        #[source]
        source: std::io::Error,
    },

    #[error("Cannot read metadata for '{path}': {source}")]
    Metadata {
        path: PathBuf,
        #[source]
        source: std::io::Error,
    },

    #[error("Backup of '{path}' failed: {source}")]
    Backup {
        path: PathBuf,
        #[source]
        source: std::io::Error,
    },
}

/// Errors from encoding operations.
#[derive(Debug, Error)]
pub enum EncodingError {
    #[error("No encoding could be determined for '{path}'")]
    Undetectable { path: PathBuf },

    #[error("Decoding '{path}' as {encoding} failed")]
    DecodeFailed { path: PathBuf, encoding: String },
}

/// Result alias for file operations.
pub type FileResult<T> = Result<T, FileError>;
