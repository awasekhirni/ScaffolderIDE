"use client";

/**
 * CommandPalette.tsx
 *
 * Fuzzy-searchable command palette (Ctrl+Shift+P) covering every menu action
 * plus dynamic commands for snippet insertion, recent files, themes.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { useIDE } from "@/store/ide-store";
import { editorApi } from "./editor";
import * as textOps from "@/lib/text-ops";
import * as enc from "@/lib/encoding";
import * as fmt from "@/lib/formatters";
import { SHORTCUTS } from "@/lib/shortcuts";
import { THEME_OPTIONS } from "@/store/ide-store";
import {
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandSeparator,
} from "@/components/ui/command";

function score(query: string, target: string): number {
  if (!query) return 1;
  const q = query.toLowerCase();
  const t = target.toLowerCase();
  if (t.startsWith(q)) return 100;
  if (t.includes(q)) return 50;
  // Fuzzy: every char in q must appear in order in t.
  let qi = 0;
  for (let i = 0; i < t.length && qi < q.length; i++) {
    if (t[i] === q[qi]) qi++;
  }
  return qi === q.length ? 10 : -1;
}

export function CommandPalette() {
  const open = useIDE((s) => s.paletteOpen);
  const setOpen = useIDE((s) => s.closePalette);
  const ide = useIDE();
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (!open) setQuery("");
  }, [open]);

  // Build command list dynamically each open.
  const commands = useMemo(() => {
    const cmds: { id: string; label: string; category: string; shortcut?: string; run: () => void }[] = [];

    // File
    cmds.push({ id: "file.new", label: "New File", category: "File", run: () => ide.newDoc() });
    cmds.push({ id: "file.open", label: "Open File…", category: "File", run: () => {
      const input = document.createElement("input");
      input.type = "file"; input.multiple = true;
      input.onchange = () => {
        if (!input.files) return;
        Array.from(input.files).forEach((file) => {
          const reader = new FileReader();
          reader.onload = () => {
            const text = typeof reader.result === "string" ? reader.result : "";
            ide.openFromText(file.name, `/upload/${file.name}`, text);
          };
          reader.readAsText(file);
        });
      };
      input.click();
    } });
    cmds.push({ id: "file.save", label: "Save", category: "File", run: () => ide.activeId && ide.saveDoc(ide.activeId) });
    cmds.push({ id: "file.saveAs", label: "Save As…", category: "File", run: () => {
      const active = ide.docs.find((d) => d.id === ide.activeId);
      if (!active) return;
      const name = window.prompt("Save as:", active.name);
      if (name) ide.saveAs(active.id, name);
    } });
    cmds.push({ id: "file.saveAll", label: "Save All", category: "File", run: () => ide.saveAll() });
    cmds.push({ id: "file.close", label: "Close Tab", category: "File", run: () => ide.activeId && ide.closeDoc(ide.activeId) });
    cmds.push({ id: "file.closeAll", label: "Close All", category: "File", run: () => ide.closeAll() });
    cmds.push({ id: "file.reopenClosed", label: "Reopen Closed Tab", category: "File", run: () => ide.reopenClosed() });

    // Edit
    cmds.push({ id: "edit.find", label: "Find…", category: "Edit", run: () => ide.setSearch({ open: true }) });
    cmds.push({ id: "edit.replace", label: "Replace…", category: "Edit", run: () => ide.setSearch({ open: true }) });
    cmds.push({ id: "edit.gotoLine", label: "Go to Line…", category: "Edit", run: () => useIDE.setState({ gotoOpen: true }) });
    cmds.push({ id: "edit.undo", label: "Undo", category: "Edit", run: () => editorApi.triggerAction("undo") });
    cmds.push({ id: "edit.redo", label: "Redo", category: "Edit", run: () => editorApi.triggerAction("redo") });
    cmds.push({ id: "edit.duplicateLine", label: "Duplicate Line", category: "Edit", run: () => editorApi.triggerAction("editor.action.copyLinesDownAction") });
    cmds.push({ id: "edit.moveUp", label: "Move Line Up", category: "Edit", run: () => editorApi.triggerAction("editor.action.moveLinesUpAction") });
    cmds.push({ id: "edit.moveDown", label: "Move Line Down", category: "Edit", run: () => editorApi.triggerAction("editor.action.moveLinesDownAction") });
    cmds.push({ id: "edit.deleteLine", label: "Delete Line", category: "Edit", run: () => editorApi.triggerAction("editor.action.deleteLines") });
    cmds.push({ id: "edit.commentLine", label: "Toggle Line Comment", category: "Edit", run: () => editorApi.triggerAction("editor.action.commentLine") });
    cmds.push({ id: "edit.blockComment", label: "Toggle Block Comment", category: "Edit", run: () => editorApi.triggerAction("editor.action.blockComment") });
    cmds.push({ id: "edit.format", label: "Format Document", category: "Edit", run: () => editorApi.format() });
    cmds.push({ id: "edit.selectAll", label: "Select All", category: "Edit", run: () => editorApi.triggerAction("editor.action.selectAll") });

    // Text transforms
    const transforms: { label: string; fn: (t: string) => string }[] = [
      { label: "UPPERCASE", fn: textOps.toUpperCase },
      { label: "lowercase", fn: textOps.toLowerCase },
      { label: "Title Case", fn: textOps.toTitleCase },
      { label: "Sentence case", fn: textOps.toSentenceCase },
      { label: "camelCase", fn: textOps.toCamelCase },
      { label: "PascalCase", fn: textOps.toPascalCase },
      { label: "snake_case", fn: textOps.toSnakeCase },
      { label: "CONSTANT_CASE", fn: textOps.toConstantCase },
      { label: "kebab-case", fn: textOps.toKebabCase },
      { label: "Reverse Text", fn: textOps.reverseText },
      { label: "ROT13", fn: textOps.rot13 },
      { label: "Trim Trailing Whitespace", fn: textOps.trimTrailingWhitespace },
      { label: "Trim Leading Whitespace", fn: textOps.trimLeadingWhitespace },
      { label: "Trim Both Ends (per line)", fn: textOps.trimBothEndsPerLine },
      { label: "Remove Empty Lines", fn: textOps.removeEmptyLines },
      { label: "Sort Lines A→Z", fn: (t) => textOps.sortLines(t, true) },
      { label: "Sort Lines Z→A", fn: (t) => textOps.sortLines(t, false) },
      { label: "Reverse Line Order", fn: textOps.reverseLineOrder },
      { label: "Shuffle Lines", fn: textOps.shuffleLines },
      { label: "Tabs → Spaces", fn: (t) => textOps.tabsToSpaces(t, ide.view.tabSize) },
      { label: "Spaces → Tabs", fn: (t) => textOps.spacesToTabs(t, ide.view.tabSize) },
    ];
    transforms.forEach((t) => {
      cmds.push({
        id: `text.${t.label}`,
        label: t.label,
        category: "Text",
        run: () => editorApi.transformSelection(t.fn),
      });
    });

    // EOL
    cmds.push({ id: "eol.crlf", label: "Convert EOL to CRLF (Windows)", category: "Line Endings", run: () => editorApi.transformBuffer((t) => textOps.convertEol(t, "\r\n")) });
    cmds.push({ id: "eol.lf", label: "Convert EOL to LF (Unix)", category: "Line Endings", run: () => editorApi.transformBuffer((t) => textOps.convertEol(t, "\n")) });
    cmds.push({ id: "eol.cr", label: "Convert EOL to CR (Classic Mac)", category: "Line Endings", run: () => editorApi.transformBuffer((t) => textOps.convertEol(t, "\r")) });

    // Encoders
    const encoders: { label: string; fn: (t: string) => string }[] = [
      { label: "Base64 Encode", fn: enc.base64Encode },
      { label: "Base64 Decode", fn: enc.base64Decode },
      { label: "URL Encode", fn: enc.urlEncode },
      { label: "URL Decode", fn: enc.urlDecode },
      { label: "HTML Escape", fn: enc.htmlEscape },
      { label: "HTML Unescape", fn: enc.htmlUnescape },
      { label: "Hex Encode", fn: enc.hexEncode },
      { label: "Hex Decode", fn: enc.hexDecode },
      { label: "Binary Encode", fn: enc.textToBinary },
      { label: "Binary Decode", fn: enc.binaryToText },
    ];
    encoders.forEach((e) => cmds.push({ id: `enc.${e.label}`, label: e.label, category: "Encode", run: () => { try { editorApi.transformSelection(e.fn); } catch (err) { ide.toast("error", (err as Error).message); } } }));

    // Formatters
    const formatters: { label: string; fn: (t: string) => string }[] = [
      { label: "JSON Beautify (2-space)", fn: (t) => fmt.jsonBeautify(t, 2) },
      { label: "JSON Beautify (4-space)", fn: (t) => fmt.jsonBeautify(t, 4) },
      { label: "JSON Minify", fn: fmt.jsonMinify },
      { label: "XML / HTML Beautify", fn: (t) => fmt.xmlBeautify(t, ide.view.tabSize) },
      { label: "SQL Format", fn: (t) => fmt.sqlFormat(t, ide.view.tabSize) },
      { label: "CSS Beautify", fn: (t) => fmt.cssBeautify(t, ide.view.tabSize) },
      { label: "CSS Minify", fn: fmt.cssMinify },
      { label: "JS/TS Minify (whitespace)", fn: fmt.jsMinifyWhitespace },
    ];
    formatters.forEach((f) => cmds.push({ id: `fmt.${f.label}`, label: f.label, category: "Format", run: () => { try { editorApi.transformBuffer(f.fn); } catch (err) { ide.toast("error", `${f.label}: ${(err as Error).message}`); } } }));

    // Insert
    cmds.push({ id: "insert.iso", label: "Insert Timestamp (ISO-8601)", category: "Insert", run: () => editorApi.insertText(new Date().toISOString()) });
    cmds.push({ id: "insert.local", label: "Insert Timestamp (Local)", category: "Insert", run: () => editorApi.insertText(new Date().toLocaleString()) });
    cmds.push({ id: "insert.uuid", label: "Insert UUID v4", category: "Insert", run: () => editorApi.insertText((crypto as Crypto & { randomUUID: () => string }).randomUUID?.() ?? "") });
    cmds.push({ id: "insert.lorem1", label: "Insert Lorem Ipsum (1 paragraph)", category: "Insert", run: () => editorApi.insertText("Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.") });

    // Snippets
    ide.snippets.forEach((s) => cmds.push({
      id: `snippet.${s.id}`,
      label: `Insert Snippet: ${s.title}`,
      category: "Snippets",
      run: () => ide.insertSnippet(s.id),
    }));

    // View toggles
    cmds.push({ id: "view.toggleWrap", label: "Toggle Word Wrap", category: "View", run: () => ide.setView("wordWrap", !ide.view.wordWrap) });
    cmds.push({ id: "view.toggleMinimap", label: "Toggle Minimap", category: "View", run: () => ide.setView("showMinimap", !ide.view.showMinimap) });
    cmds.push({ id: "view.toggleLineNumbers", label: "Toggle Line Numbers", category: "View", run: () => ide.setView("showLineNumbers", !ide.view.showLineNumbers) });
    cmds.push({ id: "view.toggleIndentGuides", label: "Toggle Indent Guides", category: "View", run: () => ide.setView("showIndentGuides", !ide.view.showIndentGuides) });
    cmds.push({ id: "view.toggleBracketColor", label: "Toggle Bracket Pair Colorization", category: "View", run: () => ide.setView("bracketPairColorization", !ide.view.bracketPairColorization) });
    cmds.push({ id: "view.zoomIn", label: "Zoom In", category: "View", run: () => ide.zoomIn() });
    cmds.push({ id: "view.zoomOut", label: "Zoom Out", category: "View", run: () => ide.zoomOut() });
    cmds.push({ id: "view.zoomReset", label: "Reset Zoom", category: "View", run: () => ide.zoomReset() });
    cmds.push({ id: "view.markdownPreview", label: "Markdown Preview", category: "View", run: () => useIDE.setState({ markdownOpen: true }) });
    cmds.push({ id: "view.htmlPreview", label: "HTML Preview", category: "View", run: () => useIDE.setState({ htmlPreviewOpen: true }) });
    cmds.push({ id: "view.diff", label: "Diff vs Saved", category: "View", run: () => useIDE.setState({ diffOpen: true }) });
    cmds.push({ id: "view.stats", label: "Document Statistics", category: "View", run: () => useIDE.setState({ statsOpen: true }) });
    cmds.push({ id: "view.properties", label: "File Properties", category: "View", run: () => useIDE.setState({ propertiesOpen: true }) });
    cmds.push({ id: "view.clipboard", label: "Multi-Clipboard History", category: "View", run: () => useIDE.setState({ clipboardOpen: true }) });
    cmds.push({ id: "view.snippets", label: "Snippet Library", category: "View", run: () => useIDE.setState({ snippetsOpen: true }) });
    cmds.push({ id: "view.shortcuts", label: "Keyboard Shortcuts Reference", category: "View", run: () => useIDE.setState({ shortcutsOpen: true }) });
    cmds.push({ id: "view.about", label: "About Scaffolder IDE", category: "Help", run: () => useIDE.setState({ aboutOpen: true }) });

    // Themes
    THEME_OPTIONS.forEach((t) => cmds.push({ id: `theme.${t.id}`, label: `Theme: ${t.label}`, category: "Theme", run: () => ide.setTheme(t.id) }));

    // Recent files
    ide.recents.forEach((r) => cmds.push({ id: `recent.${r.path}`, label: `Open Recent: ${r.name}`, category: "Recent", run: () => ide.openRecent(r.path) }));

    // Bookmark commands
    cmds.push({ id: "bookmark.clear", label: "Clear All Bookmarks", category: "Bookmarks", run: () => useIDE.setState((s) => ({ docs: s.docs.map((d) => ({ ...d, bookmarks: [] })) })) });

    // Attach shortcut hints.
    const byId = new Map(cmds.map((c) => [c.id, c]));
    for (const sc of SHORTCUTS) {
      const c = byId.get(sc.id);
      if (c) c.shortcut = sc.combo;
    }

    return cmds;
  }, [open, ide.docs, ide.recents, ide.view.tabSize, ide.snippets]);

  // Filter + sort by fuzzy score.
  const filtered = useMemo(() => {
    if (!query) return commands.slice(0, 80);
    const scored = commands
      .map((c) => ({ c, s: score(query, `${c.category} ${c.label}`) }))
      .filter((x) => x.s >= 0)
      .sort((a, b) => b.s - a.s)
      .slice(0, 80)
      .map((x) => x.c);
    return scored;
  }, [query, commands]);

  // Group by category for display.
  const grouped = useMemo(() => {
    const groups: Record<string, typeof filtered> = {};
    for (const c of filtered) {
      (groups[c.category] ??= []).push(c);
    }
    return groups;
  }, [filtered]);

  return (
    <CommandDialog open={open} onOpenChange={(o) => { if (!o) setOpen(); }}>
      <CommandInput placeholder="Type a command…" value={query} onValueChange={setQuery} />
      <CommandList>
        <CommandEmpty>No matching commands.</CommandEmpty>
        {Object.entries(grouped).map(([cat, items]) => (
          <CommandGroup key={cat} heading={cat}>
            {items.map((c) => (
              <CommandItem
                key={c.id}
                value={`${c.category} ${c.label}`}
                onSelect={() => {
                  c.run();
                  setOpen();
                }}
                className="flex items-center justify-between"
              >
                <span>{c.label}</span>
                {c.shortcut && (
                  <span className="text-[10px] text-muted-foreground font-mono">{c.shortcut}</span>
                )}
              </CommandItem>
            ))}
          </CommandGroup>
        ))}
        <CommandSeparator />
      </CommandList>
    </CommandDialog>
  );
}
