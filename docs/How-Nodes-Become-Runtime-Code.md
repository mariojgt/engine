# How Visual Nodes Become Runtime Code

This document explains how the Blueprint node editor transforms visual graphs into
executable JavaScript that runs in real-time — from the moment you connect two nodes
to the moment your game object moves on screen.

---

## Overview

```
┌──────────────┐     ┌──────────────┐     ┌───────────────┐     ┌──────────────┐
│  Rete.js     │────▶│  Code        │────▶│  Shared       │────▶│  Lifecycle   │
│  Node Graph  │     │  Generator   │     │  Closure      │     │  Execution   │
│              │     │              │     │  Compiler     │     │  (Play Mode) │
└──────────────┘     └──────────────┘     └───────────────┘     └──────────────┘
   You edit              Instant             new Function()        beginPlay()
   nodes here            traversal            compiles it          tick() every
                         to JS string                              frame
```

Every time you **add a node**, **remove a node**, **create a connection**, or
**remove a connection**, the system automatically regenerates and recompiles the
entire script. This happens in under a millisecond — you never have to press
"Compile" manually.

---

## Step 1 — Change Detection

The Rete.js editor fires **pipe events** whenever the graph changes:

```
connectioncreated  →  a wire was connected
connectionremoved  →  a wire was disconnected
nodecreated        →  a new node was placed
noderemoved        →  a node was deleted
```

The editor listens for these four events and calls `compileAndSave()` after a
short 50 ms debounce. This is the entry point for the entire code generation
pipeline.

---

## Step 2 — Graph Traversal & Code Generation

The code generator (`generateFullCode`) takes the Rete editor and produces a
single JavaScript string. It works in three passes:

### Pass 1 — Variable Declarations (Preamble)

Every Blueprint variable you create in the "My Blueprint" sidebar becomes a
`let` declaration at the top of the generated code:

| Variable (sidebar)         | Generated Code                              |
|----------------------------|---------------------------------------------|
| `Speed` (Float, default 5) | `let __var_Speed = 5;`                      |
| `IsAlive` (Boolean, true)  | `let __var_IsAlive = true;`                 |
| `Origin` (Vector3)         | `let __var_Origin = { x: 0, y: 0, z: 0 };` |
| `Name` (String)            | `let __var_Name = "";`                      |

These variables live in a **shared closure scope**, meaning every lifecycle event
(BeginPlay, Tick, OnDestroy) and every user-defined function can read and write them.

### Pass 2 — Function & Custom Event Bodies

For each **Function** you defined, the generator:

1. Finds the function's dedicated Rete editor (each function graph has its own editor)
2. Locates the **FunctionEntryNode** in that editor
3. Walks the execution chain starting from the entry node's `exec` output
4. Wraps the result in a named function

```
Visual:   [FunctionEntry: "AddScore"] ──▶ [Set ScoreVar] ──▶ [Print String]

Generated:
  function __fn_AddScore(__param_Amount) {
    __var_Score = (__var_Score + __param_Amount);
    print(__var_Score);
  }
```

**Custom Events** work similarly — each `CustomEventNode` in the event graph
becomes a function:

```
  function __custom_evt_OnHit() {
    print("Ouch!");
  }
```

### Pass 3 — Event Graph Lifecycle Code

The generator scans the **Event Graph** for the three lifecycle entry points and
walks each one's execution chain:

| Node                  | Marker in generated code | When it runs          |
|-----------------------|--------------------------|-----------------------|
| `Event BeginPlay`     | `// __beginPlay__`       | Once when Play starts |
| `Event Tick`          | `// __tick__`            | Every frame           |
| `Event OnDestroy`     | `// __onDestroy__`       | When Play stops       |

#### How "walking the exec chain" works

Starting from an event node's `exec` output, the generator follows the white
execution wires node-by-node. For each node it visits, it calls `genAction()`
which produces the corresponding JavaScript:

```
Visual:
  [Event Tick] ──▶ [Set Actor Position]
                        ├─ x ← [Sine] ← [Get Time]
                        ├─ y ← (Get Actor Position).y
                        └─ z ← (Get Actor Position).z

Generated (under // __tick__):
  gameObject.position.set(
    Math.sin(elapsedTime),
    gameObject.position.y,
    gameObject.position.z
  );
```

#### Data flow resolution

When `genAction` encounters a data input (green/red/yellow wire), it calls
`resolveValue()` which traces backwards through data connections to build an
**expression tree**:

```
[Time] ──▶ [Multiply] ──▶ [Sine] ──▶ (x input of Set Position)
              └── [Float: 2]

resolveValue builds:  Math.sin((elapsedTime * 2))
                      ^^^^^^^^  ^^^^^^^^^^^^^^
                      Sine node  Multiply node
                                 ^^^^^^^^^^  ^
                                 Time node   Float node
```

This is a **recursive** process — each node asks "what's connected to my
inputs?" and resolves those first, building the expression from leaves to root.

---

## Step 3 — The Generated Code (Complete Example)

Given this visual setup:

- **Variable**: `Counter` (Float, default 0)
- **Function**: `IncrementCounter` (no params)
- **Event Tick** → `Call IncrementCounter` → `Set Actor Position(x = Counter)`

The full generated code would look like:

```javascript
let __var_Counter = 0;

function __fn_IncrementCounter() {
  __var_Counter = (__var_Counter + 1);
}

// __tick__
__fn_IncrementCounter();
gameObject.position.set(__var_Counter, gameObject.position.y, gameObject.position.z);
```

---

## Step 4 — Shared Closure Compilation

The generated string is handed to `ScriptComponent.compile()`, which splits it
into regions and compiles everything into a **single closure**:

```javascript
// What the compiler builds internally (simplified):
(function() {
  // ── Shared scope ──────────────────────
  var gameObject, deltaTime, elapsedTime, print;   // context vars
  let __var_Counter = 0;                            // your variables
  function __fn_IncrementCounter() { ... }          // your functions

  // ── Lifecycle closures ────────────────
  var tick = function(ctx) {
    gameObject = ctx.gameObject;     // refresh context each frame
    deltaTime  = ctx.deltaTime;
    elapsedTime = ctx.elapsedTime;
    print = ctx.print;

    // your tick code runs here:
    __fn_IncrementCounter();
    gameObject.position.set(...);
  };

  return { beginPlay: null, tick: tick, onDestroy: null };
})();
```

The critical design decision here: **context variables (`gameObject`, `print`,
etc.) are declared at the factory scope**, not inside each lifecycle closure. This
means your user-defined functions can access `gameObject` and `print` because
they share the same closure scope. Each lifecycle closure *assigns* (not
`var`-declares) these variables from the fresh `ctx` object every call.

---

## Step 5 — Runtime Execution

When you press **Play**, the engine calls lifecycle methods on every GameObject's
ScriptComponent:

```
Play pressed
  └─ For each GameObject:
       └─ script.beginPlay(ctx)    ← runs once

Every frame (60fps):
  └─ For each GameObject:
       └─ script.tick(ctx)         ← runs every frame
            ctx = {
              gameObject: <this object>,
              deltaTime: 0.016,        // ~16ms per frame
              elapsedTime: 3.45,       // seconds since Play
              print: (msg) => outputLog.append(msg)
            }

Play stopped
  └─ For each GameObject:
       └─ script.onDestroy(ctx)    ← runs once
```

---

## Complete Pipeline Summary

```
 YOU                          ENGINE
 ───                          ──────

 Connect two nodes
       │
       ▼
 Rete fires "connectioncreated"
       │
       ▼ (50ms debounce)
 compileAndSave()
       │
       ├──▶ generateFullCode()
       │       │
       │       ├── 1. Variable declarations     →  "let __var_X = 0;"
       │       ├── 2. Function bodies            →  "function __fn_Y() {...}"
       │       ├── 3. Custom event bodies        →  "function __custom_evt_Z() {...}"
       │       └── 4. Event graph lifecycle code →  "// __tick__\n..."
       │       │
       │       └── Returns full JS string
       │
       ├──▶ ScriptComponent.code = generatedString
       │
       └──▶ ScriptComponent.compile()
               │
               ├── Extract preamble (vars + functions)
               ├── Extract __beginPlay__ block
               ├── Extract __tick__ block
               ├── Extract __onDestroy__ block
               │
               └── new Function(factoryBody)()
                     │
                     └── Returns { beginPlay, tick, onDestroy }
                           │
                           └── Ready to run when you press Play ▶
```

---

## Key Design Decisions

| Decision | Why |
|----------|-----|
| **Regenerate on every change** | No stale code — what you see is always what runs |
| **Single shared closure** | Variables and functions are shared across all lifecycle events |
| **Context vars at factory scope** | User-defined functions can use `gameObject`, `print`, etc. |
| **`new Function()` compilation** | Sandboxed execution — script errors don't crash the editor |
| **Exec-chain walking** | Only code reachable from event nodes gets generated (dead nodes are ignored) |
| **Recursive `resolveValue`** | Data flows are inlined as expressions — no temp variables needed |

---

## Node-to-Code Reference Table

| Node Type | Generated Code |
|-----------|---------------|
| Event Tick | `// __tick__` marker (entry point) |
| Event BeginPlay | `// __beginPlay__` marker |
| Set Actor Position | `gameObject.position.set(x, y, z);` |
| Get Actor Position | `gameObject.position.x` (inline expression) |
| Print String | `print("Hello");` |
| Branch | `if (condition) { ... } else { ... }` |
| For Loop | `for (let __i = 0; __i < count; __i++) { ... }` |
| Sequence | Outputs run sequentially (then0, then1) |
| Math (Add/Sub/Mul/Div) | `(a + b)`, `(a - b)`, `(a * b)`, `(a / b)` |
| Sine / Cosine | `Math.sin(value)`, `Math.cos(value)` |
| Get Variable | `__var_Name` (inline reference) |
| Set Variable | `__var_Name = value;` |
| Function Call | `__fn_FuncName(arg1, arg2);` |
| Call Custom Event | `__custom_evt_EventName();` |
| Add Force | `gameObject.rigidBody.addForce({x, y, z}, true);` |
| Add Impulse | `gameObject.rigidBody.applyImpulse({x, y, z}, true);` |
