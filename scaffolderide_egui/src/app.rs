//! 2025-26 Beta ORI Inc. Canada. All Rights Reserved.
//! Syed Awase Khirni
//! Main application: tab management, menu, status bar, dialogs.

use crate::config::AppConfig;
use crate::document::Document;
use crate::error::FileResult;
use crate::export;
use crate::line_endings::{self, LineEnding};
use crate::text_ops;
use crate::watcher::FileWatcher;
use egui::{Color32, RichText};
use egui_code_editor::{ColorTheme, Syntax};
use egui_dock::{DockArea, DockState, NodeIndex, SurfaceIndex, TabViewer};
use egui_notify::Toasts;
use std::path::PathBuf;

// ── Theme ──────────────────────────────────────────────────────────────────

#[derive(Clone, Copy, PartialEq)]
pub enum EditorTheme {
    Gruvbox,
    GithubDark,
    Sonokai,
}

impl EditorTheme {
    pub fn color_theme(self) -> ColorTheme {
        match self {
            Self::Gruvbox => ColorTheme::GRUVBOX,
            Self::GithubDark => ColorTheme::GITHUB_DARK,
            Self::Sonokai => ColorTheme::SONOKAI,
        }
    }
    pub fn name(self) -> &'static str {
        match self {
            Self::Gruvbox => "Gruvbox",
            Self::GithubDark => "GitHub Dark",
            Self::Sonokai => "Sonokai",
        }
    }
    pub fn all() -> [Self; 3] {
        [Self::Gruvbox, Self::GithubDark, Self::Sonokai]
    }
    pub fn from_index(i: usize) -> Self {
        Self::all().get(i).copied().unwrap_or(Self::Gruvbox)
    }
    pub fn to_index(self) -> usize {
        match self {
            Self::Gruvbox => 0,
            Self::GithubDark => 1,
            Self::Sonokai => 2,
        }
    }
}

// ── Tab ────────────────────────────────────────────────────────────────────

/// A dock tab containing one `Document`.
pub struct Tab {
    pub doc: Document,
}

// ── TabViewer ──────────────────────────────────────────────────────────────

/// Renders tabs inside `egui_dock`.
pub struct ScaffoldTabViewer<'a> {
    pub font_size: f32,
    pub theme: EditorTheme,
    pub show_line_numbers: bool,
    pub toasts: &'a mut Toasts,
}

impl<'a> TabViewer for ScaffoldTabViewer<'a> {
    type Tab = Tab;

    fn title(&mut self, tab: &mut Self::Tab) -> egui::WidgetText {
        let dirty = if tab.doc.is_dirty() { "*" } else { "" };
        format!("{}{}", dirty, tab.doc.display_name()).into()
    }

    fn ui(&mut self, ui: &mut egui::Ui, tab: &mut Self::Tab) {
        let doc = &mut tab.doc;
        egui_code_editor::CodeEditor::default()
            .id_source(format!("editor_{:?}", doc.path))
            .with_rows(20)
            .with_fontsize(self.font_size)
            .with_theme(self.theme.color_theme())
            .with_syntax(doc.syntax.to_owned())
            .with_numlines(self.show_line_numbers)
            .show_with_completer(ui, &mut doc.text, &mut doc.completer);
        if doc.is_dirty() {
            // no-op; title shows the asterisk
        }
    }

    fn on_close(&mut self, tab: &mut Self::Tab) -> bool {
        if tab.doc.is_dirty() {
            self.toasts
                .warning(format!("Closed unsaved tab: {}", tab.doc.display_name()));
            tracing::warn!("Closing dirty tab: {:?}", tab.doc.path);
        } else {
            tracing::info!("Closing tab: {:?}", tab.doc.path);
        }
        true
    }
}

// ── App ────────────────────────────────────────────────────────────────────

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

impl ScaffolderIDE {
    /// Create a new app, restoring tabs from config.
    pub fn new(cc: &eframe::CreationContext<'_>) -> Self {
        tracing::info!("Initializing Scaffolder IDE");
        let config = AppConfig::load(cc.storage);
        let theme = EditorTheme::from_index(config.theme_index);

        // Restore tabs.
        let mut tabs: Vec<Tab> = Vec::new();
        for path in &config.open_tabs {
            if path.exists() {
                match Document::open(path.clone()) {
                    Ok(doc) => {
                        tracing::info!("Restored tab: {:?}", path);
                        tabs.push(Tab { doc });
                    }
                    Err(e) => tracing::warn!("Failed to restore {:?}: {e}", path),
                }
            }
        }
        if tabs.is_empty() {
            tabs.push(Tab {
                doc: Document::new(),
            });
        }

        let mut dock = DockState::new(tabs);
        // Keep a reference to the surface for adding tabs later.
        let _ = dock.main_surface_mut();

        // Start file watcher for open tabs.
        let paths: Vec<PathBuf> = config.open_tabs.clone();
        let watcher = if paths.is_empty() {
            None
        } else {
            match FileWatcher::new(&paths) {
                Ok(w) => Some(w),
                Err(e) => {
                    tracing::error!("File watcher failed: {e}");
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

    fn active_doc(&mut self) -> Option<&mut Document> {
        let (_, tab) = self.dock.find_active_focused()?;
        Some(&mut tab.doc)
    }

    fn set_status(&mut self, msg: impl Into<String>) {
        let msg = msg.into();
        tracing::info!("Status: {msg}");
        self.status = msg;
    }

    fn add_recent(&mut self, path: PathBuf) {
        self.config.recent_files.retain(|p| p != &path);
        self.config.recent_files.insert(0, path);
        self.config.recent_files.truncate(10);
    }

    fn open_path(&mut self, path: PathBuf) {
        // Check if already open.
        for (_, tab) in self.dock.iter_all_tabs() {
            if tab.doc.path.as_ref() == Some(&path) {
                self.set_status(format!("Already open: {:?}", path));
                return;
            }
        }
        match Document::open(path.clone()) {
            Ok(doc) => {
                let tab = Tab { doc };
                self.dock.push_to_focused_leaf(tab);
                self.add_recent(path.clone());
                self.set_status(format!("Opened: {:?}", path));
                self.toasts.success("File opened");
                // Refresh watcher.
                self.restart_watcher();
            }
            Err(e) => {
                tracing::error!("Open failed: {e}");
                self.toasts.error(format!("Open failed: {e}"));
            }
        }
    }

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
                    tracing::error!("Watcher restart failed: {e}");
                    None
                }
            }
        };
    }

    fn handle_open(&mut self) {
        if let Some(path) = rfd::FileDialog::new()
            .add_filter("Text", &["txt", "rs", "toml", "md", "json"])
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
                    tracing::error!("Save failed: {e}");
                    self.toasts.error(format!("Save failed: {e}"));
                }
            }
        }
    }

    fn handle_save_as(&mut self) {
        let backup = self.config.backup_on_save;
        if let Some(path) = rfd::FileDialog::new()
            .add_filter("Text", &["txt", "rs", "toml", "md", "json"])
            .save_file()
        {
            if let Some(doc) = self.active_doc() {
                match doc.save_as(path.clone(), backup) {
                    Ok(()) => {
                        self.add_recent(path);
                        self.toasts.success("Saved as");
                        self.set_status("Saved as");
                    }
                    Err(e) => {
                        tracing::error!("Save As failed: {e}");
                        self.toasts.error(format!("Save As failed: {e}"));
                    }
                }
            }
        }
    }

    fn handle_replace_all(&mut self) {
        if self.search_query.is_empty() {
            self.toasts.warning("Search term is empty");
            return;
        }
        if let Some(doc) = self.active_doc() {
            let (new_text, count) =
                text_ops::replace_all(&doc.text, &self.search_query, &self.replace_query);
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
            tracing::info!("Line endings converted to {}", target.label());
        }
    }

    fn handle_export_html(&mut self) {
        if let Some(path) = rfd::FileDialog::new()
            .add_filter("HTML", &["html", "htm"])
            .save_file()
        {
            if let Some(doc) = self.active_doc() {
                let html = export::to_html(&doc.text, &doc.display_name());
                match std::fs::write(&path, html) {
                    Ok(()) => {
                        self.toasts.success("HTML exported");
                        tracing::info!("Exported HTML to {:?}", path);
                    }
                    Err(e) => {
                        tracing::error!("HTML export failed: {e}");
                        self.toasts.error(format!("Export failed: {e}"));
                    }
                }
            }
        }
    }

    fn handle_diff(&mut self) {
        // Compare current buffer against its last saved snapshot.
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

    fn handle_sort(&mut self, ascending: bool) {
        if let Some(doc) = self.active_doc() {
            doc.text = text_ops::sort_lines(&doc.text, ascending);
            self.set_status("Lines sorted");
        }
    }

    fn handle_trim(&mut self) {
        if let Some(doc) = self.active_doc() {
            doc.text = text_ops::trim_trailing_whitespace(&doc.text);
            self.set_status("Trailing whitespace trimmed");
        }
    }

    fn handle_indent(&mut self, use_spaces: bool) {
        if let Some(doc) = self.active_doc() {
            doc.text = text_ops::convert_indentation(&doc.text, use_spaces, 4);
            self.set_status("Indentation converted");
        }
    }

    fn handle_insert_datetime(&mut self) {
        if let Some(doc) = self.active_doc() {
            doc.text = text_ops::insert_datetime(&doc.text);
            self.set_status("Timestamp inserted");
        }
    }

    // ── UI ──────────────────────────────────────────────────────────────

    fn menu_bar(&mut self, ctx: &egui::Context) {
        egui::TopBottomPanel::top("menu").show(ctx, |ui| {
            egui::menu::bar(ui, |ui| {
                ui.menu_button("File", |ui| {
                    if ui.button("New Tab").clicked() {
                        self.dock.push_to_focused_leaf(Tab {
                            doc: Document::new(),
                        });
                        ui.close_menu();
                    }
                    if ui.button("Open (Ctrl+O)").clicked() {
                        self.handle_open();
                        ui.close_menu();
                    }
                    ui.separator();
                    if ui.button("Save (Ctrl+S)").clicked() {
                        self.handle_save();
                        ui.close_menu();
                    }
                    if ui.button("Save As (Ctrl+Shift+S)").clicked() {
                        self.handle_save_as();
                        ui.close_menu();
                    }
                    ui.separator();
                    ui.menu_button("Recent", |ui| {
                        if self.config.recent_files.is_empty() {
                            ui.label("None");
                        } else {
                            let recents = self.config.recent_files.clone();
                            for p in recents {
                                let name = p.file_name().and_then(|n| n.to_str()).unwrap_or("?");
                                if ui.button(name).clicked() {
                                    self.open_path(p);
                                    ui.close_menu();
                                }
                            }
                        }
                    });
                    ui.separator();
                    if ui.button("Export HTML").clicked() {
                        self.handle_export_html();
                        ui.close_menu();
                    }
                    ui.separator();
                    if ui.button("About").clicked() {
                        self.about_open = true;
                        ui.close_menu();
                    }
                });

                ui.menu_button("Edit", |ui| {
                    if ui.button("Find / Replace (Ctrl+F)").clicked() {
                        self.search_open = true;
                        ui.close_menu();
                    }
                    if ui.button("Diff vs Saved").clicked() {
                        self.handle_diff();
                        ui.close_menu();
                    }
                    ui.separator();
                    if ui.button("Sort Lines A→Z").clicked() {
                        self.handle_sort(true);
                        ui.close_menu();
                    }
                    if ui.button("Sort Lines Z→A").clicked() {
                        self.handle_sort(false);
                        ui.close_menu();
                    }
                    if ui.button("Trim Trailing Whitespace").clicked() {
                        self.handle_trim();
                        ui.close_menu();
                    }
                    ui.separator();
                    if ui.button("Tabs → Spaces").clicked() {
                        self.handle_indent(true);
                        ui.close_menu();
                    }
                    if ui.button("Spaces → Tabs").clicked() {
                        self.handle_indent(false);
                        ui.close_menu();
                    }
                    if ui.button("Insert Timestamp").clicked() {
                        self.handle_insert_datetime();
                        ui.close_menu();
                    }
                });

                ui.menu_button("View", |ui| {
                    for t in EditorTheme::all() {
                        if ui.radio(self.theme == t, t.name()).clicked() {
                            self.theme = t;
                            self.config.theme_index = t.to_index();
                            ui.close_menu();
                        }
                    }
                    ui.separator();
                    ui.checkbox(&mut self.config.show_line_numbers, "Line Numbers");
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
                        ui.close_menu();
                    }
                    if ui.button("File Properties").clicked() {
                        self.handle_properties();
                        ui.close_menu();
                    }
                });

                ui.menu_button("Endings", |ui| {
                    for le in [LineEnding::Lf, LineEnding::CrLf, LineEnding::Cr] {
                        if ui.button(format!("Convert to {}", le.label())).clicked() {
                            self.handle_line_ending_conversion(le);
                            ui.close_menu();
                        }
                    }
                });
            });
        });
    }

    fn status_bar(&mut self, ctx: &egui::Context) {
        egui::TopBottomPanel::bottom("status").show(ctx, |ui| {
            ui.horizontal(|ui| {
                if let Some(doc) = self.active_doc() {
                    ui.label(format!("📄 {}", doc.language));
                    ui.separator();
                    ui.label(format!("Encoding: {}", doc.encoding));
                    ui.separator();
                    ui.label(format!("Endings: {}", doc.line_ending.label()));
                    ui.separator();
                    let lines = doc.text.lines().count().max(1);
                    let chars = doc.text.len();
                    let words = doc.text.split_whitespace().count();
                    ui.label(format!("L:{lines} C:{chars} W:{words}"));
                    ui.separator();
                    if doc.is_dirty() {
                        ui.colored_label(Color32::YELLOW, "● Modified");
                    } else {
                        ui.colored_label(Color32::GREEN, "✓ Saved");
                    }
                    if doc.externally_modified {
                        ui.colored_label(Color32::RED, "⚠ Modified on disk");
                    }
                }
                ui.separator();
                ui.label(&self.status);
            });
        });
    }
}

impl eframe::App for ScaffolderIDE {
    fn update(&mut self, ctx: &egui::Context, _frame: &mut eframe::Frame) {
        // ── Keyboard shortcuts ────────────────────────────────────────
        let ctrl = ctx.input(|i| i.modifiers.ctrl);
        let shift = ctx.input(|i| i.modifiers.shift);
        if ctrl && ctx.input(|i| i.key_pressed(egui::Key::S)) {
            if shift {
                self.handle_save_as();
            } else {
                self.handle_save();
            }
        }
        if ctrl && ctx.input(|i| i.key_pressed(egui::Key::O)) {
            self.handle_open();
        }
        if ctrl && ctx.input(|i| i.key_pressed(egui::Key::F)) {
            self.search_open = true;
        }

        // ── Drag-and-drop ─────────────────────────────────────────────
        let dropped = ctx.input(|i| i.raw.dropped_files.clone());
        for file in dropped {
            if let Some(path) = file.path {
                self.open_path(path);
            }
        }

        // ── File watcher poll ────────────────────────────────────────
        if let Some(w) = &self.watcher {
            for path in w.poll() {
                for (_, tab) in self.dock.iter_all_tabs_mut() {
                    if tab.doc.path.as_ref() == Some(&path) {
                        tab.doc.externally_modified = true;
                        tracing::warn!("External modification detected: {:?}", path);
                    }
                }
            }
        }

        // ── Window title ─────────────────────────────────────────────
        let dirty = self.active_doc().map(|d| d.is_dirty()).unwrap_or(false);
        ctx.send_viewport_cmd(egui::ViewportCommand::Title(format!(
            "Scaffolder IDE{}{}",
            if dirty { " *" } else { "" },
            ""
        )));

        // ── UI panels ────────────────────────────────────────────────
        self.menu_bar(ctx);
        self.status_bar(ctx);

        egui::CentralPanel::default().show(ctx, |ui| {
            let mut viewer = ScaffoldTabViewer {
                font_size: self.config.font_size,
                theme: self.theme,
                show_line_numbers: self.config.show_line_numbers,
                toasts: &mut self.toasts,
            };
            DockArea::new(&mut self.dock)
                .style(egui_dock::Style::from_egui(ui.style().as_ref()))
                .show_inside(ui, &mut viewer);
        });

        // ── Search / Replace dialog ──────────────────────────────────
        if self.search_open {
            egui::Window::new("Find / Replace")
                .open(&mut self.search_open)
                .resizable(false)
                .show(ctx, |ui| {
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
                        if ui.button("Close").clicked() {
                            self.search_open = false;
                        }
                    });
                });
        }

        // ── Diff window ─────────────────────────────────────────────
        if self.diff_open {
            egui::Window::new("Diff (saved vs current)")
                .open(&mut self.diff_open)
                .show(ctx, |ui| {
                    egui::ScrollArea::vertical().show(ui, |ui| {
                        for line in &self.diff_lines {
                            let color = match line.tag {
                                similar::ChangeTag::Delete => Color32::RED,
                                similar::ChangeTag::Insert => Color32::GREEN,
                                similar::ChangeTag::Equal => Color32::GRAY,
                            };
                            ui.colored_label(color, &line.content);
                        }
                    });
                });
        }

        // ── Markdown preview ────────────────────────────────────────
        if self.markdown_open {
            egui::Window::new("Markdown Preview")
                .open(&mut self.markdown_open)
                .show(ctx, |ui| {
                    if let Some(doc) = self.active_doc() {
                        let parser = pulldown_cmark::Parser::new(&doc.text);
                        let mut html = String::new();
                        pulldown_cmark::html::push_html(&mut html, parser);
                        // Render as plain text for simplicity.
                        ui.label(RichText::new(html).monospace());
                    }
                });
        }

        // ── Properties dialog ───────────────────────────────────────
        if self.properties_open {
            egui::Window::new("File Properties")
                .open(&mut self.properties_open)
                .show(ctx, |ui| {
                    if let Some(doc) = self.active_doc() {
                        if let Some(path) = &doc.path {
                            match std::fs::metadata(path) {
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
                                    ui.colored_label(Color32::RED, format!("Metadata error: {e}"));
                                }
                            }
                        } else {
                            ui.label("Untitled buffer — no file on disk");
                        }
                        ui.label(format!("Encoding: {}", doc.encoding));
                        ui.label(format!("Line endings: {}", doc.line_ending.label()));
                    }
                });
        }

        // ── About dialog ────────────────────────────────────────────
        if self.about_open {
            egui::Window::new("About")
                .open(&mut self.about_open)
                .resizable(false)
                .show(ctx, |ui| {
                    ui.heading("Scaffolder IDE v1.0");
                    ui.label("Multi-tab code editor built with egui.");
                    ui.label("Features: encoding detection, file watching, diff, HTML export,");
                    ui.label("markdown preview, line-ending conversion, text operations.");
                });
        }

        // ── Auto-save ───────────────────────────────────────────────
        if self.config.auto_save && !ctx.input(|i| i.focused) {
            let backup = self.config.backup_on_save;
            for (_, tab) in self.dock.iter_all_tabs_mut() {
                if tab.doc.is_dirty() && tab.doc.path.is_some() {
                    if let Err(e) = tab.doc.save(backup) {
                        tracing::error!("Auto-save failed: {e}");
                    } else {
                        tracing::info!("Auto-saved {:?}", tab.doc.path);
                    }
                }
            }
        }

        self.toasts.show(ctx);
    }

    fn save(&mut self, storage: &mut dyn eframe::Storage) {
        self.config.open_tabs = self
            .dock
            .iter_all_tabs()
            .filter_map(|(_, t)| t.doc.path.clone())
            .collect();
        self.config.save(storage);
        tracing::info!("State persisted on shutdown");
    }
}
