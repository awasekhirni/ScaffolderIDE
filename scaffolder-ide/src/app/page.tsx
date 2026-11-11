"use client";

/**
 * Scaffolder IDE — main page.
 *
 * Layout:
 *   ┌────────────────────────────────────────────┐
 *   │ BrandHeader                                │
 *   ├────────────────────────────────────────────┤
 *   │ MenuBar                                    │
 *   ├────────────────────────────────────────────┤
 *   │ TabStrip                                   │
 *   ├────────────────────────────────────────────┤
 *   │                                            │
 *   │            MonacoEditor                    │
 *   │   (with floating Find/Replace overlay)     │
 *   │                                            │
 *   ├────────────────────────────────────────────┤
 *   │ StatusBar                                  │
 *   └────────────────────────────────────────────┘
 *
 * All dialogs (palette, properties, snippets, etc.) mount as overlays.
 */

import { useEffect } from "react";
import { BrandHeader } from "@/components/ide/brand-header";
import { MenuBar } from "@/components/ide/menu-bar";
import { TabStrip } from "@/components/ide/tab-strip";
import { MonacoEditor } from "@/components/ide/editor";
import { StatusBar } from "@/components/ide/status-bar";
import { FindReplaceDialog } from "@/components/ide/find-replace";
import { ShortcutsHandler } from "@/components/ide/shortcuts-handler";
import {
  GotoLineDialog,
  DiffDialog,
  MarkdownPreviewDialog,
  HtmlPreviewDialog,
  PropertiesDialog,
  StatsDialog,
  SnippetLibraryDialog,
  ClipboardHistoryDialog,
  ShortcutsDialog,
  AboutDialog,
  ToastHost,
} from "@/components/ide/dialogs";
import { CommandPalette } from "@/components/ide/command-palette";
import { useIDE } from "@/store/ide-store";

export default function HomePage() {
  const restoreSession = useIDE((s) => s.restoreSession);

  // Restore session on first mount (client-only).
  useEffect(() => {
    restoreSession();
  }, [restoreSession]);

  return (
    <div className="h-screen flex flex-col bg-background overflow-hidden">
      <BrandHeader />
      <MenuBar />
      <TabStrip />
      <div className="flex-1 relative overflow-hidden">
        <MonacoEditor />
        <FindReplaceDialog />
      </div>
      <StatusBar />

      {/* Overlays */}
      <ShortcutsHandler />
      <CommandPalette />
      <GotoLineDialog />
      <DiffDialog />
      <MarkdownPreviewDialog />
      <HtmlPreviewDialog />
      <PropertiesDialog />
      <StatsDialog />
      <SnippetLibraryDialog />
      <ClipboardHistoryDialog />
      <ShortcutsDialog />
      <AboutDialog />
      <ToastHost />
    </div>
  );
}
