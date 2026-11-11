"use client";

/**
 * FindReplaceDialog.tsx
 *
 * Floating find/replace widget anchored to the top-right of the editor.
 * Features: case sensitivity, regex, whole word, replace, replace all,
 * highlight matches via Monaco decorators.
 */

import { useEffect, useRef, useState } from "react";
import { useIDE } from "@/store/ide-store";
import { editorApi } from "./editor";
import { CaseSensitive, Regex, WholeWord, X, ChevronDown, ChevronUp, Replace } from "lucide-react";

export function FindReplaceDialog() {
  const search = useIDE((s) => s.search);
  const setSearch = useIDE((s) => s.setSearch);
  const toast = useIDE((s) => s.toast);
  const [matchCount, setMatchCount] = useState<number | null>(null);
  const findInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (search.open) {
      setTimeout(() => findInputRef.current?.focus(), 50);
      // Pre-fill with current selection if any.
      const sel = editorApi.getSelection();
      if (sel && sel.length > 0 && sel.length < 200) {
        setSearch({ query: sel });
      }
    }
  }, [search.open]);

  if (!search.open) return null;

  function escapeRegex(s: string): string {
    return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function buildNeedle(query: string): RegExp | string | null {
    if (!query) return null;
    if (search.regex) {
      try {
        const flags = search.caseSensitive ? "g" : "gi";
        if (search.wholeWord) {
          return new RegExp(`\\b${query}\\b`, flags);
        }
        return new RegExp(query, flags);
      } catch (e) {
        return null;
      }
    }
    const flags = search.caseSensitive ? "g" : "gi";
    const q = search.wholeWord ? `\\b${escapeRegex(query)}\\b` : escapeRegex(query);
    return new RegExp(q, flags);
  }

  function countMatches(): number {
    const text = editorApi.getModel()?.getValue() ?? "";
    const needle = buildNeedle(search.query);
    if (!needle) return 0;
    if (typeof needle === "string") return 0;
    const matches = text.match(needle);
    return matches ? matches.length : 0;
  }

  function findNext() {
    if (!search.query) return;
    const needle = buildNeedle(search.query);
    if (!needle) {
      toast("warning", "Invalid regular expression");
      return;
    }
    const ed = editorApi;
    ed.triggerAction("editor.action.nextMatch");
    setMatchCount(countMatches());
  }

  function findPrev() {
    if (!search.query) return;
    editorApi.triggerAction("editor.action.previousMatch");
    setMatchCount(countMatches());
  }

  function replaceNext() {
    if (!search.query) return;
    // Monaco's built-in replace action.
    const ed = editorApi;
    // We need to feed our find/replace state into Monaco.
    const model = ed.getModel();
    if (!model) return;
    const text = model.getValue();
    const needle = buildNeedle(search.query);
    if (!needle) return;
    if (typeof needle === "string") return;
    needle.lastIndex = 0;
    const m = needle.exec(text);
    if (!m) {
      toast("info", "No match");
      return;
    }
    // Compute replacement (handle $1, $& for regex).
    let replacement = search.replace;
    if (search.regex && m.length > 1) {
      replacement = replacement.replace(/\$(\d)/g, (_, n) => m[parseInt(n, 10)] ?? "");
    }
    replacement = replacement.replace(/\$&/g, m[0]);
    const start = model.getPositionAt(m.index);
    const end = model.getPositionAt(m.index + m[0].length);
    ed.getModel()!.applyEdits([{
      range: {
        startLineNumber: start.lineNumber,
        startColumn: start.column,
        endLineNumber: end.lineNumber,
        endColumn: end.column,
      } as never,
      text: replacement,
    }]);
    setMatchCount(countMatches());
  }

  function replaceAll() {
    if (!search.query) return;
    const ed = editorApi;
    const model = ed.getModel();
    if (!model) return;
    const text = model.getValue();
    const needle = buildNeedle(search.query);
    if (!needle) {
      toast("warning", "Invalid regular expression");
      return;
    }
    if (typeof needle === "string") return;
    needle.lastIndex = 0;
    let count = 0;
    let result = text.replace(needle, (match, ...args) => {
      count++;
      let replacement = search.replace;
      if (search.regex) {
        // $1..$9 — args has capture groups plus offset and string.
        for (let i = 0; i < args.length - 2; i++) {
          replacement = replacement.replaceAll(`$${i + 1}`, args[i] ?? "");
        }
        replacement = replacement.replaceAll("$&", match);
      }
      return replacement;
    });
    model.applyEdits([{
      range: model.getFullModelRange(),
      text: result,
      forceMoveMarkers: true,
    }]);
    toast("success", `Replaced ${count} occurrence${count !== 1 ? "s" : ""}`);
    setMatchCount(count);
  }

  return (
    <div className="absolute top-2 right-3 z-20 bg-background border border-border shadow-lg rounded-md w-[360px]">
      <div className="flex items-center justify-between px-2 py-1 border-b border-border bg-muted/30">
        <span className="text-xs font-semibold">Find &amp; Replace</span>
        <button
          onClick={() => setSearch({ open: false })}
          className="p-0.5 hover:bg-muted rounded"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
      <div className="p-2 space-y-2">
        <div className="flex items-center gap-1">
          <input
            ref={findInputRef}
            type="text"
            value={search.query}
            onChange={(e) => setSearch({ query: e.target.value })}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                if (e.shiftKey) { findPrev(); } else { findNext(); }
              }
              if (e.key === "Escape") setSearch({ open: false });
            }}
            placeholder="Find"
            className="flex-1 h-7 px-2 text-xs bg-background border border-input rounded focus:outline-none focus:ring-1 focus:ring-ring"
          />
          <button
            onClick={() => setSearch({ caseSensitive: !search.caseSensitive })}
            className={`p-1.5 rounded ${search.caseSensitive ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
            title="Match case"
          >
            <CaseSensitive className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => setSearch({ wholeWord: !search.wholeWord })}
            className={`p-1.5 rounded ${search.wholeWord ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
            title="Whole word"
          >
            <WholeWord className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => setSearch({ regex: !search.regex })}
            className={`p-1.5 rounded ${search.regex ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
            title="Regex"
          >
            <Regex className="w-3.5 h-3.5" />
          </button>
          <button onClick={findPrev} className="p-1.5 hover:bg-muted rounded" title="Previous (Shift+Enter)">
            <ChevronUp className="w-3.5 h-3.5" />
          </button>
          <button onClick={findNext} className="p-1.5 hover:bg-muted rounded" title="Next (Enter)">
            <ChevronDown className="w-3.5 h-3.5" />
          </button>
        </div>
        <div className="flex items-center gap-1">
          <input
            type="text"
            value={search.replace}
            onChange={(e) => setSearch({ replace: e.target.value })}
            onKeyDown={(e) => {
              if (e.key === "Enter") { e.preventDefault(); replaceNext(); }
              if (e.key === "Escape") setSearch({ open: false });
            }}
            placeholder="Replace"
            className="flex-1 h-7 px-2 text-xs bg-background border border-input rounded focus:outline-none focus:ring-1 focus:ring-ring"
          />
          <button
            onClick={replaceNext}
            className="px-2 h-7 text-xs hover:bg-muted rounded border border-input"
            title="Replace next (Enter)"
          >
            <Replace className="w-3.5 h-3.5 inline mr-1" />Rep
          </button>
          <button
            onClick={replaceAll}
            className="px-2 h-7 text-xs bg-primary text-primary-foreground hover:bg-primary/90 rounded"
          >
            All
          </button>
        </div>
        {matchCount !== null && (
          <div className="text-[10px] text-muted-foreground text-right">
            {matchCount} match{matchCount !== 1 ? "es" : ""}
          </div>
        )}
      </div>
    </div>
  );
}
