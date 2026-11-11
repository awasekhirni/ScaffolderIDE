"use client";

/**
 * Dialogs.tsx
 *
 * One file containing all the modal dialogs:
 *  - Go to Line
 *  - Diff vs Saved
 *  - Markdown Preview
 *  - HTML Preview
 *  - File Properties
 *  - Document Statistics
 *  - Snippet Library
 *  - Multi-Clipboard History
 *  - Keyboard Shortcuts Reference
 *  - About
 *  - Toast
 */

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { useIDE, useActiveDoc, EOL_LABEL } from "@/store/ide-store";
import { editorApi } from "./editor";
import { computeStats } from "@/lib/text-ops";
import { formatBytes } from "@/lib/encoding";
import { languageById } from "@/lib/languages";
import { SHORTCUTS } from "@/lib/shortcuts";
import ReactMarkdown from "react-markdown";
import { Copy, Clipboard, Trash2, Search, Pin, Hash, Clock } from "lucide-react";

// ─── Go to Line ─────────────────────────────────────────────────────────────
export function GotoLineDialog() {
  const open = useIDE((s) => s.gotoOpen);
  const setOpen = (v: boolean) => useIDE.setState({ gotoOpen: v });
  const [line, setLine] = useState("");
  function go() {
    const n = parseInt(line, 10);
    if (Number.isFinite(n)) editorApi.revealLine(n);
    setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Go to Line</DialogTitle>
          <DialogDescription>Enter a line number (1-indexed).</DialogDescription>
        </DialogHeader>
        <Input
          key={open ? "open" : "closed"}
          autoFocus
          type="number"
          min={1}
          value={line}
          onChange={(e) => setLine(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") go(); }}
          placeholder="e.g. 42"
        />
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={go}>Go</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Diff vs Saved ─────────────────────────────────────────────────────────
export function DiffDialog() {
  const open = useIDE((s) => s.diffOpen);
  const setOpen = (v: boolean) => useIDE.setState({ diffOpen: v });
  const doc = useActiveDoc();
  if (!doc) return null;

  // Compute simple line diff.
  const oldLines = doc.originalText.split(/\r\n|\r|\n/);
  const newLines = doc.text.split(/\r\n|\r|\n/);
  const max = Math.max(oldLines.length, newLines.length);
  const rows: { tag: "equal" | "added" | "removed"; oldNo: number | null; newNo: number | null; old: string; new: string }[] = [];
  // LCS-style diff would be ideal; for now we do a naive positional comparison.
  for (let i = 0; i < max; i++) {
    const o = i < oldLines.length ? oldLines[i] : null;
    const n = i < newLines.length ? newLines[i] : null;
    if (o === null && n === null) continue;
    if (o === n) {
      rows.push({ tag: "equal", oldNo: i + 1, newNo: i + 1, old: o ?? "", new: n ?? "" });
    } else {
      if (o !== null) rows.push({ tag: "removed", oldNo: i + 1, newNo: null, old: o, new: "" });
      if (n !== null) rows.push({ tag: "added", oldNo: null, newNo: i + 1, old: "", new: n });
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-4xl max-h-[80vh]">
        <DialogHeader>
          <DialogTitle>Diff: {doc.name} (saved vs current)</DialogTitle>
          <DialogDescription>
            {rows.filter((r) => r.tag === "added").length} added, {" "}
            {rows.filter((r) => r.tag === "removed").length} removed
          </DialogDescription>
        </DialogHeader>
        <ScrollArea className="h-[60vh] border border-border rounded">
          <table className="w-full text-xs font-mono">
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} className={
                  r.tag === "added" ? "bg-emerald-500/10" :
                  r.tag === "removed" ? "bg-red-500/10" : ""
                }>
                  <td className="px-2 text-right text-muted-foreground w-10">{r.oldNo ?? ""}</td>
                  <td className="px-2 text-right text-muted-foreground w-10">{r.newNo ?? ""}</td>
                  <td className="px-2 whitespace-pre-wrap break-all">
                    <span className={
                      r.tag === "added" ? "text-emerald-600 dark:text-emerald-400" :
                      r.tag === "removed" ? "text-red-600 dark:text-red-400" : ""
                    }>
                      {r.tag === "added" ? "+ " : r.tag === "removed" ? "- " : "  "}
                      {r.tag === "added" ? r.new : r.old}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </ScrollArea>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Markdown Preview ──────────────────────────────────────────────────────
export function MarkdownPreviewDialog() {
  const open = useIDE((s) => s.markdownOpen);
  const setOpen = (v: boolean) => useIDE.setState({ markdownOpen: v });
  const doc = useActiveDoc();
  if (!doc) return null;
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-3xl max-h-[85vh]">
        <DialogHeader>
          <DialogTitle>Markdown Preview — {doc.name}</DialogTitle>
          <DialogDescription>Live-rendered Markdown.</DialogDescription>
        </DialogHeader>
        <ScrollArea className="h-[70vh] border border-border rounded p-4 prose prose-sm dark:prose-invert max-w-none">
          <ReactMarkdown
            components={{
              // Render code blocks with simple styling.
              code: ({ inline, className, children, ...props }) => {
                if (inline) {
                  return <code className={className} {...props}>{children}</code>;
                }
                return (
                  <pre className="bg-muted/40 p-3 rounded text-xs overflow-x-auto">
                    <code className={className} {...props}>{children}</code>
                  </pre>
                );
              },
            }}
          >
            {doc.text}
          </ReactMarkdown>
        </ScrollArea>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── HTML Preview ──────────────────────────────────────────────────────────
export function HtmlPreviewDialog() {
  const open = useIDE((s) => s.htmlPreviewOpen);
  const setOpen = (v: boolean) => useIDE.setState({ htmlPreviewOpen: v });
  const doc = useActiveDoc();
  if (!doc) return null;
  const src = doc.language === "html" ? doc.text : `<pre style="font-family:monospace;padding:1em">${doc.text.replace(/</g, "&lt;")}</pre>`;
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-4xl max-h-[85vh]">
        <DialogHeader>
          <DialogTitle>HTML Preview — {doc.name}</DialogTitle>
          <DialogDescription>Rendered in a sandboxed iframe.</DialogDescription>
        </DialogHeader>
        <iframe
          title="html-preview"
          sandbox="allow-scripts"
          srcDoc={src}
          className="w-full h-[70vh] bg-white border border-border rounded"
        />
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── File Properties ───────────────────────────────────────────────────────
export function PropertiesDialog() {
  const open = useIDE((s) => s.propertiesOpen);
  const setOpen = (v: boolean) => useIDE.setState({ propertiesOpen: v });
  const doc = useActiveDoc();
  if (!doc) return null;
  const stats = computeStats(doc.text);
  const lang = languageById(doc.language);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>File Properties</DialogTitle>
          <DialogDescription>Metadata for the active document.</DialogDescription>
        </DialogHeader>
        <div className="space-y-2 text-sm">
          <Row label="Name" value={doc.name} />
          <Row label="Path" value={doc.path ?? "(untitled)"} mono />
          <Row label="Language" value={lang?.label ?? doc.language} />
          <Row label="Encoding" value={doc.encoding} />
          <Row label="Line endings" value={EOL_LABEL[doc.eol]} />
          <Row label="Size" value={formatBytes(doc.size)} />
          <Row label="Lines" value={stats.lines.toString()} />
          <Row label="Words" value={stats.words.toString()} />
          <Row label="Characters" value={stats.chars.toString()} />
          <Row label="Characters (no spaces)" value={stats.charsNoSpaces.toString()} />
          <Row label="Paragraphs" value={stats.paragraphs.toString()} />
          <Row label="Longest line" value={`${stats.longestLine} chars`} />
          <Row label="Reading time" value={`${stats.readingTimeMin} min`} />
          <Row label="Bookmarks" value={doc.bookmarks.length.toString()} />
          <Row label="Last modified" value={doc.lastModified ? new Date(doc.lastModified).toLocaleString() : "—"} />
          <Row label="Dirty" value={doc.isDirty ? "Yes (unsaved)" : "No"} />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-muted-foreground">{label}</span>
      <span className={`text-right truncate ${mono ? "font-mono text-xs" : ""}`} title={value}>{value}</span>
    </div>
  );
}

// ─── Document Statistics ───────────────────────────────────────────────────
export function StatsDialog() {
  const open = useIDE((s) => s.statsOpen);
  const setOpen = (v: boolean) => useIDE.setState({ statsOpen: v });
  const doc = useActiveDoc();
  if (!doc) return null;
  const stats = computeStats(doc.text);
  // Word frequency (top 10).
  const freq: Record<string, number> = {};
  const words = doc.text.toLowerCase().match(/[a-z0-9']+/g) ?? [];
  for (const w of words) {
    if (w.length < 3) continue;
    freq[w] = (freq[w] ?? 0) + 1;
  }
  const top = Object.entries(freq).sort((a, b) => b[1] - a[1]).slice(0, 15);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Document Statistics</DialogTitle>
          <DialogDescription>{doc.name}</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-3 gap-2 text-center">
          <Stat label="Lines" value={stats.lines} />
          <Stat label="Words" value={stats.words} />
          <Stat label="Chars" value={stats.chars} />
          <Stat label="No-space" value={stats.charsNoSpaces} />
          <Stat label="Paragraphs" value={stats.paragraphs} />
          <Stat label="Reading" value={`${stats.readingTimeMin}m`} />
        </div>
        <div className="mt-4">
          <h4 className="text-xs font-semibold mb-2 text-muted-foreground">Top 15 word frequencies</h4>
          <div className="space-y-1">
            {top.map(([w, n]) => (
              <div key={w} className="flex items-center gap-2 text-xs">
                <span className="w-32 truncate font-mono">{w}</span>
                <div className="flex-1 h-3 bg-muted rounded overflow-hidden">
                  <div
                    className="h-full bg-primary/70"
                    style={{ width: `${(n / top[0][1]) * 100}%` }}
                  />
                </div>
                <span className="w-8 text-right text-muted-foreground">{n}</span>
              </div>
            ))}
            {top.length === 0 && (
              <div className="text-xs text-muted-foreground">No words with length ≥ 3.</div>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="border border-border rounded p-2">
      <div className="text-lg font-semibold">{value}</div>
      <div className="text-[10px] text-muted-foreground uppercase">{label}</div>
    </div>
  );
}

// ─── Snippet Library ───────────────────────────────────────────────────────
export function SnippetLibraryDialog() {
  const open = useIDE((s) => s.snippetsOpen);
  const setOpen = (v: boolean) => useIDE.setState({ snippetsOpen: v });
  const snippets = useIDE((s) => s.snippets);
  const insertSnippet = useIDE((s) => s.insertSnippet);
  const [filter, setFilter] = useState("");
  const [active, setActive] = useState<string | null>(snippets[0]?.id ?? null);

  const filtered = snippets.filter((s) =>
    !filter ||
    s.title.toLowerCase().includes(filter.toLowerCase()) ||
    s.language.includes(filter.toLowerCase()) ||
    s.description.toLowerCase().includes(filter.toLowerCase())
  );
  const current = snippets.find((s) => s.id === active) ?? filtered[0];

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-4xl max-h-[80vh]">
        <DialogHeader>
          <DialogTitle>Snippet Library</DialogTitle>
          <DialogDescription>Insert a ready-made code template into the active document.</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-[300px_1fr] gap-4 h-[60vh]">
          <div className="flex flex-col gap-2">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <Input
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder="Filter snippets…"
                className="pl-7 h-8 text-xs"
              />
            </div>
            <ScrollArea className="flex-1 border border-border rounded">
              <div className="divide-y divide-border">
                {filtered.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => setActive(s.id)}
                    className={`w-full text-left p-2 hover:bg-muted/50 ${active === s.id ? "bg-muted" : ""}`}
                  >
                    <div className="text-xs font-semibold">{s.title}</div>
                    <div className="text-[10px] text-muted-foreground truncate">{s.description}</div>
                    <Badge variant="outline" className="mt-1 text-[9px]">{s.language}</Badge>
                  </button>
                ))}
                {filtered.length === 0 && (
                  <div className="p-3 text-xs text-muted-foreground text-center">No matching snippets.</div>
                )}
              </div>
            </ScrollArea>
          </div>
          <ScrollArea className="border border-border rounded">
            <pre className="p-3 text-xs font-mono whitespace-pre-wrap">{current?.body}</pre>
          </ScrollArea>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Close</Button>
          <Button
            disabled={!current}
            onClick={() => {
              if (current) {
                insertSnippet(current.id);
                setOpen(false);
              }
            }}
          >
            Insert
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Multi-Clipboard History ───────────────────────────────────────────────
export function ClipboardHistoryDialog() {
  const open = useIDE((s) => s.clipboardOpen);
  const setOpen = (v: boolean) => useIDE.setState({ clipboardOpen: v });
  const clipboard = useIDE((s) => s.clipboard);
  const clearClipboard = useIDE((s) => s.clearClipboard);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-2xl max-h-[80vh]">
        <DialogHeader>
          <DialogTitle>Multi-Clipboard History</DialogTitle>
          <DialogDescription>Last 20 text copy/cut operations. Click to insert at cursor.</DialogDescription>
        </DialogHeader>
        <ScrollArea className="h-[60vh] border border-border rounded">
          <div className="divide-y divide-border">
            {clipboard.length === 0 && (
              <div className="p-6 text-center text-xs text-muted-foreground">
                <Clipboard className="w-8 h-8 mx-auto mb-2 opacity-30" />
                No clipboard history yet. Copy something in the editor to populate.
              </div>
            )}
            {clipboard.map((entry) => (
              <button
                key={entry.id}
                onClick={() => {
                  editorApi.insertText(entry.text);
                  setOpen(false);
                }}
                className="w-full text-left p-2 hover:bg-muted/50"
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {new Date(entry.ts).toLocaleTimeString()}
                  </span>
                  <Badge variant="outline" className="text-[9px]">{entry.text.length} chars</Badge>
                </div>
                <pre className="text-xs font-mono whitespace-pre-wrap break-all line-clamp-3">{entry.text}</pre>
              </button>
            ))}
          </div>
        </ScrollArea>
        <DialogFooter>
          <Button variant="outline" onClick={() => clearClipboard()} disabled={clipboard.length === 0}>
            <Trash2 className="w-3.5 h-3.5 mr-1" /> Clear
          </Button>
          <Button variant="outline" onClick={() => setOpen(false)}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Keyboard Shortcuts Reference ──────────────────────────────────────────
export function ShortcutsDialog() {
  const open = useIDE((s) => s.shortcutsOpen);
  const setOpen = (v: boolean) => useIDE.setState({ shortcutsOpen: v });
  const [filter, setFilter] = useState("");
  const filtered = SHORTCUTS.filter((s) =>
    !filter ||
    s.label.toLowerCase().includes(filter.toLowerCase()) ||
    s.combo.toLowerCase().includes(filter.toLowerCase()) ||
    s.category.toLowerCase().includes(filter.toLowerCase())
  );
  const groups = filtered.reduce<Record<string, typeof SHORTCUTS>>((acc, s) => {
    (acc[s.category] ??= []).push(s);
    return acc;
  }, {});
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-2xl max-h-[80vh]">
        <DialogHeader>
          <DialogTitle>Keyboard Shortcuts</DialogTitle>
          <DialogDescription>All Scaffolder IDE shortcuts.</DialogDescription>
        </DialogHeader>
        <Input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter…"
          className="h-8 text-xs"
        />
        <ScrollArea className="h-[55vh] border border-border rounded">
          <div className="p-3 space-y-4">
            {Object.entries(groups).map(([cat, items]) => (
              <div key={cat}>
                <h4 className="text-xs font-semibold uppercase text-muted-foreground mb-1">{cat}</h4>
                <div className="space-y-1">
                  {items.map((s) => (
                    <div key={s.id} className="flex items-center justify-between text-xs">
                      <span>{s.label}</span>
                      <kbd className="font-mono text-[10px] px-1.5 py-0.5 bg-muted border border-border rounded">{s.combo}</kbd>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── About ─────────────────────────────────────────────────────────────────
export function AboutDialog() {
  const open = useIDE((s) => s.aboutOpen);
  const setOpen = (v: boolean) => useIDE.setState({ aboutOpen: v });
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Scaffolder IDE</DialogTitle>
          <DialogDescription>Version 1.0 — Notepad++-style code editor</DialogDescription>
        </DialogHeader>
        <div className="text-sm space-y-3">
          <p>
            A multi-tab code editor built with Next.js, Monaco Editor and TypeScript.
            Implements 50+ features beyond the original 20-feature foundation, including
            text transformations, encoding tools, language formatters, command palette,
            multi-clipboard history, snippet library, bookmarks, diff view, and more.
          </p>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="border border-border rounded p-2">
              <div className="font-semibold">Editor engine</div>
              <div className="text-muted-foreground">Monaco 0.57</div>
            </div>
            <div className="border border-border rounded p-2">
              <div className="font-semibold">Languages</div>
              <div className="text-muted-foreground">30+</div>
            </div>
            <div className="border border-border rounded p-2">
              <div className="font-semibold">Themes</div>
              <div className="text-muted-foreground">4 (Dark, Light, HC Dark, HC Light)</div>
            </div>
            <div className="border border-border rounded p-2">
              <div className="font-semibold">Commands</div>
              <div className="text-muted-foreground">100+ via palette</div>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Toast ─────────────────────────────────────────────────────────────────
export function ToastHost() {
  const msg = useIDE((s) => s.toastMsg);
  const kind = useIDE((s) => s.toastKind);
  if (!msg) return null;
  const colors = {
    info:    "bg-blue-500/95 text-white",
    success: "bg-emerald-500/95 text-white",
    warning: "bg-amber-500/95 text-white",
    error:   "bg-red-500/95 text-white",
  };
  return (
    <div className="fixed bottom-10 left-1/2 -translate-x-1/2 z-50 pointer-events-none">
      <div className={`px-4 py-2 rounded shadow-lg text-xs ${colors[kind]}`}>
        {msg}
      </div>
    </div>
  );
}
