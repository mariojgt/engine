# Architecture Overview

## Runtime core

- `Engine` orchestrates scene updates, physics stepping, lifecycle callbacks, and manager wiring.
- `Scene` owns actors/game objects and runtime spawning integration.
- `ScriptComponent` compiles generated graph code to executable closures.
- `PhysicsWorld` and `Physics2DWorld` provide simulation layers for 3D/2D gameplay.
- `UIManager`, input, audio, event bus, save/load, and particle systems are exposed to scripts via runtime context.

## Editor core

- `src/main.ts` initializes editor shell, toolbar, manager instances, and runtime bridges.
- Docking/panel infrastructure is managed by editor layout modules.
- Asset managers provide authored content for meshes, animation blueprints, widget blueprints, game instance classes, AI, data tables, and build configs.

## Blueprint compile-and-run model

1. Graph edits trigger regeneration.
2. `src/editor/nodeEditor/codeGen.ts` emits JavaScript for data and exec paths.
3. Lifecycle sections are split into `beginPlay`, `tick`, `onDestroy`.
4. `ScriptComponent` compiles and stores executable closures.
5. `Engine` updates script context and runs lifecycle handlers.

## Runtime targets

- **Web runtime** with Vite.
- **Desktop runtime** with Tauri wrapper.

Both targets reuse the same TypeScript engine/editor logic.
