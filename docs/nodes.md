# Node Catalog

Every built-in node, grouped by category. Use the right-hand outline (or `Ctrl+K` search) to jump.

::: tip How to read a card
Each card shows the node's **name**, its **kind** (top-right tag), a short description, and (where useful) its key **input / output pins**. The colored dot beside each pin tells you the type — see [Pin colors](/blueprints#pin-colors).
:::

---

## Events

Entry points. Every action chain in your blueprint starts from one of these.

<div class="feather-node-grid">

<NodeCard
  name="Event Begin Play"
  kind="event"
  desc="Fires once when Play starts (or when the actor spawns mid-game)."
  :outputs='[{"name":"Then","type":"exec"}]'
/>

<NodeCard
  name="Event Tick"
  kind="event"
  desc="Fires every frame. Provides the frame's deltaTime."
  :outputs='[{"name":"Then","type":"exec"},{"name":"Delta Time","type":"num"}]'
/>

<NodeCard
  name="Event On Destroy"
  kind="event"
  desc="Fires once when the actor is removed or Play stops. Cleanup goes here."
  :outputs='[{"name":"Then","type":"exec"}]'
/>

<NodeCard
  name="Custom Event"
  kind="event"
  desc="A named event you create. Trigger it from anywhere with Call Event."
  :outputs='[{"name":"Then","type":"exec"}]'
/>

<NodeCard
  name="Input Key Pressed / Released"
  kind="event"
  desc="Fires on a specific keyboard / mouse button transition."
  :outputs='[{"name":"Then","type":"exec"}]'
/>

<NodeCard
  name="On Collision Begin / End"
  kind="event"
  desc="Fires when this actor's collider starts / stops touching another."
  :outputs='[{"name":"Then","type":"exec"},{"name":"Other","type":"any"}]'
/>

</div>

---

## Flow Control

Branching, looping, gating execution.

<div class="feather-node-grid">

<NodeCard
  name="Branch"
  kind="flow"
  desc="If/else. Routes execution down True or False."
  :inputs='[{"name":"In","type":"exec"},{"name":"Condition","type":"bool"}]'
  :outputs='[{"name":"True","type":"exec"},{"name":"False","type":"exec"}]'
/>

<NodeCard
  name="Sequence"
  kind="flow"
  desc="Fires multiple exec outputs in order. Add as many pins as you need."
  :inputs='[{"name":"In","type":"exec"}]'
  :outputs='[{"name":"Then 0","type":"exec"},{"name":"Then 1","type":"exec"}]'
/>

<NodeCard
  name="For Loop"
  kind="flow"
  desc="Iterates from First to Last, emitting an index on each pass."
  :inputs='[{"name":"In","type":"exec"},{"name":"First","type":"num"},{"name":"Last","type":"num"}]'
  :outputs='[{"name":"Loop Body","type":"exec"},{"name":"Index","type":"num"},{"name":"Completed","type":"exec"}]'
/>

<NodeCard
  name="For Loop with Break"
  kind="flow"
  desc="For Loop that can be exited early via a Break exec pin."
/>

<NodeCard
  name="While Loop"
  kind="flow"
  desc="Repeats while a condition is true. Watch out for infinite loops."
/>

<NodeCard
  name="Do Once"
  kind="flow"
  desc="Fires downstream the first time it's hit. Ignores subsequent triggers."
/>

<NodeCard
  name="Do N"
  kind="flow"
  desc="Fires downstream up to N times, then stops."
/>

<NodeCard
  name="Gate"
  kind="flow"
  desc="A controllable on/off valve for execution flow."
/>

<NodeCard
  name="FlipFlop"
  kind="flow"
  desc="Alternates between two outputs every time it's triggered."
/>

<NodeCard
  name="Multi Gate"
  kind="flow"
  desc="Round-robin across multiple exec outputs."
/>

<NodeCard
  name="Switch on Int / String"
  kind="flow"
  desc="Routes execution to a labeled output based on a value."
/>

<NodeCard
  name="Delay"
  kind="flow"
  desc="Waits N seconds before continuing. Non-blocking — other tick logic keeps running."
  :inputs='[{"name":"In","type":"exec"},{"name":"Duration","type":"num"}]'
  :outputs='[{"name":"Then","type":"exec"}]'
/>

</div>

---

## Math

<div class="feather-node-grid">

<NodeCard
  name="Add / Subtract / Multiply / Divide"
  kind="pure"
  desc="The four basics. Available for floats and Vector3."
  :inputs='[{"name":"A","type":"num"},{"name":"B","type":"num"}]'
  :outputs='[{"name":"Result","type":"num"}]'
/>

<NodeCard
  name="Greater Than / Less Than"
  kind="pure"
  desc="Comparison nodes. Output a bool."
  :inputs='[{"name":"A","type":"num"},{"name":"B","type":"num"}]'
  :outputs='[{"name":"Result","type":"bool"}]'
/>

<NodeCard
  name="Abs"
  kind="pure"
  desc="Absolute value. abs(-3) = 3."
  :inputs='[{"name":"Value","type":"num"}]'
  :outputs='[{"name":"Result","type":"num"}]'
/>

<NodeCard
  name="Clamp"
  kind="pure"
  desc="Constrains a value between min and max."
  :inputs='[{"name":"Value","type":"num"},{"name":"Min","type":"num"},{"name":"Max","type":"num"}]'
  :outputs='[{"name":"Result","type":"num"}]'
/>

<NodeCard
  name="Lerp"
  kind="pure"
  desc="Linear interpolation between A and B by alpha."
  :inputs='[{"name":"A","type":"num"},{"name":"B","type":"num"},{"name":"Alpha","type":"num"}]'
  :outputs='[{"name":"Result","type":"num"}]'
/>

<NodeCard
  name="Sin / Cos"
  kind="pure"
  desc="Trigonometry. Useful for oscillation, circular motion, easing."
  :inputs='[{"name":"Radians","type":"num"}]'
  :outputs='[{"name":"Result","type":"num"}]'
/>

<NodeCard
  name="Extended Math"
  kind="pure"
  desc="Pow, sqrt, mod, min/max, floor, ceil, round, sign, atan2, exp, log."
/>

</div>

---

## Values & Literals

Constants you type into a node.

<div class="feather-node-grid">

<NodeCard
  name="Float Literal"
  kind="value"
  desc="A constant number."
  :outputs='[{"name":"Value","type":"num"}]'
/>

<NodeCard
  name="Integer Literal"
  kind="value"
  desc="A constant whole number."
  :outputs='[{"name":"Value","type":"num"}]'
/>

<NodeCard
  name="Boolean"
  kind="value"
  desc="True / False toggle."
  :outputs='[{"name":"Value","type":"bool"}]'
/>

<NodeCard
  name="String Literal"
  kind="value"
  desc="A constant string."
  :outputs='[{"name":"Value","type":"str"}]'
/>

<NodeCard
  name="Vector3 Literal"
  kind="value"
  desc="(X, Y, Z) constant. Used for positions, directions, scales."
  :outputs='[{"name":"Value","type":"vec3"}]'
/>

<NodeCard
  name="Color"
  kind="value"
  desc="RGBA color picker."
  :outputs='[{"name":"Value","type":"color"}]'
/>

<NodeCard
  name="Delta Time"
  kind="value"
  desc="Seconds since last frame. Crucial for frame-rate-independent motion."
  :outputs='[{"name":"Value","type":"num"}]'
/>

<NodeCard
  name="Time"
  kind="value"
  desc="Seconds since Play started."
  :outputs='[{"name":"Value","type":"num"}]'
/>

</div>

---

## Variables

Named, typed state that persists across ticks.

<div class="feather-node-grid">

<NodeCard
  name="Get [Variable]"
  kind="pure"
  desc="Reads the current value of a blueprint variable."
  :outputs='[{"name":"Value","type":"any"}]'
/>

<NodeCard
  name="Set [Variable]"
  kind="action"
  desc="Writes a new value into a blueprint variable."
  :inputs='[{"name":"In","type":"exec"},{"name":"Value","type":"any"}]'
  :outputs='[{"name":"Then","type":"exec"}]'
/>

<NodeCard
  name="Make Struct / Break Struct"
  kind="pure"
  desc="Compose or decompose a custom struct value."
/>

</div>

---

## Conversions

Coerce one type into another. Drop these between mismatched pins.

<div class="feather-node-grid">

<NodeCard name="Bool → Number" kind="convert" :inputs='[{"name":"In","type":"bool"}]' :outputs='[{"name":"Out","type":"num"}]' />
<NodeCard name="Bool → String" kind="convert" :inputs='[{"name":"In","type":"bool"}]' :outputs='[{"name":"Out","type":"str"}]' />
<NodeCard name="Number → Bool" kind="convert" :inputs='[{"name":"In","type":"num"}]' :outputs='[{"name":"Out","type":"bool"}]' />
<NodeCard name="Number → String" kind="convert" :inputs='[{"name":"In","type":"num"}]' :outputs='[{"name":"Out","type":"str"}]' />
<NodeCard name="String → Bool" kind="convert" :inputs='[{"name":"In","type":"str"}]' :outputs='[{"name":"Out","type":"bool"}]' />
<NodeCard name="String → Number" kind="convert" :inputs='[{"name":"In","type":"str"}]' :outputs='[{"name":"Out","type":"num"}]' />
<NodeCard name="String → Color" kind="convert" :inputs='[{"name":"In","type":"str"}]' :outputs='[{"name":"Out","type":"color"}]' />
<NodeCard name="Color → String" kind="convert" :inputs='[{"name":"In","type":"color"}]' :outputs='[{"name":"Out","type":"str"}]' />

</div>

---

## Transform

Read and write actor position, rotation, scale.

<div class="feather-node-grid">

<NodeCard
  name="Get Position / Rotation / Scale"
  kind="pure"
  desc="Reads the actor's current transform component."
  :inputs='[{"name":"Target","type":"any"}]'
  :outputs='[{"name":"Value","type":"vec3"}]'
/>

<NodeCard
  name="Set Position"
  kind="action"
  desc="Teleports the actor to a world position."
  :inputs='[{"name":"In","type":"exec"},{"name":"Target","type":"any"},{"name":"Location","type":"vec3"}]'
  :outputs='[{"name":"Then","type":"exec"}]'
/>

<NodeCard
  name="Set Rotation"
  kind="action"
  desc="Sets the actor's rotation as Euler degrees."
  :inputs='[{"name":"In","type":"exec"},{"name":"Target","type":"any"},{"name":"Rotation","type":"vec3"}]'
/>

<NodeCard
  name="Set Scale"
  kind="action"
  desc="Sets the actor's scale."
  :inputs='[{"name":"In","type":"exec"},{"name":"Target","type":"any"},{"name":"Scale","type":"vec3"}]'
/>

<NodeCard
  name="Get / Set Actor"
  kind="action"
  desc="Read and modify general actor state — name, tag, parent, hidden, lifetime."
/>

</div>

---

## Spawning &amp; Selection

Create actors, find references, destroy.

<div class="feather-node-grid">

<NodeCard
  name="Spawn Actor"
  kind="action"
  desc="Spawns an actor template at a position."
  :inputs='[{"name":"In","type":"exec"},{"name":"Class","type":"any"},{"name":"Location","type":"vec3"}]'
  :outputs='[{"name":"Then","type":"exec"},{"name":"Spawned","type":"any"}]'
/>

<NodeCard
  name="Destroy Actor"
  kind="action"
  desc="Removes an actor from the scene; OnDestroy fires."
  :inputs='[{"name":"In","type":"exec"},{"name":"Target","type":"any"}]'
/>

<NodeCard
  name="Find Actor by Name / Tag"
  kind="pure"
  desc="Locate an actor by string match."
  :outputs='[{"name":"Found","type":"any"}]'
/>

<NodeCard
  name="Get Self"
  kind="pure"
  desc="Reference to the actor running this script."
  :outputs='[{"name":"Self","type":"any"}]'
/>

</div>

---

## Physics (3D)

Forces, impulses, velocity queries. Backed by [Rapier3D](https://rapier.rs).

<div class="feather-node-grid">

<NodeCard
  name="Add Force"
  kind="action"
  desc="Apply continuous force to a rigidbody. Frame-rate-aware."
  :inputs='[{"name":"In","type":"exec"},{"name":"Target","type":"any"},{"name":"Force","type":"vec3"}]'
/>

<NodeCard
  name="Add Impulse"
  kind="action"
  desc="One-shot velocity change. Use for jumps, knockback, explosions."
  :inputs='[{"name":"In","type":"exec"},{"name":"Target","type":"any"},{"name":"Impulse","type":"vec3"}]'
/>

<NodeCard
  name="Add Force / Impulse At Location"
  kind="action"
  desc="Off-center force — also imparts torque. Useful for hits at a specific point."
/>

<NodeCard
  name="Add Torque / Add Angular Impulse"
  kind="action"
  desc="Rotational equivalents of force / impulse."
/>

<NodeCard
  name="Get / Set Velocity"
  kind="action"
  desc="Read or override linear velocity directly."
/>

<NodeCard
  name="Get Speed"
  kind="pure"
  desc="Magnitude of linear velocity."
  :outputs='[{"name":"Speed","type":"num"}]'
/>

<NodeCard
  name="Get / Set Angular Velocity"
  kind="action"
  desc="Read or override rotational velocity."
/>

<NodeCard
  name="Set Body Type"
  kind="action"
  desc="Switch between Dynamic, Kinematic, and Static at runtime."
/>

<NodeCard
  name="Set Gravity Scale / Enabled"
  kind="action"
  desc="Per-body gravity tuning. Useful for floaty enemies, low-gravity zones."
/>

<NodeCard
  name="Set / Get Mass"
  kind="action"
  desc="Read or override the body's mass."
/>

<NodeCard
  name="Set Linear / Angular Damping"
  kind="action"
  desc="How quickly velocity decays. Higher = more friction-like behavior."
/>

<NodeCard
  name="Set Physics Material"
  kind="action"
  desc="Friction and restitution (bounciness)."
/>

<NodeCard
  name="Set Constraint"
  kind="action"
  desc="Lock or free axes of motion / rotation per body."
/>

<NodeCard
  name="Sleep / Wake"
  kind="action"
  desc="Manually put a body to sleep or force-wake it."
/>

<NodeCard
  name="Reset Physics"
  kind="action"
  desc="Zero-out velocities and clear pending forces."
/>

<NodeCard
  name="Teleport Physics Body"
  kind="action"
  desc="Move a rigidbody without solver penetration. Use instead of Set Position for physics actors."
/>

<NodeCard
  name="Radial Force / Impulse"
  kind="action"
  desc="Explosion-style outward force around a point."
/>

<NodeCard
  name="Set World Gravity"
  kind="action"
  desc="Change the global gravity vector at runtime."
/>

</div>

---

## Collision &amp; Tracing

<div class="feather-node-grid">

<NodeCard
  name="Line Trace by Channel"
  kind="action"
  desc="Cast a ray; returns the first hit and surface info."
  :inputs='[{"name":"In","type":"exec"},{"name":"Start","type":"vec3"},{"name":"End","type":"vec3"}]'
  :outputs='[{"name":"Then","type":"exec"},{"name":"Hit","type":"bool"},{"name":"Hit Actor","type":"any"},{"name":"Hit Location","type":"vec3"}]'
/>

<NodeCard
  name="Sphere / Box Trace"
  kind="action"
  desc="Swept-volume traces for thicker collision queries."
/>

<NodeCard
  name="Overlap Query"
  kind="action"
  desc="Find every actor inside a shape volume. Useful for AOE damage."
/>

<NodeCard
  name="On Collision / On Overlap"
  kind="event"
  desc="Begin / End events when colliders touch or volumes overlap."
/>

<NodeCard
  name="Set Collision Enabled"
  kind="action"
  desc="Toggle a collider on or off without removing the component."
/>

</div>

---

## Character &amp; Camera

Player and AI movement, camera control.

<div class="feather-node-grid">

<NodeCard
  name="Add Movement Input"
  kind="action"
  desc="Push the character along an input vector. Respects ground normal, slopes, jump state."
/>

<NodeCard
  name="Jump"
  kind="action"
  desc="Trigger a jump on a CharacterMovementComponent."
/>

<NodeCard
  name="Set Walk / Run / Crouch Speed"
  kind="action"
  desc="Tune movement speed at runtime — sprinting, sneaking, swimming."
/>

<NodeCard
  name="Get / Set Controller"
  kind="action"
  desc="Read or swap the controller possessing a pawn."
/>

<NodeCard
  name="Get Player Controller"
  kind="pure"
  desc="Reference to the local player's controller."
  :outputs='[{"name":"Controller","type":"any"}]'
/>

<NodeCard
  name="Set Camera Target"
  kind="action"
  desc="Point a camera at an actor (used with spring-arm setups)."
/>

<NodeCard
  name="Set Spring Arm Length"
  kind="action"
  desc="Zoom in / out on a third-person camera rig."
/>

<NodeCard
  name="AI Move To"
  kind="action"
  desc="Path-find and move an AI pawn to a destination via NavMesh."
/>

</div>

---

## AI &amp; NavMesh

<div class="feather-node-grid">

<NodeCard
  name="Run Behavior Tree"
  kind="action"
  desc="Start the actor's behavior tree (defined as a separate asset)."
/>

<NodeCard
  name="Stop Behavior Tree"
  kind="action"
  desc="Halt the running behavior tree."
/>

<NodeCard
  name="Get NavMesh Path"
  kind="pure"
  desc="Compute waypoints between two points on the NavMesh."
/>

<NodeCard
  name="Project Point to NavMesh"
  kind="pure"
  desc="Snap a world point to the nearest navigable position."
/>

</div>

---

## UI &amp; Widgets

Build runtime HUDs with widget blueprints. Rendered as a DOM overlay above the canvas.

<div class="feather-node-grid">

<NodeCard
  name="Create Widget"
  kind="action"
  desc="Instantiate a widget blueprint and add it to the screen."
  :outputs='[{"name":"Then","type":"exec"},{"name":"Widget","type":"any"}]'
/>

<NodeCard
  name="Remove Widget"
  kind="action"
  desc="Tear down a previously created widget."
/>

<NodeCard
  name="Set Text"
  kind="action"
  desc="Update the text shown on a Text widget element."
/>

<NodeCard
  name="Set Visibility"
  kind="action"
  desc="Show or hide a widget element."
/>

<NodeCard
  name="Set Color / Opacity"
  kind="action"
  desc="Tint or fade widget elements."
/>

<NodeCard
  name="Set Progress / Slider Value"
  kind="action"
  desc="Drive progress bars and sliders from gameplay state."
/>

<NodeCard
  name="On Button Clicked"
  kind="event"
  desc="Fires when a widget button receives a click."
/>

<NodeCard
  name="Set Cursor / Input Mode"
  kind="action"
  desc="Lock the cursor for gameplay, free it for menus."
/>

</div>

---

## Animation

<div class="feather-node-grid">

<NodeCard
  name="Play Animation"
  kind="action"
  desc="Play a clip on a skeletal mesh."
/>

<NodeCard
  name="Set Animation Variable"
  kind="action"
  desc="Update a value the AnimBlueprint state machine reads (Speed, IsGrounded, etc)."
/>

<NodeCard
  name="Play Montage"
  kind="action"
  desc="One-shot clip layered on top of the locomotion state."
/>

<NodeCard
  name="On Anim Notify"
  kind="event"
  desc="Fires at a tagged frame inside an animation — e.g. footstep, swing-impact."
/>

</div>

---

## Audio

<div class="feather-node-grid">

<NodeCard
  name="Play Sound"
  kind="action"
  desc="One-shot or looping playback of a sound asset."
  :inputs='[{"name":"In","type":"exec"},{"name":"Sound","type":"any"},{"name":"Volume","type":"num"}]'
/>

<NodeCard
  name="Stop Sound"
  kind="action"
  desc="Halt a sound by name or handle."
/>

<NodeCard
  name="Set Volume"
  kind="action"
  desc="Adjust master / category / per-sound volume."
/>

<NodeCard
  name="Play Sound At Location"
  kind="action"
  desc="3D positional playback at a world point."
/>

</div>

---

## Save / Load &amp; Game Instance

<div class="feather-node-grid">

<NodeCard
  name="Save Game to Slot"
  kind="action"
  desc="Persist the GameInstance state to a named slot."
/>

<NodeCard
  name="Load Game from Slot"
  kind="action"
  desc="Restore GameInstance state from a slot."
/>

<NodeCard
  name="Get / Set Game Instance Variable"
  kind="action"
  desc="Read and write values that survive scene transitions."
/>

</div>

---

## 2D — Sprites, Tilemaps, 2D Physics

Same engine, dedicated 2D path. Uses [Camera2D](../src/engine/Camera2D.ts), [Physics2DWorld](../src/engine/Physics2DWorld.ts), and the 2D animation system.

<div class="feather-node-grid">

<NodeCard
  name="Set Sprite"
  kind="action"
  desc="Swap the sprite shown on a sprite actor."
/>

<NodeCard
  name="Play Sprite Animation"
  kind="action"
  desc="Start a flipbook animation on a sprite."
/>

<NodeCard
  name="Get Tile / Set Tile"
  kind="action"
  desc="Read or modify a single tile in a tilemap layer."
/>

<NodeCard
  name="Add Force 2D"
  kind="action"
  desc="Force on a 2D rigidbody (Vector2)."
/>

<NodeCard
  name="Character 2D Move"
  kind="action"
  desc="Side-scroller / top-down movement primitive."
/>

<NodeCard
  name="Camera2D Follow"
  kind="action"
  desc="Make the 2D camera track an actor with optional damping and bounds."
/>

</div>

---

## Components

Add and configure components from blueprints (rather than authoring them in the inspector).

<div class="feather-node-grid">

<NodeCard
  name="Add Light Component"
  kind="action"
  desc="Spawn a light on the actor at runtime."
/>

<NodeCard
  name="Set Mesh"
  kind="action"
  desc="Swap the mesh shown by a MeshComponent."
/>

<NodeCard
  name="Set Trigger Volume"
  kind="action"
  desc="Resize a TriggerComponent volume."
/>

</div>

---

## Casting &amp; Inheritance

Convert between actor / component types. Useful when a generic reference holds a known subclass.

<div class="feather-node-grid">

<NodeCard
  name="Cast To [Type]"
  kind="flow"
  desc="If the input is the requested type, exec passes through 'Cast Succeeded' with a typed reference. Otherwise 'Cast Failed' fires."
  :inputs='[{"name":"In","type":"exec"},{"name":"Object","type":"any"}]'
  :outputs='[{"name":"Cast Succeeded","type":"exec"},{"name":"Cast Failed","type":"exec"},{"name":"As [Type]","type":"any"}]'
/>

<NodeCard
  name="Get Game Instance"
  kind="pure"
  desc="Reference to the project-wide GameInstance."
/>

<NodeCard
  name="Is A"
  kind="pure"
  desc="Boolean check — does this object inherit a given class?"
/>

</div>

---

## Utility

<div class="feather-node-grid">

<NodeCard
  name="Print String"
  kind="action"
  desc="Write a message to the Output Log. Often the first node you wire up."
  :inputs='[{"name":"In","type":"exec"},{"name":"Message","type":"str"}]'
/>

<NodeCard
  name="Open Scene"
  kind="action"
  desc="Switch to a different scene asset."
/>

<NodeCard
  name="Load Scene (Async)"
  kind="action"
  desc="Streaming variant — fires Then when the scene is ready."
/>

<NodeCard
  name="Set Timer by Name"
  kind="action"
  desc="Schedule a custom event to fire after a delay (or repeatedly)."
/>

<NodeCard
  name="Format String"
  kind="pure"
  desc="String interpolation — substitute named variables into a template."
/>

</div>

---

## A note on completeness

The catalog above is a **representative cross-section** of the most-used built-in nodes. The actual project ships ~200 nodes across the categories listed in [src/editor/nodes/](../src/editor/nodes/). For the complete enumeration, the directory tree itself is the source of truth — every `.ts` file under `nodes/` registers one or more nodes via `registerNode(displayName, category, factory)`.

To extend the catalog with your own nodes, see [Extending Feather](/extending#adding-new-nodes).
