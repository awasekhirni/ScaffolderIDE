/**
 * shortcuts.ts
 *
 * Central registry of keyboard shortcuts. Used by the global key handler
 * and by the "Keyboard Shortcuts" reference dialog.
 */

export interface Shortcut {
  id: string;
  label: string;
  category: string;
  combo: string;          // Human-readable, e.g. "Ctrl+S"
  mac?: string;           // macOS variant
}

export const SHORTCUTS: Shortcut[] = [
  // File
  { id: "file.new",         label: "New File",              category: "File", combo: "Ctrl+N" },
  { id: "file.open",        label: "Open File…",            category: "File", combo: "Ctrl+O" },
  { id: "file.save",        label: "Save",                  category: "File", combo: "Ctrl+S" },
  { id: "file.saveAs",      label: "Save As…",              category: "File", combo: "Ctrl+Shift+S" },
  { id: "file.saveAll",     label: "Save All",              category: "File", combo: "Ctrl+Alt+S" },
  { id: "file.close",       label: "Close Tab",             category: "File", combo: "Ctrl+W" },
  { id: "file.closeAll",    label: "Close All Tabs",        category: "File", combo: "Ctrl+Shift+W" },
  { id: "file.reopenClosed",label: "Reopen Closed Tab",     category: "File", combo: "Ctrl+Shift+T" },
  // Edit
  { id: "edit.find",        label: "Find…",                 category: "Edit", combo: "Ctrl+F" },
  { id: "edit.replace",     label: "Replace…",              category: "Edit", combo: "Ctrl+H" },
  { id: "edit.findInFiles", label: "Find in Files",         category: "Edit", combo: "Ctrl+Shift+F" },
  { id: "edit.gotoLine",    label: "Go to Line…",           category: "Edit", combo: "Ctrl+G" },
  { id: "edit.gotoSymbol",  label: "Go to Symbol…",         category: "Edit", combo: "Ctrl+Shift+O" },
  { id: "edit.duplicateLine",label: "Duplicate Line",       category: "Edit", combo: "Ctrl+Shift+D" },
  { id: "edit.moveUp",      label: "Move Line Up",          category: "Edit", combo: "Alt+Up" },
  { id: "edit.moveDown",    label: "Move Line Down",        category: "Edit", combo: "Alt+Down" },
  { id: "edit.deleteLine",  label: "Delete Line",           category: "Edit", combo: "Ctrl+Shift+K" },
  { id: "edit.toggleComment",label: "Toggle Line Comment",  category: "Edit", combo: "Ctrl+/" },
  { id: "edit.blockComment",label: "Toggle Block Comment",  category: "Edit", combo: "Ctrl+Shift+/" },
  // Selection
  { id: "edit.selectAll",   label: "Select All",            category: "Selection", combo: "Ctrl+A" },
  // View
  { id: "view.zoomIn",      label: "Zoom In",               category: "View", combo: "Ctrl+=" },
  { id: "view.zoomOut",     label: "Zoom Out",              category: "View", combo: "Ctrl+-" },
  { id: "view.zoomReset",   label: "Reset Zoom",            category: "View", combo: "Ctrl+0" },
  { id: "view.commandPalette",label: "Command Palette",     category: "View", combo: "Ctrl+Shift+P" },
  { id: "view.toggleWrap",  label: "Toggle Word Wrap",      category: "View", combo: "Alt+Z" },
  { id: "view.toggleMinimap",label: "Toggle Minimap",       category: "View", combo: "Ctrl+M" },
  // Bookmarks
  { id: "bookmark.toggle",  label: "Toggle Bookmark",       category: "Bookmarks", combo: "Ctrl+F2" },
  { id: "bookmark.next",    label: "Next Bookmark",         category: "Bookmarks", combo: "F2" },
  { id: "bookmark.prev",    label: "Previous Bookmark",     category: "Bookmarks", combo: "Shift+F2" },
  // Tabs
  { id: "tab.next",         label: "Next Tab",              category: "Tabs", combo: "Ctrl+Tab" },
  { id: "tab.prev",         label: "Previous Tab",          category: "Tabs", combo: "Ctrl+Shift+Tab" },
];
