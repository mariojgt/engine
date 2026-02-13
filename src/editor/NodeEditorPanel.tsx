import React, { useEffect, useRef } from 'react';
import { NodeEditor, GetSchemes, ClassicPreset } from 'rete';
import { AreaPlugin, AreaExtensions } from 'rete-area-plugin';
import { ConnectionPlugin, Presets as ConnectionPresets } from 'rete-connection-plugin';
import { ReactPlugin, Presets } from 'rete-react-plugin';
import { createRoot } from 'react-dom/client';
import type { GameObject } from '../engine/GameObject';
import { ScriptComponent } from '../engine/ScriptComponent';

// Import all nodes — side-effect: each file calls registerNode()
import {
  NODE_PALETTE,
  EventTickNode,
  SineNode,
  TimeNode,
  SetPositionNode,
  GetPositionNode,
} from './nodes';
import type { NodeEntry } from './nodes';

type Schemes = GetSchemes<
  ClassicPreset.Node,
  ClassicPreset.Connection<ClassicPreset.Node, ClassicPreset.Node>
>;

// ============================================================
//  CODE GENERATOR  — walks the graph and emits lifecycle blocks
// ============================================================
function generateCodeFromGraph(editor: NodeEditor<Schemes>): string {
  const nodes = editor.getNodes();
  const connections = editor.getConnections();
  if (nodes.length === 0) return '';

  // Maps: target.inputKey → { sourceNodeId, sourceOutputKey }
  const inputSrc = new Map<string, { nid: string; ok: string }>();
  for (const c of connections) {
    inputSrc.set(`${c.target}.${c.targetInput}`, { nid: c.source, ok: c.sourceOutput });
  }

  // Maps: source.outputKey → [{ targetNodeId, targetInputKey }]
  const outputDst = new Map<string, { nid: string; ik: string }[]>();
  for (const c of connections) {
    const key = `${c.source}.${c.sourceOutput}`;
    const arr = outputDst.get(key) || [];
    arr.push({ nid: c.target, ik: c.targetInput });
    outputDst.set(key, arr);
  }

  const nodeMap = new Map(nodes.map(n => [n.id, n]));

  // Resolve a value input recursively
  function resolveValue(nodeId: string, outputKey: string): string {
    const node = nodeMap.get(nodeId);
    if (!node) return '0';

    switch (node.label) {
      case 'Float': {
        const ctrl = node.controls['value'] as ClassicPreset.InputControl<'number'>;
        return String(ctrl?.value ?? 0);
      }
      case 'Boolean': {
        const ctrl = node.controls['value'] as ClassicPreset.InputControl<'number'>;
        return (ctrl?.value ?? 0) ? 'true' : 'false';
      }
      case 'Get Time':
        return 'elapsedTime';
      case 'Get Delta Time':
        return 'deltaTime';
      case 'Event Tick':
        if (outputKey === 'dt') return 'deltaTime';
        return '0';

      // Transform getters
      case 'Get Actor Position':
        return `gameObject.position.${outputKey}`;
      case 'Get Actor Rotation': {
        const map: Record<string, string> = { x: 'x', y: 'y', z: 'z' };
        return `gameObject.rotation.${map[outputKey] || 'x'}`;
      }
      case 'Get Actor Scale':
        return `gameObject.scale.${outputKey}`;

      // Math
      case 'Add':
      case 'Subtract':
      case 'Multiply':
      case 'Divide': {
        const ops: Record<string, string> = { 'Add': '+', 'Subtract': '-', 'Multiply': '*', 'Divide': '/' };
        const aS = inputSrc.get(`${nodeId}.a`);
        const bS = inputSrc.get(`${nodeId}.b`);
        const a = aS ? resolveValue(aS.nid, aS.ok) : '0';
        const b = bS ? resolveValue(bS.nid, bS.ok) : (node.label === 'Divide' ? '1' : '0');
        return `(${a} ${ops[node.label]} ${b})`;
      }
      case 'Sine': {
        const s = inputSrc.get(`${nodeId}.value`);
        return `Math.sin(${s ? resolveValue(s.nid, s.ok) : '0'})`;
      }
      case 'Cosine': {
        const s = inputSrc.get(`${nodeId}.value`);
        return `Math.cos(${s ? resolveValue(s.nid, s.ok) : '0'})`;
      }
      case 'Abs': {
        const s = inputSrc.get(`${nodeId}.value`);
        return `Math.abs(${s ? resolveValue(s.nid, s.ok) : '0'})`;
      }
      case 'Clamp': {
        const v = inputSrc.get(`${nodeId}.value`);
        const mn = inputSrc.get(`${nodeId}.min`);
        const mx = inputSrc.get(`${nodeId}.max`);
        return `Math.min(Math.max(${v ? resolveValue(v.nid, v.ok) : '0'}, ${mn ? resolveValue(mn.nid, mn.ok) : '0'}), ${mx ? resolveValue(mx.nid, mx.ok) : '1'})`;
      }
      case 'Lerp': {
        const aS = inputSrc.get(`${nodeId}.a`);
        const bS = inputSrc.get(`${nodeId}.b`);
        const al = inputSrc.get(`${nodeId}.alpha`);
        const a = aS ? resolveValue(aS.nid, aS.ok) : '0';
        const b = bS ? resolveValue(bS.nid, bS.ok) : '1';
        const t = al ? resolveValue(al.nid, al.ok) : '0.5';
        return `(${a} + (${b} - ${a}) * ${t})`;
      }
      case 'Greater Than': {
        const aS = inputSrc.get(`${nodeId}.a`);
        const bS = inputSrc.get(`${nodeId}.b`);
        return `(${aS ? resolveValue(aS.nid, aS.ok) : '0'} > ${bS ? resolveValue(bS.nid, bS.ok) : '0'})`;
      }
      default:
        return '0';
    }
  }

  // Walk exec chain from a node's exec output
  function walkExec(nodeId: string, execOutput: string): string[] {
    const lines: string[] = [];
    const targets = outputDst.get(`${nodeId}.${execOutput}`) || [];
    for (const t of targets) {
      lines.push(...generateAction(t.nid));
    }
    return lines;
  }

  // Generate action code for an exec-receiving node
  function generateAction(nodeId: string): string[] {
    const node = nodeMap.get(nodeId);
    if (!node) return [];
    const lines: string[] = [];

    switch (node.label) {
      case 'Set Actor Position': {
        const xS = inputSrc.get(`${nodeId}.x`);
        const yS = inputSrc.get(`${nodeId}.y`);
        const zS = inputSrc.get(`${nodeId}.z`);
        const x = xS ? resolveValue(xS.nid, xS.ok) : 'gameObject.position.x';
        const y = yS ? resolveValue(yS.nid, yS.ok) : 'gameObject.position.y';
        const z = zS ? resolveValue(zS.nid, zS.ok) : 'gameObject.position.z';
        lines.push(`gameObject.position.set(${x}, ${y}, ${z});`);
        lines.push(...walkExec(nodeId, 'exec'));
        break;
      }
      case 'Set Actor Rotation': {
        const xS = inputSrc.get(`${nodeId}.x`);
        const yS = inputSrc.get(`${nodeId}.y`);
        const zS = inputSrc.get(`${nodeId}.z`);
        const x = xS ? resolveValue(xS.nid, xS.ok) : 'gameObject.rotation.x';
        const y = yS ? resolveValue(yS.nid, yS.ok) : 'gameObject.rotation.y';
        const z = zS ? resolveValue(zS.nid, zS.ok) : 'gameObject.rotation.z';
        lines.push(`gameObject.rotation.set(${x}, ${y}, ${z});`);
        lines.push(...walkExec(nodeId, 'exec'));
        break;
      }
      case 'Set Actor Scale': {
        const xS = inputSrc.get(`${nodeId}.x`);
        const yS = inputSrc.get(`${nodeId}.y`);
        const zS = inputSrc.get(`${nodeId}.z`);
        const x = xS ? resolveValue(xS.nid, xS.ok) : 'gameObject.scale.x';
        const y = yS ? resolveValue(yS.nid, yS.ok) : 'gameObject.scale.y';
        const z = zS ? resolveValue(zS.nid, zS.ok) : 'gameObject.scale.z';
        lines.push(`gameObject.scale.set(${x}, ${y}, ${z});`);
        lines.push(...walkExec(nodeId, 'exec'));
        break;
      }
      case 'Print String': {
        const vS = inputSrc.get(`${nodeId}.value`);
        let v: string;
        if (vS) {
          v = resolveValue(vS.nid, vS.ok);
        } else {
          // Use the inline text control value
          const ctrl = node.controls['text'] as ClassicPreset.InputControl<'text'> | undefined;
          const txt = ctrl?.value ?? 'Hello';
          v = JSON.stringify(String(txt));
        }
        lines.push(`print(${v});`);
        lines.push(...walkExec(nodeId, 'exec'));
        break;
      }
      case 'Add Force': {
        const xS = inputSrc.get(`${nodeId}.x`);
        const yS = inputSrc.get(`${nodeId}.y`);
        const zS = inputSrc.get(`${nodeId}.z`);
        lines.push(`if (gameObject.rigidBody) { gameObject.rigidBody.addForce({x:${xS ? resolveValue(xS.nid, xS.ok) : '0'}, y:${yS ? resolveValue(yS.nid, yS.ok) : '0'}, z:${zS ? resolveValue(zS.nid, zS.ok) : '0'}}, true); }`);
        lines.push(...walkExec(nodeId, 'exec'));
        break;
      }
      case 'Add Impulse': {
        const xS = inputSrc.get(`${nodeId}.x`);
        const yS = inputSrc.get(`${nodeId}.y`);
        const zS = inputSrc.get(`${nodeId}.z`);
        lines.push(`if (gameObject.rigidBody) { gameObject.rigidBody.applyImpulse({x:${xS ? resolveValue(xS.nid, xS.ok) : '0'}, y:${yS ? resolveValue(yS.nid, yS.ok) : '0'}, z:${zS ? resolveValue(zS.nid, zS.ok) : '0'}}, true); }`);
        lines.push(...walkExec(nodeId, 'exec'));
        break;
      }
      case 'Set Velocity': {
        const xS = inputSrc.get(`${nodeId}.x`);
        const yS = inputSrc.get(`${nodeId}.y`);
        const zS = inputSrc.get(`${nodeId}.z`);
        lines.push(`if (gameObject.rigidBody) { gameObject.rigidBody.setLinvel({x:${xS ? resolveValue(xS.nid, xS.ok) : '0'}, y:${yS ? resolveValue(yS.nid, yS.ok) : '0'}, z:${zS ? resolveValue(zS.nid, zS.ok) : '0'}}, true); }`);
        lines.push(...walkExec(nodeId, 'exec'));
        break;
      }
      case 'Branch': {
        const cS = inputSrc.get(`${nodeId}.condition`);
        const cond = cS ? resolveValue(cS.nid, cS.ok) : 'false';
        const trueLines = walkExec(nodeId, 'true');
        const falseLines = walkExec(nodeId, 'false');
        lines.push(`if (${cond}) {`);
        lines.push(...trueLines.map(l => '  ' + l));
        if (falseLines.length) {
          lines.push('} else {');
          lines.push(...falseLines.map(l => '  ' + l));
        }
        lines.push('}');
        break;
      }
      case 'Sequence': {
        lines.push(...walkExec(nodeId, 'then0'));
        lines.push(...walkExec(nodeId, 'then1'));
        break;
      }
      case 'For Loop': {
        const cS = inputSrc.get(`${nodeId}.count`);
        const count = cS ? resolveValue(cS.nid, cS.ok) : '10';
        lines.push(`for (let __i = 0; __i < ${count}; __i++) {`);
        lines.push(...walkExec(nodeId, 'body').map(l => '  ' + l));
        lines.push('}');
        lines.push(...walkExec(nodeId, 'done'));
        break;
      }
    }
    return lines;
  }

  // Build code for each lifecycle event
  const sections: string[] = [];

  const beginPlayNodes = nodes.filter(n => n.label === 'Event BeginPlay');
  if (beginPlayNodes.length > 0) {
    const bp: string[] = [];
    for (const ev of beginPlayNodes) bp.push(...walkExec(ev.id, 'exec'));
    if (bp.length) sections.push('// __beginPlay__\n' + bp.join('\n'));
  }

  const tickNodes = nodes.filter(n => n.label === 'Event Tick');
  if (tickNodes.length > 0) {
    const tk: string[] = [];
    for (const ev of tickNodes) tk.push(...walkExec(ev.id, 'exec'));
    if (tk.length) sections.push('// __tick__\n' + tk.join('\n'));
  }

  const destroyNodes = nodes.filter(n => n.label === 'Event OnDestroy');
  if (destroyNodes.length > 0) {
    const od: string[] = [];
    for (const ev of destroyNodes) od.push(...walkExec(ev.id, 'exec'));
    if (od.length) sections.push('// __onDestroy__\n' + od.join('\n'));
  }

  return sections.join('\n');
}

// ============================================================
//  Right-click Context Menu (search palette)
// ============================================================
function showContextMenu(
  container: HTMLElement,
  x: number,
  y: number,
  onSelect: (entry: NodeEntry) => void,
) {
  const existing = container.querySelector('.bp-context-menu');
  if (existing) existing.remove();

  const menu = document.createElement('div');
  menu.className = 'bp-context-menu';
  menu.style.left = x + 'px';
  menu.style.top = y + 'px';

  const header = document.createElement('div');
  header.className = 'bp-context-header';
  header.textContent = 'All Actions';
  menu.appendChild(header);

  const searchInput = document.createElement('input');
  searchInput.className = 'bp-context-search';
  searchInput.placeholder = 'Search...';
  searchInput.type = 'text';
  menu.appendChild(searchInput);

  const listEl = document.createElement('div');
  listEl.className = 'bp-context-list';
  menu.appendChild(listEl);

  function renderList(filter: string) {
    listEl.innerHTML = '';
    const lf = filter.toLowerCase();

    const categories = new Map<string, NodeEntry[]>();
    for (const entry of NODE_PALETTE) {
      if (lf && !entry.label.toLowerCase().includes(lf) && !entry.category.toLowerCase().includes(lf)) continue;
      const arr = categories.get(entry.category) || [];
      arr.push(entry);
      categories.set(entry.category, arr);
    }

    for (const [cat, entries] of categories) {
      const catEl = document.createElement('div');
      catEl.className = 'bp-context-category';
      catEl.textContent = cat;
      listEl.appendChild(catEl);

      for (const entry of entries) {
        const item = document.createElement('div');
        item.className = 'bp-context-item';
        item.textContent = entry.label;
        item.addEventListener('click', () => {
          onSelect(entry);
          menu.remove();
        });
        listEl.appendChild(item);
      }
    }

    if (categories.size === 0) {
      const empty = document.createElement('div');
      empty.className = 'bp-context-empty';
      empty.textContent = 'No matching nodes';
      listEl.appendChild(empty);
    }
  }

  renderList('');
  searchInput.addEventListener('input', () => renderList(searchInput.value));

  container.appendChild(menu);
  requestAnimationFrame(() => searchInput.focus());

  const closeHandler = (e: MouseEvent) => {
    if (!menu.contains(e.target as Node)) {
      menu.remove();
      document.removeEventListener('mousedown', closeHandler);
    }
  };
  setTimeout(() => document.addEventListener('mousedown', closeHandler), 0);
}

// ============================================================
//  React Component
// ============================================================
interface NodeEditorViewProps {
  gameObject: GameObject;
}

function NodeEditorView({ gameObject }: NodeEditorViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<NodeEditor<Schemes> | null>(null);
  const areaRef = useRef<AreaPlugin<Schemes, any> | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    let destroyed = false;

    async function setup() {
      const container = containerRef.current!;
      container.innerHTML = '';

      const editor = new NodeEditor<Schemes>();
      const area = new AreaPlugin<Schemes, any>(container);
      const connection = new ConnectionPlugin<Schemes, any>();
      const reactPlugin = new ReactPlugin<Schemes, any>({ createRoot });

      reactPlugin.addPreset(Presets.classic.setup());
      connection.addPreset(ConnectionPresets.classic.setup());

      editor.use(area);
      area.use(connection);
      area.use(reactPlugin);

      editorRef.current = editor;
      areaRef.current = area;

      // Right-click to open context menu / palette
      container.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        const rect = container.getBoundingClientRect();
        const clientX = e.clientX - rect.left;
        const clientY = e.clientY - rect.top;

        showContextMenu(container, clientX, clientY, async (entry) => {
          const node = entry.factory();
          await editor.addNode(node);
          const transform = area.area.transform;
          const ax = (clientX - transform.x) / transform.k;
          const ay = (clientY - transform.y) / transform.k;
          await area.translate(node.id, { x: ax, y: ay });
        });
      });

      // Default starter graph
      if (!gameObject.scripts[0]?.nodeData) {
        const evTick = new EventTickNode();
        const sine = new SineNode();
        const time = new TimeNode();
        const setPos = new SetPositionNode();
        const getPos = new GetPositionNode();

        await editor.addNode(evTick);
        await editor.addNode(time);
        await editor.addNode(sine);
        await editor.addNode(setPos);
        await editor.addNode(getPos);

        await area.translate(evTick.id, { x: 0, y: 0 });
        await area.translate(time.id, { x: 20, y: 200 });
        await area.translate(sine.id, { x: 250, y: 200 });
        await area.translate(setPos.id, { x: 500, y: 0 });
        await area.translate(getPos.id, { x: 20, y: 400 });

        await editor.addConnection(new ClassicPreset.Connection(evTick, 'exec', setPos, 'exec'));
        await editor.addConnection(new ClassicPreset.Connection(time, 'time', sine, 'value'));
        await editor.addConnection(new ClassicPreset.Connection(sine, 'result', setPos, 'x'));
        await editor.addConnection(new ClassicPreset.Connection(getPos, 'y', setPos, 'y'));
        await editor.addConnection(new ClassicPreset.Connection(getPos, 'z', setPos, 'z'));
      }

      // Auto-compile on changes
      const compileAndSave = () => {
        if (destroyed) return;
        const code = generateCodeFromGraph(editor);
        if (gameObject.scripts.length === 0) {
          gameObject.scripts.push(new ScriptComponent());
        }
        gameObject.scripts[0].code = code;
        gameObject.scripts[0].compile();
      };

      editor.addPipe((ctx) => {
        if (
          ctx.type === 'connectioncreated' ||
          ctx.type === 'connectionremoved' ||
          ctx.type === 'nodecreated' ||
          ctx.type === 'noderemoved'
        ) {
          setTimeout(compileAndSave, 50);
        }
        return ctx;
      });

      compileAndSave();

      setTimeout(() => {
        if (!destroyed) AreaExtensions.zoomAt(area, editor.getNodes());
      }, 100);
    }

    setup();
    return () => {
      destroyed = true;
      if (areaRef.current) areaRef.current.destroy();
    };
  }, [gameObject]);

  return (
    <div
      ref={containerRef}
      style={{ width: '100%', height: '100%', background: '#1a1a2e', position: 'relative' }}
    />
  );
}

// ============================================================
//  Mount function for vanilla TS
// ============================================================
export function mountNodeEditor(
  container: HTMLElement,
  gameObject: GameObject
): () => void {
  const root = createRoot(container);
  root.render(React.createElement(NodeEditorView, { gameObject }));
  return () => root.unmount();
}
