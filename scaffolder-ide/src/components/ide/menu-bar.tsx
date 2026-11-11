"use client";

/**
 * MenuBar.tsx
 *
 * Top application menu: File / Edit / Selection / View / Document / Tools / Help.
 * All 50+ feature actions are wired here and also exposed via the Command Palette.
 *
 * The menu uses simple hover-popover menus rather than the radix menubar
 * because we need nested submenus for the Tools menu and radix's menubar
 * submenu support is fiddly. DropdownMenu handles nesting well.
 */

import { useEffect, useMemo, useState } from "react";
import {
  Menubar,
  MenubarMenu,
  MenubarTrigger,
  MenubarContent,
  MenubarItem,
  MenubarSeparator,
  MenubarSub,
  MenubarSubTrigger,
  MenubarSubContent,
} from "@/components/ui/menubar";
import { useIDE, THEME_OPTIONS, EOL_LABEL, type Eol } from "@/store/ide-store";
import { editorApi } from "./editor";
import * as textOps from "@/lib/text-ops";
import * as enc from "@/lib/encoding";
import * as fmt from "@/lib/formatters";
import { LANGUAGES } from "@/lib/languages";

interface MenuItemDef {
  label: string;
  shortcut?: string;
  action: () => void;
  separatorAfter?: boolean;
  disabled?: boolean;
}

function run<T>(fn: () => T, label?: string): void {
  try {
    fn();
  } catch (e) {
    useIDE.getState().toast("error", label ? `${label}: ${(e as Error).message}` : (e as Error).message);
  }
}

export function MenuBar() {
  const ide = useIDE();
  const { docs, activeId, view, recents, search } = ide;
  const active = docs.find((d) => d.id === activeId) ?? null;

  // ─── File actions ───────────────────────────────────────────────────────
  const fileItems: MenuItemDef[] = [
    { label: "New File", shortcut: "Ctrl+N", action: () => ide.newDoc() },
    { label: "Open File…", shortcut: "Ctrl+O", action: () => {
        const input = document.createElement("input");
        input.type = "file";
        input.multiple = true;
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
      } },
    { label: "Save", shortcut: "Ctrl+S", action: () => active && ide.saveDoc(active.id), disabled: !active },
    { label: "Save As…", shortcut: "Ctrl+Shift+S", action: () => {
        if (!active) return;
        const name = window.prompt("Save as:", active.name);
        if (name) ide.saveAs(active.id, name);
      }, disabled: !active },
    { label: "Save All", shortcut: "Ctrl+Alt+S", action: () => ide.saveAll(), separatorAfter: true },
    { label: "Close Tab", shortcut: "Ctrl+W", action: () => active && ide.closeDoc(active.id), disabled: !active },
    { label: "Close Others", action: () => active && ide.closeOthers(active.id), disabled: !active },
    { label: "Close All", shortcut: "Ctrl+Shift+W", action: () => ide.closeAll(), separatorAfter: true },
    { label: "Reopen Closed Tab", shortcut: "Ctrl+Shift+T", action: () => ide.reopenClosed() },
  ];

  // ─── Edit actions ───────────────────────────────────────────────────────
  const editItems: MenuItemDef[] = [
    { label: "Undo", shortcut: "Ctrl+Z", action: () => editorApi.triggerAction("undo") },
    { label: "Redo", shortcut: "Ctrl+Y", action: () => editorApi.triggerAction("redo"), separatorAfter: true },
    { label: "Find…", shortcut: "Ctrl+F", action: () => ide.setSearch({ open: true }) },
    { label: "Replace…", shortcut: "Ctrl+H", action: () => ide.setSearch({ open: true }) },
    { label: "Find in Files", shortcut: "Ctrl+Shift+F", action: () => ide.setSearch({ open: true }), separatorAfter: true },
    { label: "Go to Line…", shortcut: "Ctrl+G", action: () => useIDE.setState({ gotoOpen: true }) },
    { label: "Go to Symbol…", shortcut: "Ctrl+Shift+O", action: () => editorApi.triggerAction("editor.action.quickCommand") },
    { label: "Command Palette", shortcut: "Ctrl+Shift+P", action: () => ide.openPalette(), separatorAfter: true },
    { label: "Duplicate Line", shortcut: "Ctrl+Shift+D", action: () => editorApi.triggerAction("editor.action.copyLinesDownAction") },
    { label: "Move Line Up", shortcut: "Alt+Up", action: () => editorApi.triggerAction("editor.action.moveLinesUpAction") },
    { label: "Move Line Down", shortcut: "Alt+Down", action: () => editorApi.triggerAction("editor.action.moveLinesDownAction") },
    { label: "Delete Line", shortcut: "Ctrl+Shift+K", action: () => editorApi.triggerAction("editor.action.deleteLines") },
    { label: "Toggle Line Comment", shortcut: "Ctrl+/", action: () => editorApi.triggerAction("editor.action.commentLine") },
    { label: "Toggle Block Comment", shortcut: "Ctrl+Shift+/", action: () => editorApi.triggerAction("editor.action.blockComment"), separatorAfter: true },
    { label: "Select All", shortcut: "Ctrl+A", action: () => editorApi.triggerAction("editor.action.selectAll") },
  ];

  // ─── Selection actions ─────────────────────────────────────────────────
  const selectionItems: MenuItemDef[] = [
    { label: "Expand Selection", shortcut: "Shift+Alt+→", action: () => editorApi.triggerAction("editor.action.smartSelect.expand") },
    { label: "Shrink Selection", shortcut: "Shift+Alt+←", action: () => editorApi.triggerAction("editor.action.smartSelect.shrink") },
    { label: "Add Cursor Above", action: () => editorApi.triggerAction("editor.action.insertCursorAbove") },
    { label: "Add Cursor Below", action: () => editorApi.triggerAction("editor.action.insertCursorBelow") },
    { label: "Add Cursors to Line Ends", shortcut: "Shift+Alt+I", action: () => editorApi.triggerAction("editor.action.insertCursorAtEndOfEachLineSelected") },
    { label: "Select Next Occurrence", shortcut: "Ctrl+D", action: () => editorApi.triggerAction("editor.action.addSelectionToNextFindMatch") },
    { label: "Select All Occurrences", shortcut: "Ctrl+Shift+L", action: () => editorApi.triggerAction("editor.action.selectHighlights"), separatorAfter: true },
    { label: "Copy Line Down", action: () => editorApi.triggerAction("editor.action.copyLinesDownAction") },
    { label: "Copy Line Up", action: () => editorApi.triggerAction("editor.action.copyLinesUpAction") },
  ];

  // ─── Text operations (most of our 50 new features live here) ────────────
  const transformMenu: MenuItemDef[] = [
    { label: "UPPERCASE", action: () => editorApi.transformSelection(textOps.toUpperCase) },
    { label: "lowercase", action: () => editorApi.transformSelection(textOps.toLowerCase) },
    { label: "Title Case", action: () => editorApi.transformSelection(textOps.toTitleCase) },
    { label: "Sentence case", action: () => editorApi.transformSelection(textOps.toSentenceCase) },
    { label: "camelCase", action: () => editorApi.transformSelection(textOps.toCamelCase) },
    { label: "PascalCase", action: () => editorApi.transformSelection(textOps.toPascalCase) },
    { label: "snake_case", action: () => editorApi.transformSelection(textOps.toSnakeCase) },
    { label: "CONSTANT_CASE", action: () => editorApi.transformSelection(textOps.toConstantCase) },
    { label: "kebab-case", action: () => editorApi.transformSelection(textOps.toKebabCase), separatorAfter: true },
    { label: "Trim Trailing Whitespace", action: () => editorApi.transformBuffer(textOps.trimTrailingWhitespace) },
    { label: "Trim Leading Whitespace", action: () => editorApi.transformBuffer(textOps.trimLeadingWhitespace) },
    { label: "Trim Both Ends (per line)", action: () => editorApi.transformBuffer(textOps.trimBothEndsPerLine) },
    { label: "Remove Empty Lines", action: () => editorApi.transformBuffer(textOps.removeEmptyLines) },
    { label: "Remove Duplicate Lines", action: () => {
        const result = editorApi.getSelection();
        if (result) {
          editorApi.transformSelection((t) => textOps.removeDuplicateLines(t).result);
        } else {
          editorApi.transformBuffer((t) => textOps.removeDuplicateLines(t).result);
        }
      } },
    { label: "Sort Lines A→Z", action: () => editorApi.transformBuffer((t) => textOps.sortLines(t, true)) },
    { label: "Sort Lines Z→A", action: () => editorApi.transformBuffer((t) => textOps.sortLines(t, false)) },
    { label: "Reverse Line Order", action: () => editorApi.transformBuffer(textOps.reverseLineOrder) },
    { label: "Shuffle Lines", action: () => editorApi.transformBuffer(textOps.shuffleLines), separatorAfter: true },
    { label: "Tabs → Spaces", action: () => editorApi.transformBuffer((t) => textOps.tabsToSpaces(t, view.tabSize)) },
    { label: "Spaces → Tabs", action: () => editorApi.transformBuffer((t) => textOps.spacesToTabs(t, view.tabSize)) },
    { label: "Reverse Text", action: () => editorApi.transformSelection(textOps.reverseText) },
    { label: "ROT13", action: () => editorApi.transformSelection(textOps.rot13) },
  ];

  const eolMenu: MenuItemDef[] = [
    { label: "Convert to CRLF (Windows)", action: () => editorApi.transformBuffer((t) => textOps.convertEol(t, "\r\n")) },
    { label: "Convert to LF (Unix)", action: () => editorApi.transformBuffer((t) => textOps.convertEol(t, "\n")) },
    { label: "Convert to CR (Classic Mac)", action: () => editorApi.transformBuffer((t) => textOps.convertEol(t, "\r")) },
  ];

  const encodeMenu: MenuItemDef[] = [
    { label: "Base64 Encode", action: () => editorApi.transformSelection(enc.base64Encode) },
    { label: "Base64 Decode", action: () => run(() => editorApi.transformSelection(enc.base64Decode)) },
    { label: "URL Encode", action: () => editorApi.transformSelection(enc.urlEncode) },
    { label: "URL Decode", action: () => run(() => editorApi.transformSelection(enc.urlDecode)) },
    { label: "HTML Escape", action: () => editorApi.transformSelection(enc.htmlEscape) },
    { label: "HTML Unescape", action: () => editorApi.transformSelection(enc.htmlUnescape) },
    { label: "Hex Encode", action: () => editorApi.transformSelection(enc.hexEncode) },
    { label: "Hex Decode", action: () => run(() => editorApi.transformSelection(enc.hexDecode)) },
    { label: "Binary Encode", action: () => editorApi.transformSelection(enc.textToBinary) },
    { label: "Binary Decode", action: () => run(() => editorApi.transformSelection(enc.binaryToText)) },
  ];

  const formatMenu: MenuItemDef[] = [
    { label: "Format Document (Monaco)", shortcut: "Shift+Alt+F", action: () => editorApi.format() },
    { label: "JSON Beautify (2-space)", action: () => run(() => editorApi.transformBuffer((t) => fmt.jsonBeautify(t, 2)), "JSON Beautify") },
    { label: "JSON Beautify (4-space)", action: () => run(() => editorApi.transformBuffer((t) => fmt.jsonBeautify(t, 4)), "JSON Beautify") },
    { label: "JSON Minify", action: () => run(() => editorApi.transformBuffer(fmt.jsonMinify), "JSON Minify") },
    { label: "JSON Validate", action: () => {
        const r = fmt.jsonValidate(active?.text ?? "");
        if (r.ok) ide.toast("success", "Valid JSON");
        else ide.toast("error", `Invalid JSON${r.line ? ` at ${r.line}:${r.column}` : ""}: ${r.error}`);
      } },
    { label: "XML / HTML Beautify", action: () => editorApi.transformBuffer((t) => fmt.xmlBeautify(t, view.tabSize)) },
    { label: "SQL Format", action: () => editorApi.transformBuffer((t) => fmt.sqlFormat(t, view.tabSize)) },
    { label: "CSS Beautify", action: () => editorApi.transformBuffer((t) => fmt.cssBeautify(t, view.tabSize)) },
    { label: "CSS Minify", action: () => editorApi.transformBuffer(fmt.cssMinify) },
    { label: "JS/TS Minify (whitespace)", action: () => editorApi.transformBuffer(fmt.jsMinifyWhitespace) },
    { label: "Markdown → HTML (preview)", action: () => useIDE.setState({ markdownOpen: true }) },
  ];

  const insertMenu: MenuItemDef[] = [
    { label: "Snippet Library…", action: () => useIDE.setState({ snippetsOpen: true }) },
    { label: "Timestamp (ISO-8601)", action: () => {
        const iso = new Date().toISOString();
        editorApi.insertText(iso);
      } },
    { label: "Timestamp (Local)", action: () => {
        const local = new Date().toLocaleString();
        editorApi.insertText(local);
      } },
    { label: "Timestamp (UTC YYYY-MM-DD HH:MM:SS)", action: () => {
        const d = new Date();
        const utc = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")} ${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}:${String(d.getUTCSeconds()).padStart(2, "0")}`;
        editorApi.insertText(utc);
      } },
    { label: "Lorem Ipsum (1 paragraph)", action: () => {
        editorApi.insertText("Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.");
      } },
    { label: "Lorem Ipsum (5 paragraphs)", action: () => {
        const para = "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.";
        editorApi.insertText(Array(5).fill(para).join("\n\n"));
      } },
    { label: "UUID v4", action: () => {
        const uuid = (crypto as Crypto & { randomUUID: () => string }).randomUUID?.() ?? "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
          const r = Math.random() * 16 | 0;
          const v = c === "x" ? r : (r & 0x3) | 0x8;
          return v.toString(16);
        });
        editorApi.insertText(uuid);
      } },
  ];

  // ─── View actions ───────────────────────────────────────────────────────
  const viewItems: MenuItemDef[] = [
    { label: "Zoom In", shortcut: "Ctrl+=", action: () => ide.zoomIn() },
    { label: "Zoom Out", shortcut: "Ctrl+-", action: () => ide.zoomOut() },
    { label: "Reset Zoom", shortcut: "Ctrl+0", action: () => ide.zoomReset(), separatorAfter: true },
    { label: view.wordWrap ? "✓ Word Wrap" : "  Word Wrap", shortcut: "Alt+Z", action: () => ide.setView("wordWrap", !view.wordWrap) },
    { label: view.showLineNumbers ? "✓ Line Numbers" : "  Line Numbers", action: () => ide.setView("showLineNumbers", !view.showLineNumbers) },
    { label: view.showMinimap ? "✓ Minimap" : "  Minimap", shortcut: "Ctrl+M", action: () => ide.setView("showMinimap", !view.showMinimap) },
    { label: view.showIndentGuides ? "✓ Indent Guides" : "  Indent Guides", action: () => ide.setView("showIndentGuides", !view.showIndentGuides) },
    { label: view.bracketPairColorization ? "✓ Bracket Pair Color" : "  Bracket Pair Color", action: () => ide.setView("bracketPairColorization", !view.bracketPairColorization) },
    { label: view.highlightActiveLine ? "✓ Highlight Active Line" : "  Highlight Active Line", action: () => ide.setView("highlightActiveLine", !view.highlightActiveLine) },
    { label: view.autoClosingBrackets ? "✓ Auto-Close Brackets" : "  Auto-Close Brackets", action: () => ide.setView("autoClosingBrackets", !view.autoClosingBrackets) },
    { label: view.fontLigatures ? "✓ Font Ligatures" : "  Font Ligatures", action: () => ide.setView("fontLigatures", !view.fontLigatures), separatorAfter: true },
    { label: "Render Whitespace: None", action: () => ide.setView("renderWhitespace", "none") },
    { label: "Render Whitespace: Boundary", action: () => ide.setView("renderWhitespace", "boundary") },
    { label: "Render Whitespace: All", action: () => ide.setView("renderWhitespace", "all"), separatorAfter: true },
    { label: "Markdown Preview", action: () => useIDE.setState({ markdownOpen: true }) },
    { label: "HTML Preview", action: () => useIDE.setState({ htmlPreviewOpen: true }) },
    { label: "Diff vs Saved", action: () => useIDE.setState({ diffOpen: true }) },
    { label: "Document Statistics", action: () => useIDE.setState({ statsOpen: true }) },
    { label: "File Properties", action: () => useIDE.setState({ propertiesOpen: true }) },
    { label: "Multi-Clipboard History", action: () => useIDE.setState({ clipboardOpen: true }) },
    { label: "Keyboard Shortcuts", shortcut: "Ctrl+K Ctrl+S", action: () => useIDE.setState({ shortcutsOpen: true }) },
  ];

  const helpItems: MenuItemDef[] = [
    { label: "About Scaffolder IDE", action: () => useIDE.setState({ aboutOpen: true }) },
    { label: "Command Palette", shortcut: "Ctrl+Shift+P", action: () => ide.openPalette() },
  ];

  function renderItems(items: MenuItemDef[]) {
    return items.map((item, i) => (
      <div key={i}>
        <MenubarItem
          disabled={item.disabled}
          onClick={() => run(item.action, item.label)}
          className="flex items-center justify-between gap-6"
        >
          <span>{item.label}</span>
          {item.shortcut && (
            <span className="text-[10px] text-muted-foreground font-mono">{item.shortcut}</span>
          )}
        </MenubarItem>
        {item.separatorAfter && <MenubarSeparator />}
      </div>
    ));
  }

  function renderSubmenu(label: string, items: MenuItemDef[]) {
    return (
      <MenubarSub>
        <MenubarSubTrigger>{label}</MenubarSubTrigger>
        <MenubarSubContent className="min-w-[240px]">
          {renderItems(items)}
        </MenubarSubContent>
      </MenubarSub>
    );
  }

  return (
    <div className="border-b border-border bg-background">
      <Menubar className="rounded-none border-0 h-9">
        <MenubarMenu>
          <MenubarTrigger>File</MenubarTrigger>
          <MenubarContent className="min-w-[260px]">
            {renderItems(fileItems)}
            <MenubarSeparator />
            <MenubarSub>
              <MenubarSubTrigger>Recent Files</MenubarSubTrigger>
              <MenubarSubContent>
                {recents.length === 0 ? (
                  <MenubarItem disabled>No recent files</MenubarItem>
                ) : (
                  recents.map((r) => (
                    <MenubarItem key={r.path} onClick={() => ide.openRecent(r.path)}>
                      {r.name}
                    </MenubarItem>
                  ))
                )}
              </MenubarSubContent>
            </MenubarSub>
          </MenubarContent>
        </MenubarMenu>

        <MenubarMenu>
          <MenubarTrigger>Edit</MenubarTrigger>
          <MenubarContent className="min-w-[280px]">{renderItems(editItems)}</MenubarContent>
        </MenubarMenu>

        <MenubarMenu>
          <MenubarTrigger>Selection</MenubarTrigger>
          <MenubarContent className="min-w-[260px]">{renderItems(selectionItems)}</MenubarContent>
        </MenubarMenu>

        <MenubarMenu>
          <MenubarTrigger>Text</MenubarTrigger>
          <MenubarContent className="min-w-[260px]">
            {renderSubmenu("Case Conversion", transformMenu.slice(0, 9))}
            {renderSubmenu("Whitespace", transformMenu.slice(9, 14))}
            {renderSubmenu("Sort & Order", transformMenu.slice(14, 18))}
            {renderSubmenu("Indentation", transformMenu.slice(18, 20))}
            {renderSubmenu("Misc", transformMenu.slice(20))}
            <MenubarSeparator />
            {renderSubmenu("Line Endings", eolMenu)}
          </MenubarContent>
        </MenubarMenu>

        <MenubarMenu>
          <MenubarTrigger>Tools</MenubarTrigger>
          <MenubarContent className="min-w-[260px]">
            {renderSubmenu("Encode", encodeMenu)}
            {renderSubmenu("Format", formatMenu)}
            {renderSubmenu("Insert", insertMenu)}
          </MenubarContent>
        </MenubarMenu>

        <MenubarMenu>
          <MenubarTrigger>View</MenubarTrigger>
          <MenubarContent className="min-w-[300px]">
            {renderItems(viewItems.slice(0, 3))}
            <MenubarSeparator />
            {renderItems(viewItems.slice(3, 12))}
            <MenubarSeparator />
            {renderSubmenu("Theme", THEME_OPTIONS.map(t => ({
              label: (view.theme === t.id ? "✓ " : "  ") + t.label,
              action: () => ide.setTheme(t.id),
            })))}
            {renderSubmenu("Language", LANGUAGES.map(l => ({
              label: (active?.language === l.id ? "✓ " : "  ") + l.label,
              action: () => {
                if (!active) return;
                // Switch language on the model.
                const monaco = (window as unknown as { monaco?: unknown }).monaco;
                void monaco;
                // We just update doc.language; Monaco picks it up from path.
                useIDE.setState((s) => ({
                  docs: s.docs.map((d) => d.id === active.id ? { ...d, language: l.id } : d),
                }));
              },
            })))}
            <MenubarSeparator />
            {renderItems(viewItems.slice(12))}
          </MenubarContent>
        </MenubarMenu>

        <MenubarMenu>
          <MenubarTrigger>Help</MenubarTrigger>
          <MenubarContent>{renderItems(helpItems)}</MenubarContent>
        </MenubarMenu>

        <div className="ml-auto flex items-center gap-2 px-3 text-[10px] text-muted-foreground">
          <span>Scaffolder IDE v1.0</span>
        </div>
      </Menubar>
    </div>
  );
}
