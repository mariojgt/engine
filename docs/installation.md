# Installation

Feather runs as a Vite-served web app. You can also wrap that same app in [Tauri](https://tauri.app) for a native desktop build.

## Prerequisites

| Tool | Version | Why |
|------|---------|-----|
| Node.js | 18+ | Vite, TypeScript, build tooling |
| npm (or bun) | 9+ | Package install |
| Rust toolchain | latest stable | **Desktop build only** (Tauri) |

::: tip
Bun also works — the repo ships with both `package-lock.json` and `bun.lock`. Pick whichever you prefer; commands below use `npm` for clarity.
:::

## 1. Clone and install

```bash
git clone <your-feather-fork>.git
cd engine
npm install
```

This pulls Three.js, Rapier 2D + 3D, Rete, DockView, React, Recast, and the rest.

## 2. Run the editor (web)

```bash
npm run dev
```

Open the URL Vite prints (usually `http://localhost:5173`). You should see the Feather editor shell load with empty docked panels — viewport, content browser, inspector, blueprint editor.

::: warning First-load tip
On a fresh checkout the project starts empty. You won't have any actors yet — that's expected. Head to the [Quickstart](/quickstart) for the five-minute tour from empty to playable.
:::

## 3. Build for production (web)

```bash
npm run build
npm run preview
```

This runs `tsc` for typechecking, then `vite build` to produce `dist/`. `vite preview` serves the built bundle locally for sanity-checking before you deploy.

## 4. Run as a desktop app (Tauri)

If you have the Rust toolchain and your platform's Tauri prerequisites installed:

```bash
npm run tauri dev
```

This boots the same web frontend inside a native window. Tauri exposes filesystem, dialog, and shell APIs to the editor, so saving/loading projects becomes a real disk operation rather than IndexedDB.

To produce a distributable installer:

```bash
npm run tauri build
```

The output goes under `src-tauri/target/release/bundle/` — `.dmg` on macOS, `.msi` on Windows, `.AppImage` / `.deb` on Linux.

## 5. Project entry points

Vite is configured with multiple HTML entries, each loading a different runtime:

| Entry | Loads | Purpose |
|-------|-------|---------|
| `index.html` | `src/main.ts` | The full editor + tooling shell. Use this in dev. |
| `gameplay.html` | `src/gameplay.ts` | A gameplay-only entry — runs your game without the editor chrome. |
| `popout.html` | `src/popout-entry.ts` | A detached popout window for editor panels. |

For most authoring work, you only ever open `index.html` (the default). The other entries become relevant when you're shipping or running standalone gameplay sessions.

## 6. Build the docs (this site)

The docs site lives in [docs/](../) and is a separate VitePress project:

```bash
cd docs
npm install
npm run docs:dev
```

VitePress will print a local URL (usually `http://localhost:5174`) where you can browse this site. To produce static HTML for self-hosting:

```bash
npm run docs:build
# output → docs/.vitepress/dist
```

## Troubleshooting

<ConceptBox icon="🚫" title="Vite fails to start with EADDRINUSE" tone="red">
Another process is on port 5173. Kill it (<code>lsof -i :5173</code>) or run with <code>npm run dev -- --port 5174</code>.
</ConceptBox>

<ConceptBox icon="🦀" title="Tauri fails on first build" tone="amber">
You're missing platform prerequisites. See <a href="https://tauri.app/start/prerequisites/">tauri.app/start/prerequisites</a> — most commonly: Xcode CLT on macOS, WebView2 + MSVC build tools on Windows, <code>libwebkit2gtk</code> on Linux.
</ConceptBox>

<ConceptBox icon="📦" title="Type errors during npm run build" tone="cyan">
<code>tsc</code> runs before <code>vite build</code> in strict mode. Fix the errors it prints, or temporarily run <code>vite build</code> alone if you need a quick preview build.
</ConceptBox>

## Next

- [Quickstart](/quickstart) — your first game in five minutes.
- [Editor tour](/editor) — what every panel in the UI does.
