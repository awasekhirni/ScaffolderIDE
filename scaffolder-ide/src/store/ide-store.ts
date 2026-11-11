"use client";

/**
 * ide-store.ts
 *
 * Central Zustand store for the Scaffolder IDE.
 * Holds: open documents, active tab, recent files, view options, theme,
 * bookmarks, clipboard history, snippet state, modal visibility.
 *
 * Persistence: open tabs + view prefs are mirrored to localStorage in the
 * `persistSession` action, which the host page wires to `beforeunload`.
 */

import { create } from "zustand";
import { detectLanguage } from "@/lib/languages";
import { detectEncoding, type Encoding } from "@/lib/encoding";
import { detectEol } from "@/lib/text-ops";
import { SNIPPETS, type Snippet } from "@/lib/snippets";
import { SHORTCUTS } from "@/lib/shortcuts";

export type Eol = "\r\n" | "\n" | "\r";
export const EOL_LABEL: Record<Eol, string> = { "\r\n": "CRLF", "\n": "LF", "\r": "CR" };

export type ThemeId = "vs-dark" | "vs-light" | "hc-black" | "hc-light";
export interface ThemeOption {
  id: ThemeId;
  label: string;
}
export const THEME_OPTIONS: ThemeOption[] = [
  { id: "vs-dark",   label: "Dark" },
  { id: "vs-light",  label: "Light" },
  { id: "hc-black",  label: "High Contrast Dark" },
  { id: "hc-light",  label: "High Contrast Light" },
];

export interface Document {
  id: string;                 // uuid
  name: string;               // "foo.rs"
  path?: string;              // virtual path (e.g. "/workspace/foo.rs")
  text: string;
  originalText: string;       // snapshot at load / save, for diff
  language: string;           // Monaco language id
  encoding: Encoding;
  eol: Eol;
  size: number;               // bytes
  isPinned: boolean;
  isDirty: boolean;
  bookmarks: number[];        // 1-indexed line numbers
  lastModified?: number;      // ms epoch
}

export interface RecentFile {
  name: string;
  path: string;
  text: string;               // we keep the text so the user can reopen in a sandboxed browser
  language: string;
}

export interface ClipboardEntry {
  id: string;
  text: string;
  ts: number;
}

export interface ViewOptions {
  theme: ThemeId;
  fontSize: number;
  wordWrap: boolean;
  showLineNumbers: boolean;
  showMinimap: boolean;
  showIndentGuides: boolean;
  renderWhitespace: "none" | "boundary" | "all";
  bracketPairColorization: boolean;
  highlightActiveLine: boolean;
  cursorBlinking: "blink" | "smooth" | "phase" | "expand" | "solid";
  fontFamily: string;
  fontLigatures: boolean;
  tabSize: number;
  insertSpaces: boolean;
  autoClosingBrackets: boolean;
}

const DEFAULT_VIEW: ViewOptions = {
  theme: "vs-dark",
  fontSize: 14,
  wordWrap: false,
  showLineNumbers: true,
  showMinimap: true,
  showIndentGuides: true,
  renderWhitespace: "boundary",
  bracketPairColorization: true,
  highlightActiveLine: true,
  cursorBlinking: "blink",
  fontFamily: "Menlo, Monaco, 'Courier New', monospace",
  fontLigatures: false,
  tabSize: 2,
  insertSpaces: true,
  autoClosingBrackets: true,
};

let idCounter = 0;
function newId(): string {
  idCounter += 1;
  return `doc-${Date.now().toString(36)}-${idCounter}`;
}

function makeUntitled(text = "", name?: string): Document {
  const lang = detectLanguage(name ?? "untitled.txt");
  const eol = detectEol(text);
  const bytes = new TextEncoder().encode(text);
  return {
    id: newId(),
    name: name ?? "untitled.txt",
    text,
    originalText: text,
    language: lang.id,
    encoding: detectEncoding(bytes),
    eol,
    size: bytes.length,
    isPinned: false,
    isDirty: false,
    bookmarks: [],
    lastModified: Date.now(),
  };
}

export interface CommandDef {
  id: string;
  label: string;
  category: string;
  hint?: string;
  /** Returns true if the command performed something (used by palette). */
  run: () => void;
  /** Optional shortcut id matching shortcuts.ts. */
  shortcutId?: string;
}

type ToastKind = "info" | "success" | "warning" | "error";

interface IdeState {
  docs: Document[];
  activeId: string | null;
  recents: RecentFile[];
  closedStack: Document[];        // for "Reopen Closed Tab"
  clipboard: ClipboardEntry[];
  snippets: Snippet[];
  view: ViewOptions;
  search: { open: boolean; query: string; replace: string; caseSensitive: boolean; regex: boolean; wholeWord: boolean; };
  gotoOpen: boolean;
  paletteOpen: boolean;
  shortcutsOpen: boolean;
  propertiesOpen: boolean;
  statsOpen: boolean;
  snippetsOpen: boolean;
  clipboardOpen: boolean;
  diffOpen: boolean;
  markdownOpen: boolean;
  htmlPreviewOpen: boolean;
  aboutOpen: boolean;
  toastMsg: string | null;
  toastKind: ToastKind;
  statusMessage: string;
  commands: CommandDef[];

  // ─── Actions ────────────────────────────────────────────────────────────
  newDoc: (text?: string, name?: string) => string;
  openFromText: (name: string, path: string, text: string) => string;
  closeDoc: (id: string) => void;
  closeOthers: (id: string) => void;
  closeAll: () => void;
  reopenClosed: () => void;
  setActive: (id: string) => void;
  updateText: (id: string, text: string) => void;
  saveDoc: (id: string) => void;
  saveAs: (id: string, name: string) => void;
  saveAll: () => void;
  togglePin: (id: string) => void;
  toggleBookmark: (id: string, line: number) => void;
  nextBookmark: (id: string, fromLine: number) => number | null;
  prevBookmark: (id: string, fromLine: number) => number | null;
  pushClipboard: (text: string) => void;
  clearClipboard: () => void;
  insertSnippet: (id: string) => void;
  addRecent: (file: RecentFile) => void;
  openRecent: (path: string) => void;
  setView: <K extends keyof ViewOptions>(key: K, value: ViewOptions[K]) => void;
  setTheme: (id: ThemeId) => void;
  zoomIn: () => void;
  zoomOut: () => void;
  zoomReset: () => void;
  setSearch: (patch: Partial<IdeState["search"]>) => void;
  toast: (kind: ToastKind, msg: string) => void;
  setStatus: (msg: string) => void;
  openPalette: () => void;
  closePalette: () => void;
  registerCommands: (cmds: CommandDef[]) => void;
  persistSession: () => void;
  restoreSession: () => void;
}

const STORAGE_KEY = "scaffolder-ide-session-v1";
const VIEW_KEY = "scaffolder-ide-view-v1";
const RECENTS_KEY = "scaffolder-ide-recents-v1";

function safeGet(key: string): string | null {
  try { return localStorage.getItem(key); } catch { return null; }
}
function safeSet(key: string, val: string): void {
  try { localStorage.setItem(key, val); } catch { /* quota */ }
}

export const useIDE = create<IdeState>((set, get) => ({
  docs: [makeUntitled("// Scaffolder IDE — press Ctrl+Shift+P to open the command palette\n")],
  activeId: null,
  recents: [],
  closedStack: [],
  clipboard: [],
  snippets: SNIPPETS,
  view: (() => {
    const raw = safeGet(VIEW_KEY);
    if (raw) try { return { ...DEFAULT_VIEW, ...JSON.parse(raw) }; } catch {}
    return DEFAULT_VIEW;
  })(),
  search: { open: false, query: "", replace: "", caseSensitive: false, regex: false, wholeWord: false },
  gotoOpen: false,
  paletteOpen: false,
  shortcutsOpen: false,
  propertiesOpen: false,
  statsOpen: false,
  snippetsOpen: false,
  clipboardOpen: false,
  diffOpen: false,
  markdownOpen: false,
  htmlPreviewOpen: false,
  aboutOpen: false,
  toastMsg: null,
  toastKind: "info",
  statusMessage: "Ready",
  commands: [],

  newDoc: (text, name) => {
    const doc = makeUntitled(text ?? "", name);
    set((s) => ({ docs: [...s.docs, doc], activeId: doc.id }));
    return doc.id;
  },

  openFromText: (name, path, text) => {
    const state = get();
    // If the same path is already open, focus it.
    const existing = state.docs.find((d) => d.path === path);
    if (existing) {
      set({ activeId: existing.id });
      return existing.id;
    }
    const lang = detectLanguage(name);
    const bytes = new TextEncoder().encode(text);
    const doc: Document = {
      id: newId(),
      name,
      path,
      text,
      originalText: text,
      language: lang.id,
      encoding: detectEncoding(bytes),
      eol: detectEol(text),
      size: bytes.length,
      isPinned: false,
      isDirty: false,
      bookmarks: [],
      lastModified: Date.now(),
    };
    set((s) => ({
      docs: [...s.docs, doc],
      activeId: doc.id,
      recents: [{ name, path, text, language: lang.id }, ...s.recents.filter((r) => r.path !== path)].slice(0, 15),
    }));
    get().setStatus(`Opened ${name}`);
    return doc.id;
  },

  closeDoc: (id) => {
    set((s) => {
      const idx = s.docs.findIndex((d) => d.id === id);
      if (idx < 0) return s;
      const [closed] = s.docs.splice(idx, 1);
      // Only remember closed docs that had a name (untitled buffers are dropped).
      if (closed.name && closed.name !== "untitled.txt") {
        s.closedStack = [closed, ...s.closedStack].slice(0, 10);
      }
      const newActive = s.docs.length === 0
        ? null
        : s.docs[Math.min(idx, s.docs.length - 1)].id;
      return { docs: [...s.docs], activeId: newActive, closedStack: [...s.closedStack] };
    });
    const { docs, activeId } = get();
    if (docs.length === 0) {
      get().newDoc();
    } else if (activeId === null) {
      set({ activeId: docs[docs.length - 1].id });
    }
  },

  closeOthers: (id) => {
    set((s) => ({ docs: s.docs.filter((d) => d.id === id || d.isPinned), activeId: id }));
  },

  closeAll: () => {
    set((s) => ({
      docs: s.docs.filter((d) => d.isPinned),
      closedStack: [
        ...s.docs.filter((d) => !d.isPinned && d.name && d.name !== "untitled.txt"),
        ...s.closedStack,
      ].slice(0, 10),
      activeId: null,
    }));
    const { docs } = get();
    if (docs.length === 0) get().newDoc();
    else set({ activeId: docs[0].id });
  },

  reopenClosed: () => {
    const s = get();
    if (s.closedStack.length === 0) return;
    const [first, ...rest] = s.closedStack;
    set({
      closedStack: rest,
      docs: [...s.docs, first],
      activeId: first.id,
    });
  },

  setActive: (id) => set({ activeId: id }),

  updateText: (id, text) => {
    set((s) => ({
      docs: s.docs.map((d) =>
        d.id === id
          ? {
              ...d,
              text,
              isDirty: text !== d.originalText,
              size: new TextEncoder().encode(text).length,
              eol: detectEol(text),
            }
          : d
      ),
    }));
  },

  saveDoc: (id) => {
    set((s) => ({
      docs: s.docs.map((d) =>
        d.id === id ? { ...d, originalText: d.text, isDirty: false, lastModified: Date.now() } : d
      ),
    }));
    get().setStatus("Saved");
    get().toast("success", "File saved");
    get().persistSession();
  },

  saveAs: (id, name) => {
    const lang = detectLanguage(name);
    set((s) => ({
      docs: s.docs.map((d) =>
        d.id === id
          ? {
              ...d,
              name,
              path: `/${name}`,
              language: lang.id,
              originalText: d.text,
              isDirty: false,
              lastModified: Date.now(),
            }
          : d
      ),
    }));
    get().toast("success", `Saved as ${name}`);
    get().persistSession();
  },

  saveAll: () => {
    set((s) => ({
      docs: s.docs.map((d) =>
        d.isDirty ? { ...d, originalText: d.text, isDirty: false, lastModified: Date.now() } : d
      ),
    }));
    get().toast("success", "All files saved");
    get().persistSession();
  },

  togglePin: (id) => {
    set((s) => ({ docs: s.docs.map((d) => (d.id === id ? { ...d, isPinned: !d.isPinned } : d)) }));
  },

  toggleBookmark: (id, line) => {
    set((s) => ({
      docs: s.docs.map((d) => {
        if (d.id !== id) return d;
        const b = d.bookmarks.includes(line)
          ? d.bookmarks.filter((l) => l !== line)
          : [...d.bookmarks, line].sort((a, b) => a - b);
        return { ...d, bookmarks: b };
      }),
    }));
  },

  nextBookmark: (id, fromLine) => {
    const doc = get().docs.find((d) => d.id === id);
    if (!doc || doc.bookmarks.length === 0) return null;
    const next = doc.bookmarks.find((l) => l > fromLine);
    return next ?? doc.bookmarks[0];
  },

  prevBookmark: (id, fromLine) => {
    const doc = get().docs.find((d) => d.id === id);
    if (!doc || doc.bookmarks.length === 0) return null;
    const prev = [...doc.bookmarks].reverse().find((l) => l < fromLine);
    return prev ?? doc.bookmarks[doc.bookmarks.length - 1];
  },

  pushClipboard: (text) => {
    if (!text) return;
    const entry: ClipboardEntry = { id: newId(), text: text.slice(0, 4096), ts: Date.now() };
    set((s) => ({ clipboard: [entry, ...s.clipboard].slice(0, 20) }));
  },

  clearClipboard: () => set({ clipboard: [] }),

  insertSnippet: (id) => {
    const s = get();
    const snip = s.snippets.find((x) => x.id === id);
    if (!snip || !s.activeId) return;
    const doc = s.docs.find((d) => d.id === s.activeId);
    if (!doc) return;
    s.updateText(doc.id, doc.text + "\n" + snip.body);
    s.toast("success", `Inserted: ${snip.title}`);
  },

  addRecent: (file) => {
    set((s) => ({
      recents: [file, ...s.recents.filter((r) => r.path !== file.path)].slice(0, 15),
    }));
    safeSet(RECENTS_KEY, JSON.stringify(get().recents));
  },

  openRecent: (path) => {
    const r = get().recents.find((x) => x.path === path);
    if (!r) return;
    get().openFromText(r.name, r.path, r.text);
  },

  setView: (key, value) => {
    set((s) => ({ view: { ...s.view, [key]: value } }));
    safeSet(VIEW_KEY, JSON.stringify(get().view));
  },

  setTheme: (id) => {
    set((s) => ({ view: { ...s.view, theme: id } }));
    safeSet(VIEW_KEY, JSON.stringify(get().view));
  },

  zoomIn:  () => set((s) => ({ view: { ...s.view, fontSize: Math.min(32, s.view.fontSize + 1) } })),
  zoomOut: () => set((s) => ({ view: { ...s.view, fontSize: Math.max(8,  s.view.fontSize - 1) } })),
  zoomReset: () => set((s) => ({ view: { ...s.view, fontSize: DEFAULT_VIEW.fontSize } })),

  setSearch: (patch) => set((s) => ({ search: { ...s.search, ...patch } })),

  toast: (kind, msg) => {
    set({ toastKind: kind, toastMsg: msg });
    // Auto-clear after 2.5s
    setTimeout(() => {
      if (get().toastMsg === msg) set({ toastMsg: null });
    }, 2500);
  },

  setStatus: (msg) => set({ statusMessage: msg }),

  openPalette: () => set({ paletteOpen: true }),
  closePalette: () => set({ paletteOpen: false }),

  registerCommands: (cmds) => set({ commands: cmds }),

  persistSession: () => {
    const { docs, view } = get();
    const serialised = docs
      .filter((d) => d.name !== "untitled.txt" || d.text.length > 0)
      .map((d) => ({
        name: d.name,
        path: d.path,
        text: d.text,
        isPinned: d.isPinned,
      }));
    safeSet(STORAGE_KEY, JSON.stringify({ docs: serialised }));
    safeSet(VIEW_KEY, JSON.stringify(view));
    safeSet(RECENTS_KEY, JSON.stringify(get().recents));
  },

  restoreSession: () => {
    const raw = safeGet(STORAGE_KEY);
    if (!raw) {
      // Ensure we always have an active doc.
      const s = get();
      if (s.activeId === null && s.docs.length > 0) set({ activeId: s.docs[0].id });
      return;
    }
    try {
      const parsed = JSON.parse(raw) as { docs: { name: string; path?: string; text: string; isPinned?: boolean }[] };
      if (parsed.docs && parsed.docs.length > 0) {
        const restored: Document[] = parsed.docs.map((d) => {
          const lang = detectLanguage(d.name);
          const bytes = new TextEncoder().encode(d.text);
          return {
            id: newId(),
            name: d.name,
            path: d.path,
            text: d.text,
            originalText: d.text,
            language: lang.id,
            encoding: detectEncoding(bytes),
            eol: detectEol(d.text),
            size: bytes.length,
            isPinned: d.isPinned ?? false,
            isDirty: false,
            bookmarks: [],
            lastModified: Date.now(),
          };
        });
        set({
          docs: restored,
          activeId: restored[0].id,
          recents: (() => {
            const r = safeGet(RECENTS_KEY);
            if (!r) return [];
            try { return JSON.parse(r) as RecentFile[]; } catch { return []; }
          })(),
        });
      }
    } catch {
      // ignore
    }
  },
}));

// Initialise activeId — the default doc was created above without one.
const initialDocs = useIDE.getState().docs;
if (useIDE.getState().activeId === null && initialDocs.length > 0) {
  useIDE.setState({ activeId: initialDocs[0].id });
}

// Helper for components.
export function useActiveDoc(): Document | null {
  return useIDE((s) => s.docs.find((d) => d.id === s.activeId) ?? null);
}

export { SHORTCUTS };
