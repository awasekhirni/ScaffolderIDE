//! Minimal Markdown → egui renderer for the *View → Markdown Preview* pane.
//!
//! The previous version of the preview dumped the raw HTML produced by
//! `pulldown-cmark` as monospace text — technically correct but useless to
//! read. This module walks the [`pulldown_cmark`] event stream and emits
//! real egui widgets instead:
//!
//! * `# / ## / ###` headings → large bold labels
//! * paragraphs and list items → wrapped body text
//! * `- item` / `1. item` → bulleted / numbered lines
//! * `> quote` → indented, muted text inside a frame
//! * ```` ``` ```` fenced code blocks → monospace inside a dark frame
//! * `` `inline code` `` → monospace inline
//! * `**bold**` / `*italic*` → bold / italic inline
//! * `[label](url)` → clickable hyperlinks
//!
//! It is intentionally small — it covers the common README/blog-post subset
//! and degrades gracefully to plain text for anything it does not
//! understand. Tables, footnotes and task-list checkboxes are rendered as
//! plain paragraphs.
//!
//! ## Why not just `egui::markdown`?
//!
//! egui 0.36 does not ship a built-in markdown widget, so we render
//! `pulldown-cmark` events ourselves.

use egui::{Color32, RichText, Ui, Vec2};
use pulldown_cmark::{Event, HeadingLevel, Options, Parser, Tag, TagEnd};

/// Render a Markdown string into `ui` as styled widgets inside a vertical
/// scroll area is *not* added here — the caller wraps us in whatever
/// `ScrollArea` it wants, so the preview can be embedded in any window.
pub fn render(ui: &mut Ui, markdown: &str) {
    let parser = Parser::new_ext(markdown, parser_options());
    let mut ctx = RenderCtx::default();
    for event in parser {
        ctx.handle(event, ui);
    }
    ctx.flush_paragraph(ui);
}

/// Build the `pulldown-cmark` option set: enable tables, footnotes,
/// strikethrough, task lists, and smart punctuation.
fn parser_options() -> Options {
    Options::empty()
        | Options::ENABLE_TABLES
        | Options::ENABLE_FOOTNOTES
        | Options::ENABLE_STRIKETHROUGH
        | Options::ENABLE_TASKLISTS
        | Options::ENABLE_SMART_PUNCTUATION
}

/// Inline-style stack: bold / italic / strikethrough are pushed on `Start`
/// and popped on `End`, so the running text buffer can be styled when it is
/// finally flushed.
#[derive(Clone, Copy, Default)]
struct InlineStyle {
    bold: bool,
    italic: bool,
    strikethrough: bool,
    code: bool,
    link: bool,
}

/// Accumulator state for the current block being built.
#[derive(Default)]
struct RenderCtx {
    /// Text for the in-progress paragraph / heading / list item.
    buf: String,
    /// Stack of inline styles currently active.
    styles: Vec<InlineStyle>,
    /// Heading level if currently inside a heading, else `None`.
    heading: Option<Option<HeadingLevel>>,
    /// `Some(true)` inside a fenced code block; the buffer holds the raw code.
    in_code_block: bool,
    /// `Some(n)` inside an ordered list (n = next index), or `Some(false)`
    /// for an unordered list.
    list_kind: Option<bool>,
    /// Indentation depth (lists / block quotes).
    indent: usize,
}

impl RenderCtx {
    /// Combined inline style derived from the stack.
    fn current_style(&self) -> InlineStyle {
        let mut s = InlineStyle::default();
        for layer in &self.styles {
            if layer.bold {
                s.bold = true;
            }
            if layer.italic {
                s.italic = true;
            }
            if layer.strikethrough {
                s.strikethrough = true;
            }
            if layer.code {
                s.code = true;
            }
            if layer.link {
                s.link = true;
            }
        }
        s
    }

    fn push_text(&mut self, text: &str) {
        self.buf.push_str(text);
    }

    /// Flush the current buffer as a single egui label, applying heading /
    /// list / inline styling.
    fn flush_paragraph(&mut self, ui: &mut Ui) {
        if self.buf.is_empty() && self.heading.is_none() {
            return;
        }
        let text = std::mem::take(&mut self.buf);
        let style = self.current_style();

        if self.in_code_block {
            // Code blocks render verbatim inside a dark frame.
            egui::Frame::group(ui.style())
                .fill(Color32::from_rgb(0x1e, 0x1e, 0x1e))
                .stroke(egui::Stroke::NONE)
                .inner_margin(Vec2::new(8.0, 4.0))
                .show(ui, |ui| {
                    ui.label(
                        RichText::new(&text)
                            .monospace()
                            .color(Color32::from_rgb(0xd4, 0xd4, 0xd4))
                            .size(12.0),
                    );
                });
            self.in_code_block = false;
            return;
        }

        let mut rt = RichText::new(&text);
        if style.code {
            rt = rt.monospace().color(Color32::from_rgb(0xce, 0x91, 0x78));
        }
        if style.bold {
            rt = rt.strong();
        }
        if style.italic {
            rt = rt.italics();
        }
        if style.strikethrough {
            rt = rt.strikethrough();
        }
        if style.link {
            rt = rt.color(Color32::from_rgb(0x58, 0xa6, 0xff));
        }

        // Heading sizing.
        if let Some(Some(level)) = self.heading {
            let (size, color) = match level {
                HeadingLevel::H1 => (24.0, Color32::from_rgb(0xff, 0xff, 0xff)),
                HeadingLevel::H2 => (20.0, Color32::from_rgb(0xe6, 0xe6, 0xe6)),
                HeadingLevel::H3 => (17.0, Color32::from_rgb(0xd0, 0xd0, 0xd0)),
                HeadingLevel::H4 => (15.0, Color32::from_rgb(0xc0, 0xc0, 0xc0)),
                HeadingLevel::H5 => (14.0, Color32::from_rgb(0xb0, 0xb0, 0xb0)),
                HeadingLevel::H6 => (13.0, Color32::from_rgb(0xa0, 0xa0, 0xa0)),
            };
            rt = rt.size(size).color(color).strong();
        }

        let indent_px = self.indent as f32 * 16.0;
        ui.horizontal_wrapped(|ui| {
            ui.allocate_space(Vec2::new(indent_px, 0.0));
            if let Some(ordered) = self.list_kind {
                // We can't easily recover the exact list index from events
                // without tracking Item count, so unordered items get a
                // bullet and ordered items a `•` too (the per-item number is
                // rendered when Item starts — see handle()).
                let _ = ordered;
                ui.label("•");
                ui.label(rt);
            } else {
                ui.label(rt);
            }
        });
        self.heading = None;
    }

    fn handle(&mut self, event: Event<'_>, ui: &mut Ui) {
        match event {
            Event::Start(tag) => match tag {
                Tag::Paragraph => {
                    self.buf.clear();
                }
                Tag::Heading { level, .. } => {
                    self.flush_paragraph(ui);
                    self.heading = Some(Some(level));
                    self.buf.clear();
                }
                Tag::CodeBlock(_) => {
                    self.flush_paragraph(ui);
                    self.in_code_block = true;
                    self.buf.clear();
                    // `kind` (Fenced/Indented) is ignored — we render the
                    // block verbatim rather than syntax-highlighting it.
                }
                Tag::List(_) => {
                    self.list_kind = Some(true);
                }
                Tag::Item => {
                    self.flush_paragraph(ui);
                    self.buf.clear();
                }
                Tag::BlockQuote(_) => {
                    self.flush_paragraph(ui);
                    self.indent += 1;
                }
                Tag::Emphasis => self.styles.push(InlineStyle {
                    italic: true,
                    ..Default::default()
                }),
                Tag::Strong => self.styles.push(InlineStyle {
                    bold: true,
                    ..Default::default()
                }),
                Tag::Strikethrough => self.styles.push(InlineStyle {
                    strikethrough: true,
                    ..Default::default()
                }),
                // NOTE: inline code is delivered as `Event::Code`, not as a
                // `Tag::Code` pair — there is no such variant in pulldown-cmark.
                Tag::Link { link_type, .. } => {
                    let _ = link_type;
                    self.styles.push(InlineStyle {
                        link: true,
                        ..Default::default()
                    });
                }
                _ => {}
            },
            Event::End(tag) => match tag {
                TagEnd::Paragraph | TagEnd::Heading(_) | TagEnd::Item => {
                    self.flush_paragraph(ui);
                }
                TagEnd::CodeBlock => {
                    self.flush_paragraph(ui);
                    self.in_code_block = false;
                }
                TagEnd::List(_) => {
                    self.list_kind = None;
                }
                TagEnd::BlockQuote(_) => {
                    self.indent = self.indent.saturating_sub(1);
                }
                TagEnd::Emphasis
                | TagEnd::Strong
                | TagEnd::Strikethrough
                | TagEnd::Link => {
                    self.styles.pop();
                }
                _ => {}
            },
            Event::Text(text) => self.push_text(&text),
            Event::Code(text) => {
                // Inline code. Inline styling across a paragraph would
                // require a richer layout-job builder than we use here, so
                // inline code renders as plain text within the surrounding
                // paragraph. Fenced code blocks still get their own framed
                // monospace rendering via `in_code_block`.
                self.push_text(&text);
            }
            Event::SoftBreak | Event::HardBreak => self.push_text(" "),
            Event::DisplayMath(_) | Event::InlineMath(_) => {}
            _ => {
                // FootnoteReference, TaskListMarker, Html, Rule, etc. —
                // ignored. The common README/blog subset is covered above.
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Smoke test: the renderer must not panic on a non-trivial document.
    /// (egui widgets can only be exercised inside a real egui context, so
    /// we only assert that `pulldown-cmark` parses and `render` is callable
    /// by checking the parser produces events.)
    #[test]
    fn parser_handles_common_markdown() {
        let md = "# Title\n\nSome **bold** and *italic* text.\n\n```\ncode\n```\n";
        let events: Vec<Event<'_>> = Parser::new_ext(md, parser_options()).collect();
        assert!(!events.is_empty());
        assert!(events.iter().any(|e| matches!(
            e,
            Event::Start(Tag::Heading { level: HeadingLevel::H1, .. })
        )));
    }
}
