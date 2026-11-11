/**
 * text-ops.ts
 *
 * Pure text transformation functions used by Edit menu actions and the
 * Command Palette. Every function is synchronous, side-effect-free, and
 * operates either on a whole buffer or on a caller-supplied selection.
 *
 * The functions are intentionally framework-agnostic so they can be unit
 * tested in isolation or reused outside the React tree.
 */

/** Empty input guard — avoids returning stray newlines for empty buffers. */
function withLines<T>(text: string, fn: (lines: string[]) => T): T {
  if (text.length === 0) return text as unknown as T;
  return fn(text.split(/\r\n|\r|\n/));
}

function joinPreservingEol(lines: string[], eol: string): string {
  return lines.join(eol);
}

/** Detect the dominant EOL sequence in `text`, defaulting to `\n`. */
export function detectEol(text: string): "\r\n" | "\n" | "\r" {
  const crlf = text.includes("\r\n");
  const lf = text.includes("\n");
  const cr = text.includes("\r");
  if (crlf) return "\r\n";
  if (cr && !lf) return "\r";
  return "\n";
}

// ─── Case Conversions ──────────────────────────────────────────────────────

export function toUpperCase(text: string): string {
  return text.toUpperCase();
}

export function toLowerCase(text: string): string {
  return text.toLowerCase();
}

/** "the quick brown" → "The Quick Brown". */
export function toTitleCase(text: string): string {
  return text.replace(/\b\w/g, (c) => c.toUpperCase());
}

/** "the quick brown" → "The quick brown". */
export function toSentenceCase(text: string): string {
  return text.replace(/(^\s*\w|[.!?]\s+\w)/g, (c) => c.toUpperCase());
}

/** Split on any non-alphanumeric boundary, then reassemble as camelCase. */
export function toCamelCase(text: string): string {
  const words = text.match(/[A-Za-z0-9]+/g) ?? [];
  return words
    .map((w, i) =>
      i === 0
        ? w.toLowerCase()
        : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()
    )
    .join("");
}

export function toPascalCase(text: string): string {
  const words = text.match(/[A-Za-z0-9]+/g) ?? [];
  return words
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join("");
}

export function toSnakeCase(text: string): string {
  const words = text.match(/[A-Za-z0-9]+/g) ?? [];
  return words.map((w) => w.toLowerCase()).join("_");
}

export function toConstantCase(text: string): string {
  const words = text.match(/[A-Za-z0-9]+/g) ?? [];
  return words.map((w) => w.toUpperCase()).join("_");
}

export function toKebabCase(text: string): string {
  const words = text.match(/[A-Za-z0-9]+/g) ?? [];
  return words.map((w) => w.toLowerCase()).join("-");
}

// ─── Whitespace & Line Operations ──────────────────────────────────────────

export function trimTrailingWhitespace(text: string): string {
  return text.replace(/[ \t]+$/gm, "");
}

export function trimLeadingWhitespace(text: string): string {
  return text.replace(/^[ \t]+/gm, "");
}

export function trimBothEndsPerLine(text: string): string {
  return text
    .split(/\r\n|\r|\n/)
    .map((l) => l.trim())
    .join("\n");
}

export function removeEmptyLines(text: string): string {
  return text
    .split(/\r\n|\r|\n/)
    .filter((l) => l.trim().length > 0)
    .join("\n");
}

/** Preserve first occurrence; drop subsequent duplicates. */
export function removeDuplicateLines(text: string): { result: string; removed: number } {
  const eol = detectEol(text);
  const seen = new Set<string>();
  const out: string[] = [];
  let removed = 0;
  for (const line of text.split(/\r\n|\r|\n/)) {
    if (seen.has(line)) {
      removed++;
    } else {
      seen.add(line);
      out.push(line);
    }
  }
  return { result: out.join(eol), removed };
}

export function sortLines(text: string, ascending = true, caseSensitive = true): string {
  const eol = detectEol(text);
  const lines = text.split(/\r\n|\r|\n/);
  lines.sort(caseSensitive
    ? (a, b) => ascending ? a.localeCompare(b) : b.localeCompare(a)
    : (a, b) => {
        const cmp = a.toLowerCase().localeCompare(b.toLowerCase());
        return ascending ? cmp : -cmp;
      });
  return lines.join(eol);
}

export function reverseLineOrder(text: string): string {
  const eol = detectEol(text);
  return text.split(/\r\n|\r|\n/).reverse().join(eol);
}

/** Fisher–Yates shuffle of lines — useful for randomising test data. */
export function shuffleLines(text: string): string {
  const eol = detectEol(text);
  const lines = text.split(/\r\n|\r|\n/);
  for (let i = lines.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [lines[i], lines[j]] = [lines[j], lines[i]];
  }
  return lines.join(eol);
}

// ─── Indentation ───────────────────────────────────────────────────────────

export function tabsToSpaces(text: string, width = 4): string {
  const spaces = " ".repeat(width);
  return text.replace(/\t/g, spaces);
}

export function spacesToTabs(text: string, width = 4): string {
  // Convert leading spaces (per line) into tabs of `width` spaces each.
  return text.replace(
    /^( +)/gm,
    (_, leading: string) => {
      const tabs = Math.floor(leading.length / width);
      const rem = leading.length % width;
      return "\t".repeat(tabs) + " ".repeat(rem);
    }
  );
}

// ─── EOL Conversion ────────────────────────────────────────────────────────

export function convertEol(text: string, target: "\r\n" | "\n" | "\r"): string {
  // First normalise to \n, then re-emit as the target.
  const normalised = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  if (target === "\n") return normalised;
  if (target === "\r\n") return normalised.replace(/\n/g, "\r\n");
  return normalised.replace(/\n/g, "\r"); // CR
}

// ─── Insert ────────────────────────────────────────────────────────────────

export function insertAtCursor(text: string, insertion: string, offset: number): string {
  return text.slice(0, offset) + insertion + text.slice(offset);
}

// ─── Reverse Text & ROT13 ──────────────────────────────────────────────────

export function reverseText(text: string): string {
  // Reverse character-by-character (handles surrogate pairs via spread).
  return Array.from(text).reverse().join("");
}

export function rot13(text: string): string {
  return text.replace(/[a-zA-Z]/g, (c) => {
    const base = c <= "Z" ? 65 : 97;
    return String.fromCharCode(((c.charCodeAt(0) - base + 13) % 26) + base);
  });
}

// ─── Statistics ────────────────────────────────────────────────────────────

export interface DocStats {
  lines: number;
  words: number;
  chars: number;
  charsNoSpaces: number;
  selectionLength: number;
  paragraphs: number;
  readingTimeMin: number;
  longestLine: number;
}

export function computeStats(text: string, selection = ""): DocStats {
  const lines = text === "" ? 0 : text.split(/\r\n|\r|\n/).length;
  const words = (text.match(/\S+/g) ?? []).length;
  const chars = text.length;
  const charsNoSpaces = text.replace(/\s/g, "").length;
  const paragraphs = text.split(/\n\s*\n/).filter((p) => p.trim().length > 0).length;
  const longestLine = Math.max(
    0,
    ...text.split(/\r\n|\r|\n/).map((l) => l.length)
  );
  return {
    lines,
    words,
    chars,
    charsNoSpaces,
    selectionLength: selection.length,
    paragraphs,
    readingTimeMin: Math.max(1, Math.round(words / 200)),
    longestLine,
  };
}
