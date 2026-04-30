# Showcase

Real games and tools built with Feather Engine. Want yours featured? Open a PR adding it to this page.

<div class="feather-showcase-hero">
  <span class="fsh-tag">★ Featured · Factory Sim</span>

## Loop Industries

  <p class="fsh-sub">A factory simulation game built end-to-end on Feather Engine. Place machines, route conveyor belts, automate production lines, and scale up an entire industrial loop — all powered by Feather's blueprint visual scripting, 3D physics, and dockable editor.</p>

  <div class="fsh-meta">
    <span class="fsh-pill">Genre: Factory Sim</span>
    <span class="fsh-pill">Engine: Feather</span>
    <span class="fsh-pill">Status: In Development</span>
  </div>
</div>

## Screenshots

<div class="feather-gallery">
  <figure>
    <img src="/img1.png" alt="Loop Industries — main menu and save slots" />
    <figcaption>Main menu — save slots, "Powered by Feather Engine"</figcaption>
  </figure>
  <figure>
    <img src="/img2.png" alt="Loop Industries — factory floor with belts, machines, power grid, and build menu" />
    <figcaption>Factory floor — belts, machines, power grid, build menu</figcaption>
  </figure>
  <figure>
    <img src="/img3.png" alt="Loop Industries — late-game industrial network at sunset" />
    <figcaption>Late-game — sprawling production network at dusk</figcaption>
  </figure>
</div>

## What Loop Industries uses from Feather

<div class="feather-feature-grid">

<FeatureCard icon="🧩" title="Visual Scripting" href="/blueprints">
Every machine's logic — input throughput, output rules, upgrade tiers — is authored as a blueprint graph. Designers iterate without touching engine code.
</FeatureCard>

<FeatureCard icon="⚙️" title="3D Physics" href="/systems#physics">
Conveyor belts, sliding crates, falling resources — all driven by Rapier 3D rigidbodies, joints, and triggers wired into gameplay nodes.
</FeatureCard>

<FeatureCard icon="🖼️" title="Widget UI" href="/systems#ui-widgets">
Build menus, machine inspectors, tech tree, and HUD overlays as widget blueprints. Rendered as a DOM overlay over the canvas — fast, accessible, easy to style.
</FeatureCard>

<FeatureCard icon="💾" title="Save / Load" href="/systems#save-load">
Persistent factory state across sessions. The GameInstance carries inventory, unlocks, and machine layouts between scenes.
</FeatureCard>

<FeatureCard icon="🎬" title="Editor &amp; Tooling" href="/editor">
Levels, machines, recipes, and tech-tree data are all authored inside Feather's dockable editor — no external tooling needed.
</FeatureCard>

<FeatureCard icon="🖥️" title="Web + Desktop" href="/installation#run-as-a-desktop-app-tauri">
Ships to the browser via Vite and to Windows / macOS / Linux desktops via Tauri — same TypeScript codebase, no rewrites.
</FeatureCard>

</div>

## Want your project featured?

If you've shipped or prototyped something with Feather, we want to see it. Open a PR adding a section above with:

- a short pitch (one paragraph),
- 1–3 screenshots dropped into [docs/public/](../public/),
- the Feather features your project leans on.

Templates and structure mirror the Loop Industries entry above.
