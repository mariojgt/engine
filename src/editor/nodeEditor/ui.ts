// ============================================================
//  UI helpers  — sidebar builder, context menus, dialogs
// ============================================================

import { NodeEditor, ClassicPreset } from 'rete';
import { AreaPlugin } from 'rete-area-plugin';
import type {
  BlueprintVariable,
  BlueprintFunction,
  BlueprintMacro,
  BlueprintCustomEvent,
  BlueprintStruct,
  VarType,
} from '../BlueprintData';
import { iconHTML, Icons, ICON_COLORS } from '../icons';
import * as N from '../nodes';
import type { NodeEntry, ComponentNodeEntry } from '../nodes';
import {
  type Schemes,
  type GraphType,
  type GraphTab,
  type CommentBox,
  getStructMgr,
  getActorAssetMgr,
  getWidgetBPMgr,
  getSaveGameMgr,
  getDataTableMgr,
  getGameInstanceBPMgr,
  getProjectMgr,
  getNodeCategory,
} from './state';
import type { ActorComponentData } from '../ActorAsset';
import { resolveStructFields } from './codeGen';
import { SoundLibrary } from '../SoundLibrary';
import { TextureLibrary } from '../TextureLibrary';
import { EventAssetManager } from '../EventAsset';
import { InputMappingAssetManager } from '../InputMappingAsset';

export { getNodeCategory } from './state';

// ============================================================
export function buildMyBlueprintPanel(
  container: HTMLElement,
  bp: import('../BlueprintData').BlueprintData,
  callbacks: {
    onSwitchGraph: (tab: GraphTab) => void;
    onAddVariable: () => void;
    onAddFunction: () => void;
    onAddMacro: () => void;
    onAddCustomEvent: () => void;
    onAddLocalVariable: (funcId: string) => void;
    onAddStruct: () => void;
    onDeleteVariable: (id: string) => void;
    onDeleteFunction: (id: string) => void;
    onDeleteMacro: (id: string) => void;
    onDeleteCustomEvent: (id: string) => void;
    onDeleteLocalVariable: (funcId: string, varId: string) => void;
    onDeleteStruct: (id: string) => void;
    onEditVariable: (v: BlueprintVariable) => void;
    onEditStruct: (s: BlueprintStruct) => void;
    onEditFunction: (fn: BlueprintFunction) => void;
    onEditCustomEvent: (evt: BlueprintCustomEvent) => void;
    activeGraphId: string;
    graphTabs: GraphTab[];
  },
): void {
  container.innerHTML = '';
  container.className = 'my-blueprint-panel';

  // Title
  const title = document.createElement('div');
  title.className = 'mybp-title';
  title.textContent = 'MY BLUEPRINT';
  container.appendChild(title);

  // --- Graphs ---
  const graphBody = addSection(container, 'Graphs', null);
  for (const tab of callbacks.graphTabs) {
    const item = document.createElement('div');
    item.className = 'mybp-item' + (tab.id === callbacks.activeGraphId ? ' active' : '');
    const icon = tab.type === 'event' ? iconHTML(Icons.Zap, 'xs', ICON_COLORS.warning) : tab.type === 'function' ? iconHTML(Icons.Code, 'xs', ICON_COLORS.blueprint) : iconHTML(Icons.Diamond, 'xs');
    item.innerHTML = `<span class="mybp-item-icon">${icon}</span><span>${tab.label}</span>`;
    item.addEventListener('click', () => callbacks.onSwitchGraph(tab));
    graphBody.appendChild(item);
  }

  // --- Functions ---
  const fnBody = addSection(container, 'Functions', callbacks.onAddFunction);
  for (const fn of bp.functions) {
    const fnItem = makeDeletableItem(fn.name, iconHTML(Icons.Code, 'xs', ICON_COLORS.blueprint), 'mybp-fn',
      () => callbacks.onSwitchGraph({ id: fn.id, label: fn.name, type: 'function', refId: fn.id }),
      () => callbacks.onDeleteFunction(fn.id),
      { dragType: 'function', funcId: fn.id, funcName: fn.name, inputs: JSON.stringify(fn.inputs), outputs: JSON.stringify(fn.outputs) },
    );
    // Add edit button for parameters (insert before delete in the actions container)
    const actionsEl = fnItem.querySelector('.mybp-item-actions')!;
    const editBtn = document.createElement('span');
    editBtn.className = 'mybp-edit-btn';
    editBtn.innerHTML = iconHTML(Icons.Settings, 'xs', ICON_COLORS.muted);
    editBtn.title = 'Edit Parameters';
    editBtn.addEventListener('click', (e) => { e.stopPropagation(); callbacks.onEditFunction(fn); });
    actionsEl.insertBefore(editBtn, actionsEl.firstChild);
    fnBody.appendChild(fnItem);
  }

  // --- Macros ---
  const macroBody = addSection(container, 'Macros', callbacks.onAddMacro);
  for (const m of bp.macros) {
    macroBody.appendChild(makeDeletableItem(m.name, iconHTML(Icons.Diamond, 'xs', ICON_COLORS.secondary), 'mybp-macro',
      () => callbacks.onSwitchGraph({ id: m.id, label: m.name, type: 'macro', refId: m.id }),
      () => callbacks.onDeleteMacro(m.id),
      { dragType: 'macro', macroId: m.id, macroName: m.name },
    ));
  }

  // --- Variables ---
  const varBody = addSection(container, 'Variables', callbacks.onAddVariable);
  for (const v of bp.variables) {
    const item = document.createElement('div');
    item.className = 'mybp-item mybp-var';
    item.draggable = true;

    const dot = document.createElement('span');
    dot.className = `mybp-var-dot ${typeDotClass(v.type)}`;
    item.appendChild(dot);

    const nameSpan = document.createElement('span');
    nameSpan.className = 'mybp-var-name';
    nameSpan.textContent = v.name;
    item.appendChild(nameSpan);

    const typeSpan = document.createElement('span');
    typeSpan.className = 'mybp-var-type';
    typeSpan.textContent = typeDisplayName(v.type, bp);
    item.appendChild(typeSpan);

    const actions = document.createElement('span');
    actions.className = 'mybp-item-actions';
    const del = document.createElement('span');
    del.className = 'mybp-delete';
    del.innerHTML = iconHTML(Icons.X, 'xs', ICON_COLORS.muted);
    del.title = 'Delete';
    del.addEventListener('click', (e) => { e.stopPropagation(); callbacks.onDeleteVariable(v.id); });
    actions.appendChild(del);
    item.appendChild(actions);

    item.addEventListener('click', () => callbacks.onEditVariable(v));
    item.addEventListener('dragstart', (e) => {
      e.dataTransfer!.setData('text/plain', JSON.stringify({ varId: v.id, varName: v.name, varType: v.type }));
    });

    varBody.appendChild(item);
  }

  // --- Local Variables (when viewing a function graph) ---
  const activeTab = callbacks.graphTabs.find(t => t.id === callbacks.activeGraphId);
  if (activeTab && activeTab.type === 'function' && activeTab.refId) {
    const fn = bp.getFunction(activeTab.refId);
    if (fn) {
      const localBody = addSection(container, 'Local Variables', () => callbacks.onAddLocalVariable(fn.id));
      for (const lv of fn.localVariables) {
        const item = document.createElement('div');
        item.className = 'mybp-item mybp-var mybp-local-var';
        item.draggable = true;

        const dot = document.createElement('span');
        dot.className = `mybp-var-dot ${typeDotClass(lv.type)}`;
        item.appendChild(dot);

        const nameSpan = document.createElement('span');
        nameSpan.className = 'mybp-var-name';
        nameSpan.textContent = lv.name;
        item.appendChild(nameSpan);

        const typeSpan = document.createElement('span');
        typeSpan.className = 'mybp-var-type';
        typeSpan.textContent = `${typeDisplayName(lv.type, bp)} (local)`;
        item.appendChild(typeSpan);

        const actions = document.createElement('span');
        actions.className = 'mybp-item-actions';
        const del = document.createElement('span');
        del.className = 'mybp-delete';
        del.innerHTML = iconHTML(Icons.X, 'xs', ICON_COLORS.muted);
        del.title = 'Delete';
        del.addEventListener('click', (e) => { e.stopPropagation(); callbacks.onDeleteLocalVariable(fn.id, lv.id); });
        actions.appendChild(del);
        item.appendChild(actions);

        item.addEventListener('click', () => callbacks.onEditVariable(lv));
        item.addEventListener('dragstart', (e) => {
          e.dataTransfer!.setData('text/plain', JSON.stringify({ varId: lv.id, varName: lv.name, varType: lv.type, isLocal: true, funcId: fn.id }));
        });

        localBody.appendChild(item);
      }
    }
  }

  // --- Custom Events ---
  const evtBody = addSection(container, 'Custom Events', callbacks.onAddCustomEvent);
  for (const evt of bp.customEvents) {
    const evtItem = makeDeletableItem(evt.name, iconHTML(Icons.Circle, 'xs', ICON_COLORS.secondary), 'mybp-evt',
      () => callbacks.onSwitchGraph(callbacks.graphTabs[0]),
      () => callbacks.onDeleteCustomEvent(evt.id),
      { dragType: 'customEvent', eventId: evt.id, eventName: evt.name, params: JSON.stringify(evt.params) },
    );
    // Add edit button for parameters (insert before delete in the actions container)
    const actionsEl = evtItem.querySelector('.mybp-item-actions')!;
    const editBtn = document.createElement('span');
    editBtn.className = 'mybp-edit-btn';
    editBtn.innerHTML = iconHTML(Icons.Settings, 'xs', ICON_COLORS.muted);
    editBtn.title = 'Edit Parameters';
    editBtn.addEventListener('click', (e) => { e.stopPropagation(); callbacks.onEditCustomEvent(evt); });
    actionsEl.insertBefore(editBtn, actionsEl.firstChild);
    evtBody.appendChild(evtItem);
  }

  // --- Structs ---
  const structBody = addSection(container, 'Structs', callbacks.onAddStruct);
  for (const s of bp.structs) {
    const item = document.createElement('div');
    item.className = 'mybp-item mybp-struct';

    const sIcon = document.createElement('span');
    sIcon.className = 'mybp-item-icon';
    sIcon.innerHTML = iconHTML(Icons.Diamond, 12, ICON_COLORS.blue);
    item.appendChild(sIcon);

    const sName = document.createElement('span');
    sName.className = 'mybp-item-name';
    sName.textContent = s.name;
    item.appendChild(sName);

    const sType = document.createElement('span');
    sType.className = 'mybp-var-type';
    sType.textContent = `${s.fields.length} fields`;
    item.appendChild(sType);

    const actions = document.createElement('span');
    actions.className = 'mybp-item-actions';
    const del = document.createElement('span');
    del.className = 'mybp-delete';
    del.innerHTML = iconHTML(Icons.X, 'xs', ICON_COLORS.muted);
    del.title = 'Delete';
    del.addEventListener('click', (e) => { e.stopPropagation(); callbacks.onDeleteStruct(s.id); });
    actions.appendChild(del);
    item.appendChild(actions);
    item.addEventListener('click', () => callbacks.onEditStruct(s));
    structBody.appendChild(item);
  }
}

export function addSection(parent: HTMLElement, title: string, onAdd: (() => void) | null): HTMLElement {
  const section = document.createElement('div');
  section.className = 'mybp-section';
  const header = document.createElement('div');
  header.className = 'mybp-section-header';
  const span = document.createElement('span');
  span.textContent = title;
  header.appendChild(span);
  if (onAdd) {
    const btn = document.createElement('span');
    btn.className = 'mybp-add-btn';
    btn.textContent = '+';
    btn.title = `Add ${title.slice(0, -1)}`;
    btn.addEventListener('click', (e) => { e.stopPropagation(); onAdd(); });
    header.appendChild(btn);
  }
  section.appendChild(header);
  const body = document.createElement('div');
  body.className = 'mybp-section-body';
  section.appendChild(body);
  parent.appendChild(section);
  return body;
}

export function makeDeletableItem(
  name: string, icon: string, cls: string,
  onClick: () => void, onDelete: () => void,
  dragData?: Record<string, any>,
): HTMLElement {
  const item = document.createElement('div');
  item.className = `mybp-item ${cls}`;

  const iconSpan = document.createElement('span');
  iconSpan.className = 'mybp-item-icon';
  iconSpan.innerHTML = icon;
  item.appendChild(iconSpan);

  const nameSpan = document.createElement('span');
  nameSpan.className = 'mybp-item-name';
  nameSpan.textContent = name;
  item.appendChild(nameSpan);

  // Actions container (right side)
  const actions = document.createElement('span');
  actions.className = 'mybp-item-actions';
  item.appendChild(actions);

  const del = document.createElement('span');
  del.className = 'mybp-delete';
  del.innerHTML = iconHTML(Icons.X, 'xs', ICON_COLORS.muted);
  del.title = 'Delete';
  del.addEventListener('click', (e) => { e.stopPropagation(); onDelete(); });
  actions.appendChild(del);

  item.addEventListener('click', onClick);
  if (dragData) {
    item.draggable = true;
    item.addEventListener('dragstart', (e) => {
      e.dataTransfer!.setData('text/plain', JSON.stringify(dragData));
    });
  }
  return item;
}

// ============================================================
//  Graph Tab Bar
// ============================================================
export function buildGraphTabBar(
  container: HTMLElement, tabs: GraphTab[], activeId: string,
  onSwitch: (tab: GraphTab) => void,
): void {
  container.innerHTML = '';
  container.className = 'graph-tab-bar';
  for (const tab of tabs) {
    const btn = document.createElement('div');
    btn.className = 'graph-tab' + (tab.id === activeId ? ' active' : '');
    const icon = tab.type === 'event' ? iconHTML(Icons.Zap, 'xs', ICON_COLORS.warning) : tab.type === 'function' ? iconHTML(Icons.Code, 'xs', ICON_COLORS.blueprint) : iconHTML(Icons.Diamond, 'xs');
    btn.innerHTML = `${icon} ${tab.label}`;
    btn.addEventListener('click', () => onSwitch(tab));
    container.appendChild(btn);
  }
}

// ============================================================
//  Drag-from-Pin Context Menu (UE-style)
//  Shows only nodes compatible with the dragged socket type.
//  For ClassRef pins, shows target actor's variables, functions,
//  component nodes, and actor-type-specific nodes (character, camera, etc.)
// ============================================================
export function showDragPinContextMenu(
  container: HTMLElement,
  x: number, y: number,
  draggedSocket: ClassicPreset.Socket,
  initial: { nodeId: string; side: 'input' | 'output'; key: string },
  targetActorId: string | null,
  targetActorName: string | null,
  targetBp: import('../BlueprintData').BlueprintData | null,
  isObjectPin: boolean,
  currentBp: import('../BlueprintData').BlueprintData,
  graphType: GraphType,
  onCreateNode: (node: ClassicPreset.Node, connectToKey: string | null) => void,
  targetActorType?: string,
  targetComponents?: ActorComponentData[],
  targetRootMeshType?: string,
) {
  const existing = container.querySelector('.bp-context-menu');
  if (existing) existing.remove();

  const menu = document.createElement('div');
  menu.className = 'bp-context-menu';
  menu.style.left = x + 'px';
  menu.style.top = y + 'px';

  const header = document.createElement('div');
  header.className = 'bp-context-header';
  if (targetActorName) {
    header.textContent = `${targetActorName} Members`;
  } else if (isObjectPin) {
    header.textContent = 'Object Actions';
  } else {
    header.textContent = `${draggedSocket.name} Actions`;
  }
  menu.appendChild(header);

  const searchInput = document.createElement('input');
  searchInput.className = 'bp-context-search';
  searchInput.placeholder = 'Search...';
  searchInput.type = 'text';
  menu.appendChild(searchInput);

  const listEl = document.createElement('div');
  listEl.className = 'bp-context-list';
  menu.appendChild(listEl);

  // Determine which side we're coming from to pick the right connect key
  const dragSide = initial.side; // 'output' = dragged from output, need to connect to input
  const dragSocketName = draggedSocket.name;

  function renderList(filter: string) {
    listEl.innerHTML = '';
    const lf = filter.toLowerCase();
    const categories = new Map<string, { label: string; action: () => void }[]>();

    // --- Target actor variables (Get / Set) ---
    if (targetBp && targetActorId) {
      const items: { label: string; action: () => void }[] = [];
      for (const v of targetBp.variables) {
        const getLabel = `Get ${v.name}`;
        const setLabel = `Set ${v.name}`;
        if (!lf || getLabel.toLowerCase().includes(lf) || 'variables'.includes(lf)) {
          items.push({ label: getLabel, action: () => {
            const node = new N.GetActorVariableNode(v.name, v.type, targetActorId!);
            // If dragged from output, connect to 'target' input
            const connectKey = dragSide === 'output' ? 'target' : 'value';
            onCreateNode(node, connectKey);
            menu.remove();
          }});
        }
        if (!lf || setLabel.toLowerCase().includes(lf) || 'variables'.includes(lf)) {
          items.push({ label: setLabel, action: () => {
            const node = new N.SetActorVariableNode(v.name, v.type, targetActorId!);
            const connectKey = dragSide === 'output' ? 'target' : 'exec';
            onCreateNode(node, connectKey);
            menu.remove();
          }});
        }
      }
      if (items.length) categories.set(`${targetActorName} Variables`, items);
    }

    // --- Target actor functions (Call) ---
    if (targetBp && targetActorId) {
      const items: { label: string; action: () => void }[] = [];
      for (const fn of targetBp.functions) {
        const label = `Call ${fn.name}`;
        if (!lf || label.toLowerCase().includes(lf) || 'functions'.includes(lf)) {
          items.push({ label, action: () => {
            const node = new N.CallActorFunctionNode(fn.id, fn.name, targetActorId!, fn.inputs, fn.outputs);
            const connectKey = dragSide === 'output' ? 'target' : 'exec';
            onCreateNode(node, connectKey);
            menu.remove();
          }});
        }
      }
      if (items.length) categories.set(`Æ’ ${targetActorName} Functions`, items);
    }

    // --- Target actor custom events (Call remotely) ---
    if (targetBp && targetActorId) {
      const items: { label: string; action: () => void }[] = [];
      for (const evt of targetBp.customEvents) {
        const label = `Call ${evt.name}`;
        if (!lf || label.toLowerCase().includes(lf) || 'events'.includes(lf)) {
          items.push({ label, action: () => {
            // For simplicity, create a CallCustomEventNode â€” remote event call
            // Note: this fires the event on the target actor
            const node = new N.CallCustomEventNode(evt.id, evt.name, evt.params, targetActorId || undefined);
            onCreateNode(node, null);
            menu.remove();
          }});
        }
      }
      if (items.length) categories.set(`${targetActorName} Events`, items);
    }

    // --- Target actor component nodes (light, trigger, mesh, etc.) ---
    if (targetActorId && targetComponents && targetRootMeshType) {
      const compEntries = N.getComponentNodeEntries(targetComponents, targetRootMeshType);
      if (compEntries.length > 0) {
        const items: { label: string; action: () => void }[] = [];
        for (const ce of compEntries) {
          if (!lf || ce.label.toLowerCase().includes(lf) || 'components'.includes(lf)) {
            items.push({ label: ce.label, action: () => {
              const node = ce.factory();
              onCreateNode(node, null);
              menu.remove();
            }});
          }
        }
        if (items.length) categories.set(`${targetActorName || ''} Components`, items);
      }
    }

    // --- Actor-type-specific nodes (Character, Camera, Physics, Transform) ---
    if (targetActorId && isObjectPin) {
      const isCharacter = targetActorType === 'characterPawn';
      const isCharacter2D = targetActorType === 'characterPawn2D';

      // Collect relevant N.NODE_PALETTE categories for this actor type
      const relevantCategories = new Set(['Physics', 'Transform', 'Collision']);
      if (isCharacter) {
        relevantCategories.add('Character');
      }
      if (isCharacter2D) {
        relevantCategories.add('Movement 2D');
        relevantCategories.add('Camera 2D');
        relevantCategories.add('Animation 2D');
      }
      if (targetActorType === 'projectile') {
        relevantCategories.add('Projectile');
      }

      for (const cat of relevantCategories) {
        const items: { label: string; action: () => void }[] = [];
        for (const entry of N.NODE_PALETTE) {
          if (entry.category !== cat) continue;
          if (lf && !entry.label.toLowerCase().includes(lf) && !cat.toLowerCase().includes(lf)) continue;
          items.push({ label: entry.label, action: () => {
            const node = entry.factory();
            onCreateNode(node, null);
            menu.remove();
          }});
        }
        if (items.length) {
          categories.set(cat, items);
        }
      }
    }

    // --- Generic object actions (for any ObjectRef / ClassRef pin) ---
    if (isObjectPin) {
      const objItems: { label: string; action: () => void }[] = [];

      // Get Actor Name
      if (!lf || 'get actor name'.includes(lf)) {
        objItems.push({ label: 'Get Actor Name', action: () => {
          const node = new N.GetActorNameNode();
          onCreateNode(node, dragSide === 'output' ? 'object' : 'name');
          menu.remove();
        }});
      }
      // Is Valid
      if (!lf || 'is valid'.includes(lf)) {
        objItems.push({ label: 'Is Valid', action: () => {
          const node = new N.IsValidNode();
          onCreateNode(node, dragSide === 'output' ? 'object' : null);
          menu.remove();
        }});
      }

      // Cast To entries â€” only for generic ObjectRef (ClassRef already know the type)
      if (dragSocketName === 'ObjectRef' && getActorAssetMgr()) {
        for (const asset of getActorAssetMgr()!.assets) {
          if (!lf || `cast to ${asset.name}`.toLowerCase().includes(lf) || 'casting'.includes(lf)) {
            objItems.push({ label: `Cast to ${asset.name}`, action: () => {
              const node = new N.CastToNode(asset.id, asset.name);
              onCreateNode(node, dragSide === 'output' ? 'object' : 'castedObject');
              menu.remove();
            }});
          }
          if (!lf || `pure cast to ${asset.name}`.toLowerCase().includes(lf) || 'casting'.includes(lf)) {
            objItems.push({ label: `Pure Cast to ${asset.name}`, action: () => {
              const node = new N.PureCastNode(asset.id, asset.name);
              onCreateNode(node, dragSide === 'output' ? 'object' : 'castedObject');
              menu.remove();
            }});
          }
        }
      }

      if (objItems.length) categories.set('Object Actions', objItems);
    }

    // --- Standard palette nodes filtered by socket compatibility ---
    if (!isObjectPin) {
      const stdItems: { label: string; action: () => void }[] = [];
      for (const entry of N.NODE_PALETTE) {
        if (graphType !== 'event' && entry.category === 'Events') continue;
        if (!lf && !entry.label.toLowerCase().includes(lf) && lf) continue;
        if (lf && !entry.label.toLowerCase().includes(lf) && !entry.category.toLowerCase().includes(lf)) continue;

        // Create a temp node to check socket compatibility
        const tempNode = entry.factory();
        let compatKey: string | null = null;
        if (dragSide === 'output') {
          // Find an input on the new node that's compatible with our dragged socket
          for (const [key, inp] of Object.entries(tempNode.inputs)) {
            if (inp?.socket && N.socketsCompatible(draggedSocket, inp.socket)) {
              compatKey = key;
              break;
            }
          }
        } else {
          // Find an output on the new node that's compatible
          for (const [key, out] of Object.entries(tempNode.outputs)) {
            if (out?.socket && N.socketsCompatible(draggedSocket, out.socket)) {
              compatKey = key;
              break;
            }
          }
        }
        if (compatKey !== null) {
          const ck = compatKey;
          stdItems.push({ label: entry.label, action: () => {
            const node = entry.factory();
            onCreateNode(node, ck);
            menu.remove();
          }});
        }
      }
      if (stdItems.length) categories.set('Compatible Nodes', stdItems);
    }

    // Render categories
    for (const [cat, entries] of categories) {
      const catEl = document.createElement('div');
      catEl.className = 'bp-context-category';
      catEl.textContent = cat;
      listEl.appendChild(catEl);
      for (const e of entries) {
        const item = document.createElement('div');
        item.className = 'bp-context-item';
        item.textContent = e.label;
        item.addEventListener('click', e.action);
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

  // Keyboard navigation
  let _selectedIdx = -1;
  searchInput.addEventListener('keydown', (e) => {
    const items = listEl.querySelectorAll('.bp-context-item');
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      _selectedIdx = Math.min(_selectedIdx + 1, items.length - 1);
      items.forEach((el, i) => el.classList.toggle('highlighted', i === _selectedIdx));
      items[_selectedIdx]?.scrollIntoView({ block: 'nearest' });
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      _selectedIdx = Math.max(_selectedIdx - 1, 0);
      items.forEach((el, i) => el.classList.toggle('highlighted', i === _selectedIdx));
      items[_selectedIdx]?.scrollIntoView({ block: 'nearest' });
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (_selectedIdx >= 0 && _selectedIdx < items.length) {
        (items[_selectedIdx] as HTMLElement).click();
      }
    } else if (e.key === 'Escape') {
      menu.remove();
    } else {
      _selectedIdx = -1;
    }
  });

  container.appendChild(menu);
  menu.addEventListener('wheel', (e) => { e.stopPropagation(); }, true);
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
//  Context Menu (palette) â€” includes variables, functions, macros
// ============================================================
export function showContextMenu(
  container: HTMLElement, x: number, y: number,
  bp: import('../BlueprintData').BlueprintData,
  graphType: GraphType,
  currentFuncId: string | null,
  onSelect: (entry: NodeEntry) => void,
  onAddVarNode: (v: BlueprintVariable, mode: 'get' | 'set') => void,
  onAddFnCallNode: (fn: BlueprintFunction) => void,
  onAddMacroCallNode: (m: BlueprintMacro) => void,
  onAddCustomEventCallNode: (evt: BlueprintCustomEvent) => void,
  onAddLocalVarNode: (v: BlueprintVariable, mode: 'get' | 'set') => void,
  onAddStructNode: (s: BlueprintStruct, mode: 'make' | 'break') => void,
  onAddInputKeyNode: (type: 'event' | 'isdown' | 'axis') => void,
  componentEntries?: ComponentNodeEntry[],
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
    const categories = new Map<string, { label: string; action: () => void }[]>();

    // Standard nodes
    for (const entry of N.NODE_PALETTE) {
      if (graphType !== 'event' && entry.category === 'Events') continue;
      if (lf && !entry.label.toLowerCase().includes(lf) && !entry.category.toLowerCase().includes(lf)) continue;
      const arr = categories.get(entry.category) || [];
      arr.push({ label: entry.label, action: () => { onSelect(entry); menu.remove(); } });
      categories.set(entry.category, arr);
    }

    // Variables â€” Get / Set
    if (bp.variables.length > 0) {
      const items: { label: string; action: () => void }[] = [];
      for (const v of bp.variables) {
        if (!lf || `get ${v.name}`.toLowerCase().includes(lf) || 'variables'.includes(lf))
          items.push({ label: `Get ${v.name}`, action: () => { onAddVarNode(v, 'get'); menu.remove(); } });
        if (!lf || `set ${v.name}`.toLowerCase().includes(lf) || 'variables'.includes(lf))
          items.push({ label: `Set ${v.name}`, action: () => { onAddVarNode(v, 'set'); menu.remove(); } });
      }
      if (items.length) categories.set('Variables', items);
    }

    // Local Variables â€” Get / Set (only in function graphs)
    if (currentFuncId) {
      const fn = bp.getFunction(currentFuncId);
      if (fn && fn.localVariables.length > 0) {
        const items: { label: string; action: () => void }[] = [];
        for (const lv of fn.localVariables) {
          if (!lf || `get ${lv.name}`.toLowerCase().includes(lf) || 'local variables'.includes(lf))
            items.push({ label: `Get ${lv.name} (local)`, action: () => { onAddLocalVarNode(lv, 'get'); menu.remove(); } });
          if (!lf || `set ${lv.name}`.toLowerCase().includes(lf) || 'local variables'.includes(lf))
            items.push({ label: `Set ${lv.name} (local)`, action: () => { onAddLocalVarNode(lv, 'set'); menu.remove(); } });
        }
        if (items.length) categories.set('Local Variables', items);
      }
    }

    // Functions
    if (bp.functions.length > 0) {
      const items: { label: string; action: () => void }[] = [];
      for (const fn of bp.functions) {
        if (!lf || fn.name.toLowerCase().includes(lf) || 'functions'.includes(lf))
          items.push({ label: fn.name, action: () => { onAddFnCallNode(fn); menu.remove(); } });
      }
      if (items.length) categories.set('Functions', items);
    }

    // Macros
    if (bp.macros.length > 0) {
      const items: { label: string; action: () => void }[] = [];
      for (const m of bp.macros) {
        if (!lf || m.name.toLowerCase().includes(lf) || 'macros'.includes(lf))
          items.push({ label: m.name, action: () => { onAddMacroCallNode(m); menu.remove(); } });
      }
      if (items.length) categories.set('Macros', items);
    }

    // Custom Events â€” Call
    if (bp.customEvents.length > 0) {
      const items: { label: string; action: () => void }[] = [];
      for (const evt of bp.customEvents) {
        if (!lf || `call ${evt.name}`.toLowerCase().includes(lf) || 'custom events'.includes(lf))
          items.push({ label: `Call ${evt.name}`, action: () => { onAddCustomEventCallNode(evt); menu.remove(); } });
      }
      if (items.length) categories.set('Custom Events', items);
    }

    // Structs â€” Make / Break (per-actor + project-level)
    {
      const items: { label: string; action: () => void }[] = [];
      // Per-actor structs
      for (const s of bp.structs) {
        if (!lf || `make ${s.name}`.toLowerCase().includes(lf) || 'structs'.includes(lf))
          items.push({ label: `Make ${s.name}`, action: () => { onAddStructNode(s, 'make'); menu.remove(); } });
        if (!lf || `break ${s.name}`.toLowerCase().includes(lf) || 'structs'.includes(lf))
          items.push({ label: `Break ${s.name}`, action: () => { onAddStructNode(s, 'break'); menu.remove(); } });
      }
      // Project-level structures
      if (getStructMgr()) {
        for (const ps of getStructMgr()!.structures) {
          // Skip if already listed from per-actor structs
          if (bp.structs.some(bs => bs.id === ps.id)) continue;
          const fields = ps.fields.map(f => ({ name: f.name, type: f.type }));
          const pseudoStruct = { id: ps.id, name: ps.name, fields };
          if (!lf || `make ${ps.name}`.toLowerCase().includes(lf) || 'structs'.includes(lf))
            items.push({ label: `Make ${ps.name}`, action: () => { onAddStructNode(pseudoStruct as any, 'make'); menu.remove(); } });
          if (!lf || `break ${ps.name}`.toLowerCase().includes(lf) || 'structs'.includes(lf))
            items.push({ label: `Break ${ps.name}`, action: () => { onAddStructNode(pseudoStruct as any, 'break'); menu.remove(); } });
        }
      }
      if (items.length) categories.set('Structs', items);
    }

    // Input â€” Key Event / Is Key Down / Input Axis (event graph only for Key Event)
    {
      const items: { label: string; action: () => void }[] = [];
      if (graphType === 'event') {
        if (!lf || 'input key event'.includes(lf) || 'input'.includes(lf))
          items.push({ label: 'Input Key Event', action: () => { menu.remove(); onAddInputKeyNode('event'); } });
      }
      if (!lf || 'is key down'.includes(lf) || 'input'.includes(lf))
        items.push({ label: 'Is Key Down', action: () => { menu.remove(); onAddInputKeyNode('isdown'); } });
      if (!lf || 'input axis'.includes(lf) || 'input'.includes(lf))
        items.push({ label: 'Input Axis', action: () => { menu.remove(); onAddInputKeyNode('axis'); } });
      if (items.length) categories.set('Input', items);
    }

    // Components â€” dynamic entries from ComponentNodeRules
    if (componentEntries && componentEntries.length > 0) {
      const items: { label: string; action: () => void }[] = [];
      for (const ce of componentEntries) {
        if (!lf || ce.label.toLowerCase().includes(lf) || 'components'.includes(lf))
          items.push({ label: ce.label, action: () => { onSelect({ label: ce.label, category: 'Components', factory: ce.factory }); menu.remove(); } });
      }
      if (items.length) categories.set('Components', items);
    }

    // Casting â€” dynamic "Cast to <ClassName>" entries per actor asset
    if (getActorAssetMgr()) {
      const castItems: { label: string; action: () => void }[] = [];
      for (const asset of getActorAssetMgr()!.assets) {
        // Cast To (exec-based)
        if (!lf || `cast to ${asset.name}`.toLowerCase().includes(lf) || 'casting'.includes(lf))
          castItems.push({ label: `Cast to ${asset.name}`, action: () => {
            onSelect({ label: `Cast to ${asset.name}`, category: 'Casting', factory: () => new N.CastToNode(asset.id, asset.name) });
            menu.remove();
          }});
        // Pure Cast (data-only)
        if (!lf || `pure cast to ${asset.name}`.toLowerCase().includes(lf) || 'casting'.includes(lf))
          castItems.push({ label: `Pure Cast to ${asset.name}`, action: () => {
            onSelect({ label: `Pure Cast to ${asset.name}`, category: 'Casting', factory: () => new N.PureCastNode(asset.id, asset.name) });
            menu.remove();
          }});
        // Get All Actors Of Class
        if (!lf || `get all actors of class ${asset.name}`.toLowerCase().includes(lf) || 'casting'.includes(lf))
          castItems.push({ label: `Get All ${asset.name}`, action: () => {
            onSelect({ label: `Get All ${asset.name}`, category: 'Casting', factory: () => new N.GetAllActorsOfClassNode(asset.id, asset.name) });
            menu.remove();
          }});
      }
      if (castItems.length) {
        const existing = categories.get('Casting') || [];
        categories.set('Casting', [...existing, ...castItems]);
      }
    }

    // DataTable — dynamic entries per DataTable asset
    if (getDataTableMgr() && getDataTableMgr()!.tables.length > 0) {
      const dtItems: { label: string; action: () => void }[] = [];
      for (const dt of getDataTableMgr()!.tables) {
        if (!lf || `get ${dt.name} row`.toLowerCase().includes(lf) || 'datatable'.includes(lf))
          dtItems.push({ label: `Get ${dt.name} Row`, action: () => {
            onSelect({ label: `Get ${dt.name} Row`, category: 'DataTable', factory: () => new N.GetDataTableRowNode(dt.id, dt.name, dt.structId, dt.structName) });
            menu.remove();
          }});
        if (!lf || `get all ${dt.name} rows`.toLowerCase().includes(lf) || 'datatable'.includes(lf))
          dtItems.push({ label: `Get All ${dt.name} Rows`, action: () => {
            onSelect({ label: `Get All ${dt.name} Rows`, category: 'DataTable', factory: () => new N.GetAllDataTableRowsNode(dt.id, dt.name, dt.structId, dt.structName) });
            menu.remove();
          }});
        if (!lf || `get ${dt.name} field`.toLowerCase().includes(lf) || 'datatable'.includes(lf))
          dtItems.push({ label: `Get ${dt.name} Field`, action: () => {
            onSelect({ label: `Get ${dt.name} Field`, category: 'DataTable', factory: () => new N.GetDataTableFieldNode(dt.id, dt.name, dt.structId, dt.structName) });
            menu.remove();
          }});
      }
      if (dtItems.length) {
        const existing = categories.get('DataTable') || [];
        categories.set('DataTable', [...existing, ...dtItems]);
      }
    }

    for (const [cat, entries] of categories) {
      const catEl = document.createElement('div');
      catEl.className = 'bp-context-category';
      const catIcon = N.getCategoryIcon(cat);
      catEl.innerHTML = `<span class="bp-cat-icon">${catIcon}</span> ${cat}`;
      listEl.appendChild(catEl);
      for (const e of entries) {
        const item = document.createElement('div');
        item.className = 'bp-context-item';
        item.textContent = e.label;
        item.addEventListener('click', e.action);
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

  // Keyboard navigation in context menu
  let _selectedIdx = -1;
  searchInput.addEventListener('keydown', (e) => {
    const items = listEl.querySelectorAll('.bp-context-item');
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      _selectedIdx = Math.min(_selectedIdx + 1, items.length - 1);
      items.forEach((el, i) => el.classList.toggle('highlighted', i === _selectedIdx));
      items[_selectedIdx]?.scrollIntoView({ block: 'nearest' });
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      _selectedIdx = Math.max(_selectedIdx - 1, 0);
      items.forEach((el, i) => el.classList.toggle('highlighted', i === _selectedIdx));
      items[_selectedIdx]?.scrollIntoView({ block: 'nearest' });
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (_selectedIdx >= 0 && _selectedIdx < items.length) {
        (items[_selectedIdx] as HTMLElement).click();
      }
    } else if (e.key === 'Escape') {
      menu.remove();
    } else {
      _selectedIdx = -1;
    }
  });

  container.appendChild(menu);
  // Prevent scroll inside menu from zooming the canvas
  menu.addEventListener('wheel', (e) => { e.stopPropagation(); }, true);
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
//  Dialogs â€” Add Variable, Add Function/Macro, Edit Variable, Struct
// ============================================================
export function buildTypeOptions(bp: import('../BlueprintData').BlueprintData, selected?: VarType): string {
  const base = ['Float', 'Boolean', 'Vector3', 'String', 'Color', 'ObjectRef', 'Widget', 'BlackboardKeySelector'] as const;
  let html = '';
  for (const t of base) {
    html += `<option value="${t}"${selected === t ? ' selected' : ''}>${t}</option>`;
  }
  // Per-actor (legacy) structs
  for (const s of bp.structs) {
    const val = `Struct:${s.id}`;
    html += `<option value="${val}"${selected === val ? ' selected' : ''}>${s.name}</option>`;
  }
  // Project-level structures
  if (getStructMgr()) {
    for (const s of getStructMgr()!.structures) {
      const val: VarType = `Struct:${s.id}`;
      // Skip if already listed from per-actor structs
      if (bp.structs.some(bs => bs.id === s.id)) continue;
      html += `<option value="${val}"${selected === val ? ' selected' : ''}>${s.name} (Struct)</option>`;
    }
    // Project-level enums
    for (const e of getStructMgr()!.enums) {
      const val: VarType = `Enum:${e.id}`;
      html += `<option value="${val}"${selected === val ? ' selected' : ''}>${e.name} (Enum)</option>`;
    }
  }
  // Actor class references â€” for storing typed actor/object refs as variables
  if (getActorAssetMgr()) {
    for (const asset of getActorAssetMgr()!.assets) {
      const val: VarType = `ClassRef:${asset.id}`;
      html += `<option value="${val}"${selected === val ? ' selected' : ''}>${asset.name} (Actor Ref)</option>`;
    }
  }
  return html;
}

/** Returns the display name for a VarType (resolving struct IDs to names) */
export function typeDisplayName(type: VarType, bp: import('../BlueprintData').BlueprintData): string {
  if (type.startsWith('Struct:')) {
    const structId = type.slice(7);
    const struct = bp.structs.find(s => s.id === structId);
    if (struct) return struct.name;
    // Try project-level
    if (getStructMgr()) {
      const projStruct = getStructMgr()!.getStructure(structId);
      if (projStruct) return projStruct.name;
    }
    return 'Struct?';
  }
  if (type.startsWith('Enum:')) {
    const enumId = type.slice(5);
    if (getStructMgr()) {
      const projEnum = getStructMgr()!.getEnum(enumId);
      if (projEnum) return projEnum.name;
    }
    return 'Enum?';
  }
  if (type.startsWith('ClassRef:')) {
    const actorId = type.slice(9);
    if (getActorAssetMgr()) {
      const asset = getActorAssetMgr()!.assets.find(a => a.id === actorId);
      if (asset) return `${asset.name} Ref`;
    }
    return 'Actor Ref?';
  }
  return type;
}

/** CSS class suffix for type dot color */
export function typeDotClass(type: VarType): string {
  if (type.startsWith('Struct:')) return 'mybp-var-struct';
  if (type.startsWith('Enum:'))   return 'mybp-var-enum';
  if (type.startsWith('ClassRef:')) return 'mybp-var-objectref';
  return `mybp-var-${type.toLowerCase()}`;
}

export function showAddVariableDialog(parent: HTMLElement, bp: import('../BlueprintData').BlueprintData, onAdd: (name: string, type: VarType) => void) {
  const overlay = document.createElement('div');
  overlay.className = 'mybp-dialog-overlay';
  const dialog = document.createElement('div');
  dialog.className = 'mybp-dialog';
  dialog.innerHTML = `
    <div class="mybp-dialog-title">New Variable</div>
    <label class="mybp-dialog-label">Name</label>
    <input class="mybp-dialog-input" type="text" value="NewVar" id="dlg-var-name" />
    <label class="mybp-dialog-label">Type</label>
    <select class="mybp-dialog-select" id="dlg-var-type">
      ${buildTypeOptions(bp)}
    </select>
    <div class="mybp-dialog-actions">
      <button class="mybp-dialog-btn cancel" id="dlg-cancel">Cancel</button>
      <button class="mybp-dialog-btn ok" id="dlg-ok">Add</button>
    </div>`;
  overlay.appendChild(dialog);
  parent.appendChild(overlay);
  const nameInput = dialog.querySelector('#dlg-var-name') as HTMLInputElement;
  nameInput.select(); nameInput.focus();
  const close = () => overlay.remove();
  dialog.querySelector('#dlg-cancel')!.addEventListener('click', close);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
  dialog.querySelector('#dlg-ok')!.addEventListener('click', () => {
    onAdd(nameInput.value.trim() || 'NewVar', (dialog.querySelector('#dlg-var-type') as HTMLSelectElement).value as VarType);
    close();
  });
  nameInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') dialog.querySelector<HTMLButtonElement>('#dlg-ok')!.click();
    if (e.key === 'Escape') close();
  });
}

export function showAddNameDialog(parent: HTMLElement, title: string, defaultName: string, onAdd: (name: string) => void) {
  const overlay = document.createElement('div');
  overlay.className = 'mybp-dialog-overlay';
  const dialog = document.createElement('div');
  dialog.className = 'mybp-dialog';
  dialog.innerHTML = `
    <div class="mybp-dialog-title">${title}</div>
    <label class="mybp-dialog-label">Name</label>
    <input class="mybp-dialog-input" type="text" value="${defaultName}" id="dlg-name" />
    <div class="mybp-dialog-actions">
      <button class="mybp-dialog-btn cancel" id="dlg-cancel">Cancel</button>
      <button class="mybp-dialog-btn ok" id="dlg-ok">Add</button>
    </div>`;
  overlay.appendChild(dialog);
  parent.appendChild(overlay);
  const nameInput = dialog.querySelector('#dlg-name') as HTMLInputElement;
  nameInput.select(); nameInput.focus();
  const close = () => overlay.remove();
  dialog.querySelector('#dlg-cancel')!.addEventListener('click', close);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
  dialog.querySelector('#dlg-ok')!.addEventListener('click', () => {
    onAdd(nameInput.value.trim() || defaultName);
    close();
  });
  nameInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') dialog.querySelector<HTMLButtonElement>('#dlg-ok')!.click();
    if (e.key === 'Escape') close();
  });
}

export function showKeySelectDialog(parent: HTMLElement, title: string, onSelect: (key: string) => void) {
  const overlay = document.createElement('div');
  overlay.className = 'mybp-dialog-overlay';
  const dialog = document.createElement('div');
  dialog.className = 'mybp-dialog';
  const options = N.INPUT_KEYS.map(k => `<option value="${k}">${k}</option>`).join('');
  dialog.innerHTML = `
    <div class="mybp-dialog-title">${title}</div>
    <label class="mybp-dialog-label">Key</label>
    <select class="mybp-dialog-input" id="dlg-key">${options}</select>
    <div class="mybp-dialog-actions">
      <button class="mybp-dialog-btn cancel" id="dlg-cancel">Cancel</button>
      <button class="mybp-dialog-btn ok" id="dlg-ok">Add</button>
    </div>`;
  overlay.appendChild(dialog);
  parent.appendChild(overlay);
  const close = () => overlay.remove();
  dialog.querySelector('#dlg-cancel')!.addEventListener('click', close);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
  dialog.querySelector('#dlg-ok')!.addEventListener('click', () => {
    const sel = dialog.querySelector('#dlg-key') as HTMLSelectElement;
    onSelect(sel.value);
    close();
  });
}

// ============================================================
//  Parameter Editor Dialog â€” edit inputs/outputs for functions
//  or params for custom events (reusable, struct-field-like UI)
// ============================================================
export function showParamEditorDialog(
  parent: HTMLElement,
  bp: import('../BlueprintData').BlueprintData,
  title: string,
  inputParams: { name: string; type: VarType }[],
  outputParams: { name: string; type: VarType }[] | null, // null = custom events (no outputs)
  onSave: (inputs: { name: string; type: VarType }[], outputs: { name: string; type: VarType }[] | null) => void,
) {
  const overlay = document.createElement('div');
  overlay.className = 'mybp-dialog-overlay';
  const dialog = document.createElement('div');
  dialog.className = 'mybp-dialog mybp-struct-dialog';

  const inputs = inputParams.map(p => ({ ...p }));
  const outputs = outputParams ? outputParams.map(p => ({ ...p })) : null;

  function render() {
    dialog.innerHTML = '';

    const titleEl = document.createElement('div');
    titleEl.className = 'mybp-dialog-title';
    titleEl.textContent = title;
    dialog.appendChild(titleEl);

    // --- Inputs ---
    const inLabel = document.createElement('label');
    inLabel.className = 'mybp-dialog-label';
    inLabel.textContent = outputs !== null ? 'Inputs' : 'Parameters';
    dialog.appendChild(inLabel);

    const inList = document.createElement('div');
    inList.className = 'mybp-struct-field-list';
    dialog.appendChild(inList);

    for (let i = 0; i < inputs.length; i++) {
      const p = inputs[i];
      const row = document.createElement('div');
      row.className = 'mybp-struct-field-row';

      const pName = document.createElement('input');
      pName.className = 'mybp-dialog-input mybp-struct-field-name';
      pName.type = 'text';
      pName.value = p.name;
      pName.placeholder = 'Param name';
      pName.addEventListener('input', () => { p.name = pName.value; });
      row.appendChild(pName);

      const pType = document.createElement('select');
      pType.className = 'mybp-dialog-select mybp-struct-field-type';
      pType.innerHTML = buildTypeOptions(bp, p.type);
      pType.addEventListener('change', () => { p.type = pType.value as VarType; });
      row.appendChild(pType);

      const delBtn = document.createElement('span');
      delBtn.className = 'mybp-struct-field-del';
      delBtn.innerHTML = iconHTML(Icons.X, 'xs', ICON_COLORS.muted);
      delBtn.title = 'Remove';
      delBtn.addEventListener('click', () => { inputs.splice(i, 1); render(); });
      row.appendChild(delBtn);

      inList.appendChild(row);
    }

    const addInBtn = document.createElement('button');
    addInBtn.className = 'mybp-dialog-btn mybp-struct-add-field';
    addInBtn.textContent = outputs !== null ? '+ Add Input' : '+ Add Parameter';
    addInBtn.addEventListener('click', () => { inputs.push({ name: 'NewParam', type: 'Float' }); render(); });
    dialog.appendChild(addInBtn);

    // --- Outputs (functions only) ---
    if (outputs !== null) {
      const outLabel = document.createElement('label');
      outLabel.className = 'mybp-dialog-label';
      outLabel.style.marginTop = '12px';
      outLabel.textContent = 'Outputs';
      dialog.appendChild(outLabel);

      const outList = document.createElement('div');
      outList.className = 'mybp-struct-field-list';
      dialog.appendChild(outList);

      for (let i = 0; i < outputs.length; i++) {
        const p = outputs[i];
        const row = document.createElement('div');
        row.className = 'mybp-struct-field-row';

        const pName = document.createElement('input');
        pName.className = 'mybp-dialog-input mybp-struct-field-name';
        pName.type = 'text';
        pName.value = p.name;
        pName.placeholder = 'Output name';
        pName.addEventListener('input', () => { p.name = pName.value; });
        row.appendChild(pName);

        const pType = document.createElement('select');
        pType.className = 'mybp-dialog-select mybp-struct-field-type';
        pType.innerHTML = buildTypeOptions(bp, p.type);
        pType.addEventListener('change', () => { p.type = pType.value as VarType; });
        row.appendChild(pType);

        const delBtn = document.createElement('span');
        delBtn.className = 'mybp-struct-field-del';
        delBtn.innerHTML = iconHTML(Icons.X, 'xs', ICON_COLORS.muted);
        delBtn.title = 'Remove';
        delBtn.addEventListener('click', () => { outputs.splice(i, 1); render(); });
        row.appendChild(delBtn);

        outList.appendChild(row);
      }

      const addOutBtn = document.createElement('button');
      addOutBtn.className = 'mybp-dialog-btn mybp-struct-add-field';
      addOutBtn.textContent = '+ Add Output';
      addOutBtn.addEventListener('click', () => { outputs.push({ name: 'ReturnValue', type: 'Float' }); render(); });
      dialog.appendChild(addOutBtn);
    }

    // --- Actions ---
    const actions = document.createElement('div');
    actions.className = 'mybp-dialog-actions';
    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'mybp-dialog-btn cancel';
    cancelBtn.textContent = 'Cancel';
    cancelBtn.addEventListener('click', () => overlay.remove());
    actions.appendChild(cancelBtn);
    const okBtn = document.createElement('button');
    okBtn.className = 'mybp-dialog-btn ok';
    okBtn.textContent = 'Save';
    okBtn.addEventListener('click', () => {
      const validInputs = inputs.filter(p => p.name.trim());
      const validOutputs = outputs ? outputs.filter(p => p.name.trim()) : null;
      onSave(validInputs, validOutputs);
      overlay.remove();
    });
    actions.appendChild(okBtn);
    dialog.appendChild(actions);
  }

  render();
  overlay.appendChild(dialog);
  parent.appendChild(overlay);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
}

export function showVariableEditor(parent: HTMLElement, v: BlueprintVariable, bp: import('../BlueprintData').BlueprintData, onChange: () => void) {
  const overlay = document.createElement('div');
  overlay.className = 'mybp-dialog-overlay';
  const dialog = document.createElement('div');
  dialog.className = 'mybp-dialog';

  function buildDefaultValueInput(type: VarType, dv: any): string {
    if (type === 'Float') return `<input class="mybp-dialog-input" type="number" step="0.1" value="${dv ?? 0}" id="dlg-val" />`;
    if (type === 'Boolean') return `<label style="display:flex;align-items:center;gap:8px;"><input type="checkbox" id="dlg-val" ${dv ? 'checked' : ''} /> Default</label>`;
    if (type === 'String') return `<input class="mybp-dialog-input" type="text" value="${dv ?? ''}" id="dlg-val" />`;
    if (type === 'Color') return `<input class="mybp-dialog-input" type="color" value="${dv ?? '#ffffff'}" id="dlg-val" style="height:32px;padding:2px;cursor:pointer;" />`;
    if (type === 'Vector3') {
      const d = dv || { x: 0, y: 0, z: 0 };
      return `<div style="display:flex;gap:4px;"><input class="mybp-dialog-input" type="number" step="0.1" value="${d.x}" id="dlg-vx" style="flex:1" placeholder="X"/><input class="mybp-dialog-input" type="number" step="0.1" value="${d.y}" id="dlg-vy" style="flex:1" placeholder="Y"/><input class="mybp-dialog-input" type="number" step="0.1" value="${d.z}" id="dlg-vz" style="flex:1" placeholder="Z"/></div>`;
    }
    if (type.startsWith('Struct:')) {
      return `<span style="color:#888;font-size:11px;">Struct â€” set field defaults via Set nodes</span>`;
    }
    if (type.startsWith('Enum:')) {
      const enumId = type.slice(5);
      const enumAsset = getStructMgr()?.getEnum(enumId);
      if (enumAsset && enumAsset.values.length > 0) {
        let html = `<select class="mybp-dialog-select" id="dlg-val">`;
        for (const ev of enumAsset.values) {
          html += `<option value="${ev.name}"${dv === ev.name ? ' selected' : ''}>${ev.displayName}</option>`;
        }
        html += `</select>`;
        return html;
      }
      return `<span style="color:#888;font-size:11px;">Enum â€” no values defined</span>`;
    }
    if (type === 'ObjectRef' || type === 'Widget') {
      return `<span style="color:#888;font-size:11px;">None â€” assigned at runtime via Cast/Get nodes</span>`;
    }
    if (type.startsWith('ClassRef:')) {
      const actorId = type.slice(9);
      const actorName = getActorAssetMgr()?.assets.find(a => a.id === actorId)?.name ?? 'Actor';
      return `<span style="color:#888;font-size:11px;">None (${actorName} Ref) â€” assigned at runtime via Cast nodes</span>`;
    }
    return '';
  }

  function defaultForType(type: VarType): any {
    switch (type) {
      case 'Float': return 0;
      case 'Boolean': return false;
      case 'Vector3': return { x: 0, y: 0, z: 0 };
      case 'Color': return '#ffffff'
      case 'String': return '';
      default:
        if (type.startsWith('Struct:')) {
          const fields = resolveStructFields(type.slice(7), bp);
          if (fields) {
            const obj: any = {};
            for (const f of fields) obj[f.name] = defaultForType(f.type);
            return obj;
          }
        }
        if (type.startsWith('Enum:')) {
          const enumAsset = getStructMgr()?.getEnum(type.slice(5));
          return enumAsset?.values[0]?.name ?? '';
        }
        return null;
    }
  }

  function renderDialog() {
    const displayType = typeDisplayName(v.type, bp);
    dialog.innerHTML = `
      <div class="mybp-dialog-title">Edit: ${v.name} (${displayType})</div>
      <label class="mybp-dialog-label">Name</label>
      <input class="mybp-dialog-input" type="text" value="${v.name}" id="dlg-var-name" />
      <label class="mybp-dialog-label">Type</label>
      <select class="mybp-dialog-select" id="dlg-var-type">
        ${buildTypeOptions(bp, v.type)}
      </select>
      <label class="mybp-dialog-label">Default Value</label>
      <div id="dlg-default-container">${buildDefaultValueInput(v.type, v.defaultValue)}</div>
      <div class="mybp-dialog-actions">
        <button class="mybp-dialog-btn cancel" id="dlg-cancel">Cancel</button>
        <button class="mybp-dialog-btn ok" id="dlg-ok">Save</button>
      </div>`;

    // When type changes, update default value input and reset defaultValue
    const typeSelect = dialog.querySelector('#dlg-var-type') as HTMLSelectElement;
    typeSelect.addEventListener('change', () => {
      const newType = typeSelect.value as VarType;
      v.type = newType;
      v.defaultValue = defaultForType(newType);
      const container = dialog.querySelector('#dlg-default-container')!;
      container.innerHTML = buildDefaultValueInput(newType, v.defaultValue);
    });

    const close = () => overlay.remove();
    dialog.querySelector('#dlg-cancel')!.addEventListener('click', close);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
    dialog.querySelector('#dlg-ok')!.addEventListener('click', () => {
      v.name = (dialog.querySelector('#dlg-var-name') as HTMLInputElement).value.trim() || v.name;
      v.type = (dialog.querySelector('#dlg-var-type') as HTMLSelectElement).value as VarType;
      if (v.type === 'Float') v.defaultValue = parseFloat((dialog.querySelector('#dlg-val') as HTMLInputElement).value) || 0;
      else if (v.type === 'Color') v.defaultValue = (dialog.querySelector('#dlg-val') as HTMLInputElement).value;
      else if (v.type === 'Boolean') v.defaultValue = (dialog.querySelector('#dlg-val') as HTMLInputElement).checked;
      else if (v.type === 'String') v.defaultValue = (dialog.querySelector('#dlg-val') as HTMLInputElement).value;
      else if (v.type === 'Vector3') {
        v.defaultValue = {
          x: parseFloat((dialog.querySelector('#dlg-vx') as HTMLInputElement).value) || 0,
          y: parseFloat((dialog.querySelector('#dlg-vy') as HTMLInputElement).value) || 0,
          z: parseFloat((dialog.querySelector('#dlg-vz') as HTMLInputElement).value) || 0,
        };
      } else if (v.type.startsWith('Struct:')) {
        v.defaultValue = defaultForType(v.type);
      } else if (v.type.startsWith('Enum:')) {
        const valEl = dialog.querySelector('#dlg-val') as HTMLSelectElement | null;
        v.defaultValue = valEl?.value ?? '';
      } else if (v.type === 'ObjectRef' || v.type === 'Widget' || v.type.startsWith('ClassRef:')) {
        v.defaultValue = null; // Object references are always null by default, assigned at runtime
      }
      onChange();
      close();
    });
  }

  renderDialog();
  overlay.appendChild(dialog);
  parent.appendChild(overlay);
}

// ============================================================
//  Struct Dialog â€” Create / Edit struct with field editor
// ============================================================
export function showStructDialog(
  parent: HTMLElement,
  bp: import('../BlueprintData').BlueprintData,
  existing: BlueprintStruct | null,
  onSave: (name: string, fields: { name: string; type: VarType }[]) => void,
) {
  const overlay = document.createElement('div');
  overlay.className = 'mybp-dialog-overlay';
  const dialog = document.createElement('div');
  dialog.className = 'mybp-dialog mybp-struct-dialog';

  let structName = existing ? existing.name : 'ST_NewStruct';
  let fields: { name: string; type: VarType }[] = existing
    ? existing.fields.map(f => ({ ...f }))
    : [{ name: 'Value', type: 'Float' as VarType }];

  function render() {
    dialog.innerHTML = '';

    const title = document.createElement('div');
    title.className = 'mybp-dialog-title';
    title.textContent = existing ? `Edit Struct: ${structName}` : 'New Struct';
    dialog.appendChild(title);

    // Name
    const nameLbl = document.createElement('label');
    nameLbl.className = 'mybp-dialog-label';
    nameLbl.textContent = 'Struct Name';
    dialog.appendChild(nameLbl);
    const nameInput = document.createElement('input');
    nameInput.className = 'mybp-dialog-input';
    nameInput.type = 'text';
    nameInput.value = structName;
    nameInput.addEventListener('input', () => { structName = nameInput.value; });
    dialog.appendChild(nameInput);

    // Fields header
    const fieldsLbl = document.createElement('label');
    fieldsLbl.className = 'mybp-dialog-label';
    fieldsLbl.textContent = 'Fields';
    dialog.appendChild(fieldsLbl);

    const fieldList = document.createElement('div');
    fieldList.className = 'mybp-struct-field-list';
    dialog.appendChild(fieldList);

    for (let i = 0; i < fields.length; i++) {
      const f = fields[i];
      const row = document.createElement('div');
      row.className = 'mybp-struct-field-row';

      const fName = document.createElement('input');
      fName.className = 'mybp-dialog-input mybp-struct-field-name';
      fName.type = 'text';
      fName.value = f.name;
      fName.placeholder = 'Field name';
      fName.addEventListener('input', () => { f.name = fName.value; });
      row.appendChild(fName);

      const fType = document.createElement('select');
      fType.className = 'mybp-dialog-select mybp-struct-field-type';
      fType.innerHTML = buildTypeOptions(bp, f.type);
      fType.addEventListener('change', () => { f.type = fType.value as VarType; });
      row.appendChild(fType);

      const delBtn = document.createElement('span');
      delBtn.className = 'mybp-struct-field-del';
      delBtn.innerHTML = iconHTML(Icons.X, 'xs', ICON_COLORS.muted);
      delBtn.title = 'Remove field';
      delBtn.addEventListener('click', () => { fields.splice(i, 1); render(); });
      row.appendChild(delBtn);

      fieldList.appendChild(row);
    }

    // Add field button
    const addFieldBtn = document.createElement('button');
    addFieldBtn.className = 'mybp-dialog-btn mybp-struct-add-field';
    addFieldBtn.textContent = '+ Add Field';
    addFieldBtn.addEventListener('click', () => {
      fields.push({ name: 'NewField', type: 'Float' });
      render();
    });
    dialog.appendChild(addFieldBtn);

    // Actions
    const actions = document.createElement('div');
    actions.className = 'mybp-dialog-actions';
    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'mybp-dialog-btn cancel';
    cancelBtn.textContent = 'Cancel';
    cancelBtn.addEventListener('click', () => overlay.remove());
    actions.appendChild(cancelBtn);
    const okBtn = document.createElement('button');
    okBtn.className = 'mybp-dialog-btn ok';
    okBtn.textContent = existing ? 'Save' : 'Create';
    okBtn.addEventListener('click', () => {
      const validFields = fields.filter(f => f.name.trim());
      onSave(structName.trim() || 'ST_NewStruct', validFields);
      overlay.remove();
    });
    actions.appendChild(okBtn);
    dialog.appendChild(actions);
  }

  render();
  overlay.appendChild(dialog);
  parent.appendChild(overlay);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
}

// ============================================================
//  Graph Serialization / Deserialization
// ============================================================

/** Map a node instance to a serializable type string */
