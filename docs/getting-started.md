# Getting Started

## 1) Install and run the editor

```bash
npm install
npm run dev
```

Open the Vite URL (default `http://localhost:5173`) to load the editor app.

## 2) Understand primary entry points

- `index.html` → `src/main.ts` (editor + tooling shell)
- `gameplay.html` → `src/gameplay.ts` (runtime-focused entry)
- `popout.html` → `src/popout-entry.ts` (detached/popout UI flow)

## 3) Build and preview

```bash
npm run build
npm run preview
```

## 4) Desktop mode with Tauri

```bash
npm run tauri dev
```

Use this when you need desktop-native packaging and host-level integrations.

## 5) Documentation workflow

```bash
cd docs
npm install
npm run docs:dev
```

