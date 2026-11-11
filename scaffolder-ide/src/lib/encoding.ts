/**
 * encoding.ts
 *
 * Encoding detection + small encoding toolbox (Base64, URL, HTML, Hex, Binary).
 *
 * Browser TextEncoder only emits UTF-8 — there is no native ISO-8859-1 encoder.
 * For non-UTF-8 detection we sniff BOMs and high-bit byte ratios, which is
 * enough for the status bar indicator and Properties dialog.
 */

export type Encoding = "UTF-8" | "UTF-8-BOM" | "UTF-16-LE" | "UTF-16-BE" | "ISO-8859-1" | "ASCII" | "Binary";

/**
 * Detect the most likely encoding of a byte buffer.
 * Heuristic, not cryptographic — accurate enough for a status-bar label.
 */
export function detectEncoding(bytes: Uint8Array): Encoding {
  if (bytes.length === 0) return "UTF-8";

  // BOM checks first.
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) return "UTF-8-BOM";
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return "UTF-16-LE";
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return "UTF-16-BE";

  // Scan for invalid-UTF-8 sequences and binary nulls.
  let hasNull = false;
  let hasHighBit = false;
  let invalidUtf8 = false;
  let i = 0;
  while (i < bytes.length) {
    const b = bytes[i];
    if (b === 0) hasNull = true;
    if (b >= 0x80) hasHighBit = true;

    // UTF-8 multi-byte validation.
    if (b < 0x80) {
      i++;
    } else if ((b & 0xe0) === 0xc0) {
      if (i + 1 >= bytes.length || (bytes[i + 1] & 0xc0) !== 0x80) { invalidUtf8 = true; i++; }
      else i += 2;
    } else if ((b & 0xf0) === 0xe0) {
      if (i + 2 >= bytes.length || (bytes[i + 1] & 0xc0) !== 0x80 || (bytes[i + 2] & 0xc0) !== 0x80) {
        invalidUtf8 = true; i++;
      } else i += 3;
    } else if ((b & 0xf8) === 0xf0) {
      if (i + 3 >= bytes.length || (bytes[i + 1] & 0xc0) !== 0x80 || (bytes[i + 2] & 0xc0) !== 0x80 || (bytes[i + 3] & 0xc0) !== 0x80) {
        invalidUtf8 = true; i++;
      } else i += 4;
    } else {
      invalidUtf8 = true; i++;
    }
  }

  if (hasNull) return "Binary";
  if (!hasHighBit) return "ASCII";
  if (invalidUtf8) return "ISO-8859-1";
  return "UTF-8";
}

// ─── Base64 ────────────────────────────────────────────────────────────────

export function base64Encode(text: string): string {
  // Convert UTF-8 string to bytes before encoding so non-ASCII survives.
  const bytes = new TextEncoder().encode(text);
  let bin = "";
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin);
}

export function base64Decode(text: string): string {
  const bin = atob(text.trim());
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return new TextDecoder("utf-8", { fatal: false }).decode(bytes);
}

// ─── URL Encode / Decode ───────────────────────────────────────────────────

export function urlEncode(text: string): string {
  return encodeURIComponent(text);
}

export function urlDecode(text: string): string {
  return decodeURIComponent(text.replace(/\+/g, "%20"));
}

// ─── HTML Escape / Unescape ────────────────────────────────────────────────

const HTML_ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

export function htmlEscape(text: string): string {
  return text.replace(/[&<>"']/g, (c) => HTML_ESCAPES[c]);
}

const HTML_UNESCAPES: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
  "&#x27;": "'",
  "&apos;": "'",
  "&nbsp;": " ",
};

export function htmlUnescape(text: string): string {
  return text
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
    .replace(/&[a-z#x0-9]+;/gi, (e) => HTML_UNESCAPES[e] ?? e);
}

// ─── Hex ───────────────────────────────────────────────────────────────────

export function hexEncode(text: string): string {
  const bytes = new TextEncoder().encode(text);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join(" ");
}

export function hexDecode(text: string): string {
  const clean = text.replace(/[^0-9a-fA-F]/g, "");
  if (clean.length % 2 !== 0) throw new Error("Hex string has odd length");
  const bytes = new Uint8Array(clean.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(clean.substr(i * 2, 2), 16);
  }
  return new TextDecoder("utf-8", { fatal: false }).decode(bytes);
}

// ─── Binary ────────────────────────────────────────────────────────────────

export function textToBinary(text: string): string {
  const bytes = new TextEncoder().encode(text);
  return Array.from(bytes)
    .map((b) => b.toString(2).padStart(8, "0"))
    .join(" ");
}

export function binaryToText(text: string): string {
  const bits = text.replace(/[^01]/g, "");
  if (bits.length % 8 !== 0) throw new Error("Binary string length is not a multiple of 8");
  const bytes = new Uint8Array(bits.length / 8);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(bits.substr(i * 8, 8), 2);
  }
  return new TextDecoder("utf-8", { fatal: false }).decode(bytes);
}

// ─── Byte Size Pretty-Print ────────────────────────────────────────────────

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}
