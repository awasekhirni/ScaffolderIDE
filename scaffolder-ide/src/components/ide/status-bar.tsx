"use client";

/**
 * StatusBar.tsx
 *
 * Bottom status bar with: dirty indicator, language, encoding, EOL, Ln:Col,
 * Sel, words/chars/lines, selection count, current status message.
 * Refreshes position via polling Monaco (every 200ms) to avoid heavyweight
 * event subscriptions.
 */

import { useEffect, useState } from "react";
import { useIDE, useActiveDoc, EOL_LABEL } from "@/store/ide-store";
import { editorApi } from "./editor";
import { computeStats } from "@/lib/text-ops";
import { languageById } from "@/lib/languages";
import { formatBytes } from "@/lib/encoding";
import { Circle, Save, AlertCircle, CheckCircle2 } from "lucide-react";

export function StatusBar() {
  const doc = useActiveDoc();
  const status = useIDE((s) => s.statusMessage);
  const view = useIDE((s) => s.view);
  const [pos, setPos] = useState({ line: 1, column: 1 });
  const [sel, setSel] = useState<{ length: number; lines: number }>({ length: 0, lines: 0 });

  // Poll Monaco for cursor position + selection (every 150ms is cheap).
  useEffect(() => {
    const id = setInterval(() => {
      setPos(editorApi.getPosition());
      const selection = editorApi.getSelection();
      if (selection) {
        const lines = selection.split(/\r\n|\r|\n/).length;
        setSel({ length: selection.length, lines });
      } else {
        setSel({ length: 0, lines: 0 });
      }
    }, 150);
    return () => clearInterval(id);
  }, [doc?.id]);

  if (!doc) {
    return (
      <footer className="h-6 border-t border-border bg-muted/30 px-3 flex items-center text-[10px] text-muted-foreground">
        No document
      </footer>
    );
  }

  const stats = computeStats(doc.text);
  const lang = languageById(doc.language);

  return (
    <footer className="h-6 border-t border-border bg-muted/30 flex items-center text-[10px] text-muted-foreground gap-3 px-2 overflow-x-auto whitespace-nowrap">
      <span className="flex items-center gap-1 text-foreground">
        {doc.isDirty ? (
          <span className="flex items-center gap-1 text-amber-500"><Circle className="w-2 h-2 fill-current" /> Modified</span>
        ) : (
          <span className="flex items-center gap-1 text-emerald-500"><CheckCircle2 className="w-3 h-3" /> Saved</span>
        )}
      </span>
      <span className="text-border">|</span>
      <span>{lang?.label ?? doc.language}</span>
      <span className="text-border">|</span>
      <span>{doc.encoding}</span>
      <span className="text-border">|</span>
      <span>{EOL_LABEL[doc.eol]}</span>
      <span className="text-border">|</span>
      <span>Ln {pos.line}, Col {pos.column}</span>
      {sel.length > 0 && (
        <>
          <span className="text-border">|</span>
          <span>Sel {sel.length} ({sel.lines} line{sel.lines !== 1 ? "s" : ""})</span>
        </>
      )}
      <span className="text-border">|</span>
      <span>{stats.lines} lines</span>
      <span className="text-border">|</span>
      <span>{stats.words} words</span>
      <span className="text-border">|</span>
      <span>{stats.chars} chars</span>
      <span className="text-border">|</span>
      <span>{formatBytes(doc.size)}</span>
      {doc.isPinned && (
        <>
          <span className="text-border">|</span>
          <span className="text-primary">PINNED</span>
        </>
      )}
      <span className="ml-auto text-foreground/70">{status}</span>
    </footer>
  );
}
