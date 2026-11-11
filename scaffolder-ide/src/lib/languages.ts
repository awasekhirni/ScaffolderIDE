/**
 * languages.ts
 *
 * Maps file extensions → Monaco language id + human-readable label.
 * Also defines the language list exposed in the status bar and Language menu.
 */

export interface LanguageDef {
  id: string;            // Monaco language id
  label: string;         // Display name
  extensions: string[];  // File extensions (without dot)
}

export const LANGUAGES: LanguageDef[] = [
  { id: "typescript", label: "TypeScript", extensions: ["ts", "tsx", "mts", "cts"] },
  { id: "javascript", label: "JavaScript", extensions: ["js", "jsx", "mjs", "cjs"] },
  { id: "python", label: "Python", extensions: ["py", "pyw", "pyi"] },
  { id: "rust", label: "Rust", extensions: ["rs"] },
  { id: "go", label: "Go", extensions: ["go"] },
  { id: "java", label: "Java", extensions: ["java"] },
  { id: "kotlin", label: "Kotlin", extensions: ["kt", "kts"] },
  { id: "swift", label: "Swift", extensions: ["swift"] },
  { id: "c", label: "C", extensions: ["c", "h"] },
  { id: "cpp", label: "C++", extensions: ["cpp", "cc", "cxx", "hpp", "hh"] },
  { id: "csharp", label: "C#", extensions: ["cs"] },
  { id: "php", label: "PHP", extensions: ["php"] },
  { id: "ruby", label: "Ruby", extensions: ["rb"] },
  { id: "shell", label: "Shell", extensions: ["sh", "bash", "zsh"] },
  { id: "powershell", label: "PowerShell", extensions: ["ps1", "psm1"] },
  { id: "lua", label: "Lua", extensions: ["lua"] },
  { id: "perl", label: "Perl", extensions: ["pl", "pm"] },
  { id: "html", label: "HTML", extensions: ["html", "htm", "xhtml"] },
  { id: "css", label: "CSS", extensions: ["css"] },
  { id: "scss", label: "SCSS", extensions: ["scss", "sass"] },
  { id: "less", label: "Less", extensions: ["less"] },
  { id: "json", label: "JSON", extensions: ["json", "jsonc"] },
  { id: "yaml", label: "YAML", extensions: ["yml", "yaml"] },
  { id: "toml", label: "TOML", extensions: ["toml"] },
  { id: "xml", label: "XML", extensions: ["xml", "svg", "rss", "atom"] },
  { id: "markdown", label: "Markdown", extensions: ["md", "markdown", "mdx"] },
  { id: "sql", label: "SQL", extensions: ["sql"] },
  { id: "dockerfile", label: "Dockerfile", extensions: ["dockerfile"] },
  { id: "graphql", label: "GraphQL", extensions: ["graphql", "gql"] },
  { id: "plaintext", label: "Plain Text", extensions: ["txt", "log"] },
];

const EXT_MAP: Record<string, LanguageDef> = (() => {
  const m: Record<string, LanguageDef> = {};
  for (const lang of LANGUAGES) {
    for (const ext of lang.extensions) {
      m[ext.toLowerCase()] = lang;
    }
  }
  return m;
})();

/** Resolve a LanguageDef from a filename. Falls back to plaintext. */
export function detectLanguage(filename: string): LanguageDef {
  // Dockerfile has no extension.
  const lower = filename.toLowerCase();
  if (lower === "dockerfile" || lower.endsWith("/dockerfile")) {
    return LANGUAGES.find((l) => l.id === "dockerfile")!;
  }
  const dot = lower.lastIndexOf(".");
  if (dot < 0 || dot === lower.length - 1) return LANGUAGES.find((l) => l.id === "plaintext")!;
  const ext = lower.slice(dot + 1);
  return EXT_MAP[ext] ?? LANGUAGES.find((l) => l.id === "plaintext")!;
}

export function languageById(id: string): LanguageDef | undefined {
  return LANGUAGES.find((l) => l.id === id);
}
