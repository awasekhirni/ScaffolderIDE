"use client";

/**
 * shortcuts-handler.tsx
 *
 * Global keyboard shortcut handler. Mounts once at the page level and
 * listens for hotkeys that aren't handled by Monaco itself (Monaco
 * already handles Ctrl+Z/Y/F/H/G/C/V/X etc. when it has focus).
 *
 * Shortcuts we own: Ctrl+N, Ctrl+Shift+P, Ctrl+W, Ctrl+Shift+W, Ctrl+Tab,
 * Ctrl+Shift+Tab, Ctrl+=, Ctrl+-, Ctrl+0, Alt+Z, Ctrl+M, Ctrl+Alt+S,
 * Ctrl+Shift+T, F2/Shift+F2 (delegated to Monaco).
 */

import { useEffect } from "react";
import { useIDE } from "@/store/ide-store";
import { editorApi } from "./editor";

export function ShortcutsHandler() {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const ctrl = e.ctrlKey || e.metaKey;
      const shift = e.shiftKey;
      const alt = e.altKey;
      const target = e.target as HTMLElement | null;
      const isTypingInField =
        target &&
        (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable) &&
        // Allow shortcuts that include Ctrl/Cmd even in inputs (but not pure typing).
        !ctrl;

      // We still allow Ctrl+Shift+P everywhere.
      if (ctrl && shift && e.key === "P") {
        e.preventDefault();
        useIDE.getState().openPalette();
        return;
      }
      if (ctrl && shift && e.key === "F") {
        e.preventDefault();
        useIDE.setState({ search: { ...useIDE.getState().search, open: true } });
        return;
      }
      if (isTypingInField) return;

      // Ctrl+N — new file
      if (ctrl && !shift && (e.key === "n" || e.key === "N")) {
        e.preventDefault();
        useIDE.getState().newDoc();
        return;
      }
      // Ctrl+S — save (with shift = save as, with alt = save all)
      if (ctrl && !alt && (e.key === "s" || e.key === "S")) {
        e.preventDefault();
        const ide = useIDE.getState();
        if (ide.activeId) {
          if (shift) {
            const active = ide.docs.find((d) => d.id === ide.activeId);
            const name = window.prompt("Save as:", active?.name ?? "untitled.txt");
            if (name && ide.activeId) ide.saveAs(ide.activeId, name);
          } else {
            ide.saveDoc(ide.activeId);
          }
        }
        return;
      }
      if (ctrl && alt && (e.key === "s" || e.key === "S")) {
        e.preventDefault();
        useIDE.getState().saveAll();
        return;
      }
      // Ctrl+W — close tab (with shift = close all)
      if (ctrl && !shift && (e.key === "w" || e.key === "W")) {
        e.preventDefault();
        const ide = useIDE.getState();
        if (ide.activeId) ide.closeDoc(ide.activeId);
        return;
      }
      if (ctrl && shift && (e.key === "w" || e.key === "W")) {
        e.preventDefault();
        useIDE.getState().closeAll();
        return;
      }
      // Ctrl+Shift+T — reopen closed
      if (ctrl && shift && (e.key === "t" || e.key === "T")) {
        e.preventDefault();
        useIDE.getState().reopenClosed();
        return;
      }
      // Ctrl+Tab / Ctrl+Shift+Tab — cycle tabs
      if (ctrl && e.key === "Tab") {
        e.preventDefault();
        const ide = useIDE.getState();
        const docs = ide.docs;
        if (docs.length < 2) return;
        const idx = docs.findIndex((d) => d.id === ide.activeId);
        const nextIdx = shift
          ? (idx - 1 + docs.length) % docs.length
          : (idx + 1) % docs.length;
        ide.setActive(docs[nextIdx].id);
        return;
      }
      // Ctrl+= / Ctrl+- / Ctrl+0 — zoom
      if (ctrl && (e.key === "=" || e.key === "+")) {
        e.preventDefault();
        useIDE.getState().zoomIn();
        return;
      }
      if (ctrl && e.key === "-") {
        e.preventDefault();
        useIDE.getState().zoomOut();
        return;
      }
      if (ctrl && e.key === "0") {
        e.preventDefault();
        useIDE.getState().zoomReset();
        return;
      }
      // Alt+Z — word wrap
      if (alt && !ctrl && (e.key === "z" || e.key === "Z")) {
        e.preventDefault();
        const ide = useIDE.getState();
        ide.setView("wordWrap", !ide.view.wordWrap);
        return;
      }
      // Ctrl+M — minimap
      if (ctrl && !shift && (e.key === "m" || e.key === "M")) {
        e.preventDefault();
        const ide = useIDE.getState();
        ide.setView("showMinimap", !ide.view.showMinimap);
        return;
      }
      // Ctrl+F — open find (Monaco handles when focused; this is a fallback)
      if (ctrl && !shift && (e.key === "f" || e.key === "F")) {
        // Don't preventDefault — Monaco will handle it.
        return;
      }
    }

    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, []);

  // Persist on beforeunload.
  useEffect(() => {
    function persist() {
      useIDE.getState().persistSession();
    }
    window.addEventListener("beforeunload", persist);
    const id = setInterval(persist, 10_000); // autosave every 10s
    return () => {
      window.removeEventListener("beforeunload", persist);
      clearInterval(id);
    };
  }, []);

  // Drag-and-drop file open.
  useEffect(() => {
    function onDrop(e: DragEvent) {
      e.preventDefault();
      const files = e.dataTransfer?.files;
      if (!files) return;
      Array.from(files).forEach((file) => {
        const reader = new FileReader();
        reader.onload = () => {
          const text = typeof reader.result === "string" ? reader.result : "";
          useIDE.getState().openFromText(file.name, `/upload/${file.name}`, text);
        };
        reader.readAsText(file);
      });
    }
    function onDragOver(e: DragEvent) {
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
    }
    window.addEventListener("drop", onDrop);
    window.addEventListener("dragover", onDragOver);
    return () => {
      window.removeEventListener("drop", onDrop);
      window.removeEventListener("dragover", onDragOver);
    };
  }, []);

  // Sync `<html>` class with the IDE theme so Tailwind's `dark:` variants
  // follow Monaco's dark/light theme.
  const theme = useIDE((s) => s.view.theme);
  useEffect(() => {
    const root = document.documentElement;
    const isDark = theme === "vs-dark" || theme === "hc-black";
    if (isDark) root.classList.add("dark");
    else root.classList.remove("dark");
  }, [theme]);

  return null;
}
