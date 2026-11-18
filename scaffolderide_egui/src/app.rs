//! Main application shell: dockable tabs, menu bar, status bar, dialogs.
//!
//! This module ties every other module together into the [`ScaffolderIDE`]
//! struct that implements [`eframe::App`]. It owns:
//!
//! * the [`DockState`] (egui_dock's tab tree),
//! * the persisted [`AppConfig`],
//! * the active [`EditorTheme`],
//! * the toast notifier,
//! * the optional [`FileWatcher`].
//!
//! Everything else (opening / saving / encoding / line endings / text ops /
//! diff / export / markdown) is delegated to the leaf modules.

use crate::config::AppConfig;
use crate::document::{DocStats, Document};
use crate::error::FileError;
use crate::export;
use crate::line_endings::{self, LineEnding};
use crate::text_ops;
use crate::watcher::FileWatcher;
use egui::{Color32, Id, RichText};
use egui_code_editor::ColorTheme;
use egui_dock::{DockArea, DockState, TabViewer};
use egui_dock::widgets::tab_viewer::OnCloseResponse;
use egui_notify::Toasts;
use std::path::PathBuf;
use std::sync::atomic::{AtomicU64, Ordering};

// ── Theme ──────────────────────────────────────────────────────────────────

/// The set of colour themes offered in the *View* menu.
///
/// Each variant maps to a [`ColorTheme`] constant exported by
/// `egui_code_editor`. Storing the theme as a small enum (rather than a
/// `ColorTheme` directly) keeps it `Copy` and trivially serialisable as an
/// index into [`EditorTheme::all`].
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum EditorTheme {
    Gruvbox,
    GithubDark,
    Sonokai,
}

impl EditorTheme {
    /// Convert to the underlying `egui_code_editor` colour theme.
    pub fn color_theme(self) -> ColorTheme {
        match self {
            Self::Gruvbox => ColorTheme::GRUVBOX,
            Self::GithubDark => ColorTheme::GITHUB_DARK,
            Self::Sonokai => ColorTheme::SONOKAI,
        }
    }

    /// Human-readable name shown in the *View* menu.
    pub fn name(self) -> &'static str {
        match self {
            Self::Gruvbox => "Gruvbox",
            Self::GithubDark => "GitHub Dark",
            Self::Sonokai => "Sonokai",
        }
    }

    /// All themes, in stable storage order.
    pub fn all() -> [Self; 3] {
        [Self::Gruvbox, Self::GithubDark, Self::Sonokai]
    }

    /// Reconstruct from the integer index stored in [`AppConfig`].
    pub fn from_index(i: usize) -> Self {
        Self::all().get(i).copied().unwrap_or(Self::Gruvbox)
    }

    /// Stable storage index for [`AppConfig`].
    pub fn to_index(self) -> usize {
        match self {
            Self::Gruvbox => 0,
            Self::GithubDark => 1,
            Self::Sonokai => 2,
        }
    }
}

// ── Tab ────────────────────────────────────────────────────────────────────

/// Monotonic counter that gives every tab a stable, unique id even when two
/// tabs share the same path or are both untitled. A stable id is essential:
/// `egui_code_editor` uses it as the `TextEdit` widget id, and if it changed
/// every frame (e.g. when the dirty marker flips the title) the cursor
/// would jump back to the start on every keystroke.
static NEXT_TAB_ID: AtomicU64 = AtomicU64::new(1);

fn next_tab_id() -> u64 {
    NEXT_TAB_ID.fetch_add(1, Ordering::Relaxed)
}

/// A dock tab wrapping one [`Document`] plus a stable unique id.
pub struct Tab {
    pub doc: Document,
    pub id: u64,
}

impl Tab {
    /// Create a new tab holding the given document.
    pub fn new(doc: Document) -> Self {
        Self {
            doc,
            id: next_tab_id(),
        }
    }
}

// ── TabViewer ──────────────────────────────────────────────────────────────

/// Renders tabs inside `egui_dock`.
///
/// Holds per-frame rendering settings (font size, theme, line numbers, word
/// wrap) plus a borrow of the toast notifier so that `on_close` can surface
/// a warning when a dirty tab is closed.
pub struct ScaffoldTabViewer<'a> {
    pub font_size: f32,
    pub theme: EditorTheme,
    pub show_line_numbers: bool,
    pub word_wrap: bool,
    pub toasts: &'a mut Toasts,
}

impl<'a> TabViewer for ScaffoldTabViewer<'a> {
    type Tab = Tab;

    fn id(&mut self, tab: &mut Self::Tab) -> Id {
        // Stable across dirty-state changes — see `NEXT_TAB_ID` docs.
        Id::new(tab.id)
    }

    fn title(&mut self, tab: &mut Self::Tab) -> egui::WidgetText {
        // Leading asterisk marks unsaved buffers, matching most editors.
        let dirty = if tab.doc.is_dirty() { "*" } else { "" };
        format!("{}{}", dirty, tab.doc.display_name()).into()
    }

    fn ui(&mut self, ui: &mut egui::Ui, tab: &mut Self::Tab) {
        let doc = &mut tab.doc;
        // NOTE: `egui_code_editor` 0.4.x removed the `with_syntax` builder —
        // the syntax is now passed directly to `show` / `show_with_completer`.
        // `with_wrap` is honoured only when `with_numlines(false)`.
        egui_code_editor::CodeEditor::default()
            .id_source(format!("editor_{}", tab.id))
            .with_rows(20)
            .with_fontsize(self.font_size)
            .with_theme(self.theme.color_theme())
            .with_numlines(self.show_line_numbers)
            .with_wrap(self.word_wrap && !self.show_line_numbers)
            .show_with_completer(ui, &mut doc.text, &doc.syntax, &mut doc.completer);
    }

    fn on_close(&mut self, tab: &mut Self::Tab) -> OnCloseResponse {
        if tab.doc.is_dirty() {
            self.toasts
                .warning(format!("Closed unsaved tab: {}", tab.doc.display_name()));
            tracing::warn!("closing dirty tab: {:?}", tab.doc.path);
        } else {
            tracing::info!("closing tab: {:?}", tab.doc.path);
        }
        // Close anyway — the file can be re-opened from the Recent list.
        OnCloseResponse::Close
    }
}

// ── App ────────────────────────────────────────────────────────────────────

/// The top-level application state.
pub struct ScaffolderIDE {
    pub dock: DockState<Tab>,
    pub config: AppConfig,
    pub theme: EditorTheme,
    pub toasts: Toasts,
    pub status: String,
    pub search_open: bool,
    pub search_query: String,
    pub replace_query: String,
    pub diff_open: bool,
    pub diff_lines: Vec<export::DiffLine>,
    pub markdown_open: bool,
    pub properties_open: bool,
    pub about_open: bool,
    pub watcher: Option<FileWatcher>,
}

/// Snapshot of everything the status bar needs to display, computed up front
/// so the render closure borrows `self` only briefly (avoiding a long mutable
/// borrow that would conflict with reading `self.status`).
struct StatusBarSnapshot {
    language: String,
    encoding: String,
    line_ending_label: &'static str,
    stats: DocStats,
    dirty: bool,
    externally_modified: bool,
    tab_count: usize,
    status: String,
}

impl ScaffolderIDE {
    /// Create a new app, restoring tabs from persisted config.
    pub fn new(cc: &eframe::CreationContext<'_>) -> Self {
        tracing::info!("initialising Scaffolder IDE");
        let config = AppConfig::load(cc.storage);
        let theme = EditorTheme::from_index(config.theme_index);

        // Restore previously-open tabs. Files that no longer exist are
        // silently skipped (logged at warn).
        let mut tabs: Vec<Tab> = Vec::new();
        for path in &config.open_tabs {
            if path.exists() {
                match Document::open(path.clone()) {
                    Ok(doc) => {
                        tracing::info!("restored tab: {path:?}");
                        tabs.push(Tab::new(doc));
                    }
                    Err(e) => tracing::warn!("failed to restore {path:?}: {e}"),
                }
            }
        }
        if tabs.is_empty() {
            tabs.push(Tab::new(Document::new()));
        }

        let dock = DockState::new(tabs);

        // Start a file watcher covering every restored tab.
        let paths: Vec<PathBuf> = config.open_tabs.clone();
        let watcher = if paths.is_empty() {
            None
        } else {
            match FileWatcher::new(&paths) {
                Ok(w) => Some(w),
                Err(e) => {
                    tracing::error!("file watcher failed: {e}");
                    None
                }
            }
        };

        Self {
            dock,
            config,
            theme,
            toasts: Toasts::default(),
            status: "Ready".to_string(),
            search_open: false,
            search_query: String::new(),
            replace_query: String::new(),
            diff_open: false,
            diff_lines: Vec::new(),
            markdown_open: false,
            properties_open: false,
            about_open: false,
            watcher,
        }
    }

    // ── Helpers ─────────────────────────────────────────────────────────

    /// Mutable reference to the document in the currently-focused tab, if any.
    fn active_doc(&mut self) -> Option<&mut Document> {
        let (_, tab) = self.dock.find_active_focused()?;
        Some(&mut tab.doc)
    }

    /// Set the status-bar message and log it at info level.
    fn set_status(&mut self, msg: impl Into<String>) {
        let msg = msg.into();
        tracing::info!("status: {msg}");
        self.status = msg;
    }

    /// Push `path` to the front of the recent-files list (capped at 10).
    fn add_recent(&mut self, path: PathBuf) {
        self.config.recent_files.retain(|p| p != &path);
        self.config.recent_files.insert(0, path);
        self.config.recent_files.truncate(10);
    }

    /// Open `path` as a new tab, or focus it if already open.
    fn open_path(&mut self, path: PathBuf) {
        // De-duplicate: if the file is already open, just report it.
        // Collect the verdict up front so we don't hold an immutable borrow
        // of `self.dock` while calling `self.set_status` below.
        let already_open = self
            .dock
            .iter_all_tabs()
            .any(|(_, tab)| tab.doc.path.as_ref() == Some(&path));
        if already_open {
            self.set_status(format!("already open: {path:?}"));
            return;
        }
        match Document::open(path.clone()) {
            Ok(doc) => {
                self.dock.push_to_focused_leaf(Tab::new(doc));
                self.add_recent(path.clone());
                self.set_status(format!("opened: {path:?}"));
                self.toasts.success("File opened");
                self.restart_watcher();
            }
            Err(e) => {
                tracing::error!("open failed: {e}");
                self.toasts.error(format!("Open failed: {e}"));
            }
        }
    }

    /// Rebuild the file watcher to cover exactly the set of open-tab paths.
    fn restart_watcher(&mut self) {
        let paths: Vec<PathBuf> = self
            .dock
            .iter_all_tabs()
            .filter_map(|(_, t)| t.doc.path.clone())
            .collect();
        self.watcher = if paths.is_empty() {
            None
        } else {
            match FileWatcher::new(&paths) {
                Ok(w) => Some(w),
                Err(e) => {
                    tracing::error!("watcher restart failed: {e}");
                    None
                }
            }
        };
    }

    fn handle_new_tab(&mut self) {
        self.dock.push_to_focused_leaf(Tab::new(Document::new()));
        self.set_status("New tab");
    }

    fn handle_open(&mut self) {
        if let Some(path) = rfd::FileDialog::new()
            .add_filter("Text", &["txt", "rs", "toml", "md", "json", "py", "lua", "sh", "sql"])
            .pick_file()
        {
            self.open_path(path);
        }
    }

    fn handle_save(&mut self) {
        let backup = self.config.backup_on_save;
        if let Some(doc) = self.active_doc() {
            match doc.save(backup) {
                Ok(()) => {
                    self.toasts.success("File saved");
                    self.set_status("Saved");
                }
                Err(e) => {
                    tracing::error!("save failed: {e}");
                    self.toasts.error(format!("Save failed: {e}"));
                }
            }
        }
    }

    fn handle_save_as(&mut self) {
        let backup = self.config.backup_on_save;
        if let Some(path) = rfd::FileDialog::new()
            .add_filter("Text", &["txt", "rs", "toml", "md", "json", "py", "lua", "sh", "sql"])
            .save_file()
            && let Some(doc) = self.active_doc()
        {
            match doc.save_as(path.clone(), backup) {
                Ok(()) => {
                    self.add_recent(path);
                    self.toasts.success("Saved as");
                    self.set_status("Saved as");
                    self.restart_watcher();
                }
                Err(e) => {
                    tracing::error!("save-as failed: {e}");
                    self.toasts.error(format!("Save As failed: {e}"));
                }
            }
        }
    }

    fn handle_reload(&mut self) {
        if let Some(doc) = self.active_doc() {
            if doc.path.is_none() {
                self.toasts.info("This tab has no file on disk");
                return;
            }
            match doc.reload() {
                Ok(()) => {
                    self.toasts.success("Reloaded from disk");
                    self.set_status("Reloaded");
                }
                Err(e) => {
                    tracing::error!("reload failed: {e}");
                    self.toasts.error(format!("Reload failed: {e}"));
                }
            }
        }
    }

    fn handle_replace_all(&mut self) {
        if self.search_query.is_empty() {
            self.toasts.warning("Search term is empty");
            return;
        }
        // Clone the queries up front: `active_doc` borrows `&mut self`, so
        // borrowing `&self.search_query` inside the same block would fight
        // the mutable borrow of `doc`.
        let needle = self.search_query.clone();
        let replacement = self.replace_query.clone();
        if let Some(doc) = self.active_doc() {
            let (new_text, count) = text_ops::replace_all(&doc.text, &needle, &replacement);
            doc.text = new_text;
            self.set_status(format!("Replaced {count} occurrence(s)"));
            self.toasts.info(format!("Replaced {count} occurrence(s)"));
        }
    }

    fn handle_line_ending_conversion(&mut self, target: LineEnding) {
        if let Some(doc) = self.active_doc() {
            doc.text = line_endings::convert(&doc.text, target);
            doc.line_ending = target;
            self.set_status(format!("Converted to {}", target.label()));
            tracing::info!("line endings converted to {}", target.label());
        }
    }

    fn handle_export_html(&mut self) {
        if let Some(path) = rfd::FileDialog::new()
            .add_filter("HTML", &["html", "htm"])
            .save_file()
            && let Some(doc) = self.active_doc()
        {
            let html = export::to_html(&doc.text, &doc.display_name());
            match std::fs::write(&path, html) {
                Ok(()) => {
                    self.toasts.success("HTML exported");
                    tracing::info!("exported HTML to {path:?}");
                }
                Err(e) => {
                    tracing::error!("HTML export failed: {e}");
                    self.toasts.error(format!("Export failed: {e}"));
                }
            }
        }
    }

    fn handle_diff(&mut self) {
        if let Some(doc) = self.active_doc() {
            if doc.is_dirty() {
                self.diff_lines = export::compute_diff(&doc.last_saved, &doc.text);
                self.diff_open = true;
                self.set_status("Diff computed");
            } else {
                self.toasts.info("No changes to diff");
            }
        }
    }

    fn handle_markdown_preview(&mut self) {
        self.markdown_open = true;
    }

    fn handle_properties(&mut self) {
        self.properties_open = true;
    }

    /// Apply a whole-buffer text transformation to the active document.
    fn apply_text_op<F: FnOnce(&str) -> String>(&mut self, label: &str, op: F) {
        if let Some(doc) = self.active_doc() {
            doc.text = op(&doc.text);
            self.set_status(label);
        }
    }

    fn handle_sort(&mut self, ascending: bool) {
        self.apply_text_op("Lines sorted", |t| text_ops::sort_lines(t, ascending));
    }

    fn handle_reverse(&mut self) {
        self.apply_text_op("Lines reversed", text_ops::reverse_lines);
    }

    fn handle_remove_empty_lines(&mut self) {
        self.apply_text_op("Empty lines removed", text_ops::remove_empty_lines);
    }

    fn handle_remove_duplicate_lines(&mut self) {
        self.apply_text_op("Duplicate lines removed", text_ops::remove_duplicate_lines);
    }

    fn handle_number_lines(&mut self) {
        self.apply_text_op("Lines numbered", text_ops::number_lines);
    }

    fn handle_case(&mut self, upper: bool) {
        self.apply_text_op(
            if upper { "UPPERCASE" } else { "lowercase" },
            if upper { text_ops::to_uppercase } else { text_ops::to_lowercase },
        );
    }

    fn handle_trim(&mut self) {
        self.apply_text_op("Trailing whitespace trimmed", text_ops::trim_trailing_whitespace);
    }

    fn handle_indent(&mut self, use_spaces: bool) {
        self.apply_text_op("Indentation converted", |t| {
            text_ops::convert_indentation(t, use_spaces, 4)
        });
    }

    fn handle_insert_datetime(&mut self) {
        self.apply_text_op("Timestamp inserted", text_ops::insert_datetime);
    }

    // ── UI ──────────────────────────────────────────────────────────────

    fn menu_bar(&mut self, ui: &mut egui::Ui) {
        // egui 0.36 replaced `TopBottomPanel::top(id).show(ctx, …)` with
        // `Panel::top(id).show(ui, …)`, and the standalone `egui::menu::bar`
        // function with the `MenuBar` builder. `ui.menu_button` is unchanged.
        egui::Panel::top("menu").show(ui, |ui| {
            egui::MenuBar::new().ui(ui, |ui| {
                // ── File ────────────────────────────────────────────────
                ui.menu_button("File", |ui| {
                    if ui.button("New Tab (Ctrl+N)").clicked() {
                        self.handle_new_tab();
                    }
                    if ui.button("Open… (Ctrl+O)").clicked() {
                        self.handle_open();
                    }
                    ui.separator();
                    if ui.button("Save (Ctrl+S)").clicked() {
                        self.handle_save();
                    }
                    if ui.button("Save As… (Ctrl+Shift+S)").clicked() {
                        self.handle_save_as();
                    }
                    ui.separator();
                    ui.menu_button("Recent", |ui| {
                        if self.config.recent_files.is_empty() {
                            ui.label("(none)");
                        } else {
                            let recents = self.config.recent_files.clone();
                            for p in recents {
                                let name = p
                                    .file_name()
                                    .and_then(|n| n.to_str())
                                    .unwrap_or("?");
                                if ui.button(name).clicked() {
                                    self.open_path(p);
                                }
                            }
                        }
                    });
                    ui.separator();
                    if ui.button("Export HTML…").clicked() {
                        self.handle_export_html();
                    }
                    ui.separator();
                    if ui.button("About").clicked() {
                        self.about_open = true;
                    }
                });

                // ── Edit ────────────────────────────────────────────────
                ui.menu_button("Edit", |ui| {
                    if ui.button("Find / Replace… (Ctrl+F)").clicked() {
                        self.search_open = true;
                    }
                    if ui.button("Reload from Disk").clicked() {
                        self.handle_reload();
                    }
                    if ui.button("Diff vs Saved").clicked() {
                        self.handle_diff();
                    }
                    ui.separator();
                    if ui.button("Sort Lines A→Z").clicked() {
                        self.handle_sort(true);
                    }
                    if ui.button("Sort Lines Z→A").clicked() {
                        self.handle_sort(false);
                    }
                    if ui.button("Reverse Lines").clicked() {
                        self.handle_reverse();
                    }
                    if ui.button("Number Lines").clicked() {
                        self.handle_number_lines();
                    }
                    ui.separator();
                    if ui.button("Remove Empty Lines").clicked() {
                        self.handle_remove_empty_lines();
                    }
                    if ui.button("Remove Duplicate Lines").clicked() {
                        self.handle_remove_duplicate_lines();
                    }
                    ui.separator();
                    if ui.button("Trim Trailing Whitespace").clicked() {
                        self.handle_trim();
                    }
                    if ui.button("Tabs → Spaces").clicked() {
                        self.handle_indent(true);
                    }
                    if ui.button("Spaces → Tabs").clicked() {
                        self.handle_indent(false);
                    }
                    ui.separator();
                    if ui.button("UPPERCASE").clicked() {
                        self.handle_case(true);
                    }
                    if ui.button("lowercase").clicked() {
                        self.handle_case(false);
                    }
                    if ui.button("Insert Timestamp").clicked() {
                        self.handle_insert_datetime();
                    }
                });

                // ── View ────────────────────────────────────────────────
                ui.menu_button("View", |ui| {
                    for t in EditorTheme::all() {
                        if ui.radio(self.theme == t, t.name()).clicked() {
                            self.theme = t;
                            self.config.theme_index = t.to_index();
                        }
                    }
                    ui.separator();
                    ui.checkbox(&mut self.config.show_line_numbers, "Line Numbers");
                    ui.checkbox(&mut self.config.word_wrap, "Word Wrap (needs line numbers off)");
                    ui.checkbox(&mut self.config.auto_save, "Auto-save");
                    ui.checkbox(&mut self.config.backup_on_save, "Backup on Save");
                    ui.separator();
                    ui.horizontal(|ui| {
                        ui.label("Font:");
                        ui.add(egui::Slider::new(&mut self.config.font_size, 8.0..=32.0));
                    });
                    ui.separator();
                    if ui.button("Markdown Preview").clicked() {
                        self.handle_markdown_preview();
                    }
                    if ui.button("File Properties").clicked() {
                        self.handle_properties();
                    }
                });

                // ── Endings ─────────────────────────────────────────────
                ui.menu_button("Endings", |ui| {
                    for le in [LineEnding::Lf, LineEnding::CrLf, LineEnding::Cr] {
                        if ui.button(format!("Convert to {}", le.label())).clicked() {
                            self.handle_line_ending_conversion(le);
                        }
                    }
                });
            });
        });
    }

    /// Snapshot of everything the status bar needs to display, computed up
    /// front so the render closure borrows `self` only briefly. (The struct
    /// itself is defined at module level — Rust does not allow nested
    /// structs inside an `impl` block.)
    fn status_snapshot(&mut self) -> StatusBarSnapshot {
        let tab_count = self.dock.iter_all_tabs().count();
        let status = self.status.clone();
        if let Some(doc) = self.active_doc() {
            StatusBarSnapshot {
                language: doc.language.clone(),
                encoding: doc.encoding.clone(),
                line_ending_label: doc.line_ending.label(),
                stats: doc.stats(),
                dirty: doc.is_dirty(),
                externally_modified: doc.externally_modified,
                tab_count,
                status,
            }
        } else {
            StatusBarSnapshot {
                language: String::new(),
                encoding: String::new(),
                line_ending_label: "",
                stats: DocStats::from_text(""),
                dirty: false,
                externally_modified: false,
                tab_count,
                status,
            }
        }
    }

    fn status_bar(&mut self, ui: &mut egui::Ui) {
        let snap = self.status_snapshot();
        egui::Panel::bottom("status").show(ui, |ui| {
            ui.horizontal(|ui| {
                if !snap.language.is_empty() {
                    ui.label(format!("📄 {}", snap.language));
                    ui.separator();
                    ui.label(format!("Encoding: {}", snap.encoding));
                    ui.separator();
                    ui.label(format!("Endings: {}", snap.line_ending_label));
                    ui.separator();
                    ui.label(format!(
                        "L:{} C:{} W:{}",
                        snap.stats.lines, snap.stats.chars, snap.stats.words
                    ));
                    ui.separator();
                    if snap.dirty {
                        ui.colored_label(Color32::YELLOW, "● Modified");
                    } else {
                        ui.colored_label(Color32::GREEN, "✓ Saved");
                    }
                    if snap.externally_modified {
                        ui.colored_label(
                            Color32::RED,
                            "⚠ Modified on disk — Edit → Reload from Disk",
                        );
                    }
                    ui.separator();
                }
                ui.label(format!("Tabs: {}", snap.tab_count));
                ui.separator();
                ui.label(&snap.status);
            });
        });
    }
}

impl eframe::App for ScaffolderIDE {
    /// Per-frame entry point.
    ///
    /// eframe 0.36 renamed `App::update(&mut self, ctx, frame)` to
    /// `App::ui(&mut self, ui, frame)` and now hands us the root `&mut Ui`
    /// directly. We obtain the `Context` from `ui.ctx()` when we need it
    /// (for input polling, viewport commands, windows and toasts).
    fn ui(&mut self, ui: &mut egui::Ui, _frame: &mut eframe::Frame) {
        // ── Keyboard shortcuts + drag-and-drop ─────────────────────────
        // Read every input we need in ONE closure so we never hold a borrow
        // of `ui.ctx()` across the `&mut self` handler calls below.
        let (
            ctrl,
            shift,
            s_pressed,
            o_pressed,
            n_pressed,
            f_pressed,
            dropped,
            focused,
        ) = ui.ctx().input(|i| {
            (
                i.modifiers.ctrl,
                i.modifiers.shift,
                i.key_pressed(egui::Key::S),
                i.key_pressed(egui::Key::O),
                i.key_pressed(egui::Key::N),
                i.key_pressed(egui::Key::F),
                i.raw.dropped_files.clone(),
                i.focused,
            )
        });

        if ctrl && s_pressed {
            if shift {
                self.handle_save_as();
            } else {
                self.handle_save();
            }
        }
        if ctrl && o_pressed {
            self.handle_open();
        }
        if ctrl && n_pressed {
            self.handle_new_tab();
        }
        if ctrl && f_pressed {
            self.search_open = true;
        }

        // egui 0.36: `dropped_files` is `Vec<Arc<dyn DroppedFile>>` and
        // `DroppedFile::path(&self) -> &Path` returns the path directly (no
        // Option) — every dropped item carries a path (a relative one on web).
        for file in dropped {
            let path = file.path();
            self.open_path(path.to_path_buf());
        }

        // ── File-watcher poll ─────────────────────────────────────────
        if let Some(w) = &self.watcher {
            for path in w.poll() {
                for (_, tab) in self.dock.iter_all_tabs_mut() {
                    if tab.doc.path.as_ref() == Some(&path) {
                        tab.doc.externally_modified = true;
                        tracing::warn!("external modification detected: {path:?}");
                        self.toasts
                            .warning("File changed on disk — Edit → Reload from Disk or Save");
                    }
                }
            }
        }

        // ── Window title ──────────────────────────────────────────────
        let dirty = self.active_doc().map(|d| d.is_dirty()).unwrap_or(false);
        ui.ctx().send_viewport_cmd(egui::ViewportCommand::Title(format!(
            "Scaffolder IDE{}",
            if dirty { " *" } else { "" }
        )));

        // ── UI panels ─────────────────────────────────────────────────
        self.menu_bar(ui);
        self.status_bar(ui);

        egui::CentralPanel::default().show(ui, |ui| {
            let mut viewer = ScaffoldTabViewer {
                font_size: self.config.font_size,
                theme: self.theme,
                show_line_numbers: self.config.show_line_numbers,
                word_wrap: self.config.word_wrap,
                toasts: &mut self.toasts,
            };
            DockArea::new(&mut self.dock)
                .style(egui_dock::Style::from_egui(ui.style().as_ref()))
                .show_inside(ui, &mut viewer);
        });

        // ── Find / Replace dialog ─────────────────────────────────────
        // Hoist the `open` flag into a local: `.open(&mut self.search_open)`
        // would hold a mutable borrow of `self.search_open` across the
        // `.show` closure, which also needs `&mut self` (for the search
        // fields and `handle_replace_all`). A local breaks the cycle; we
        // write the result back after `show` returns. The window's own X
        // button (wired by `.open`) closes it, so no separate Close button
        // is needed.
        if self.search_open {
            let mut open = true;
            egui::Window::new("Find / Replace")
                .open(&mut open)
                .resizable(false)
                .show(ui.ctx(), |ui| {
                    ui.horizontal(|ui| {
                        ui.label("Find:");
                        ui.text_edit_singleline(&mut self.search_query);
                    });
                    ui.horizontal(|ui| {
                        ui.label("Replace:");
                        ui.text_edit_singleline(&mut self.replace_query);
                    });
                    ui.horizontal(|ui| {
                        if ui.button("Replace All").clicked() {
                            self.handle_replace_all();
                        }
                    });
                });
            self.search_open = open;
        }

        // ── Diff window ───────────────────────────────────────────────
        if self.diff_open {
            egui::Window::new("Diff (saved vs current)")
                .open(&mut self.diff_open)
                .show(ui.ctx(), |ui| {
                    egui::ScrollArea::vertical().show(ui, |ui| {
                        for line in &self.diff_lines {
                            let color = match line.tag {
                                similar::ChangeTag::Delete => Color32::from_rgb(0xff, 0x6b, 0x6b),
                                similar::ChangeTag::Insert => Color32::from_rgb(0x6b, 0xff, 0x8a),
                                similar::ChangeTag::Equal => Color32::from_rgb(0x90, 0x90, 0x90),
                            };
                            let prefix = match line.tag {
                                similar::ChangeTag::Delete => "- ",
                                similar::ChangeTag::Insert => "+ ",
                                similar::ChangeTag::Equal => "  ",
                            };
                            ui.colored_label(
                                color,
                                RichText::new(format!("{prefix}{}", line.content)).monospace(),
                            );
                        }
                    });
                });
        }

        // ── Markdown preview ─────────────────────────────────────────
        // Snapshot the active document's text *before* building the window
        // so the `.show` closure borrows only the local `text` (not `self`),
        // which would otherwise conflict with `.open(&mut self.markdown_open)`.
        if self.markdown_open {
            let text = self
                .active_doc()
                .map(|d| d.text.clone())
                .unwrap_or_default();
            egui::Window::new("Markdown Preview")
                .open(&mut self.markdown_open)
                .default_width(560.0)
                .default_height(520.0)
                .show(ui.ctx(), |ui| {
                    egui::ScrollArea::vertical()
                        .auto_shrink([false, false])
                        .show(ui, |ui| {
                            crate::markdown::render(ui, &text);
                        });
                });
        }

        // ── Properties dialog ────────────────────────────────────────
        // Snapshot the active document's metadata before building the
        // window, same reason as the Markdown preview above.
        if self.properties_open {
            let (path, encoding, line_ending_label) = self
                .active_doc()
                .map(|d| (d.path.clone(), d.encoding.clone(), d.line_ending.label()))
                .unwrap_or_default();
            egui::Window::new("File Properties")
                .open(&mut self.properties_open)
                .show(ui.ctx(), |ui| {
                    if let Some(path) = &path {
                        match std::fs::metadata(path).map_err(|source| FileError::Metadata {
                            path: path.clone(),
                            source,
                        }) {
                            Ok(meta) => {
                                ui.label(format!("Path: {}", path.display()));
                                ui.label(format!("Size: {} bytes", meta.len()));
                                ui.label(format!("Modified: {:?}", meta.modified().ok()));
                                ui.label(format!(
                                    "Read-only: {}",
                                    meta.permissions().readonly()
                                ));
                            }
                            Err(e) => {
                                ui.colored_label(Color32::from_rgb(0xff, 0x6b, 0x6b), format!("{e}"));
                            }
                        }
                    } else {
                        ui.label("Untitled buffer — no file on disk");
                    }
                    if !encoding.is_empty() {
                        ui.label(format!("Encoding: {encoding}"));
                    }
                    if !line_ending_label.is_empty() {
                        ui.label(format!("Line endings: {line_ending_label}"));
                    }
                });
        }

        // ── About dialog ─────────────────────────────────────────────
        if self.about_open {
            egui::Window::new("About")
                .open(&mut self.about_open)
                .resizable(false)
                .show(ui.ctx(), |ui| {
                    ui.heading("Scaffolder IDE");
                    ui.label("A multi-tab, multi-encoding code editor built with egui.");
                    ui.add_space(4.0);
                    ui.label("Features:");
                    ui.label(
                        RichText::new(
                            "• Encoding detection & transcoding (UTF-8/16, Windows-1252, …)\n\
                             • File watching with reload-from-disk\n\
                             • Diff vs saved, HTML export\n\
                             • Markdown preview\n\
                             • Line-ending conversion (LF / CRLF / CR)\n\
                             • Sort / dedup / reverse / number / case text ops",
                        )
                        .monospace(),
                    );
                });
        }

        // ── Auto-save on focus loss ───────────────────────────────────
        if self.config.auto_save && !focused {
            let backup = self.config.backup_on_save;
            for (_, tab) in self.dock.iter_all_tabs_mut() {
                if tab.doc.is_dirty() && tab.doc.path.is_some() {
                    if let Err(e) = tab.doc.save(backup) {
                        tracing::error!("auto-save failed: {e}");
                    } else {
                        tracing::info!("auto-saved {:?}", tab.doc.path);
                    }
                }
            }
        }

        self.toasts.show(ui.ctx());
    }

    fn save(&mut self, storage: &mut dyn eframe::Storage) {
        self.config.open_tabs = self
            .dock
            .iter_all_tabs()
            .filter_map(|(_, t)| t.doc.path.clone())
            .collect();
        self.config.save(storage);
        tracing::info!("state persisted on shutdown");
    }
}
