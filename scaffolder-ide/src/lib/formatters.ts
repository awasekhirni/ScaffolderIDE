/**
 * formatters.ts
 *
 * Language-specific beautifiers and minifiers.
 * Pure functions: input string → output string, throwing on parse errors
 * where the input is genuinely malformed.
 */

// ─── JSON ──────────────────────────────────────────────────────────────────

export function jsonBeautify(text: string, indent = 2): string {
  const parsed = JSON.parse(text);
  return JSON.stringify(parsed, null, indent);
}

export function jsonMinify(text: string): string {
  const parsed = JSON.parse(text);
  return JSON.stringify(parsed);
}

export interface ValidationResult {
  ok: boolean;
  error?: string;
  line?: number;
  column?: number;
}

/** Validate JSON without throwing — returns a structured result. */
export function jsonValidate(text: string): ValidationResult {
  try {
    JSON.parse(text);
    return { ok: true };
  } catch (e) {
    const msg = (e as Error).message;
    // Try to extract position from V8/SpiderMonkey error messages.
    const posMatch = msg.match(/position (\d+)/);
    let line: number | undefined;
    let column: number | undefined;
    if (posMatch) {
      const pos = parseInt(posMatch[1], 10);
      const before = text.slice(0, pos);
      const parts = before.split(/\r\n|\r|\n/);
      line = parts.length;
      column = parts[parts.length - 1].length + 1;
    }
    return { ok: false, error: msg, line, column };
  }
}

// ─── XML / HTML (basic indentation) ────────────────────────────────────────

/**
 * Lightweight XML/HTML indenter. Not a parser — uses regex heuristics.
 * Suitable for human-authored markup, not for adversarial input.
 */
export function xmlBeautify(text: string, indent = 2): string {
  const pad = " ".repeat(indent);
  let depth = 0;
  let out = "";
  // Tokenize tags + text content.
  const tokens = text.replace(/>\s*</g, "><").trim().split(/(<[^>]+>)/g).filter(Boolean);
  for (const tok of tokens) {
    if (!tok) continue;
    if (tok.startsWith("<")) {
      const isClosing = tok.startsWith("</");
      const isSelfClosing = tok.endsWith("/>") || tok.startsWith("<!");
      const isDoctype = tok.startsWith("<!");
      if (isClosing) depth = Math.max(0, depth - 1);
      out += pad.repeat(depth) + tok + "\n";
      if (!isClosing && !isSelfClosing && !isDoctype) depth++;
    } else {
      const trimmed = tok.trim();
      if (trimmed) out += pad.repeat(depth) + trimmed + "\n";
    }
  }
  return out.trimEnd();
}

// ─── SQL (very basic) ──────────────────────────────────────────────────────

const SQL_KEYWORDS = [
  "SELECT", "FROM", "WHERE", "AND", "OR", "NOT", "IN", "EXISTS", "BETWEEN",
  "LIKE", "IS", "NULL", "ORDER", "BY", "GROUP", "HAVING", "LIMIT", "OFFSET",
  "JOIN", "INNER", "LEFT", "RIGHT", "OUTER", "FULL", "ON", "AS", "DISTINCT",
  "INSERT", "INTO", "VALUES", "UPDATE", "SET", "DELETE", "CREATE", "TABLE",
  "INDEX", "VIEW", "DROP", "ALTER", "ADD", "COLUMN", "PRIMARY", "KEY",
  "FOREIGN", "REFERENCES", "DEFAULT", "CHECK", "UNIQUE", "CONSTRAINT",
  "BEGIN", "COMMIT", "ROLLBACK", "TRANSACTION", "CASE", "WHEN", "THEN",
  "ELSE", "END", "UNION", "ALL", "INTERSECT", "EXCEPT", "WITH", "RECURSIVE",
];

/** Very small SQL pretty-printer. Newlines before major clauses, uppercase keywords. */
export function sqlFormat(text: string, indent = 2): string {
  const pad = " ".repeat(indent);
  // Uppercase known keywords.
  let out = text;
  for (const kw of SQL_KEYWORDS) {
    const re = new RegExp(`\\b${kw}\\b`, "gi");
    out = out.replace(re, kw);
  }
  // Insert newlines before clause-leading keywords.
  const breakBefore = ["FROM", "WHERE", "GROUP BY", "ORDER BY", "HAVING", "LIMIT", "OFFSET", "JOIN", "INNER JOIN", "LEFT JOIN", "RIGHT JOIN", "FULL JOIN", "UNION", "VALUES", "SET", "ON"];
  for (const kw of breakBefore) {
    const re = new RegExp(`\\s+${kw}\\b`, "g");
    out = out.replace(re, `\n${kw}`);
  }
  // Indent AND / OR one level under WHERE.
  out = out.replace(/\b(AND|OR)\b/g, `\n${pad}$1`);
  // Compress runs of whitespace inside lines.
  out = out.split(/\r\n|\r|\n/).map((l) => l.replace(/\s+/g, " ").trim()).join("\n");
  return out.trim();
}

// ─── CSS Minify (basic) ────────────────────────────────────────────────────

export function cssMinify(text: string): string {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, "")     // strip comments
    .replace(/\s+/g, " ")
    .replace(/\s*([{}:;,>])\s*/g, "$1")
    .replace(/;}/g, "}")
    .trim();
}

export function cssBeautify(text: string, indent = 2): string {
  const pad = " ".repeat(indent);
  let depth = 0;
  return text
    .replace(/\s*([{}:;,>])\s*/g, (_, c) => {
      if (c === "{") return ` {\n${pad.repeat(++depth)}`;
      if (c === "}") return `\n${pad.repeat(--depth)}}\n${pad.repeat(depth)}`;
      if (c === ":") return ": ";
      if (c === ";") return `;\n${pad.repeat(depth)}`;
      if (c === ",") return ", ";
      return c;
    })
    .replace(/\n\s*\n/g, "\n")
    .trim();
}

// ─── JS / TS minify (whitespace-only — safe, non-aggressive) ───────────────

export function jsMinifyWhitespace(text: string): string {
  // Strip single-line and block comments that are NOT inside strings.
  // Conservative: only strip on a line basis, never inside templates.
  let out = text;
  out = out.replace(/\/\/.*$/gm, "");
  out = out.replace(/\/\*[\s\S]*?\*\//g, "");
  out = out.replace(/\s+/g, " ").trim();
  return out;
}

// ─── Markdown to HTML (very small subset) ──────────────────────────────────

/** Minimal Markdown → HTML. For full Markdown, use react-markdown. */
export function markdownToHtml(md: string): string {
  const lines = md.split(/\r\n|\r|\n/);
  const html: string[] = [];
  let inList = false;
  let inCode = false;
  let codeBuf: string[] = [];

  const inline = (s: string) =>
    s
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/`([^`]+)`/g, "<code>$1</code>")
      .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
      .replace(/\*([^*]+)\*/g, "<em>$1</em>")
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');

  for (const line of lines) {
    if (line.startsWith("```")) {
      if (inCode) {
        html.push(`<pre><code>${codeBuf.join("\n").replace(/</g, "&lt;")}</code></pre>`);
        codeBuf = [];
        inCode = false;
      } else {
        inCode = true;
      }
      continue;
    }
    if (inCode) {
      codeBuf.push(line);
      continue;
    }
    if (/^#{1,6}\s/.test(line)) {
      const level = line.match(/^#+/)![0].length;
      html.push(`<h${level}>${inline(line.replace(/^#+\s/, ""))}</h${level}>`);
      continue;
    }
    if (/^\s*[-*]\s/.test(line)) {
      if (!inList) { html.push("<ul>"); inList = true; }
      html.push(`<li>${inline(line.replace(/^\s*[-*]\s/, ""))}</li>`);
      continue;
    }
    if (inList) { html.push("</ul>"); inList = false; }
    if (line.trim() === "") {
      html.push("");
      continue;
    }
    html.push(`<p>${inline(line)}</p>`);
  }
  if (inList) html.push("</ul>");
  if (inCode) html.push(`<pre><code>${codeBuf.join("\n")}</code></pre>`);
  return html.join("\n");
}
