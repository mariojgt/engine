# Core Concepts

Five ideas, in order. Read them in sequence — each one builds on the last.

## 1. Scene

A **scene** is a self-contained world. It owns:

- a hierarchy of actors,
- lighting and environment settings (sky, day/night),
- physics worlds (3D and/or 2D),
- a NavMesh (if AI lives here),
- a primary camera.

Implemented in [src/engine/Scene.ts](../src/engine/Scene.ts). You can have many scenes in a project — only one is *active* at a time. Nodes like `Open Scene` and `Load Scene` swap between them at runtime.

## 2. Actor

An **actor** is anything that exists in the scene. Players, enemies, doors, triggers, UI roots, cameras — all actors.

Every actor has:

- a **Transform** — position, rotation, scale (world + local).
- a list of **Components** — geometry, behavior, physics, scripts.
- a parent and children (forming the scene's hierarchy tree).

Actors don't have built-in behavior. Their behavior comes entirely from the components attached to them.

::: info
You'll sometimes see <code>GameObject</code> in the source ([GameObject.ts](../src/engine/GameObject.ts)) — that's the engine-internal name for an actor. They're the same thing.
:::

## 3. Component

A **component** is a unit of geometry or behavior attached to an actor. Some are visual, some are physics, some are pure logic. Examples:

| Component | What it does |
|-----------|--------------|
| `MeshComponent` | Renders a mesh in the viewport. |
| `LightComponent` | Adds a directional / point / spot light. |
| `ColliderComponent` | Defines a physics shape (Box / Sphere / Capsule / Mesh). |
| `RigidbodyComponent` | Makes the actor physically simulated. |
| `TriggerComponent` | A non-blocking volume that fires overlap events. |
| `CharacterMovementComponent` | Player-style movement (walk, jump, slope handling). |
| `FloatingPawnMovement` | Free-flight movement for spectators / drones. |
| `ProjectileMovementComponent` | Linear motion + gravity + lifespan, for bullets / arrows. |
| `ScriptComponent` | Runs a blueprint. |

You compose actors by stacking components. A "player" is just an actor with a mesh, a collider, a rigidbody, a movement component, and a script.

::: tip
Adding the right components to an actor is most of the work. Scripting is the *last* step — once geometry, physics, and movement are in place, blueprints just decide *when* things happen.
:::

## 4. Script &amp; the lifecycle

A **script** is a blueprint asset attached to an actor via a `ScriptComponent`. When Play starts, the engine compiles the blueprint into JavaScript and runs three lifecycle functions:

<ConceptBox icon="▶️" title="BeginPlay" tone="mint">
Fires <strong>once</strong>, the first frame the actor exists in Play mode. Use this for setup: cache references, spawn helper actors, register input bindings, start music.
</ConceptBox>

<ConceptBox icon="🔄" title="Tick" tone="cyan">
Fires <strong>every frame</strong>, with <code>deltaTime</code> available. Use this for per-frame logic: read input, move the actor, check distances, update timers.
</ConceptBox>

<ConceptBox icon="🛑" title="OnDestroy" tone="red">
Fires <strong>once</strong>, when the actor is removed or Play stops. Use this for cleanup: stop sounds, unsubscribe from events, save persistent state.
</ConceptBox>

You don't write these functions yourself — you connect them as **events** in the blueprint graph. See [Blueprints](/blueprints) for how that turns into runtime code.

::: warning
Scripts run *only* in Play mode. While you're in editor mode, no `BeginPlay` or `Tick` ever fires — that's why physics, animations, and AI all stay frozen until you press Play.
:::

## 5. Controllers and pawns

For actors that represent characters (player, enemy, NPC), Feather follows an Unreal-style **Pawn / Controller split**:

- The **pawn** is the actor in the world — its mesh, collider, rigidbody, movement component.
- The **controller** decides what the pawn does — reads input, runs AI, picks the camera.

Three built-in controllers:

| Controller | Purpose |
|------------|---------|
| [PlayerController](../src/engine/PlayerController.ts) | Reads input, drives the local player's pawn. |
| [AIController](../src/engine/AIController.ts) | Runs a behavior tree; drives an AI pawn. |
| [SpectatorController](../src/engine/SpectatorController.ts) | A free-flying camera, no pawn ownership. |

Why this split? Because you want to switch what controls a pawn without rebuilding it. Same enemy actor, AI in normal play, swap to a `PlayerController` for a possession mechanic — without touching the pawn itself.

## Bonus: GameInstance

The **GameInstance** ([src/engine/GameInstance.ts](../src/engine/GameInstance.ts)) is a singleton that lives across scene transitions. Use it for:

- the player's progression / inventory,
- save data,
- global settings (volume, language),
- anything that should survive a scene swap.

It's exposed to blueprints via the `Game Instance` node category.

## Putting it together

Here's how the concepts compose for a typical "third-person player":

```
Scene
└── Actor "Player"
    ├── Transform
    ├── MeshComponent       → renders the character mesh
    ├── ColliderComponent   → capsule shape
    ├── RigidbodyComponent  → physical body
    ├── CharacterMovementComponent → walking, jumping
    ├── ScriptComponent     → blueprint that reads input → moves
    └── (controlled by) PlayerController

Scene
└── Actor "Camera"
    ├── Transform
    └── (a spring-arm setup that follows Player)
```

Each box on its own is small. The whole assembly is a third-person player.

## Next

- [Blueprints](/blueprints) — how the script graph compiles to JS and runs on each lifecycle event.
- [Editor tour](/editor) — where each of these concepts lives in the UI.
- [Node catalog](/nodes) — the full list of building blocks available to scripts.
