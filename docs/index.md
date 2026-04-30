---
layout: home

hero:
  name: "Feather Engine"
  text: "Build games. In your browser."
  tagline: "A TypeScript-first game engine with visual scripting, real-time physics, and a dockable editor — running in the browser or as a native desktop app. No reload. No compile step. Just hit play."
  image:
    src: /img4.png
    alt: Feather Engine editor
  actions:
    - theme: brand
      text: Get started →
      link: /introduction
    - theme: alt
      text: Quickstart (5 min)
      link: /quickstart
    - theme: alt
      text: Node catalog
      link: /nodes

features:
  - icon: 🪶
    title: Browser-Native Editor
    details: A full Unreal-style editor — viewport, inspector, content browser, blueprint graph — running on Vite. Open it, build, ship.
  - icon: 🧩
    title: Visual Scripting
    details: Connect nodes in a Rete-powered graph. The engine compiles them into live JavaScript closures. No build step between you and play.
  - icon: ⚙️
    title: Real Physics
    details: Rapier 2D + 3D worlds. Joints, character controllers, collision events, raycasts, and triggers — all wired to nodes.
  - icon: 🎮
    title: 2D + 3D in One
    details: Three.js scene graph, sprite actors, tilemaps, and 2D physics share the same lifecycle, scripts, and editor.
  - icon: 🧠
    title: AI &amp; Navigation
    details: Behavior trees, AI controllers, and Recast NavMesh pathfinding — exposed as nodes you can drop into any actor.
  - icon: 🖼️
    title: Widget Blueprints
    details: Author HUDs visually. Rendered as a DOM overlay over the canvas at runtime — fast, accessible, easy to style.
  - icon: 🖥️
    title: Web + Desktop
    details: One TypeScript codebase. Run in any browser, or wrap in Tauri for a native Windows / macOS / Linux app with filesystem access.
  - icon: 🔌
    title: Extensible By Design
    details: Add your own nodes, components, and runtime systems. The engine, editor, and codegen are all in plain TypeScript.
---

<div style="margin-top: 3rem;">

## Why Feather

<div class="feather-stats">
  <div class="feather-stat">
    <div class="fs-num">200+</div>
    <div class="fs-label">Built-in Nodes</div>
  </div>
  <div class="feather-stat">
    <div class="fs-num">2D + 3D</div>
    <div class="fs-label">Same Engine</div>
  </div>
  <div class="feather-stat">
    <div class="fs-num">0</div>
    <div class="fs-label">Compile Steps</div>
  </div>
  <div class="feather-stat">
    <div class="fs-num">Web · Desktop</div>
    <div class="fs-label">Ship Anywhere</div>
  </div>
</div>

## Pick Your Path

<div class="feather-feature-grid">

<FeatureCard icon="🚀" title="I'm new — show me" href="/quickstart">
Build your first scene, drop an actor, wire two nodes, hit Play. Five minutes, zero ceremony.
</FeatureCard>

<FeatureCard icon="🧭" title="Learn the editor" href="/editor">
The viewport, the inspector, the content browser, the blueprint graph. What every panel does and how they fit together.
</FeatureCard>

<FeatureCard icon="🔗" title="Understand blueprints" href="/blueprints">
How visual graphs become real JavaScript at runtime. Events, exec pins, data pins, custom functions.
</FeatureCard>

<FeatureCard icon="📚" title="Browse all nodes" href="/nodes">
Every node, organized by what it does — events, flow, math, transform, physics, character, UI, AI, audio, 2D.
</FeatureCard>

<FeatureCard icon="🛠️" title="Runtime systems" href="/systems">
Physics, animation, audio, particles, save/load, navigation, sky &amp; day-night — all under the hood.
</FeatureCard>

<FeatureCard icon="🧪" title="Build your own nodes" href="/extending">
Add new gameplay primitives with a few lines of TypeScript. The engine treats your nodes the same as the built-ins.
</FeatureCard>

</div>

## Built With Feather

<div class="feather-showcase-hero" style="margin-top: 1rem;">
  <span class="fsh-tag">★ Showcase · Factory Sim</span>

### Loop Industries

  <p class="fsh-sub">A factory simulation game built end-to-end on Feather Engine — place machines, route conveyor belts, automate production lines, scale up an entire industrial loop.</p>

  <div class="fsh-meta">
    <span class="fsh-pill">Blueprints</span>
    <span class="fsh-pill">3D Physics</span>
    <span class="fsh-pill">Widget UI</span>
    <span class="fsh-pill">Save / Load</span>
  </div>

  <p style="margin-top: 16px;"><a href="/showcase">See more &amp; full gallery →</a></p>
</div>

</div>
