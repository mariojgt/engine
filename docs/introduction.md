# Introduction

Feather Engine is a **game engine and editor that lives in your browser**. You author scenes, blueprints, and assets in a dockable editor; you script gameplay by connecting nodes in a graph; you hit Play and your game runs in the same window — no rebuild, no reload, no waiting.

It's written entirely in TypeScript and built on the modern web platform: **Three.js** for rendering, **Rapier** for physics, **Rete** for the visual scripting graph, **Recast** for navigation. You can run it as a Vite-served web app, or wrap it in **Tauri** to ship a native desktop app on Windows, macOS, and Linux.

## The 30-second mental model

<ConceptBox icon="🎬" title="Scene" tone="purple">
A world. Holds actors, lighting, navigation data, and the camera. You can have many scenes; only one is active at a time.
</ConceptBox>

<ConceptBox icon="🎭" title="Actor" tone="cyan">
A thing in your scene. A player, an enemy, a door, a UI root. Has a transform (position / rotation / scale) and a list of components.
</ConceptBox>

<ConceptBox icon="🧱" title="Component" tone="mint">
A piece of behavior or geometry attached to an actor — a mesh, a light, a collider, a movement controller, a script.
</ConceptBox>

<ConceptBox icon="🧠" title="Blueprint" tone="amber">
A visual graph of nodes that defines what an actor does. Compiled to JavaScript and run by a <code>ScriptComponent</code> on Play.
</ConceptBox>

<ConceptBox icon="▶️" title="Play Mode" tone="pink">
The engine starts ticking. <code>BeginPlay</code> fires once, <code>Tick</code> fires every frame, <code>OnDestroy</code> fires when the actor or scene goes away.
</ConceptBox>

That's the whole loop. Everything else — physics, AI, UI, audio, save/load — plugs into those five ideas.

## What you can build

- **3D action games** with character controllers, third-person cameras, NavMesh-driven AI, and physics-based interactions.
- **2D games** with sprite actors, tilemaps, 2D physics, and a dedicated 2D camera.
- **Side-scrollers, top-down shooters, puzzle games, walking sims, prototypes.** The same engine handles them all.
- **Tools and visualizers** — the editor itself is built on the engine, so anything you can render in Three.js, you can wrap in Feather.

## What's in the box

<div class="feather-feature-grid">

<FeatureCard icon="🎨" title="Editor" href="/editor">
Dockable panels (DockView), gizmos, multi-select, drag-and-drop assets, popout windows.
</FeatureCard>

<FeatureCard icon="🧩" title="Blueprint Graph" href="/blueprints">
200+ built-in nodes. Custom events, custom functions, variables, structs, flow control.
</FeatureCard>

<FeatureCard icon="⚙️" title="Physics" href="/systems#physics">
Rapier 3D and Rapier 2D. Rigid bodies, joints, character controllers, raycasts, triggers.
</FeatureCard>

<FeatureCard icon="🎬" title="Animation" href="/systems#animation">
Skeletal mesh playback, animation blueprints with state machines, sprite animation, montages, notifies.
</FeatureCard>

<FeatureCard icon="🧠" title="AI &amp; NavMesh" href="/systems#ai">
Behavior tree manager, AI controllers, Recast Navigation pathfinding.
</FeatureCard>

<FeatureCard icon="🖼️" title="UI Widgets" href="/systems#ui">
Visual widget blueprints rendered as DOM overlays. Buttons, text, images, progress bars, sliders.
</FeatureCard>

<FeatureCard icon="🔊" title="Audio" href="/systems#audio">
Built-in audio system with positional and 2D playback, volume, looping.
</FeatureCard>

<FeatureCard icon="💾" title="Save / Load" href="/systems#save-load">
Game instance, persistent state, save slots — exposed as nodes.
</FeatureCard>

<FeatureCard icon="✨" title="Particles" href="/systems#particles">
Particle system integrated with the engine lifecycle.
</FeatureCard>

<FeatureCard icon="🌅" title="Day/Night &amp; Sky" href="/systems#daynight-sky">
Time-of-day system with sky shading, sun/moon driven lighting.
</FeatureCard>

</div>

## Who Feather is for

- **Solo devs and small teams** who want a single TypeScript codebase for tools and runtime.
- **Designers** who want to script gameplay visually without leaving the editor.
- **Web developers** who already know JavaScript / React and want to make games.
- **Educators and learners** — there's no install gauntlet; clone, `npm run dev`, you're in.

## What Feather is *not*

- It is not a AAA-tier engine. There's no clustered forward+ renderer, no Nanite, no terrain streaming.
- It is not a drop-in Unreal / Unity replacement. Workflows are *inspired* by Unreal, but the engine is its own thing.
- It is not finished. New systems land regularly; expect rough edges around contributor-facing tooling.

If you're shipping a small-to-mid 3D or 2D game, prototyping a mechanic, or teaching gamedev with TypeScript — Feather is built for you.

## What's next

- [Install Feather](/installation) — clone, install, run.
- [Quickstart](/quickstart) — five-minute tour from empty scene to your first running game.
- [Core concepts](/concepts) — actors, components, scenes, scripts, the lifecycle.
