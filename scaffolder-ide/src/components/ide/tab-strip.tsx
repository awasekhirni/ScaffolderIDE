"use client";

/**
 * TabStrip.tsx
 *
 * Top tab strip with: pinned tabs first, drag-and-drop file open, context
 * menu (Close / Close Others / Close All / Pin / Duplicate), middle-click
 * to close, scroll when overflowing.
 */

import { useRef } from "react";
import { useIDE } from "@/store/ide-store";
import { Pin, X, Plus, FilePlus2 } from "lucide-react";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";

export function TabStrip() {
  const docs = useIDE((s) => s.docs);
  const activeId = useIDE((s) => s.activeId);
  const setActive = useIDE((s) => s.setActive);
  const closeDoc = useIDE((s) => s.closeDoc);
  const closeOthers = useIDE((s) => s.closeOthers);
  const closeAll = useIDE((s) => s.closeAll);
  const togglePin = useIDE((s) => s.togglePin);
  const newDoc = useIDE((s) => s.newDoc);
  const openFromText = useIDE((s) => s.openFromText);
  const updateText = useIDE((s) => s.updateText);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Pinned first, then by creation order.
  const sorted = [...docs].sort((a, b) => {
    if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1;
    return 0;
  });

  function handleFileInput(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files) return;
    Array.from(files).forEach((file) => {
      const reader = new FileReader();
      reader.onload = () => {
        const text = typeof reader.result === "string" ? reader.result : "";
        openFromText(file.name, `/upload/${file.name}`, text);
      };
      reader.readAsText(file);
    });
    e.target.value = "";
  }

  function duplicateTab(id: string) {
    const doc = docs.find((d) => d.id === id);
    if (!doc) return;
    const newId = newDoc(doc.text, doc.name);
    updateText(newId, doc.text);
  }

  return (
    <div className="flex items-stretch border-b border-border bg-muted/30 select-none">
      <div className="flex items-center px-2 gap-1 border-r border-border">
        <span className="text-xs font-semibold tracking-wide text-primary">SCAFFOLDER</span>
      </div>

      <ScrollArea className="flex-1">
        <div className="flex items-stretch h-9">
          {sorted.map((doc) => {
            const isActive = doc.id === activeId;
            return (
              <ContextMenu key={doc.id}>
                <ContextMenuTrigger asChild>
                  <button
                    onClick={() => setActive(doc.id)}
                    onAuxClick={(e) => {
                      if (e.button === 1) {
                        e.preventDefault();
                        closeDoc(doc.id);
                      }
                    }}
                    className={`group relative flex items-center gap-2 px-3 h-9 text-xs whitespace-nowrap border-r border-border transition-colors ${
                      isActive
                        ? "bg-background text-foreground"
                        : "bg-transparent text-muted-foreground hover:bg-muted/50"
                    }`}
                  >
                    {doc.isPinned && <Pin className="w-3 h-3 text-primary" />}
                    <span className={doc.isDirty ? "italic" : ""}>{doc.name}</span>
                    {doc.isDirty && <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />}
                    {!doc.isPinned && (
                      <X
                        className="w-3 h-3 opacity-50 hover:opacity-100 hover:bg-muted rounded"
                        onClick={(e) => {
                          e.stopPropagation();
                          closeDoc(doc.id);
                        }}
                      />
                    )}
                    {isActive && (
                      <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary" />
                    )}
                  </button>
                </ContextMenuTrigger>
                <ContextMenuContent>
                  <ContextMenuItem onClick={() => closeDoc(doc.id)}>
                    <X className="w-3.5 h-3.5 mr-2" /> Close
                  </ContextMenuItem>
                  <ContextMenuItem onClick={() => closeOthers(doc.id)}>
                    Close Others
                  </ContextMenuItem>
                  <ContextMenuItem onClick={closeAll}>
                    Close All
                  </ContextMenuItem>
                  <ContextMenuSeparator />
                  <ContextMenuItem onClick={() => togglePin(doc.id)}>
                    <Pin className="w-3.5 h-3.5 mr-2" />
                    {doc.isPinned ? "Unpin Tab" : "Pin Tab"}
                  </ContextMenuItem>
                  <ContextMenuItem onClick={() => duplicateTab(doc.id)}>
                    <FilePlus2 className="w-3.5 h-3.5 mr-2" /> Duplicate Tab
                  </ContextMenuItem>
                </ContextMenuContent>
              </ContextMenu>
            );
          })}
        </div>
        <ScrollBar orientation="horizontal" />
      </ScrollArea>

      <div className="flex items-center px-2 gap-1 border-l border-border">
        <button
          onClick={() => fileInputRef.current?.click()}
          className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
          title="Open file"
        >
          <Plus className="w-4 h-4" />
        </button>
        <button
          onClick={() => newDoc()}
          className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
          title="New file (Ctrl+N)"
        >
          <FilePlus2 className="w-4 h-4" />
        </button>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          onChange={handleFileInput}
        />
      </div>
    </div>
  );
}
