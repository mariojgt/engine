// ============================================================
//  ClassHierarchyPanel — Dockable tree view of all Actor/Widget
//  class hierarchies. Shows parent→child relationships,
//  right-click actions, search/filter, and sync status.
// ============================================================

import { ClassInheritanceSystem } from './ClassInheritanceSystem';
import type { ActorAssetManager, ActorAsset } from './ActorAsset';
import type { WidgetBlueprintManager, WidgetBlueprintAsset } from './WidgetBlueprintData';

// ============================================================
//  Types
// ============================================================

interface TreeNode {
  id: string;
  name: string;
  kind: 'actor' | 'widget';
  children: TreeNode[];
  isExpanded: boolean;
  isOutOfSync: boolean;
  childCount: number; // total descendants
}

type HierarchyAction =
  | { type: 'open'; id: string; kind: 'actor' | 'widget' }
  | { type: 'create-child'; id: string; kind: 'actor' | 'widget' }
  | { type: 'show-children'; id: string; kind: 'actor' | 'widget' }
  | { type: 'show-parent'; id: string; kind: 'actor' | 'widget' }
  | { type: 'change-parent'; id: string; kind: 'actor' | 'widget' }
  | { type: 'find-references'; id: string; kind: 'actor' | 'widget' };

export class ClassHierarchyPanel {
  private _container: HTMLElement;
  private _el: HTMLElement;
  private _filter: 'all' | 'actors' | 'widgets' = 'all';
  private _searchQuery: string = '';
  private _expandedNodes: Set<string> = new Set();
  private _onAction: (action: HierarchyAction) => void;
  private _contextMenu: HTMLElement | null = null;

  private _actorMgr: ActorAssetManager | null = null;
  private _widgetMgr: WidgetBlueprintManager | null = null;
  private _inh: ClassInheritanceSystem;

  constructor(container: HTMLElement, onAction: (action: HierarchyAction) => void) {
    this._container = container;
    this._onAction = onAction;
    this._inh = ClassInheritanceSystem.instance;

    this._el = document.createElement('div');
    this._el.className = 'class-hierarchy-panel';
    this._el.style.cssText = 'width:100%;height:100%;display:flex;flex-direction:column;background:#1e1e2e;color:#ccc;font-family:"Segoe UI",sans-serif;font-size:12px;overflow:hidden;';
    container.appendChild(this._el);

    this._injectStyles();
    this._render();

    // Auto-expand root nodes
    this._expandedNodes.add('__actors__');
    this._expandedNodes.add('__widgets__');

    // Listen for inheritance changes
    this._inh.onInheritanceChanged(() => this._render());

    // Close context menu on click elsewhere
    document.addEventListener('click', () => this._closeContextMenu());
  }

  setActorManager(mgr: ActorAssetManager): void {
    this._actorMgr = mgr;
    mgr.onChanged(() => this._render());
    this._render();
  }

  setWidgetManager(mgr: WidgetBlueprintManager): void {
    this._widgetMgr = mgr;
    mgr.onChanged(() => this._render());
    this._render();
  }

  /** Highlight a specific class in the tree */
  highlightClass(id: string): void {
    // Expand all ancestors
    const chain = this._inh.getAncestryChain(id);
    for (const cid of chain) {
      this._expandedNodes.add(cid);
    }
    // Expand type group
    const actorEntry = this._inh.getActorEntry(id);
    if (actorEntry) this._expandedNodes.add('__actors__');
    const widgetEntry = this._inh.getWidgetEntry(id);
    if (widgetEntry) this._expandedNodes.add('__widgets__');

    this._render();

    // Scroll to and highlight the node
    requestAnimationFrame(() => {
      const nodeEl = this._el.querySelector(`[data-class-id="${id}"]`);
      if (nodeEl) {
        nodeEl.scrollIntoView({ block: 'center', behavior: 'smooth' });
        (nodeEl as HTMLElement).style.background = '#2563eb33';
        setTimeout(() => { (nodeEl as HTMLElement).style.background = ''; }, 2000);
      }
    });
  }

  refresh(): void {
    this._render();
  }

  // ============================================================
  //  Build Tree
  // ============================================================

  private _buildTree(): { actors: TreeNode[]; widgets: TreeNode[] } {
    const actorRoots = this._inh.getActorHierarchyRoots();
    const widgetRoots = this._inh.getWidgetHierarchyRoots();

    const buildActorNode = (entry: ReturnType<typeof this._inh.getActorEntry>): TreeNode | null => {
      if (!entry) return null;
      const children: TreeNode[] = [];
      for (const childEntry of this._inh.getActorChildren(entry.id)) {
        const childNode = buildActorNode(childEntry);
        if (childNode) children.push(childNode);
      }
      return {
        id: entry.id,
        name: entry.name,
        kind: 'actor',
        children,
        isExpanded: this._expandedNodes.has(entry.id),
        isOutOfSync: this._inh.isOutOfSync(entry.id),
        childCount: this._inh.getAllActorDescendants(entry.id).length,
      };
    };

    const buildWidgetNode = (entry: ReturnType<typeof this._inh.getWidgetEntry>): TreeNode | null => {
      if (!entry) return null;
      const children: TreeNode[] = [];
      for (const childEntry of this._inh.getWidgetChildren(entry.id)) {
        const childNode = buildWidgetNode(childEntry);
        if (childNode) children.push(childNode);
      }
      return {
        id: entry.id,
        name: entry.name,
        kind: 'widget',
        children,
        isExpanded: this._expandedNodes.has(entry.id),
        isOutOfSync: this._inh.isOutOfSync(entry.id),
        childCount: this._inh.getAllWidgetDescendants(entry.id).length,
      };
    };

    const actors = actorRoots.map(r => buildActorNode(r)).filter(Boolean) as TreeNode[];
    const widgets = widgetRoots.map(r => buildWidgetNode(r)).filter(Boolean) as TreeNode[];

    // Also add actors/widgets not registered in inheritance system (standalone, no parent)
    if (this._actorMgr) {
      for (const asset of this._actorMgr.assets) {
        if (!this._inh.getActorEntry(asset.id)) {
          actors.push({
            id: asset.id,
            name: asset.name,
            kind: 'actor',
            children: [],
            isExpanded: false,
            isOutOfSync: false,
            childCount: 0,
          });
        }
      }
    }
    if (this._widgetMgr) {
      for (const asset of this._widgetMgr.assets) {
        if (!this._inh.getWidgetEntry(asset.id)) {
          widgets.push({
            id: asset.id,
            name: asset.name,
            kind: 'widget',
            children: [],
            isExpanded: false,
            isOutOfSync: false,
            childCount: 0,
          });
        }
      }
    }

    return { actors, widgets };
  }

  private _filterTree(nodes: TreeNode[]): TreeNode[] {
    if (!this._searchQuery) return nodes;
    const q = this._searchQuery.toLowerCase();

    const filterRecursive = (node: TreeNode): TreeNode | null => {
      const nameMatch = node.name.toLowerCase().includes(q);
      const filteredChildren = node.children.map(c => filterRecursive(c)).filter(Boolean) as TreeNode[];
      if (nameMatch || filteredChildren.length > 0) {
        return { ...node, children: filteredChildren, isExpanded: true };
      }
      return null;
    };

    return nodes.map(n => filterRecursive(n)).filter(Boolean) as TreeNode[];
  }

  // ============================================================
  //  Render
  // ============================================================

  private _render(): void {
    const { actors, widgets } = this._buildTree();
    const filteredActors = this._filterTree(actors);
    const filteredWidgets = this._filterTree(widgets);

    this._el.innerHTML = '';

    // Toolbar
    const toolbar = document.createElement('div');
    toolbar.style.cssText = 'display:flex;gap:6px;padding:6px 8px;border-bottom:1px solid #333;align-items:center;flex-shrink:0;';

    // Filter dropdown
    const filterSelect = document.createElement('select');
    filterSelect.style.cssText = 'background:#2a2a3e;border:1px solid #555;border-radius:3px;color:#ccc;padding:3px 6px;font-size:11px;';
    for (const [val, label] of [['all', 'All'], ['actors', 'Actors'], ['widgets', 'Widgets']] as const) {
      const opt = document.createElement('option');
      opt.value = val;
      opt.textContent = label;
      if (this._filter === val) opt.selected = true;
      filterSelect.appendChild(opt);
    }
    filterSelect.addEventListener('change', () => {
      this._filter = filterSelect.value as any;
      this._render();
    });
    toolbar.appendChild(filterSelect);

    // Search input
    const searchInput = document.createElement('input');
    searchInput.type = 'text';
    searchInput.placeholder = '🔍 Search...';
    searchInput.value = this._searchQuery;
    searchInput.style.cssText = 'flex:1;background:#181825;border:1px solid #444;border-radius:3px;color:#ccc;padding:3px 8px;font-size:11px;outline:none;';
    searchInput.addEventListener('input', () => {
      this._searchQuery = searchInput.value;
      this._render();
    });
    toolbar.appendChild(searchInput);

    this._el.appendChild(toolbar);

    // Tree container
    const treeContainer = document.createElement('div');
    treeContainer.style.cssText = 'flex:1;overflow-y:auto;padding:4px 0;';

    // Actors section
    if (this._filter === 'all' || this._filter === 'actors') {
      const actorGroup = this._renderGroup('📁 Actors', '__actors__', filteredActors);
      treeContainer.appendChild(actorGroup);
    }

    // Widgets section
    if (this._filter === 'all' || this._filter === 'widgets') {
      const widgetGroup = this._renderGroup('📁 Widgets', '__widgets__', filteredWidgets);
      treeContainer.appendChild(widgetGroup);
    }

    this._el.appendChild(treeContainer);
  }

  private _renderGroup(label: string, groupId: string, nodes: TreeNode[]): HTMLElement {
    const wrapper = document.createElement('div');
    const isExpanded = this._expandedNodes.has(groupId);

    const header = document.createElement('div');
    header.style.cssText = 'padding:4px 8px;cursor:pointer;display:flex;align-items:center;gap:4px;color:#aaa;font-weight:600;user-select:none;';
    header.innerHTML = `<span style="font-size:10px;">${isExpanded ? '▼' : '▶'}</span> ${label} <span style="color:#666;font-weight:400;">(${nodes.length})</span>`;
    header.addEventListener('click', () => {
      if (isExpanded) this._expandedNodes.delete(groupId);
      else this._expandedNodes.add(groupId);
      this._render();
    });
    wrapper.appendChild(header);

    if (isExpanded) {
      for (const node of nodes) {
        wrapper.appendChild(this._renderTreeNode(node, 1));
      }
    }

    return wrapper;
  }

  private _renderTreeNode(node: TreeNode, depth: number): HTMLElement {
    const wrapper = document.createElement('div');

    const row = document.createElement('div');
    row.setAttribute('data-class-id', node.id);
    row.style.cssText = `padding:3px 8px 3px ${8 + depth * 16}px;cursor:pointer;display:flex;align-items:center;gap:4px;transition:background 0.1s;border-radius:2px;user-select:none;`;
    row.addEventListener('mouseenter', () => { row.style.background = '#2a2a3e'; });
    row.addEventListener('mouseleave', () => { row.style.background = ''; });

    // Expand arrow (only if has children)
    if (node.children.length > 0) {
      const arrow = document.createElement('span');
      arrow.style.cssText = 'font-size:10px;width:12px;text-align:center;color:#888;';
      arrow.textContent = node.isExpanded ? '▼' : '▶';
      arrow.addEventListener('click', (e) => {
        e.stopPropagation();
        if (node.isExpanded) this._expandedNodes.delete(node.id);
        else this._expandedNodes.add(node.id);
        this._render();
      });
      row.appendChild(arrow);
    } else {
      row.appendChild(Object.assign(document.createElement('span'), { style: 'width:12px;display:inline-block;' }));
    }

    // Icon
    const icon = document.createElement('span');
    icon.style.fontSize = '12px';
    icon.textContent = node.kind === 'actor' ? '📦' : '🖼';
    row.appendChild(icon);

    // Name
    const nameEl = document.createElement('span');
    nameEl.textContent = node.name;
    nameEl.style.color = '#e0e0e0';
    row.appendChild(nameEl);

    // Child count badge
    if (node.childCount > 0) {
      const badge = document.createElement('span');
      badge.style.cssText = 'font-size:10px;color:#888;margin-left:4px;';
      badge.textContent = `(${node.childCount})`;
      row.appendChild(badge);
    }

    // Out of sync indicator
    if (node.isOutOfSync) {
      const sync = document.createElement('span');
      sync.style.cssText = 'font-size:10px;color:#f87171;margin-left:4px;';
      sync.textContent = '⚠️';
      sync.title = 'Out of sync with parent';
      row.appendChild(sync);
    }

    // Click to open
    row.addEventListener('click', () => {
      this._onAction({ type: 'open', id: node.id, kind: node.kind });
    });

    // Right-click context menu
    row.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this._showContextMenu(e, node);
    });

    wrapper.appendChild(row);

    // Render children if expanded
    if (node.isExpanded) {
      for (const child of node.children) {
        wrapper.appendChild(this._renderTreeNode(child, depth + 1));
      }
    }

    return wrapper;
  }

  // ============================================================
  //  Context Menu
  // ============================================================

  private _showContextMenu(e: MouseEvent, node: TreeNode): void {
    this._closeContextMenu();

    const menu = document.createElement('div');
    menu.style.cssText = `position:fixed;left:${e.clientX}px;top:${e.clientY}px;background:#1e1e2e;border:1px solid #555;border-radius:6px;padding:4px 0;min-width:200px;z-index:99999;box-shadow:0 4px 16px rgba(0,0,0,0.4);`;

    this._addMenuItem(menu, '📝 Open in Editor', () => {
      this._onAction({ type: 'open', id: node.id, kind: node.kind });
    });

    this._addMenuItem(menu, '➕ Create Child Class', () => {
      this._onAction({ type: 'create-child', id: node.id, kind: node.kind });
    });

    if (node.childCount > 0) {
      this._addMenuItem(menu, `👶 Show Children (${node.childCount})`, () => {
        this._onAction({ type: 'show-children', id: node.id, kind: node.kind });
      });
    }

    const parentEntry = node.kind === 'actor'
      ? this._inh.getActorParent(node.id)
      : this._inh.getWidgetParent(node.id);
    if (parentEntry) {
      this._addMenuItem(menu, `⬆️ Show Parent (${parentEntry.name})`, () => {
        this._onAction({ type: 'show-parent', id: node.id, kind: node.kind });
      });
    }

    // Separator
    menu.appendChild(Object.assign(document.createElement('div'), {
      style: 'height:1px;background:#444;margin:4px 8px;',
    }));

    this._addMenuItem(menu, '🔄 Change Parent Class', () => {
      this._onAction({ type: 'change-parent', id: node.id, kind: node.kind });
    });

    this._addMenuItem(menu, '🔍 Find References', () => {
      this._onAction({ type: 'find-references', id: node.id, kind: node.kind });
    });

    document.body.appendChild(menu);
    this._contextMenu = menu;

    // Keep within viewport
    const rect = menu.getBoundingClientRect();
    if (rect.right > window.innerWidth) menu.style.left = `${window.innerWidth - rect.width - 8}px`;
    if (rect.bottom > window.innerHeight) menu.style.top = `${window.innerHeight - rect.height - 8}px`;
  }

  private _addMenuItem(menu: HTMLElement, label: string, action: () => void): void {
    const item = document.createElement('div');
    item.style.cssText = 'padding:5px 12px;cursor:pointer;color:#ccc;font-size:12px;transition:background 0.1s;';
    item.textContent = label;
    item.addEventListener('mouseenter', () => { item.style.background = '#2a2a3e'; });
    item.addEventListener('mouseleave', () => { item.style.background = ''; });
    item.addEventListener('click', (e) => {
      e.stopPropagation();
      this._closeContextMenu();
      action();
    });
    menu.appendChild(item);
  }

  private _closeContextMenu(): void {
    if (this._contextMenu) {
      this._contextMenu.remove();
      this._contextMenu = null;
    }
  }

  // ============================================================
  //  Styles
  // ============================================================

  private _injectStyles(): void {
    // (already injected globally by InheritanceDialogsUI, but add panel-specific ones)
  }

  dispose(): void {
    this._closeContextMenu();
    this._el.remove();
  }
}
