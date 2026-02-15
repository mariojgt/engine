# Drag-From-Pin Context Menu

When you drag a wire from a pin and release it on empty space, a context menu appears showing only nodes that are compatible with that pin. This works just like Unreal Engine's blueprint editor.

## How It Works

### 1. Drag from a Cast Output Pin (ClassRef)

If you drag from a **Cast To** node's output (e.g. `As PlayerCharacter`), the menu gives you **full access** to that actor's blueprint — exactly like UE:

- **Variables** — `Get Health`, `Set Health`, `Get Score`, etc.
- **Functions** — `Call TakeDamage`, `Call Respawn`, etc.
- **Custom Events** — `Call OnDeath`, etc.
- **Components** — all component nodes for that actor (light on/off, trigger enable, mesh visibility, etc.)
- **Character** — movement nodes if the actor is a Character Pawn (Jump, Set Max Walk Speed, Get Velocity, Camera, Spring Arm, etc.)
- **Physics** — Add Force, Set Velocity, etc.
- **Transform** — Set/Get Position, Rotation, Scale
- **Collision** — collision enable/disable, overlap checks
- **Object Actions** — Get Actor Name, Is Valid

### 2. Drag from a Generic ObjectRef Pin

If you drag from a generic object pin (e.g. `Other Actor` on an overlap event), the menu shows:

- **Cast To** entries for every actor class in your project
- **Object Actions** — Get Actor Name, Is Valid

### 3. Drag from a Data Pin

If you drag from a data pin (Number, Boolean, String, etc.), the menu shows all palette nodes that have a compatible socket.

### 4. Exec Pins

Dragging from exec pins does **not** open the menu — exec wires connect directly.

## Auto-Connect

When you pick a node from the menu, it is automatically connected to the pin you dragged from. No extra wiring needed.

## Example: Full Actor Access Through Cast

```
OnBeginOverlap → [Other Actor] ──drag──> Cast to Enemy
                                              │
                          [As Enemy] ──drag──> Get Health          (variable)
                                              Set IsAggro          (variable)
                                              Call TakeDamage      (function)
                                              Set Light Enabled    (component)
                                              Get Character Velocity (character)
                                              Set Spring Arm Length   (camera)
                                              Add Force              (physics)
```

1. **OnBeginOverlap** gives you `Other Actor` (ObjectRef).
2. Drag from `Other Actor`, release → pick **Cast to Enemy**.
3. Drag from `As Enemy` output → you see **everything** the Enemy blueprint has.
4. Pick any node → it's created and auto-wired.

## What "Full Access" Means

When you cast to an actor, the menu shows every category that exists in that actor's blueprint:

| Category | What You See | When |
|----------|-------------|------|
| Variables | Get/Set for every variable | Always (if the actor has variables) |
| Functions | Call for every function | Always (if the actor has functions) |
| Events | Call for every custom event | Always (if the actor has custom events) |
| Components | Light, Trigger, Mesh nodes | Based on what components the actor has |
| Character | Movement, Jump, Crouch, etc. | Only if the actor is a Character Pawn |
| Camera | Spring Arm, Camera Lag, FOV | Only if the actor is a Character Pawn |
| Physics | Forces, Velocity, Gravity | Always for object pins |
| Transform | Position, Rotation, Scale | Always for object pins |
| Collision | Enable/Disable, Overlap | Always for object pins |

## Remote Variable & Function Access

- `Get <Var> (Remote)` / `Set <Var> (Remote)` — read/write variables on another actor via `_scriptVars`
- `<Func> (Remote)` — call a function on another actor via `_scriptFunctions`
- Socket types are preserved (Number, Boolean, String, Vector3, Color, etc.) so connections stay correct
