// ============================================================
//  NodeEditorPanel.tsx  —  Slim React shell
//  All heavy logic lives in ./nodeEditor/ sub-modules.
//  This file provides the React component and public mount API.
// ============================================================

import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { NodeEditor, ClassicPreset } from 'rete';
import { AreaPlugin, AreaExtensions } from 'rete-area-plugin';
import { createRoot } from 'react-dom/client';
import type { GameObject } from '../engine/GameObject';
import { ScriptComponent } from '../engine/ScriptComponent';
import type { ActorComponentData } from './ActorAsset';

// Node types used directly in the React component
import {
  EventTickNode,
  SineNode,
  TimeNode,
  SetPositionNode,
  GetPositionNode,
  FunctionEntryNode,
  FunctionReturnNode,
  FunctionCallNode,
  MacroEntryNode,
  MacroExitNode,
  CustomEventNode,
  CallCustomEventNode,
  NODE_CATEGORY_COLORS,
  getComponentNodeEntries,
  type ComponentNodeEntry,
} from './nodes';

// Sub-module re-exports
import {
  type Schemes,
  type GraphTab,
  type CommentBox,
  generateFullCode,
  serializeGraph,
  deserializeGraph,
  populateWidgetSelectors,
  createGraphEditor,
  buildMyBlueprintPanel,
  buildGraphTabBar,
  getNodeCategory,
  showAddVariableDialog,
  showAddNameDialog,
  showParamEditorDialog,
  showVariableEditor,
  showStructDialog,
} from './nodeEditor';

// ── Re-export the public setter API so existing consumers don't break ──
export {
  setProjectManager,
  setStructureAssetManager,
  setActorAssetManager,
  setWidgetBPManager,
  setSaveGameManager,
  setDataTableAssetManager,
  setGameInstanceBPManager,
} from './nodeEditor';

// ============================================================
//  React Component
// ============================================================
interface NodeEditorViewProps {
  gameObject: GameObject;
  components?: ActorComponentData[];
  rootMeshType?: string;
  widgetList?: Array<{ name: string; type: string }>;
  isAnimBlueprint?: boolean;
}

function NodeEditorView({ gameObject, components, rootMeshType, widgetList, isAnimBlueprint }: NodeEditorViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    let destroyed = false;
    const bp = gameObject.blueprintData;

    // Storage for editors per graph id
    const editorStore = new Map<string, { editor: NodeEditor<Schemes>; area: AreaPlugin<Schemes, any>; el: HTMLElement; comments?: CommentBox[]; createCommentEl?: (c: CommentBox) => HTMLElement }>();
    const functionEditors = new Map<string, NodeEditor<Schemes>>();
    const macroEditors = new Map<string, NodeEditor<Schemes>>();

    // Graph tabs
    const graphTabs: GraphTab[] = [
      { id: 'eventgraph', label: 'EventGraph', type: 'event' },
    ];
    for (const fn of bp.functions) graphTabs.push({ id: fn.id, label: fn.name, type: 'function', refId: fn.id });
    for (const m of bp.macros) graphTabs.push({ id: m.id, label: m.name, type: 'macro', refId: m.id });
    let activeGraphId = 'eventgraph';

    // Build component node entries from the rules system
    const compEntries: ComponentNodeEntry[] = (components && rootMeshType)
      ? getComponentNodeEntries(components, rootMeshType)
      : [];

    // DOM structure
    const root = containerRef.current!;
    root.innerHTML = '';

    const sidebar = document.createElement('div');
    sidebar.className = 'my-blueprint-sidebar';
    root.appendChild(sidebar);

    const rightArea = document.createElement('div');
    rightArea.className = 'graph-right-area';
    root.appendChild(rightArea);

    const tabBarEl = document.createElement('div');
    rightArea.appendChild(tabBarEl);

    const graphContainer = document.createElement('div');
    graphContainer.className = 'graph-editor-area';
    rightArea.appendChild(graphContainer);

    // Minimap
    const minimap = document.createElement('div');
    minimap.className = 'fe-minimap';
    minimap.innerHTML = '<div class="fe-minimap-title">MINIMAP</div><canvas class="fe-minimap-canvas" width="160" height="100"></canvas>';
    rightArea.appendChild(minimap);
    const minimapCanvas = minimap.querySelector('.fe-minimap-canvas') as HTMLCanvasElement;
    function updateMinimap() {
      const data = editorStore.get(activeGraphId);
      if (!data || !minimapCanvas) return;
      const ctx = minimapCanvas.getContext('2d');
      if (!ctx) return;
      const nodes = data.editor.getNodes();
      if (nodes.length === 0) return;
      ctx.clearRect(0, 0, 160, 100);
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (const n of nodes) {
        const v = data.area.nodeViews.get(n.id);
        if (v) { minX = Math.min(minX, v.position.x); minY = Math.min(minY, v.position.y); maxX = Math.max(maxX, v.position.x + 160); maxY = Math.max(maxY, v.position.y + 40); }
      }
      const rangeX = Math.max(maxX - minX, 1);
      const rangeY = Math.max(maxY - minY, 1);
      const pad = 10;
      const sx = (160 - pad * 2) / rangeX;
      const sy = (100 - pad * 2) / rangeY;
      const s = Math.min(sx, sy);
      for (const n of nodes) {
        const v = data.area.nodeViews.get(n.id);
        if (!v) continue;
        const x = pad + (v.position.x - minX) * s;
        const y = pad + (v.position.y - minY) * s;
        const cat = getNodeCategory(n);
        ctx.fillStyle = NODE_CATEGORY_COLORS[cat] || '#555';
        ctx.fillRect(x, y, Math.max(4, 160 * s * 0.08), Math.max(2, 40 * s * 0.08));
      }
      const t = data.area.area.transform;
      const el = data.el;
      const vx = pad + (-t.x / t.k - minX) * s;
      const vy = pad + (-t.y / t.k - minY) * s;
      const vw = (el.clientWidth / t.k) * s;
      const vh = (el.clientHeight / t.k) * s;
      ctx.strokeStyle = '#5b8af566';
      ctx.lineWidth = 1;
      ctx.strokeRect(vx, vy, vw, vh);
    }
    setInterval(() => { if (!destroyed) updateMinimap(); }, 500);

    // Compile & save
    function compileAndSave() {
      if (destroyed) return;
      const evData = editorStore.get('eventgraph');
      if (!evData) {
        console.warn('[NodeEditor] compileAndSave: No event graph data found');
        return;
      }
      console.log('[NodeEditor] Compiling widget blueprint event graph...');
      const code = generateFullCode(evData.editor, bp, functionEditors, !!widgetList, !!isAnimBlueprint);
      console.log('[NodeEditor] Generated code length:', code.length, 'characters');

      // Persist graph node data into BlueprintData BEFORE compile,
      // because compile() triggers the save callback which reads nodeData.
      bp.eventGraph.nodeData = serializeGraph(evData.editor, evData.area);
      bp.eventGraph.comments = evData.comments ? evData.comments.map(c => ({ ...c, position: { ...c.position }, size: { ...c.size } })) : [];
      for (const [id, fnEditor] of functionEditors) {
        const fn = bp.getFunction(id);
        const fnData = editorStore.get(id);
        if (fn && fnData) {
          fn.graph.nodeData = serializeGraph(fnEditor, fnData.area);
          fn.graph.comments = fnData.comments ? fnData.comments.map(c => ({ ...c, position: { ...c.position }, size: { ...c.size } })) : [];
        }
      }
      for (const [id, mEditor] of macroEditors) {
        const m = bp.getMacro(id);
        const mData = editorStore.get(id);
        if (m && mData) {
          m.graph.nodeData = serializeGraph(mEditor, mData.area);
          m.graph.comments = mData.comments ? mData.comments.map(c => ({ ...c, position: { ...c.position }, size: { ...c.size } })) : [];
        }
      }

      // Now compile — the save callback that fires during compile()
      // will see the up-to-date nodeData set above.
      if (gameObject.scripts.length === 0) gameObject.scripts.push(new ScriptComponent());
      // Do not overwrite hand-written code-mode scripts with blueprint-generated code.
      if (gameObject.scripts[0].codeMode) {
        console.warn('[NodeEditor] Script is in code-mode — blueprint compile skipped. Use the Code Editor to edit this script.');
        return;
      }
      gameObject.scripts[0].code = code;
      gameObject.scripts[0].compile();
      console.log('[NodeEditor] Compilation complete');

      if (containerRef.current) {
        (containerRef.current as any).__compileAndSave = compileAndSave;
      }
    }

    // Switch graph
    async function switchToGraph(tab: GraphTab) {
      activeGraphId = tab.id;
      for (const [, data] of editorStore) {
        data.el.style.display = 'none';
      }

      let data = editorStore.get(tab.id);
      if (!data) {
        const el = document.createElement('div');
        el.className = 'graph-editor-canvas';
        graphContainer.appendChild(el);

        const funcId = tab.type === 'function' ? (tab.refId || null) : null;
        const { editor, area, comments: graphComments, createCommentEl: createCmtEl } = await createGraphEditor(el, bp, tab.type, funcId, compileAndSave, (node) => {
          if (node instanceof FunctionCallNode) {
            const funcTab = graphTabs.find(t => t.refId === (node as FunctionCallNode).funcId);
            if (funcTab) switchToGraph(funcTab);
          }
        }, compEntries, widgetList);
        data = { editor, area, el, comments: graphComments, createCommentEl: createCmtEl };
        editorStore.set(tab.id, data);

        if (tab.type === 'function') functionEditors.set(tab.id, editor);
        if (tab.type === 'macro') macroEditors.set(tab.id, editor);

        // Initialize graph
        if (tab.type === 'event') {
          await initEventGraph(editor, area);
        } else if (tab.type === 'function' && tab.refId) {
          const fn = bp.getFunction(tab.refId);
          if (fn) {
            if (fn.graph.nodeData && Array.isArray(fn.graph.nodeData.nodes) && fn.graph.nodeData.nodes.length > 0) {
              await deserializeGraph(editor, area, fn.graph.nodeData, bp);
            } else {
              const entry = new FunctionEntryNode(fn.id, fn.name, fn.inputs);
              const ret = new FunctionReturnNode(fn.id, fn.name, fn.outputs);
              await editor.addNode(entry);
              await editor.addNode(ret);
              await area.translate(entry.id, { x: 0, y: 0 });
              await area.translate(ret.id, { x: 400, y: 0 });
            }
          }
        } else if (tab.type === 'macro' && tab.refId) {
          const m = bp.getMacro(tab.refId);
          if (m) {
            if (m.graph.nodeData && Array.isArray(m.graph.nodeData.nodes) && m.graph.nodeData.nodes.length > 0) {
              await deserializeGraph(editor, area, m.graph.nodeData, bp);
            } else {
              const entry = new MacroEntryNode(m.id, m.name, m.inputs);
              const exit = new MacroExitNode(m.id, m.name, m.outputs);
              await editor.addNode(entry);
              await editor.addNode(exit);
              await area.translate(entry.id, { x: 0, y: 0 });
              await area.translate(exit.id, { x: 400, y: 0 });
            }
          }
        }

        compileAndSave();

        const graphDataSource =
          tab.type === 'event' ? bp.eventGraph :
          tab.type === 'function' && tab.refId ? bp.getFunction(tab.refId)?.graph :
          tab.type === 'macro' && tab.refId ? bp.getMacro(tab.refId)?.graph :
          null;
        if (graphDataSource?.comments && data.comments && data.createCommentEl) {
          for (const saved of graphDataSource.comments) {
            const c: CommentBox = { ...saved, position: { ...saved.position }, size: { ...saved.size } };
            data.comments.push(c);
            data.createCommentEl(c);
          }
        }

        setTimeout(() => {
          if (!destroyed) AreaExtensions.zoomAt(area, editor.getNodes());
        }, 100);
      }

      data.el.style.display = '';
      refreshUI();
    }

    async function initEventGraph(editor: NodeEditor<Schemes>, area: AreaPlugin<Schemes, any>) {
      if (bp.eventGraph.nodeData && Array.isArray(bp.eventGraph.nodeData.nodes) && bp.eventGraph.nodeData.nodes.length > 0) {
        await deserializeGraph(editor, area, bp.eventGraph.nodeData, bp);
      } else {
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

      if (widgetList && widgetList.length > 0) {
        await populateWidgetSelectors(editor, widgetList, area);
      }
    }

    function refreshUI() {
      buildGraphTabBar(tabBarEl, graphTabs, activeGraphId, (tab) => switchToGraph(tab));
      buildMyBlueprintPanel(sidebar, bp, {
        activeGraphId,
        graphTabs,
        onSwitchGraph: (tab) => switchToGraph(tab),
        onAddVariable: () => {
          showAddVariableDialog(root, bp, (name, type) => {
            bp.addVariable(name, type);
            refreshUI();
            compileAndSave();
          });
        },
        onAddFunction: () => {
          showAddNameDialog(root, 'New Function', 'NewFunction', (name) => {
            const fn = bp.addFunction(name);
            const tab: GraphTab = { id: fn.id, label: fn.name, type: 'function', refId: fn.id };
            graphTabs.push(tab);
            switchToGraph(tab);
          });
        },
        onAddMacro: () => {
          showAddNameDialog(root, 'New Macro', 'NewMacro', (name) => {
            const m = bp.addMacro(name);
            const tab: GraphTab = { id: m.id, label: m.name, type: 'macro', refId: m.id };
            graphTabs.push(tab);
            switchToGraph(tab);
          });
        },
        onAddCustomEvent: () => {
          showAddNameDialog(root, 'New Custom Event', 'CustomEvent', async (name) => {
            const evt = bp.addCustomEvent(name);
            const evData = editorStore.get('eventgraph');
            if (evData) {
              const node = new CustomEventNode(evt.id, evt.name);
              await evData.editor.addNode(node);
              await evData.area.translate(node.id, { x: 0, y: 300 });
            }
            refreshUI();
            compileAndSave();
          });
        },
        onAddLocalVariable: (funcId: string) => {
          showAddVariableDialog(root, bp, (name, type) => {
            bp.addFunctionLocalVariable(funcId, name, type);
            refreshUI();
            compileAndSave();
          });
        },
        onDeleteVariable: (id) => { bp.removeVariable(id); refreshUI(); compileAndSave(); },
        onDeleteFunction: (id) => {
          bp.removeFunction(id);
          const idx = graphTabs.findIndex(t => t.refId === id);
          if (idx !== -1) graphTabs.splice(idx, 1);
          const data = editorStore.get(id);
          if (data) { data.el.remove(); editorStore.delete(id); }
          functionEditors.delete(id);
          if (activeGraphId === id) switchToGraph(graphTabs[0]);
          else refreshUI();
          compileAndSave();
        },
        onDeleteMacro: (id) => {
          bp.removeMacro(id);
          const idx = graphTabs.findIndex(t => t.refId === id);
          if (idx !== -1) graphTabs.splice(idx, 1);
          const data = editorStore.get(id);
          if (data) { data.el.remove(); editorStore.delete(id); }
          macroEditors.delete(id);
          if (activeGraphId === id) switchToGraph(graphTabs[0]);
          else refreshUI();
          compileAndSave();
        },
        onDeleteCustomEvent: (id) => {
          const evData = editorStore.get('eventgraph');
          if (evData) {
            const nodes = evData.editor.getNodes();
            const evtNode = nodes.find(n => n instanceof CustomEventNode && (n as CustomEventNode).eventId === id);
            if (evtNode) evData.editor.removeNode(evtNode.id);
          }
          bp.removeCustomEvent(id);
          refreshUI();
          compileAndSave();
        },
        onDeleteLocalVariable: (funcId: string, varId: string) => {
          bp.removeFunctionLocalVariable(funcId, varId);
          refreshUI();
          compileAndSave();
        },
        onEditVariable: (v) => {
          showVariableEditor(root, v, bp, () => { refreshUI(); compileAndSave(); });
        },
        onAddStruct: () => {
          showStructDialog(root, bp, null, (name, fields) => {
            bp.addStruct(name, fields);
            refreshUI();
            compileAndSave();
          });
        },
        onDeleteStruct: (id) => {
          bp.removeStruct(id);
          refreshUI();
          compileAndSave();
        },
        onEditStruct: (s) => {
          showStructDialog(root, bp, s, (name, fields) => {
            s.name = name;
            s.fields = fields;
            refreshUI();
            compileAndSave();
          });
        },
        onEditFunction: (fn) => {
          showParamEditorDialog(root, bp, `Edit Function: ${fn.name}`, fn.inputs, fn.outputs,
            async (newInputs, newOutputs) => {
              fn.inputs = newInputs;
              fn.outputs = newOutputs || [];

              const fnData = editorStore.get(fn.id);
              if (fnData) {
                const nodes = fnData.editor.getNodes();
                for (const n of nodes) {
                  if (n instanceof FunctionEntryNode || n instanceof FunctionReturnNode) {
                    await fnData.editor.removeNode(n.id);
                  }
                }
                const entry = new FunctionEntryNode(fn.id, fn.name, fn.inputs);
                const ret = new FunctionReturnNode(fn.id, fn.name, fn.outputs);
                await fnData.editor.addNode(entry);
                await fnData.editor.addNode(ret);
                await fnData.area.translate(entry.id, { x: 0, y: 0 });
                await fnData.area.translate(ret.id, { x: 400, y: 0 });
              }

              for (const [, data] of editorStore) {
                const nodes = data.editor.getNodes();
                for (const n of nodes) {
                  if (n instanceof FunctionCallNode && (n as FunctionCallNode).funcId === fn.id) {
                    const view = data.area.nodeViews.get(n.id);
                    const pos = view ? { x: view.position.x, y: view.position.y } : { x: 0, y: 0 };
                    await data.editor.removeNode(n.id);
                    const newCall = new FunctionCallNode(fn.id, fn.name, fn.inputs, fn.outputs);
                    await data.editor.addNode(newCall);
                    await data.area.translate(newCall.id, pos);
                  }
                }
              }

              refreshUI();
              compileAndSave();
            },
          );
        },
        onEditCustomEvent: (evt) => {
          showParamEditorDialog(root, bp, `Edit Event: ${evt.name}`, evt.params, null,
            async (newParams) => {
              evt.params = newParams;

              const evData = editorStore.get('eventgraph');
              if (evData) {
                const nodes = evData.editor.getNodes();
                for (const n of nodes) {
                  if (n instanceof CustomEventNode && (n as CustomEventNode).eventId === evt.id) {
                    const view = evData.area.nodeViews.get(n.id);
                    const pos = view ? { x: view.position.x, y: view.position.y } : { x: 0, y: 300 };
                    await evData.editor.removeNode(n.id);
                    const newNode = new CustomEventNode(evt.id, evt.name, evt.params);
                    await evData.editor.addNode(newNode);
                    await evData.area.translate(newNode.id, pos);
                  }
                }

                for (const n of evData.editor.getNodes()) {
                  if (n instanceof CallCustomEventNode && (n as CallCustomEventNode).eventId === evt.id) {
                    const view = evData.area.nodeViews.get(n.id);
                    const pos = view ? { x: view.position.x, y: view.position.y } : { x: 0, y: 0 };
                    const targetActorId = (n as CallCustomEventNode).targetActorId;
                    await evData.editor.removeNode(n.id);
                    const newCall = new CallCustomEventNode(evt.id, evt.name, evt.params, targetActorId);
                    await evData.editor.addNode(newCall);
                    await evData.area.translate(newCall.id, pos);
                  }
                }
              }

              refreshUI();
              compileAndSave();
            },
          );
        },
      });
    }

    // Init - Pre-load ALL graphs to populate editors before compilation
    (async () => {
      await switchToGraph(graphTabs[0]);
      for (const tab of graphTabs) {
        if (tab.type === 'function' || tab.type === 'macro') {
          await switchToGraph(tab);
        }
      }
      await switchToGraph(graphTabs[0]);
      setTimeout(() => compileAndSave(), 100);
    })();

    return () => {
      destroyed = true;
      for (const [, data] of editorStore) {
        try { data.area.destroy(); } catch { /* ok */ }
      }
    };
  }, [gameObject]);

  return (
    <div
      ref={containerRef}
      style={{
        width: '100%', height: '100%',
        background: '#1a1a2e',
        position: 'relative',
        display: 'flex',
      }}
    />
  );
}

// ============================================================
//  Mount function for vanilla TS
// ============================================================
export function mountNodeEditor(
  container: HTMLElement,
  gameObject: GameObject,
): () => void {
  const root = createRoot(container);
  root.render(React.createElement(NodeEditorView, { gameObject }));
  return () => root.unmount();
}

/**
 * Mount the node editor for an ActorAsset.
 * Creates a lightweight proxy GameObject wrapping the asset's blueprintData.
 */
export function mountNodeEditorForAsset(
  container: HTMLElement,
  blueprintData: import('./BlueprintData').BlueprintData,
  assetName: string,
  onCompile?: (code: string) => void,
  components?: ActorComponentData[],
  rootMeshType?: string,
  widgetList?: Array<{ name: string; type: string }>,
  isAnimBlueprint?: boolean,
): () => void {
  const dummyMesh = new THREE.Mesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshBasicMaterial(),
  );

  const proxyGO: GameObject = {
    id: -1,
    name: assetName,
    mesh: dummyMesh,
    scripts: [new ScriptComponent()],
    rigidBody: null,
    collider: null,
    hasPhysics: false,
    blueprintData,
    actorAssetId: null,
    get position() { return dummyMesh.position; },
    get rotation() { return dummyMesh.rotation; },
    get scale() { return dummyMesh.scale; },
  } as any;

  if (onCompile) {
    const origCompile = proxyGO.scripts[0].compile.bind(proxyGO.scripts[0]);
    proxyGO.scripts[0].compile = function () {
      const result = origCompile();
      onCompile(proxyGO.scripts[0].code);
      return result;
    };
  }

  const root = createRoot(container);
  root.render(React.createElement(NodeEditorView, {
    gameObject: proxyGO,
    components,
    rootMeshType,
    widgetList,
    isAnimBlueprint,
  }));
  return () => root.unmount();
}
