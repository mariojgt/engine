# Deep Repository Review (2026-03-26)

This is a deep technical review of the Feather Engine codebase and how everything is working today.

## Executive Summary

Feather is ambitious and already ships a wide game-tooling surface (editor, runtime, node scripting, widgets, AI, physics, build pipeline). The core architecture is viable, but maintainability and reliability can be improved by reducing bootstrap coupling, strengthening build/test gates, and hardening generated-script diagnostics.

## What works well

### 1) Strong feature completeness for an editor-first engine

The repo includes scene editing, asset authoring, node scripting, 2D/3D systems, and desktop shell support in one codebase.

### 2) Practical graph-to-runtime design

The codegen + shared-closure `ScriptComponent` model is a productive compromise between designer workflows and runtime execution flexibility.

### 3) Runtime dependency wiring is explicit

`main.ts` clearly wires managers into the engine/runtime context (asset lookups, AI, UI, audio), which is helpful for debugging and understanding data flow.

### 4) 2D support is not an afterthought

There are dedicated 2D systems (camera, physics, 2D nodes, templates), enabling both 2D and 3D projects without splitting repos.

## Deep technical observations

## A) Composition and bootstrap complexity

The startup path is long and centralized. This creates friction when changing one subsystem because many systems are initialized in a single orchestration layer.

**Impact:**
- harder onboarding,
- higher chance of side effects,
- larger review scope for seemingly small changes.

**Recommendation:**
- split bootstrap into explicit stages (`createCore`, `createManagers`, `wireRuntimeResolvers`, `attachUIPanels`, `bindCommands`).

## B) Dynamic code execution and runtime safety

Blueprint code is compiled via `new Function`, which is powerful for iteration speed.

**Tradeoff:** if codegen emits malformed JS or unexpected context assumptions, errors can surface at runtime rather than compile time.

**Recommendation:**
- enrich compile diagnostics with node IDs,
- emit optional debug mapping files in development,
- add guardrails around high-risk script API edges.

## C) Build/test signal is currently weak

Current root build status is red in this environment due to a syntax issue in `src/index.ts` (`TS1005`).

**Recommendation:**
1. Restore green build first.
2. Add CI checks for `tsc --noEmit` + app build.
3. Add smoke tests for code generation and script compilation.

## D) Documentation discoverability

There are useful markdown docs already, but they were previously less cohesive as a single portal.

**What this update improves:**
- a themed documentation hub,
- clear “what is it / how to use it / node system / deep review” entry points,
- self-hosted deploy workflow for docs.

## How everything is working (end-to-end)

1. Editor boots from `src/main.ts` and initializes engine + managers.
2. Designers author assets and node graphs in editor panels.
3. Codegen transforms graphs into JavaScript lifecycle code.
4. `ScriptComponent` compiles code and runtime executes lifecycle callbacks.
5. Physics/input/UI/AI services are injected through engine context.
6. Web and Tauri targets reuse the same application logic with different host shells.

## Priority roadmap

1. **Fix syntax/build regression in `src/index.ts`.**
2. **Modularize bootstrap orchestration from `main.ts`.**
3. **Add CI quality gates for typecheck/build/tests.**
4. **Add runtime diagnostics for generated scripts.**
5. **Continue docs expansion with task-focused tutorials and examples.**

