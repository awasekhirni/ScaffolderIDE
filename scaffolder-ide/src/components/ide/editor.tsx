"use client";

/**
 * editor.tsx
 *
 * Thin wrapper around @monaco-editor/react. We keep a module-level singleton
 * editor instance so any component can call editor actions (insert, transform,
 * format, goto) without prop drilling or context juggling.
 *
 * The store owns document text; Monaco is the source of truth for cursor
 * position, selection, and per-key input — we sync text back to the store
 * on every change.
 */

import { useRef, useEffect, useCallback, createContext, useContext, useMemo } from "react";
import Editor, { type OnMount, type BeforeMount } from "@monaco-editor/react";
import type * as Monaco from "monaco-editor";
import { useIDE, useActiveDoc } from "@/store/ide-store";

// ─── Module-level singleton ─────────────────────────────────────────────────
// We expose imperative helpers via `editorApi`. Components call these to drive
// the editor from menu items, palette, dialogs.

let _editor: Monaco.editor.IStandaloneCodeEditor | null = null;
let _monaco: typeof Monaco | null = null;

export interface EditorApi {
  insertText: (text: string) => void;
  transformBuffer: (fn: (text: string) => string) => void;
  transformSelection: (fn: (text: string) => string) => void;
  revealLine: (line: number) => void;
  getPosition: () => { line: number; column: number };
  getSelection: () => string;
  setBuffer: (text: string) => void;
  triggerAction: (id: string) => void;
  focus: () => void;
  format: () => void;
  getModel: () => Monaco.editor.ITextModel | null;
}

function noOp(): void {}

/** The imperative API used by menu/palette/dialogs. */
export const editorApi: EditorApi = {
  insertText: (text) => {
    if (!_editor) return;
    const sel = _editor.getSelection();
    const range = sel && !sel.isEmpty()
      ? sel
      : _editor.getModel()!.getFullModelRange();
    _editor.executeEdits("scaffolder", [{ range, text, forceMoveMarkers: true }]);
    _editor.focus();
  },
  transformBuffer: (fn) => {
    if (!_editor || !_editor.getModel()) return;
    const model = _editor.getModel()!;
    const before = model.getValue();
    const after = fn(before);
    if (after === before) return;
    // Use edit so undo works.
    _editor.executeEdits("scaffolder", [{
      range: model.getFullModelRange(),
      text: after,
      forceMoveMarkers: true,
    }]);
  },
  transformSelection: (fn) => {
    if (!_editor || !_editor.getModel()) return;
    const model = _editor.getModel()!;
    const sel = _editor.getSelection();
    if (!sel || sel.isEmpty()) {
      const before = model.getValue();
      const after = fn(before);
      if (after !== before) {
        _editor.executeEdits("scaffolder", [{
          range: model.getFullModelRange(),
          text: after,
          forceMoveMarkers: true,
        }]);
      }
    } else {
      const before = model.getValueInRange(sel);
      const after = fn(before);
      if (after !== before) {
        _editor.executeEdits("scaffolder", [{ range: sel, text: after, forceMoveMarkers: true }]);
      }
    }
    _editor.focus();
  },
  revealLine: (line) => {
    if (!_editor || !_editor.getModel()) return;
    const count = _editor.getModel()!.getLineCount();
    const target = Math.max(1, Math.min(line, count));
    _editor.revealLineInCenter(target);
    _editor.setPosition({ lineNumber: target, column: 1 });
    _editor.focus();
  },
  getPosition: () => {
    if (!_editor) return { line: 1, column: 1 };
    const pos = _editor.getPosition();
    return { line: pos?.lineNumber ?? 1, column: pos?.column ?? 1 };
  },
  getSelection: () => {
    if (!_editor) return "";
    const model = _editor.getModel();
    const sel = _editor.getSelection();
    if (!model || !sel || sel.isEmpty()) return "";
    return model.getValueInRange(sel);
  },
  setBuffer: (text) => {
    if (!_editor || !_editor.getModel()) return;
    _editor.getModel()!.setValue(text);
  },
  triggerAction: (id) => {
    if (!_editor) return;
    _editor.trigger("scaffolder", id, null);
    _editor.focus();
  },
  focus: () => _editor?.focus(),
  format: () => {
    if (!_editor) return;
    _editor.trigger("scaffolder", "editor.action.formatDocument", null);
    _editor.focus();
  },
  getModel: () => _editor?.getModel() ?? null,
};

// Backwards-compat alias used by some imports.
export const useEditorApi = (): EditorApi => editorApi;

// ─── Component ──────────────────────────────────────────────────────────────

export function MonacoEditor() {
  const doc = useActiveDoc();
  const view = useIDE((s) => s.view);
  const updateText = useIDE((s) => s.updateText);
  const pushClipboard = useIDE((s) => s.pushClipboard);
  const toggleBookmark = useIDE((s) => s.toggleBookmark);

  const onBeforeMount: BeforeMount = useCallback((monaco) => {
    _monaco = monaco;

    // Custom Scaffolder themes.
    monaco.editor.defineTheme("scaffolder-dark", {
      base: "vs-dark",
      inherit: true,
      rules: [
        { token: "comment",  foreground: "6b7280", fontStyle: "italic" },
        { token: "keyword",  foreground: "c084fc" },
        { token: "string",   foreground: "84cc16" },
        { token: "number",   foreground: "f59e0b" },
        { token: "type",     foreground: "38bdf8" },
      ],
      colors: {
        "editor.background": "#0b0e14",
        "editor.foreground": "#e6e6e6",
        "editorLineNumber.foreground": "#3a3f47",
        "editorLineNumber.activeForeground": "#9ca3af",
        "editor.selectionBackground": "#264f78aa",
        "editor.lineHighlightBackground": "#1a1f29",
        "editorCursor.foreground": "#e6e6e6",
        "editorIndentGuide.background": "#1f232b",
        "editorIndentGuide.activeBackground": "#374151",
      },
    });
    monaco.editor.defineTheme("scaffolder-light", {
      base: "vs",
      inherit: true,
      rules: [
        { token: "comment",  foreground: "6b7280", fontStyle: "italic" },
        { token: "keyword",  foreground: "7c3aed" },
        { token: "string",   foreground: "16a34a" },
        { token: "number",   foreground: "c2410c" },
        { token: "type",     foreground: "0284c7" },
      ],
      colors: {
        "editor.background": "#ffffff",
        "editor.foreground": "#1f2937",
        "editorLineNumber.foreground": "#9ca3af",
        "editorLineNumber.activeForeground": "#111827",
        "editor.lineHighlightBackground": "#f3f4f6",
      },
    });
  }, []);

  const onMount: OnMount = useCallback((editor, monaco) => {
    _editor = editor;
    _monaco = monaco;

    // Push copies/cuts to the multi-clipboard history.
    editor.onKeyDown((e) => {
      const ev = e.browserEvent;
      const isCopyOrCut = (ev.ctrlKey || ev.metaKey) && (ev.key === "c" || ev.key === "C" || ev.key === "x" || ev.key === "X");
      if (isCopyOrCut) {
        const sel = editor.getSelection();
        const model = editor.getModel();
        if (sel && model && !sel.isEmpty()) {
          pushClipboard(model.getValueInRange(sel));
        }
      }
    });

    // Bookmark toggle (Ctrl+F2).
    editor.addAction({
      id: "scaffolder.bookmark.toggle",
      label: "Toggle Bookmark",
      keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.F2],
      run: (ed) => {
        const pos = ed.getPosition();
        if (pos) {
          const active = useIDE.getState().activeId;
          if (active) toggleBookmark(active, pos.lineNumber);
        }
      },
    });

    // Next/Prev bookmark (F2 / Shift+F2).
    editor.addAction({
      id: "scaffolder.bookmark.next",
      label: "Next Bookmark",
      keybindings: [monaco.KeyCode.F2],
      run: (ed) => {
        const pos = ed.getPosition();
        if (pos) {
          const active = useIDE.getState().activeId;
          if (!active) return;
          const next = useIDE.getState().nextBookmark(active, pos.lineNumber);
          if (next) editorApi.revealLine(next);
        }
      },
    });
    editor.addAction({
      id: "scaffolder.bookmark.prev",
      label: "Previous Bookmark",
      keybindings: [monaco.KeyMod.Shift | monaco.KeyCode.F2],
      run: (ed) => {
        const pos = ed.getPosition();
        if (pos) {
          const active = useIDE.getState().activeId;
          if (!active) return;
          const prev = useIDE.getState().prevBookmark(active, pos.lineNumber);
          if (prev) editorApi.revealLine(prev);
        }
      },
    });

    editor.focus();
  }, [pushClipboard, toggleBookmark]);

  // Apply theme to Monaco when it changes.
  useEffect(() => {
    if (!_monaco) return;
    const theme =
      view.theme === "hc-black" ? "hc-black" :
      view.theme === "hc-light" ? "hc-light" :
      view.theme === "vs-light" ? "scaffolder-light" :
      "scaffolder-dark";
    _monaco.editor.setTheme(theme);
  }, [view.theme]);

  // Re-focus when active doc changes.
  useEffect(() => {
    if (doc?.id) _editor?.focus();
  }, [doc?.id]);

  if (!doc) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
        No document open. Press Ctrl+N to create one.
      </div>
    );
  }

  return (
    <Editor
      key={doc.id}
      path={doc.path ?? doc.name}
      defaultLanguage={doc.language}
      defaultValue={doc.text}
      theme={
        view.theme === "hc-black" ? "hc-black" :
        view.theme === "hc-light" ? "hc-light" :
        view.theme === "vs-light" ? "scaffolder-light" :
        "scaffolder-dark"
      }
      beforeMount={onBeforeMount}
      onMount={onMount}
      onChange={(value) => {
        if (value !== undefined) updateText(doc.id, value);
      }}
      options={{
        fontSize: view.fontSize,
        fontFamily: view.fontFamily,
        fontLigatures: view.fontLigatures,
        wordWrap: view.wordWrap ? "on" : "off",
        lineNumbers: view.showLineNumbers ? "on" : "off",
        minimap: { enabled: view.showMinimap },
        guides: {
          indentation: view.showIndentGuides,
          bracketPairs: view.bracketPairColorization,
        },
        renderWhitespace: view.renderWhitespace,
        bracketPairColorization: { enabled: view.bracketPairColorization },
        highlightActiveLine: view.highlightActiveLine,
        cursorBlinking: view.cursorBlinking,
        tabSize: view.tabSize,
        insertSpaces: view.insertSpaces,
        autoClosingBrackets: view.autoClosingBrackets ? "always" : "never",
        scrollBeyondLastLine: false,
        smoothScrolling: true,
        cursorSmoothCaretAnimation: "on",
        padding: { top: 12, bottom: 12 },
        renderLineHighlight: "all",
        roundedSelection: true,
        automaticLayout: true,
        formatOnPaste: true,
        formatOnType: true,
        stickyScroll: { enabled: true },
        linkedEditing: true,
      }}
      loading={
        <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
          Loading editor…
        </div>
      }
    />
  );
}
