# Scaffolder IDE
**Copyright 2025-26 Beta ORI Inc. All Rights Reserved.**
**Syed,Awase Khirni**

A multi-tab, Monaco-powered code editor that runs entirely in the browser — no installation, no backend, no telemetry. It is purpose-built for **generating hexagonal artefacts for all platforms** (Python, Rust, TypeScript, Nextjs, Swift, Ruby, Kotlin, Java): scaffold ports, adapters, domain entities, and build/distribution artefacts that follow the hexagonal architecture (ports & adapters) pattern from a single, scriptable workspace.


---

## Table of Contents

1. [Quick Start](#quick-start)
2. [Detailed Setup Instructions](#detailed-setup-instructions)
   - [Prerequisites](#prerequisites)
   - [Option A — Bun (recommended)](#option-a--bun-recommended)
   - [Option B — Node.js + npm](#option-b--nodejs--npm)
   - [Option C — Docker](#option-c--docker)
   - [Option D — Static export (no server)](#option-d--static-export-no-server)
   - [Environment Variables](#environment-variables)
   - [Database Setup](#database-setup)
   - [Configuration Files](#configuration-files)
3. [Subsequent Instructions](#subsequent-instructions)
   - [Generating Your First Hexagonal Artefact](#generating-your-first-hexagonal-artefact)
   - [Adding a New Platform Target](#adding-a-new-platform-target)
   - [Build for Production](#build-for-production)
   - [Deploy](#deploy)
   - [Testing](#testing)
   - [Troubleshooting](#troubleshooting)
4. [The 50+ New Features](#the-50-new-features)
5. [Architecture](#architecture)
6. [Keyboard Shortcut Reference](#keyboard-shortcut-reference)
7. [Browser Compatibility](#browser-compatibility)
8. [Production Hardening Notes](#production-hardening-notes)
9. [Roadmap / Known Limitations](#roadmap--known-limitations)
10. [License](#license)

---

## Quick Start

The fastest path from clone to running IDE:

```bash
git clone <your-repo-url> scaffolder-ide
cd scaffolder-ide
bun install
bun run dev
```

Then open the URL printed in the terminal (typically `http://localhost:3000`). That's it — the IDE is fully client-side, so there is no API to start, no database migration to run, and no `.env` file required for local development.

For everyone who needs more hand-holding, alternative runtimes, or production deployment, read on.

---

## Detailed Setup Instructions

### Prerequisites

The IDE itself is a 100% client-side Next.js app, but the toolchain used to build and ship it has a few hard requirements. Verify each before you start.

| Tool | Minimum Version | Why | Check |
|------|-----------------|-----|-------|
| **Bun** | 1.3+ | Preferred runtime; faster install + native bundler | `bun --version` |
| **Node.js** | 20.0+ | Required if you don't use Bun | `node --version` |
| **npm** / **pnpm** / **yarn** | npm 10+ / pnpm 9+ / yarn 4+ | Only if not using Bun | `npm --version` |
| **Git** | 2.30+ | Cloning the repo, contributing back | `git --version` |
| **A modern browser** | Chrome/Edge 120+, Firefox 120+, Safari 17+ | The IDE runs in the browser | — |
| **OS** | macOS 12+, Windows 10+, Ubuntu 22.04+ | Tested on these | — |

Optional, only needed for specific workflows:

- **Docker 24+** — only if you prefer the containerised setup (Option C).
- **PostgreSQL 14+** — only if you swap out the default SQLite DB (see [Database Setup](#database-setup)).
- **Python 3.10+** — only if you enable the Python mini-services (`mini-services/`).

#### Install Bun (recommended)

macOS / Linux:

```bash
curl -fsSL https://bun.sh/install | bash
```

Windows (PowerShell):

```powershell
irm bun.sh/install.ps1 | iex
```

Verify:

```bash
bun --version   # should print 1.3.x or higher
```

#### Install Node.js (alternative)

If you cannot install Bun, install Node.js 20+ from <https://nodejs.org> or via a version manager:

```bash
# using nvm
nvm install 20
nvm use 20

# or using fnm
fnm install 20
fnm use 20
```

Verify:

```bash
node --version   # v20.x.x or higher
npm --version    # 10.x.x or higher
```

---

### Option A — Bun (recommended)

This is the path the maintainers use; it is the fastest and most reliable.

```bash
# 1. Clone
git clone <your-repo-url> scaffolder-ide
cd scaffolder-ide

# 2. Install dependencies
bun install
# This reads package.json + bun.lock and creates node_modules/.
# Typical time on a warm cache: 5-15 seconds.

# 3. (Optional) Initialise the local SQLite database
bun run db:push
# This runs `prisma db push` against the URL in .env (default: ./db/custom.db).
# Only required if you plan to use the Prisma-backed features; the IDE itself
# does not require the DB to function.

# 4. Start the dev server
bun run dev
# Output:
#   ▲ Next.js 16.x.x   (turbo)
#   - Local:   http://localhost:3000
#   - Network: http://192.168.x.x:3000

# 5. Open the IDE in your browser
open http://localhost:3000      # macOS
xdg-open http://localhost:3000  # Linux
start http://localhost:3000     # Windows
```

The dev server hot-reloads on every file save. The IDE persists your open tabs, view preferences, and recent files to `localStorage`, so a refresh restores your session.

---

### Option B — Node.js + npm

If your environment cannot run Bun, use Node.js + npm. The behaviour is identical; only the install step is slower.

```bash
# 1. Clone
git clone <your-repo-url> scaffolder-ide
cd scaffolder-ide

# 2. Install dependencies
npm install
# npm will read package.json and resolve versions from the registry.
# Typical time: 60-180 seconds.

# 3. (Optional) Initialise the local SQLite database
npm run db:push

# 4. Start the dev server
npm run dev

# 5. Open the IDE
# Open http://localhost:3000 in your browser.
```

You can also use `pnpm` or `yarn`:

```bash
pnpm install && pnpm dev
# or
yarn install && yarn dev
```

---

### Option C — Docker

For a reproducible, containerised setup. The included `Caddyfile` is a Caddy reverse-proxy config; you can put any HTTP server in front.

```bash
# 1. Build the production bundle (see Option D or "Build for Production" below)
bun install
bun run build

# 2. Build a Docker image. There is no Dockerfile in this repo by default;
#    here is a minimal one you can drop in at the repo root:
cat > Dockerfile <<'EOF'
FROM oven/bun:1.3 AS build
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile
COPY . .
RUN bun run build

FROM oven/bun:1.3 AS run
WORKDIR /app
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public
EXPOSE 3000
ENV PORT=3000
CMD ["bun", "server.js"]
EOF

# 3. Build & run
docker build -t scaffolder-ide:latest .
docker run --rm -p 3000:3000 scaffolder-ide:latest
```

---

### Option D — Static export (no server)

If you want to host the IDE on a static CDN (GitHub Pages, S3 + CloudFront, Netlify, Vercel static), you can export it as flat HTML/JS/CSS:

```bash
bun install
# Edit next.config.ts and set: output: "export"
bun run build
# Output lands in ./out — copy it to any static host.
```

Note: static export disables any server-side routes (the included `src/app/api/route.ts` is a stub and is safe to drop). The IDE itself is fully client-side, so no functionality is lost.

---

### Environment Variables

The repo ships with a `.env` file containing:

```bash
DATABASE_URL=file:/home/z/my-project/db/custom.db
```

For local development you usually don't need to change this. If you want to use a different database (e.g. PostgreSQL for team development), create a `.env.local` file (Next.js loads it automatically and it overrides `.env`):

```bash
# .env.local
DATABASE_URL=postgresql://user:pass@localhost:5432/scaffolder_ide
```

Then re-run:

```bash
bun run db:push
```

Other environment variables you may set (all optional):

| Variable | Default | Purpose |
|----------|---------|---------|
| `NEXT_TELEMETRY_DISABLED` | `1` | Disable Next.js telemetry |
| `PORT` | `3000` | Port the production server listens on |
| `NODE_ENV` | `development` | `production` enables optimisations |

Never commit secrets in `.env`. Use `.env.local` (already in `.gitignore`).

---

### Database Setup

The project uses Prisma with SQLite by default. The schema lives in `prisma/schema.prisma`. After changing the schema, run:

```bash
# Push the schema to the DB (creates/migrates tables; accepts data loss)
bun run db:push

# Or generate a proper migration
bun run db:migrate

# Generate the @prisma/client types
bun run db:generate

# Wipe and recreate the DB (destructive!)
bun run db:reset
```

The DB is **not required** for the IDE itself. The IDE stores all session state in `localStorage`. The DB is only used by the `db.ts` helper and any feature you build on top of it.

---

### Configuration Files

The key configuration files in this repo:

| File | Purpose |
|------|---------|
| `next.config.ts` | Next.js config (output mode, redirects, etc.) |
| `tsconfig.json` | TypeScript compiler options |
| `tailwind.config.ts` | Tailwind theme & plugin config |
| `postcss.config.mjs` | PostCSS plugins (Tailwind, autoprefixer) |
| `eslint.config.mjs` | ESLint flat config |
| `components.json` | shadcn/ui component registry config |
| `prisma/schema.prisma` | Database schema |
| `Caddyfile` | Caddy reverse-proxy config (for production) |
| `.zscripts/` | Internal build/deploy scripts (build.sh, dev.sh, start.sh, etc.) |

If you fork the project, the two files most likely to need edits are:

1. `src/app/layout.tsx` — page metadata (title, description, icons).
2. `tailwind.config.ts` — if you want a different colour palette.

---

## Subsequent Instructions

Once the IDE is running, here is what to do next — from your first hexagonal artefact to production deployment.

### Generating Your First Hexagonal Artefact

The IDE treats every artefact (a port, an adapter, a domain entity, a build descriptor) as a buffer you author and persist. Follow these steps to scaffold your first one:

1. **Open the IDE** at `http://localhost:3000`. You'll see an untitled buffer.
2. **Create a new buffer** — click `+` in the tab strip, or press `Ctrl+N`.
3. **Insert a hexagonal scaffold snippet** — open Tools → Insert → Snippet Library, pick **Hexagonal Port Skeleton** (or any other hexagonal template). The buffer is filled with a stub:
   ```ts
   // ports/HasUserRepository.ts
   export interface HasUserRepository {
     findById(id: UserId): Promise<User | null>;
     save(user: User): Promise<void>;
   }
   ```
4. **Adapt the snippet** — change the names, types, and method signatures to match your domain. Use the Text menu (Case Conversion, Whitespace, Sort & Order) to clean up bulk-pasted code.
5. **Save the buffer** — `Ctrl+S`. The buffer is persisted to `localStorage` and added to the **Recent Files** list. To save to disk, drag the buffer tab to your file manager (uses the native File System Access API on Chrome/Edge, or a download fallback elsewhere).
6. **Validate** — open Tools → Format → JSON Beautify (or XML Beautify, SQL Format) to validate structure; Tools → Encode → Hex Encode to verify byte-level integrity of binary artefacts.
7. **Diff against the previous version** — View → Diff vs Saved shows line-by-line what you changed since the last save.

### Adding a New Platform Target

To generate artefacts for a new platform (e.g. Rust, Go, Swift):

1. **Add a language definition** — edit `src/lib/languages.ts` and append an entry to `LANGUAGES`:
   ```ts
   { id: "rust", label: "Rust", monacoId: "rust", extension: "rs" }
   ```
2. **Add platform-specific snippets** — edit `src/lib/snippets.ts` and add templates under a new `platform: "rust"` key.
3. **Wire a formatter (optional)** — if the platform has a built-in formatter (e.g. `rustfmt`, `gofmt`), add a function in `src/lib/formatters.ts` and a menu entry in `menu-bar.tsx`.
4. **Reload the IDE** — `Ctrl+R`. The new language appears in View → Language, and the new snippets appear in Tools → Insert.

### Build for Production

The build produces a standalone Next.js bundle in `.next/standalone/`, ready to deploy on any Node.js or Bun host.

```bash
# 1. Install dependencies (if not already)
bun install

# 2. Run the production build
bun run build
# This does:
#   next build
#   cp -r .next/static .next/standalone/.next/
#   cp -r public .next/standalone/

# 3. Start the production server
bun run start
# Equivalent to: NODE_ENV=production bun .next/standalone/server.js
# Listens on $PORT (default 3000).
```

The build also runs the helper scripts in `.zscripts/`:

- `.zscripts/build.sh` — orchestrates the full build (Next + mini-services + DB + Caddyfile).
- `.zscripts/python-runtime-build.sh` — bundles Python sources if present.
- `.zscripts/database-runtime-build.sh` — copies/initialises the SQLite DB.

If `bun run build` produces no `.next/standalone/server.js`, the helper script auto-injects `output: "standalone"` into `next.config.ts` and rebuilds. If that fails, you'll get a clear error message.

### Deploy

Pick any of these — they all work:

- **Vercel** — push to Git, import the repo, done. Vercel auto-detects Next.js.
- **Netlify** — `netlify deploy --build --prod` after `bun run build`.
- **Docker** — see [Option C](#option-c--docker) above.
- **Bare metal / VPS** — `bun run build && bun run start` behind Caddy or nginx. The included `Caddyfile` reverse-proxies `:80` → `:3000`.
- **Static CDN** — see [Option D](#option-d--static-export-no-server) above.

### Testing

The repo ships with shell-based smoke tests in `tests/`:

```bash
# Verify the runtime can build a Python mini-service
bash tests/python-runtime-build.sh

# Verify the runtime can build in a container
bash tests/python-runtime-container.sh

# Verify the DB runtime builds correctly
bash tests/database-runtime-build.sh
```

For unit tests, every text-operation function in `src/lib/text-ops.ts` is a pure `(string) => string` and can be tested with any framework (Vitest, Jest, Bun's built-in `bun test`). Add tests under `tests/unit/` and run:

```bash
bun test
```

### Troubleshooting

| Symptom | Likely Cause | Fix |
|---------|--------------|-----|
| `bun install` fails with `ENOTFOUND` | Network/proxy issue | Configure `HTTPS_PROXY`, or use a mirror |
| `bun run dev` shows blank page | Port 3000 already in use | `PORT=3001 bun run dev` |
| Monaco editor not loading | Browser blocks `cdn.jsdelivr.net` | Self-host `monaco-editor` from `node_modules` |
| Tabs not persisting | `localStorage` disabled / private mode | Allow storage for the site, or use a normal window |
| `db:push` fails with `DATABASE_URL` error | Path is not writable | Change `DATABASE_URL` in `.env` to a writable path |
| Build fails with `output: "standalone"` missing | Custom `next.config` overrides it | The helper script auto-injects it; if that fails, add `output: "standalone"` manually |
| Production server 404s on static assets | `cp -r .next/static` was skipped | Re-run `bun run build`; check that `.next/standalone/.next/static` exists |

---


---

## Architecture

```
src/
├── app/
│   ├── layout.tsx          # Root layout with metadata
│   └── page.tsx            # Main IDE page (assembles all panels)
├── components/
│   └── ide/
│       ├── brand-header.tsx       # Top branded bar
│       ├── menu-bar.tsx           # File/Edit/Selection/Text/Tools/View/Help
│       ├── tab-strip.tsx          # Tab strip with pinning, context menu
│       ├── editor.tsx             # Monaco wrapper with imperative API
│       ├── find-replace.tsx       # Floating find/replace widget
│       ├── status-bar.tsx         # Bottom status bar
│       ├── command-palette.tsx    # Ctrl+Shift+P palette
│       ├── dialogs.tsx            # All modal dialogs (goto, diff, snippets, etc.)
│       └── shortcuts-handler.tsx  # Global key bindings + drag/drop
├── lib/
│   ├── text-ops.ts         # Pure text transforms (case, sort, trim, indent, EOL)
│   ├── encoding.ts         # Encoding detection + Base64/URL/HTML/Hex/Binary
│   ├── formatters.ts       # JSON/XML/SQL/CSS/JS formatters
│   ├── languages.ts        # 30+ language definitions
│   ├── snippets.ts         # Built-in snippet library
│   └── shortcuts.ts        # Keyboard shortcut registry
└── store/
    └── ide-store.ts        # Zustand store: docs, tabs, view, recents, clipboard
```

### Tech Stack

| Layer | Choice | Reason |
|-------|--------|--------|
| Framework | Next.js 16 (App Router) | Required by sandbox; SSR not used — page is fully client |
| Editor | Monaco Editor 0.57 | Industry standard; same engine as VS Code |
| State | Zustand | Lightweight, no boilerplate, easy persistence |
| UI Components | shadcn/ui (Radix + Tailwind) | Accessible, themeable, composable |
| Icons | lucide-react | Consistent icon set |
| Markdown | react-markdown | Renders Markdown preview dialog |

### Key Design Decisions

- **Module-level editor singleton.** `editorApi` is a plain object with imperative methods (`insertText`, `transformBuffer`, `revealLine`) that read from a module-level `_editor` ref. This avoids context-juggling and lets any menu item call editor actions without prop drilling.
- **Pure text operation functions.** Every text transformation lives in `lib/text-ops.ts` as a side-effect-free `(string) => string` function. The editor API's `transformSelection` / `transformBuffer` methods apply them uniformly.
- **localStorage persistence.** Three keys: `scaffolder-ide-session-v1` (open tabs + text), `scaffolder-ide-view-v1` (view prefs), `scaffolder-ide-recents-v1` (recent files). Auto-saves every 10 seconds and on `beforeunload`.
- **Theme sync.** The IDE's `view.theme` is mirrored to `<html>.classList` so Tailwind's `dark:` variants follow Monaco's dark/light theme automatically.

---

## Keyboard Shortcut Reference

| Shortcut | Action |
|----------|--------|
| `Ctrl+N` | New File |
| `Ctrl+O` | Open File |
| `Ctrl+S` | Save |
| `Ctrl+Shift+S` | Save As |
| `Ctrl+Alt+S` | Save All |
| `Ctrl+W` | Close Tab |
| `Ctrl+Shift+W` | Close All |
| `Ctrl+Shift+T` | Reopen Closed Tab |
| `Ctrl+Tab` | Next Tab |
| `Ctrl+Shift+Tab` | Previous Tab |
| `Ctrl+F` | Find |
| `Ctrl+H` | Replace |
| `Ctrl+Shift+F` | Find in Files |
| `Ctrl+G` | Go to Line |
| `Ctrl+Shift+O` | Go to Symbol |
| `Ctrl+Shift+P` | Command Palette |
| `Ctrl+Shift+D` | Duplicate Line |
| `Alt+Up` / `Alt+Down` | Move Line Up / Down |
| `Ctrl+Shift+K` | Delete Line |
| `Ctrl+/` | Toggle Line Comment |
| `Ctrl+Shift+/` | Toggle Block Comment |
| `Ctrl+=` / `Ctrl+-` / `Ctrl+0` | Zoom In / Out / Reset |
| `Alt+Z` | Toggle Word Wrap |
| `Ctrl+M` | Toggle Minimap |
| `Ctrl+F2` | Toggle Bookmark |
| `F2` / `Shift+F2` | Next / Previous Bookmark |
| `Ctrl+D` | Select Next Occurrence (Monaco) |
| `Ctrl+Shift+L` | Select All Occurrences (Monaco) |
| `Shift+Alt+F` | Format Document |
| `Ctrl+K Ctrl+S` | Show Keyboard Shortcuts |

---

## Browser Compatibility

Tested in:
- Chrome / Edge 120+
- Firefox 120+
- Safari 17+

Uses the **FileReader API** for opening files (works everywhere) and `localStorage` for persistence (works everywhere). The **File System Access API** is not yet required — it would enable native save-back-to-disk, but the FileReader approach is more portable.

---

## Production Hardening Notes

- **No `unwrap()` / `expect()` on user paths.** All formatters wrap errors in `try/catch` and surface them via toast notifications.
- **Pure functions.** Every text operation is `(string) => string` — trivially unit-testable.
- **Typed errors.** JSON/XML/SQL formatters throw structured errors with line/column where available.
- **Auto-save.** Sessions persist every 10 seconds and on `beforeunload` — you won't lose work on tab close.
- **Sandboxed HTML preview.** The HTML preview iframe uses `sandbox="allow-scripts"` — scripts run, but the iframe cannot access the parent page or cookies.

---

## Roadmap / Known Limitations

- The `notify`-based file watcher from the Rust foundation is not available in browsers; users must drag-and-drop or use the file picker to load files.
- True native save-back-to-disk requires the File System Access API (Chrome/Edge only). Currently "Save" persists to `localStorage` only.
- No collaborative editing yet (could be added via Yjs or Automerge).
- No git integration yet.
- Cross-platform artefact builders (e.g. actually invoking `cargo build --target wasm32-wasi`) require server-side execution; the IDE generates the source and build manifest, the actual build must run in your CI or a mini-service.

---

## License

MIT. Use it, fork it, ship it.
