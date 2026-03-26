---
layout: home

hero:
  name: "Feather Engine"
  text: "Unreal-style TypeScript Engine + Editor"
  tagline: "A self-hosted game engine docs portal for runtime systems, 2D/3D node scripting, and production workflows."
  actions:
    - theme: brand
      text: What is Feather?
      link: /what-is-feather
    - theme: alt
      text: Learn Nodes (2D/3D)
      link: /node-system

features:
  - title: Unreal-Inspired Workflow
    details: Editor panels, content browser, blueprints, and play mode closely mirror familiar Unreal-style workflows.
  - title: 2D + 3D Runtime Systems
    details: Physics, controllers, AI, animation, UI widgets, and scene/runtime integration across both dimensions.
  - title: Blueprint Code Generation
    details: Visual graphs are transformed to JavaScript lifecycle handlers through shared-closure compilation.
  - title: Self-Hosted Documentation
    details: VitePress docs can be built and deployed with GitHub Actions on your self-hosted runners.
---

## Documentation Goals

This portal explains:

1. what Feather Engine is,
2. how to use it as a developer,
3. how the 2D/3D node system works,
4. and what should be improved next based on a deep repository review.

## Run Docs Locally

```bash
cd docs
npm install
npm run docs:dev
```

## Build Docs Locally

```bash
cd docs
npm install
npm run docs:build
```
