"use client";

/**
 * BrandHeader.tsx
 *
 * Compact branded title bar at the top of the IDE. Shows the Scaffolder IDE
 * logo, the current project/workspace name, and quick actions.
 */

import { useIDE } from "@/store/ide-store";
import { Command, FileText, Bookmark, Keyboard, Info, Palette } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { THEME_OPTIONS } from "@/store/ide-store";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";

export function BrandHeader() {
  const activeId = useIDE((s) => s.activeId);
  const docs = useIDE((s) => s.docs);
  const active = docs.find((d) => d.id === activeId) ?? null;
  const theme = useIDE((s) => s.view.theme);
  const setTheme = useIDE((s) => s.setTheme);

  return (
    <header className="flex items-center gap-3 h-12 px-3 border-b border-border bg-gradient-to-r from-primary/5 via-background to-background">
      {/* Logo */}
      <div className="flex items-center gap-2">
        <div className="w-7 h-7 rounded-md bg-primary flex items-center justify-center text-primary-foreground font-bold text-sm shadow-sm">
          S
        </div>
        <div className="leading-none">
          <div className="text-sm font-semibold tracking-tight">Scaffolder IDE</div>
        </div>
      </div>

      {/* Workspace name */}
      <div className="text-xs text-muted-foreground border-l border-border pl-3">
        workspace: <span className="text-foreground font-mono">{active?.name ?? "—"}</span>
      </div>

      <div className="ml-auto flex items-center gap-1">
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="sm" className="h-8 px-2" onClick={() => useIDE.getState().openPalette()}>
                <Command className="w-3.5 h-3.5 mr-1" />
                <span className="text-xs">Commands</span>
                <kbd className="ml-2 text-[9px] font-mono bg-muted px-1 rounded">Ctrl+Shift+P</kbd>
              </Button>
            </TooltipTrigger>
            <TooltipContent>Open command palette</TooltipContent>
          </Tooltip>
        </TooltipProvider>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
              <Palette className="w-3.5 h-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {THEME_OPTIONS.map((t) => (
              <DropdownMenuItem key={t.id} onClick={() => setTheme(t.id)}>
                <span className="w-3">{theme === t.id ? "✓" : ""}</span>
                {t.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => useIDE.setState({ snippetsOpen: true })} title="Snippets">
          <FileText className="w-3.5 h-3.5" />
        </Button>
        <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => useIDE.setState({ clipboardOpen: true })} title="Clipboard history">
          <Bookmark className="w-3.5 h-3.5" />
        </Button>
        <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => useIDE.setState({ shortcutsOpen: true })} title="Shortcuts">
          <Keyboard className="w-3.5 h-3.5" />
        </Button>
        <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => useIDE.setState({ aboutOpen: true })} title="About">
          <Info className="w-3.5 h-3.5" />
        </Button>
      </div>
    </header>
  );
}
