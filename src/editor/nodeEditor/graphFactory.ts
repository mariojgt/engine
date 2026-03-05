// ============================================================
//  Graph Editor Factory — creates and configures a Rete editor
//  instance with connection handling, context menus, comment
//  boxes, and undo/redo.
// ============================================================

import React from 'react';
import { NodeEditor, ClassicPreset } from 'rete';
import { AreaPlugin, AreaExtensions } from 'rete-area-plugin';
import { ConnectionPlugin, Presets as ConnectionPresets } from 'rete-connection-plugin';
import { ReactPlugin, Presets } from 'rete-react-plugin';
import { createRoot } from 'react-dom/client';
import type { VarType } from '../BlueprintData';
import { iconHTML, Icons, ICON_COLORS } from '../icons';
import * as N from '../nodes';
import type { ComponentNodeEntry } from '../nodes';
import {
  type Schemes,
  type GraphType,
  type CommentBox,
  UndoManager,
  commentUid,
  getStructMgr,
  getActorAssetMgr,
  getWidgetBPMgr,
  getDataTableMgr,
  getSaveGameMgr,
  getGameInstanceBPMgr,
  getProjectMgr,
} from './state';
import { resolveStructFields } from './codeGen';
import {
  serializeGraph,
  deserializeGraph,
  populateWidgetSelectors,
  getNodeTypeName,
  getNodeSerialData,
  createNodeFromData,
} from './serialization';
import {
  showContextMenu,
  showDragPinContextMenu,
  getNodeCategory,
  showKeySelectDialog,
} from './ui';
import { SoundLibrary } from '../SoundLibrary';
import { TextureLibrary } from '../TextureLibrary';
import { EventAssetManager } from '../EventAsset';
import { InputMappingAssetManager } from '../InputMappingAsset';
import type { ActorComponentData } from '../ActorAsset';


export async function createGraphEditor(
  container: HTMLElement,
  bp: import('../BlueprintData').BlueprintData,
  graphType: GraphType,
  currentFuncId: string | null,
  onChanged: () => void,
  onNodeDoubleClick?: (node: ClassicPreset.Node) => void,
  componentEntries?: ComponentNodeEntry[],
  widgetList?: Array<{ name: string; type: string }>,
) {
  const editor = new NodeEditor<Schemes>();
  const area = new AreaPlugin<Schemes, any>(container);
  const connection = new ConnectionPlugin<Schemes, any>();
  const reactPlugin = new ReactPlugin<Schemes, any>({ createRoot });

  reactPlugin.addPreset(Presets.classic.setup({
    customize: {
      node(context) {
        const node = context.payload;

        const category = getNodeCategory(node);
        const color = N.NODE_CATEGORY_COLORS[category] || '#546E7A';
        const icon = N.getCategoryIcon(category);
        return (props: any) => {
          return React.createElement('div', {
            className: 'fe-node',
            'data-category': category,
            style: { '--node-color': color } as any,
          },
            React.createElement('div', { className: 'fe-node-cat-strip' },
              React.createElement('span', { className: 'fe-node-cat-icon', dangerouslySetInnerHTML: { __html: icon } }),
              React.createElement('span', { className: 'fe-node-cat-label' }, category),
            ),
            React.createElement(Presets.classic.Node, props),
          );
        };
      },
      socket(data) {
        const sock = data.payload as ClassicPreset.Socket;
        const color = N.socketColor(sock);
        return (props: any) => {
          const isExec = sock.name === 'Exec';
          const isArray = sock.name === 'ActorArray';
          const isActorRef = sock.name === 'ActorRef';

          // Array sockets render as a diamond (rotated square) like UE
          if (isArray) {
            return React.createElement('div', {
              className: 'socket socket-array',
              title: 'Actor Array',
              'data-socket-type': sock.name,
              style: {
                background: color,
                width: 10,
                height: 10,
                borderRadius: '2px',
                border: '2px solid rgba(0,0,0,0.35)',
                display: 'inline-block',
                cursor: 'pointer',
                boxSizing: 'border-box' as const,
                transform: 'rotate(45deg)',
                transition: 'box-shadow 0.15s ease, transform 0.1s ease',
              },
            });
          }

          // Actor ref sockets render as a slightly larger circle with a ring
          if (isActorRef) {
            return React.createElement('div', {
              className: 'socket socket-actor-ref',
              title: 'Actor Reference',
              'data-socket-type': sock.name,
              style: {
                background: color,
                width: 12,
                height: 12,
                borderRadius: '50%',
                border: '2px solid rgba(255,255,255,0.4)',
                display: 'inline-block',
                cursor: 'pointer',
                boxSizing: 'border-box' as const,
                transition: 'box-shadow 0.15s ease, transform 0.1s ease',
              },
            });
          }

          return React.createElement('div', {
            className: `socket${isExec ? ' socket-exec' : ''}`,
            title: sock.name,
            'data-socket-type': sock.name,
            style: {
              background: color,
              width: isExec ? 14 : 12,
              height: isExec ? 14 : 12,
              borderRadius: isExec ? '2px' : '50%',
              border: `2px solid ${isExec ? '#666' : 'rgba(0,0,0,0.35)'}`,
              display: 'inline-block',
              cursor: 'pointer',
              boxSizing: 'border-box' as const,
              transition: 'box-shadow 0.15s ease, transform 0.1s ease',
            },
          });
        };
      },
      control(data) {
        if (data.payload instanceof N.ColorPickerControl) {
          const ctrl = data.payload as N.ColorPickerControl;
          return (props: any) => {
            const [val, setVal] = React.useState(ctrl.value);
            return React.createElement('input', {
              type: 'color',
              value: val,
              onChange: (e: any) => { const v = e.target.value; ctrl.setValue(v); setVal(v); },
              onPointerDown: (e: any) => e.stopPropagation(),
              style: {
                width: '100%',
                height: 28,
                padding: 2,
                background: '#1e1e2e',
                border: '1px solid #3a3a5c',
                borderRadius: 4,
                cursor: 'pointer',
                boxSizing: 'border-box' as const,
              },
            });
          };
        }
        if (data.payload instanceof N.BoolSelectControl) {
          const ctrl = data.payload as N.BoolSelectControl;
          return (props: any) => {
            const [val, setVal] = React.useState(ctrl.value);
            return React.createElement('select', {
              value: val,
              onChange: (e: any) => { const v = Number(e.target.value); ctrl.setValue(v); setVal(v); },
              onPointerDown: (e: any) => e.stopPropagation(),
              style: {
                width: '100%',
                padding: '4px 6px',
                background: '#1e1e2e',
                color: val ? '#4caf50' : '#e74c3c',
                border: '1px solid #3a3a5c',
                borderRadius: 4,
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer',
                outline: 'none',
              },
            },
              React.createElement('option', { value: 1, style: { color: '#4caf50' } }, 'True'),
              React.createElement('option', { value: 0, style: { color: '#e74c3c' } }, 'False'),
            );
          };
        }
        if (data.payload instanceof N.MovementModeSelectControl) {
          const ctrl = data.payload as N.MovementModeSelectControl;
          return (props: any) => {
            const [val, setVal] = React.useState(ctrl.value);
            return React.createElement('select', {
              value: val,
              onChange: (e: any) => { ctrl.setValue(e.target.value); setVal(e.target.value); },
              onPointerDown: (e: any) => e.stopPropagation(),
              style: {
                width: '100%',
                padding: '4px 6px',
                background: '#1e1e2e',
                color: '#64b5f6',
                border: '1px solid #3a3a5c',
                borderRadius: 4,
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer',
                outline: 'none',
              },
            },
              ...N.MOVEMENT_MODES.map(m =>
                React.createElement('option', { key: m, value: m }, m.charAt(0).toUpperCase() + m.slice(1)),
              ),
            );
          };
        }
        if (data.payload instanceof N.SceneSelectControl) {
          const ctrl = data.payload as N.SceneSelectControl;
          return (_props: any) => {
            const [val, setVal] = React.useState(ctrl.value);
            const [scenes, setScenes] = React.useState<string[]>([]);

            React.useEffect(() => {
              const provider = N.getSceneListProvider();
              if (provider) {
                provider().then(list => setScenes(list));
              }
            }, []);

            return React.createElement('select', {
              value: val,
              onChange: (e: any) => { ctrl.setValue(e.target.value); setVal(e.target.value); },
              onPointerDown: (e: any) => e.stopPropagation(),
              style: {
                width: '100%',
                padding: '4px 6px',
                background: '#1e1e2e',
                color: '#64b5f6',
                border: '1px solid #3a3a5c',
                borderRadius: 4,
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer',
                outline: 'none',
                minWidth: 120,
              },
            },
              React.createElement('option', { value: '', disabled: true }, '-- Select Scene --'),
              ...scenes.map(s =>
                React.createElement('option', { key: s, value: s }, s),
              ),
            );
          };
        }
        if (data.payload instanceof N.ActorClassSelectControl) {
          const ctrl = data.payload as N.ActorClassSelectControl;
          return (_props: any) => {
            const [search, setSearch] = React.useState('');
            const [open, setOpen] = React.useState(false);
            const [selected, setSelected] = React.useState(ctrl.displayName || '(none)');
            const containerRef = React.useRef<HTMLDivElement>(null);

            const actors: { id: string; name: string }[] = getActorAssetMgr()
              ? getActorAssetMgr()!.assets.map((a: any) => ({ id: a.id, name: a.name }))
              : [];
            const filtered = search
              ? actors.filter(a => a.name.toLowerCase().includes(search.toLowerCase()))
              : actors;

            React.useEffect(() => {
              if (!open) return;
              const handler = (e: MouseEvent) => {
                if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
                  setOpen(false);
                  setSearch('');
                }
              };
              document.addEventListener('mousedown', handler, true);
              return () => document.removeEventListener('mousedown', handler, true);
            }, [open]);

            const onSelectActor = (id: string, name: string) => {
              ctrl.setValue(id, name);
              setSelected(name || '(none)');
              setOpen(false);
              setSearch('');
              // Populate Expose on Spawn input pins automatically
              const parentNode = (ctrl as any).__parentNode as N.SpawnActorFromClassNode | undefined;
              if (parentNode) {
                const asset = getActorAssetMgr()?.getAsset(id);
                const expVars = ((asset?.blueprintData?.variables ?? []) as any[])
                  .filter((v: any) => v.exposeOnSpawn)
                  .map((v: any) => ({ name: v.name, type: v.type, varId: v.id }));
                parentNode.setExposedVars(expVars);
                area.update('node', parentNode.id);
              }
              onChanged();
            };

            return React.createElement('div', {
              ref: containerRef,
              style: { position: 'relative', width: '100%', minWidth: 140 },
              onPointerDown: (e: any) => e.stopPropagation(),
            },
              React.createElement('div', {
                onClick: () => setOpen(!open),
                style: {
                  width: '100%',
                  padding: '4px 6px',
                  background: '#1e1e2e',
                  color: selected === '(none)' ? '#888' : '#ff9800',
                  border: open ? '1px solid #ff9800' : '1px solid #3a3a5c',
                  borderRadius: open ? '4px 4px 0 0' : 4,
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: 'pointer',
                  boxSizing: 'border-box' as const,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  userSelect: 'none' as const,
                },
              },
                React.createElement('span', {
                  style: { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const, flex: 1 },
                }, selected),
                React.createElement('span', { style: { marginLeft: 4, fontSize: 10, color: '#888' }, dangerouslySetInnerHTML: { __html: open ? iconHTML(Icons.ChevronUp, 'xs') : iconHTML(Icons.ChevronDown, 'xs') } }),
              ),
              open && React.createElement('div', {
                style: {
                  position: 'absolute',
                  top: '100%',
                  left: 0,
                  right: 0,
                  maxHeight: 180,
                  overflowY: 'auto' as const,
                  background: '#1a1a2e',
                  border: '1px solid #ff9800',
                  borderRadius: '0 0 4px 4px',
                  zIndex: 9999,
                },
              },
                React.createElement('input', {
                  type: 'text',
                  placeholder: 'Search actors...',
                  value: search,
                  autoFocus: true,
                  onChange: (e: any) => setSearch(e.target.value),
                  onPointerDown: (e: any) => e.stopPropagation(),
                  onKeyDown: (e: any) => e.stopPropagation(),
                  style: {
                    width: '100%',
                    padding: '5px 8px',
                    background: '#141422',
                    color: '#e0e0e0',
                    border: 'none',
                    borderBottom: '1px solid #333',
                    fontSize: 11,
                    outline: 'none',
                    boxSizing: 'border-box' as const,
                  },
                }),
                ...filtered.map(a =>
                  React.createElement('div', {
                    key: a.id,
                    onClick: () => onSelectActor(a.id, a.name),
                    style: {
                      padding: '5px 8px',
                      fontSize: 11,
                      color: a.id === ctrl.value ? '#ff9800' : '#e0e0e0',
                      fontWeight: a.id === ctrl.value ? 700 : 400,
                      cursor: 'pointer',
                    },
                    onMouseEnter: (e: any) => { e.currentTarget.style.background = '#2a2a4a'; },
                    onMouseLeave: (e: any) => { e.currentTarget.style.background = 'transparent'; },
                  },
                    React.createElement('span', { style: { marginRight: 4, fontSize: 9, color: '#ff9800' }, dangerouslySetInnerHTML: { __html: iconHTML(Icons.Diamond, 'xs', '#ff9800') } }),
                    a.name,
                  ),
                ),
                filtered.length === 0 && actors.length > 0 &&
                  React.createElement('div', { style: { padding: '8px', fontSize: 11, color: '#666', textAlign: 'center' as const } }, 'No matching actors'),
                actors.length === 0 &&
                  React.createElement('div', { style: { padding: '8px', fontSize: 11, color: '#666', textAlign: 'center' as const } }, 'No actor assets yet'),
              ),
            );
          };
        }
        if (data.payload instanceof N.RefreshNodesControl) {
          const ctrl = data.payload as N.RefreshNodesControl;
          return (_props: any) => React.createElement('button', {
            onPointerDown: (e: any) => e.stopPropagation(),
            onClick: () => {
              const parentNode = (ctrl as any).__parentNode as N.SpawnActorFromClassNode | undefined;
              if (parentNode && parentNode.targetClassId && getActorAssetMgr()) {
                const asset = getActorAssetMgr()!.getAsset(parentNode.targetClassId);
                const expVars = ((asset?.blueprintData?.variables ?? []) as any[])
                  .filter((v: any) => v.exposeOnSpawn)
                  .map((v: any) => ({ name: v.name, type: v.type, varId: v.id }));
                parentNode.setExposedVars(expVars);
                area.update('node', parentNode.id);
                onChanged();
              }
            },
            style: {
              width: '100%',
              padding: '3px 6px',
              background: '#1a2a1a',
              color: '#66bb6a',
              border: '1px solid #2e7d32',
              borderRadius: 4,
              fontSize: 11,
              cursor: 'pointer',
              textAlign: 'center' as const,
              marginTop: 2,
            },
          }, '\u21bb Refresh Exposed Pins');
        }
        if (data.payload instanceof N.GameInstanceVarNameControl) {
          const ctrl = data.payload as N.GameInstanceVarNameControl;
          return (_props: any) => {
            const [val, setVal] = React.useState(ctrl.value);
            return React.createElement('input', {
              type: 'text',
              value: val,
              placeholder: 'Variable Name',
              onChange: (e: any) => { ctrl.setValue(e.target.value); setVal(e.target.value); },
              onPointerDown: (e: any) => e.stopPropagation(),
              style: {
                width: '100%',
                padding: '4px 6px',
                background: '#1e1e2e',
                color: '#81c784',
                border: '1px solid #3a3a5c',
                borderRadius: 4,
                fontSize: 12,
                fontWeight: 600,
                outline: 'none',
                minWidth: 100,
              },
            });
          };
        }
        if (data.payload instanceof N.SaveGameSelectControl) {
          const ctrl = data.payload as N.SaveGameSelectControl;
          return (_props: any) => {
            const [search, setSearch] = React.useState('');
            const [open, setOpen] = React.useState(false);
            const [selected, setSelected] = React.useState(ctrl.displayName || '(none)');
            const containerRef = React.useRef<HTMLDivElement>(null);

            // Gather save game classes from the manager
            const saveGames: { id: string; name: string }[] = [];
            if (getSaveGameMgr()) {
              for (const asset of getSaveGameMgr().assets) {
                saveGames.push({ id: asset.id, name: asset.name });
              }
            }
            const filtered = search
              ? saveGames.filter(sg => sg.name.toLowerCase().includes(search.toLowerCase()))
              : saveGames;

            // Close on outside click
            React.useEffect(() => {
              if (!open) return;
              const handler = (e: MouseEvent) => {
                if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
                  setOpen(false);
                  setSearch('');
                }
              };
              document.addEventListener('mousedown', handler, true);
              return () => document.removeEventListener('mousedown', handler, true);
            }, [open]);

            const dropdownStyle: any = {
              position: 'absolute',
              top: '100%',
              left: 0,
              right: 0,
              maxHeight: 160,
              overflowY: 'auto',
              background: '#1a1a2e',
              border: '1px solid #4a9eff',
              borderRadius: '0 0 4px 4px',
              zIndex: 9999,
            };

            return React.createElement('div', {
              ref: containerRef,
              style: { position: 'relative', width: '100%', minWidth: 140 },
              onPointerDown: (e: any) => e.stopPropagation(),
            },
              // Button showing current selection
              React.createElement('div', {
                onClick: () => setOpen(!open),
                style: {
                  width: '100%',
                  padding: '4px 6px',
                  background: '#1e1e2e',
                  color: selected === '(none)' ? '#888' : '#e0e0e0',
                  border: open ? '1px solid #4a9eff' : '1px solid #3a3a5c',
                  borderRadius: open ? '4px 4px 0 0' : 4,
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: 'pointer',
                  boxSizing: 'border-box' as const,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  userSelect: 'none' as const,
                },
              },
                React.createElement('span', {
                  style: { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const, flex: 1 },
                }, selected),
                React.createElement('span', { style: { marginLeft: 4, fontSize: 10, color: '#888' }, dangerouslySetInnerHTML: { __html: open ? iconHTML(Icons.ChevronUp, 'xs') : iconHTML(Icons.ChevronDown, 'xs') } }),
              ),
              // Dropdown panel
              open && React.createElement('div', { style: dropdownStyle },
                // Search input
                React.createElement('input', {
                  type: 'text',
                  placeholder: 'Search save games...',
                  value: search,
                  autoFocus: true,
                  onChange: (e: any) => setSearch(e.target.value),
                  onPointerDown: (e: any) => e.stopPropagation(),
                  onKeyDown: (e: any) => e.stopPropagation(),
                  style: {
                    width: '100%',
                    padding: '5px 8px',
                    background: '#141422',
                    color: '#e0e0e0',
                    border: 'none',
                    borderBottom: '1px solid #333',
                    fontSize: 11,
                    outline: 'none',
                    boxSizing: 'border-box' as const,
                  },
                }),
                // Option: (none)
                React.createElement('div', {
                  onClick: () => {
                    ctrl.setValue('', '(none)');
                    setSelected('(none)');
                    setOpen(false);
                    setSearch('');
                    // Sync node fields
                    const parentNode = (ctrl as any)._parentNode;
                    if (parentNode) {
                      parentNode.saveGameId = '';
                      parentNode.saveGameName = '(none)';
                    }
                  },
                  style: {
                    padding: '5px 8px',
                    fontSize: 11,
                    color: '#888',
                    fontStyle: 'italic' as const,
                    cursor: 'pointer',
                    borderBottom: '1px solid #222',
                  },
                  onMouseEnter: (e: any) => { e.currentTarget.style.background = '#2a2a4a'; },
                  onMouseLeave: (e: any) => { e.currentTarget.style.background = 'transparent'; },
                }, '(none)'),
                // SaveGame options
                ...filtered.map(sg =>
                  React.createElement('div', {
                    key: sg.id,
                    onClick: () => {
                      ctrl.setValue(sg.id, sg.name);
                      setSelected(sg.name);
                      setOpen(false);
                      setSearch('');
                      // Sync node fields
                      const parentNode = (ctrl as any)._parentNode;
                      if (parentNode) {
                        parentNode.saveGameId = sg.id;
                        parentNode.saveGameName = sg.name;
                      }
                    },
                    style: {
                      padding: '5px 8px',
                      fontSize: 11,
                      color: sg.id === ctrl.value ? '#4a9eff' : '#e0e0e0',
                      fontWeight: sg.id === ctrl.value ? 700 : 400,
                      cursor: 'pointer',
                    },
                    onMouseEnter: (e: any) => { e.currentTarget.style.background = '#2a2a4a'; },
                    onMouseLeave: (e: any) => { e.currentTarget.style.background = 'transparent'; },
                  },
                    React.createElement('span', { style: { marginRight: 6, fontSize: 10 } }, ''),
                    sg.name,
                  ),
                ),
                filtered.length === 0 && saveGames.length > 0 &&
                  React.createElement('div', { style: { padding: '8px', fontSize: 11, color: '#666', textAlign: 'center' as const } }, 'No matching save games'),
                saveGames.length === 0 &&
                  React.createElement('div', { style: { padding: '8px', fontSize: 11, color: '#666', textAlign: 'center' as const } }, 'No save game classes yet'),
              ),
            );
          };
        }

        if (data.payload instanceof N.DataTableSelectControl) {
          const ctrl = data.payload as N.DataTableSelectControl;
          return (_props: any) => {
            const [search, setSearch] = React.useState('');
            const [open, setOpen] = React.useState(false);
            const [selected, setSelected] = React.useState(ctrl.dataTableName || '(none)');
            const containerRef = React.useRef<HTMLDivElement>(null);

            const tables: { id: string; name: string; structId: string; structName: string }[] = getDataTableMgr()
              ? getDataTableMgr()!.tables.map(t => ({ id: t.id, name: t.name, structId: t.structId, structName: t.structName }))
              : [];
            const filtered = search
              ? tables.filter(t => t.name.toLowerCase().includes(search.toLowerCase()))
              : tables;

            React.useEffect(() => {
              if (!open) return;
              const handler = (e: MouseEvent) => {
                if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
                  setOpen(false); setSearch('');
                }
              };
              document.addEventListener('mousedown', handler, true);
              return () => document.removeEventListener('mousedown', handler, true);
            }, [open]);

            return React.createElement('div', {
              ref: containerRef,
              style: { position: 'relative', width: '100%', minWidth: 140 },
              onPointerDown: (e: any) => e.stopPropagation(),
            },
              React.createElement('div', {
                onClick: () => setOpen(!open),
                style: {
                  width: '100%', padding: '4px 6px', background: '#1e1e2e',
                  color: selected === '(none)' ? '#888' : '#14b8a6',
                  border: open ? '1px solid #14b8a6' : '1px solid #3a3a5c',
                  borderRadius: open ? '4px 4px 0 0' : 4,
                  fontSize: 12, fontWeight: 600, cursor: 'pointer',
                  boxSizing: 'border-box' as const, display: 'flex',
                  alignItems: 'center', justifyContent: 'space-between', userSelect: 'none' as const,
                },
              },
                React.createElement('span', { style: { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const, flex: 1 } }, selected),
                React.createElement('span', { style: { marginLeft: 4, fontSize: 10, color: '#888' }, dangerouslySetInnerHTML: { __html: open ? iconHTML(Icons.ChevronUp, 'xs') : iconHTML(Icons.ChevronDown, 'xs') } }),
              ),
              open && React.createElement('div', {
                style: { position: 'absolute', top: '100%', left: 0, right: 0, maxHeight: 160, overflowY: 'auto' as const, background: '#1a1a2e', border: '1px solid #14b8a6', borderRadius: '0 0 4px 4px', zIndex: 9999 },
              },
                React.createElement('input', {
                  type: 'text', placeholder: 'Search data tables...', value: search, autoFocus: true,
                  onChange: (e: any) => setSearch(e.target.value),
                  onPointerDown: (e: any) => e.stopPropagation(),
                  onKeyDown: (e: any) => e.stopPropagation(),
                  style: { width: '100%', padding: '5px 8px', background: '#141422', color: '#e0e0e0', border: 'none', borderBottom: '1px solid #333', fontSize: 11, outline: 'none', boxSizing: 'border-box' as const },
                }),
                React.createElement('div', {
                  onClick: () => { ctrl.setValue('', '(none)', '', ''); setSelected('(none)'); setOpen(false); setSearch(''); const pn = (ctrl as any)._parentNode; if (pn) { pn.dataTableId = ''; pn.dataTableName = '(none)'; pn.structId = ''; pn.structName = ''; if (typeof pn.updateFields === 'function') { pn.updateFields([], '', ''); } area.update('node', pn.id); } onChanged(); },
                  style: { padding: '5px 8px', fontSize: 11, color: '#888', fontStyle: 'italic' as const, cursor: 'pointer', borderBottom: '1px solid #222' },
                  onMouseEnter: (e: any) => { e.currentTarget.style.background = '#2a2a4a'; },
                  onMouseLeave: (e: any) => { e.currentTarget.style.background = 'transparent'; },
                }, '(none)'),
                ...filtered.map(t =>
                  React.createElement('div', {
                    key: t.id,
                    onClick: () => {
                      ctrl.setValue(t.id, t.name, t.structId, t.structName);
                      setSelected(t.name); setOpen(false); setSearch('');
                      const pn = (ctrl as any)._parentNode;
                      if (pn) {
                        pn.dataTableId = t.id; pn.dataTableName = t.name; pn.structId = t.structId; pn.structName = t.structName;
                        // Dynamically expose per-field output pins when struct is known
                        if (t.structId && typeof pn.updateFields === 'function') {
                          const structAsset = getStructMgr() ? getStructMgr()!.getStructure(t.structId) : null;
                          const fields = structAsset
                            ? structAsset.fields.map((f: any) => ({ name: f.name, type: f.type }))
                            : [];
                          pn.updateFields(fields, t.structId, t.structName);
                        }
                        area.update('node', pn.id);
                        onChanged();
                      }
                    },
                    style: { padding: '5px 8px', fontSize: 11, color: t.id === ctrl.dataTableId ? '#14b8a6' : '#e0e0e0', fontWeight: t.id === ctrl.dataTableId ? 700 : 400, cursor: 'pointer' },
                    onMouseEnter: (e: any) => { e.currentTarget.style.background = '#2a2a4a'; },
                    onMouseLeave: (e: any) => { e.currentTarget.style.background = 'transparent'; },
                  },
                    React.createElement('span', { style: { marginRight: 4, fontSize: 9, color: '#14b8a6' }, dangerouslySetInnerHTML: { __html: iconHTML(Icons.Table2, 'xs', '#14b8a6') } }),
                    t.name,
                    React.createElement('span', { style: { marginLeft: 6, fontSize: 9, color: '#666' } }, t.structName ? `[${t.structName}]` : ''),
                  ),
                ),
                filtered.length === 0 && tables.length > 0 && React.createElement('div', { style: { padding: '8px', fontSize: 11, color: '#666', textAlign: 'center' as const } }, 'No matching tables'),
                tables.length === 0 && React.createElement('div', { style: { padding: '8px', fontSize: 11, color: '#666', textAlign: 'center' as const } }, 'No data tables yet'),
              ),
            );
          };
        }

        // ── N.DataTableFieldSelectControl renderer ─────────────────────
        // Shown on GetDataTableFieldNode — picks which struct field to output.
        // The parent node's N.DataTableSelectControl (dtCtrl) manages the table;
        // this picker reads its structId to pull the available fields.
        if (data.payload instanceof N.DataTableFieldSelectControl) {
          const ctrl = data.payload as N.DataTableFieldSelectControl;
          return (_props: any) => {
            const [open, setOpen] = React.useState(false);
            const [selected, setSelected] = React.useState(ctrl.fieldName || '(pick field)');
            const containerRef = React.useRef<HTMLDivElement>(null);

            // Read fields from parent node's structId (which is kept up-to-date by dtCtrl)
            const pn = (ctrl as any)._parentNode as N.GetDataTableFieldNode | undefined;
            const structId = pn?.structId ?? '';
            const structAsset = structId && getStructMgr() ? getStructMgr()!.getStructure(structId) : null;
            const fields: { name: string; type: string }[] = structAsset
              ? structAsset.fields.map((f: any) => ({ name: f.name, type: f.type }))
              : [];

            // Close on outside click
            React.useEffect(() => {
              if (!open) return;
              const handler = (e: MouseEvent) => {
                if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
                  setOpen(false);
                }
              };
              document.addEventListener('mousedown', handler, true);
              return () => document.removeEventListener('mousedown', handler, true);
            }, [open]);

            const typeColor = (t: string) => {
              if (t === 'Float') return '#34d399';
              if (t === 'Boolean') return '#f87171';
              if (t === 'String') return '#fbbf24';
              if (t === 'Vector3') return '#60a5fa';
              if (t === 'Color') return '#a78bfa';
              if (t.startsWith('Enum:')) return '#fb923c';
              if (t.startsWith('Struct:')) return '#e879f9';
              return '#94a3b8';
            };

            return React.createElement('div', {
              ref: containerRef,
              style: { position: 'relative', width: '100%', minWidth: 140 },
              onPointerDown: (e: any) => e.stopPropagation(),
            },
              // Label row
              React.createElement('div', { style: { fontSize: 9, color: '#64748b', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase' as const, marginBottom: 2, paddingLeft: 1 } }, 'Field'),
              // Picker button
              React.createElement('div', {
                onClick: () => setOpen(!open),
                style: {
                  width: '100%', padding: '4px 6px', background: '#1e1e2e',
                  color: selected === '(pick field)' ? '#888' : '#a78bfa',
                  border: open ? '1px solid #a78bfa' : '1px solid #3a3a5c',
                  borderRadius: open ? '4px 4px 0 0' : 4,
                  fontSize: 12, fontWeight: 600, cursor: fields.length ? 'pointer' : 'not-allowed',
                  boxSizing: 'border-box' as const, display: 'flex',
                  alignItems: 'center', justifyContent: 'space-between', userSelect: 'none' as const,
                  opacity: fields.length ? 1 : 0.5,
                },
              },
                React.createElement('span', { style: { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const, flex: 1 } }, selected),
                ctrl.fieldType && React.createElement('span', { style: { marginLeft: 4, fontSize: 9, color: typeColor(ctrl.fieldType), fontWeight: 700, flexShrink: 0 } }, ctrl.fieldType.startsWith('Enum:') ? 'Enum' : ctrl.fieldType.startsWith('Struct:') ? 'Struct' : ctrl.fieldType),
                React.createElement('span', { style: { marginLeft: 4, fontSize: 10, color: '#888', flexShrink: 0 }, dangerouslySetInnerHTML: { __html: open ? iconHTML(Icons.ChevronUp, 'xs') : iconHTML(Icons.ChevronDown, 'xs') } }),
              ),
              // Dropdown
              open && fields.length > 0 && React.createElement('div', {
                style: { position: 'absolute', top: '100%', left: 0, right: 0, maxHeight: 200, overflowY: 'auto' as const, background: '#1a1a2e', border: '1px solid #a78bfa', borderRadius: '0 0 4px 4px', zIndex: 9999 },
              },
                React.createElement('div', {
                  onClick: () => {
                    ctrl.setValue('', '');
                    setSelected('(pick field)');
                    setOpen(false);
                    if (pn) { pn.setField('', ''); area.update('node', pn.id); }
                    onChanged();
                  },
                  style: { padding: '5px 8px', fontSize: 11, color: '#888', fontStyle: 'italic' as const, cursor: 'pointer', borderBottom: '1px solid #222' },
                  onMouseEnter: (e: any) => { e.currentTarget.style.background = '#2a2a4a'; },
                  onMouseLeave: (e: any) => { e.currentTarget.style.background = 'transparent'; },
                }, '(none)'),
                ...fields.map(f =>
                  React.createElement('div', {
                    key: f.name,
                    onClick: () => {
                      ctrl.setValue(f.name, f.type as any);
                      setSelected(f.name);
                      setOpen(false);
                      if (pn) { pn.setField(f.name, f.type as any); area.update('node', pn.id); }
                      onChanged();
                    },
                    style: { padding: '5px 8px', fontSize: 11, color: f.name === ctrl.fieldName ? '#a78bfa' : '#e0e0e0', fontWeight: f.name === ctrl.fieldName ? 700 : 400, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 },
                    onMouseEnter: (e: any) => { e.currentTarget.style.background = '#2a2a4a'; },
                    onMouseLeave: (e: any) => { e.currentTarget.style.background = 'transparent'; },
                  },
                    React.createElement('span', {}, f.name),
                    React.createElement('span', { style: { fontSize: 9, color: typeColor(f.type), fontWeight: 700 } }, f.type.startsWith('Enum:') ? 'Enum' : f.type.startsWith('Struct:') ? 'Struct' : f.type),
                  ),
                ),
              ),
              open && fields.length === 0 && React.createElement('div', { style: { position: 'absolute', top: '100%', left: 0, right: 0, background: '#1a1a2e', border: '1px solid #a78bfa', borderRadius: '0 0 4px 4px', zIndex: 9999, padding: '8px', fontSize: 11, color: '#666', textAlign: 'center' as const } }, structId ? 'No fields in struct' : 'Select a table first'),
            );
          };
        }

        if (data.payload instanceof N.WidgetBPSelectControl) {
          const ctrl = data.payload as N.WidgetBPSelectControl;
          return (_props: any) => {
            const [search, setSearch] = React.useState('');
            const [open, setOpen] = React.useState(false);
            const [selected, setSelected] = React.useState(ctrl.displayName || '(none)');
            const containerRef = React.useRef<HTMLDivElement>(null);

            // Gather widget blueprints from the manager
            const widgets: { id: string; name: string }[] = [];
            if (getWidgetBPMgr()) {
              for (const asset of getWidgetBPMgr()!.assets) {
                widgets.push({ id: asset.id, name: asset.name });
              }
            }
            const filtered = search
              ? widgets.filter(w => w.name.toLowerCase().includes(search.toLowerCase()))
              : widgets;

            // Close on outside click
            React.useEffect(() => {
              if (!open) return;
              const handler = (e: MouseEvent) => {
                if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
                  setOpen(false);
                  setSearch('');
                }
              };
              document.addEventListener('mousedown', handler, true);
              return () => document.removeEventListener('mousedown', handler, true);
            }, [open]);

            const dropdownStyle: any = {
              position: 'absolute',
              top: '100%',
              left: 0,
              right: 0,
              maxHeight: 160,
              overflowY: 'auto',
              background: '#1a1a2e',
              border: '1px solid #4a9eff',
              borderRadius: '0 0 4px 4px',
              zIndex: 9999,
            };

            return React.createElement('div', {
              ref: containerRef,
              style: { position: 'relative', width: '100%', minWidth: 140 },
              onPointerDown: (e: any) => e.stopPropagation(),
            },
              // Button showing current selection
              React.createElement('div', {
                onClick: () => setOpen(!open),
                style: {
                  width: '100%',
                  padding: '4px 6px',
                  background: '#1e1e2e',
                  color: selected === '(none)' ? '#888' : '#e0e0e0',
                  border: open ? '1px solid #4a9eff' : '1px solid #3a3a5c',
                  borderRadius: open ? '4px 4px 0 0' : 4,
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: 'pointer',
                  boxSizing: 'border-box' as const,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  userSelect: 'none' as const,
                },
              },
                React.createElement('span', {
                  style: { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const, flex: 1 },
                }, selected),
                React.createElement('span', { style: { marginLeft: 4, fontSize: 10, color: '#888' }, dangerouslySetInnerHTML: { __html: open ? iconHTML(Icons.ChevronUp, 'xs') : iconHTML(Icons.ChevronDown, 'xs') } }),
              ),
              // Dropdown panel
              open && React.createElement('div', { style: dropdownStyle },
                // Search input
                React.createElement('input', {
                  type: 'text',
                  placeholder: 'Search widgets...',
                  value: search,
                  autoFocus: true,
                  onChange: (e: any) => setSearch(e.target.value),
                  onPointerDown: (e: any) => e.stopPropagation(),
                  onKeyDown: (e: any) => e.stopPropagation(),
                  style: {
                    width: '100%',
                    padding: '5px 8px',
                    background: '#141422',
                    color: '#e0e0e0',
                    border: 'none',
                    borderBottom: '1px solid #333',
                    fontSize: 11,
                    outline: 'none',
                    boxSizing: 'border-box' as const,
                  },
                }),
                // Option: (none)
                React.createElement('div', {
                  onClick: () => {
                    ctrl.setValue('', '(none)');
                    setSelected('(none)');
                    setOpen(false);
                    setSearch('');
                    // Sync node fields and clear dropdowns
                    const parentNode = (ctrl as any)._parentNode;
                    if (parentNode) {
                      parentNode.widgetBPId = '';
                      parentNode.widgetBPName = '(none)';
                      // Clear variable/function/event selectors
                      if (parentNode.variableControl) {
                        parentNode.variableControl.setAvailableVariables([]);
                      }
                      if (parentNode.functionControl) {
                        parentNode.functionControl.setAvailableFunctions([]);
                      }
                      if (parentNode.eventControl) {
                        parentNode.eventControl.setAvailableEvents([]);
                      }
                    }
                  },
                  style: {
                    padding: '5px 8px',
                    fontSize: 11,
                    color: '#888',
                    fontStyle: 'italic' as const,
                    cursor: 'pointer',
                    borderBottom: '1px solid #222',
                  },
                  onMouseEnter: (e: any) => { e.currentTarget.style.background = '#2a2a4a'; },
                  onMouseLeave: (e: any) => { e.currentTarget.style.background = 'transparent'; },
                }, '(none)'),
                // Widget options
                ...filtered.map(w =>
                  React.createElement('div', {
                    key: w.id,
                    onClick: () => {
                      ctrl.setValue(w.id, w.name);
                      setSelected(w.name);
                      setOpen(false);
                      setSearch('');
                      // Sync node fields
                      const parentNode = (ctrl as any)._parentNode;
                      if (parentNode) {
                        parentNode.widgetBPId = w.id;
                        parentNode.widgetBPName = w.name;

                        // Populate variable/function selectors from widget blueprint data
                        if (getWidgetBPMgr()) {
                          const widgetBP = getWidgetBPMgr()!.getAsset(w.id);
                          if (widgetBP) {
                            // Populate variables for GetWidgetVariableNode and SetWidgetVariableNode
                            if (parentNode.variableControl) {
                              const variables = (widgetBP.blueprintData.variables || []).map((v: any) => ({
                                name: v.name,
                                type: v.type,
                              }));
                              parentNode.variableControl.setAvailableVariables(variables);
                              console.log(`[NodeEditor] Populated ${variables.length} variables for widget "${w.name}"`);
                            }

                            // Populate functions for CallWidgetFunctionNode
                            if (parentNode.functionControl) {
                              const functions = (widgetBP.blueprintData.functions || []).map((f: any) => ({
                                name: f.name,
                                inputs: f.inputs || [],
                                outputs: f.outputs || [],
                              }));
                              parentNode.functionControl.setAvailableFunctions(functions);
                              console.log(`[NodeEditor] Populated ${functions.length} functions for widget "${w.name}"`);
                            }

                            // Populate events for CallWidgetEventNode
                            if (parentNode.eventControl) {
                              const events = (widgetBP.blueprintData.customEvents || []).map((e: any) => ({
                                name: e.name,
                                params: e.params || [],
                              }));
                              parentNode.eventControl.setAvailableEvents(events);
                              console.log(`[NodeEditor] Populated ${events.length} events for widget "${w.name}"`);
                            }
                          }
                        }
                      }
                    },
                    style: {
                      padding: '5px 8px',
                      fontSize: 11,
                      color: w.id === ctrl.value ? '#4a9eff' : '#e0e0e0',
                      fontWeight: w.id === ctrl.value ? 700 : 400,
                      cursor: 'pointer',
                    },
                    onMouseEnter: (e: any) => { e.currentTarget.style.background = '#2a2a4a'; },
                    onMouseLeave: (e: any) => { e.currentTarget.style.background = 'transparent'; },
                  },
                    React.createElement('span', { style: { marginRight: 6, fontSize: 10 } }, ''),
                    w.name,
                  ),
                ),
                filtered.length === 0 && widgets.length > 0 &&
                  React.createElement('div', { style: { padding: '8px', fontSize: 11, color: '#666', textAlign: 'center' as const } }, 'No matching widgets'),
                widgets.length === 0 &&
                  React.createElement('div', { style: { padding: '8px', fontSize: 11, color: '#666', textAlign: 'center' as const } }, 'No widget blueprints yet'),
              ),
            );
          };
        }

        // â”€â”€ Texture Select Control (searchable dropdown) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        if (data.payload instanceof N.TextureSelectControl) {
          const ctrl = data.payload as N.TextureSelectControl;
          return (_props: any) => {
            const [search, setSearch] = React.useState('');
            const [open, setOpen] = React.useState(false);
            const [selected, setSelected] = React.useState(ctrl.displayName || '(none)');
            const containerRef = React.useRef<HTMLDivElement>(null);

            // Gather textures from the TextureLibrary singleton
            const textures: { id: string; name: string; thumbnail: string; width: number; height: number }[] = [];
            const lib = TextureLibrary.instance;
            if (lib) {
              for (const t of lib.allTextures) {
                textures.push({
                  id: t.assetId,
                  name: t.assetName,
                  thumbnail: t.thumbnail || '',
                  width: t.metadata?.width ?? 0,
                  height: t.metadata?.height ?? 0,
                });
              }
            }
            const filtered = search
              ? textures.filter(t => t.name.toLowerCase().includes(search.toLowerCase()))
              : textures;

            // Close on outside click
            React.useEffect(() => {
              if (!open) return;
              const handler = (e: MouseEvent) => {
                if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
                  setOpen(false);
                  setSearch('');
                }
              };
              document.addEventListener('mousedown', handler, true);
              return () => document.removeEventListener('mousedown', handler, true);
            }, [open]);

            // Sync display if the control value changes externally (e.g. deserialization)
            React.useEffect(() => {
              setSelected(ctrl.displayName || '(none)');
            }, [ctrl.displayName]);

            const dropdownStyle: any = {
              position: 'absolute',
              top: '100%',
              left: 0,
              right: 0,
              maxHeight: 200,
              overflowY: 'auto',
              background: '#1a1a2e',
              border: '1px solid #4a9eff',
              borderRadius: '0 0 4px 4px',
              zIndex: 9999,
            };

            return React.createElement('div', {
              ref: containerRef,
              style: { position: 'relative', width: '100%', minWidth: 160 },
              onPointerDown: (e: any) => e.stopPropagation(),
            },
              // Button showing current selection
              React.createElement('div', {
                onClick: () => setOpen(!open),
                style: {
                  width: '100%',
                  padding: '4px 6px',
                  background: '#1e1e2e',
                  color: selected === '(none)' ? '#888' : '#e0e0e0',
                  border: open ? '1px solid #4a9eff' : '1px solid #3a3a5c',
                  borderRadius: open ? '4px 4px 0 0' : 4,
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: 'pointer',
                  boxSizing: 'border-box' as const,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  userSelect: 'none' as const,
                },
              },
                React.createElement('span', {
                  style: { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const, flex: 1 },
                }, selected),
                React.createElement('span', { style: { marginLeft: 4, fontSize: 10, color: '#888' }, dangerouslySetInnerHTML: { __html: open ? iconHTML(Icons.ChevronUp, 'xs') : iconHTML(Icons.ChevronDown, 'xs') } }),
              ),
              // Dropdown panel
              open && React.createElement('div', { style: dropdownStyle },
                // Search input
                React.createElement('input', {
                  type: 'text',
                  placeholder: 'Search textures...',
                  value: search,
                  autoFocus: true,
                  onChange: (e: any) => setSearch(e.target.value),
                  onPointerDown: (e: any) => e.stopPropagation(),
                  onKeyDown: (e: any) => e.stopPropagation(),
                  style: {
                    width: '100%',
                    padding: '5px 8px',
                    background: '#141422',
                    color: '#e0e0e0',
                    border: 'none',
                    borderBottom: '1px solid #333',
                    fontSize: 11,
                    outline: 'none',
                    boxSizing: 'border-box' as const,
                  },
                }),
                // Option: (none)
                React.createElement('div', {
                  onClick: () => {
                    ctrl.setValue('', '(none)');
                    setSelected('(none)');
                    setOpen(false);
                    setSearch('');
                  },
                  style: {
                    padding: '5px 8px',
                    fontSize: 11,
                    color: '#888',
                    fontStyle: 'italic' as const,
                    cursor: 'pointer',
                    borderBottom: '1px solid #222',
                  },
                  onMouseEnter: (e: any) => { e.currentTarget.style.background = '#2a2a4a'; },
                  onMouseLeave: (e: any) => { e.currentTarget.style.background = 'transparent'; },
                }, '(none)'),
                // Texture options with thumbnails
                ...filtered.map(tex =>
                  React.createElement('div', {
                    key: tex.id,
                    onClick: () => {
                      ctrl.setValue(tex.id, tex.name);
                      setSelected(tex.name);
                      setOpen(false);
                      setSearch('');
                    },
                    style: {
                      padding: '4px 8px',
                      fontSize: 11,
                      color: tex.id === ctrl.value ? '#4a9eff' : '#e0e0e0',
                      fontWeight: tex.id === ctrl.value ? 700 : 400,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                    },
                    onMouseEnter: (e: any) => { e.currentTarget.style.background = '#2a2a4a'; },
                    onMouseLeave: (e: any) => { e.currentTarget.style.background = 'transparent'; },
                  },
                    // Thumbnail
                    tex.thumbnail
                      ? React.createElement('img', {
                          src: tex.thumbnail,
                          style: {
                            width: 24,
                            height: 24,
                            objectFit: 'cover' as const,
                            borderRadius: 2,
                            border: '1px solid #333',
                            flexShrink: 0,
                          },
                        })
                      : React.createElement('div', {
                          style: {
                            width: 24,
                            height: 24,
                            background: '#333',
                            borderRadius: 2,
                            border: '1px solid #444',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: 10,
                            color: '#666',
                            flexShrink: 0,
                          },
                        }, React.createElement('span', { dangerouslySetInnerHTML: { __html: iconHTML(Icons.Image, 10, '#666') } })),
                    // Name + dimensions
                    React.createElement('div', { style: { display: 'flex', flexDirection: 'column' as const, overflow: 'hidden' } },
                      React.createElement('span', {
                        style: { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const },
                      }, tex.name),
                      tex.width > 0 && React.createElement('span', {
                        style: { fontSize: 9, color: '#666' },
                      }, `${tex.width}Ã—${tex.height}`),
                    ),
                  ),
                ),
                filtered.length === 0 && textures.length > 0 &&
                  React.createElement('div', { style: { padding: '8px', fontSize: 11, color: '#666', textAlign: 'center' as const } }, 'No matching textures'),
                textures.length === 0 &&
                  React.createElement('div', { style: { padding: '8px', fontSize: 11, color: '#666', textAlign: 'center' as const } }, 'No textures imported yet'),
              ),
            );
          };
        }

        // â”€â”€ Sound Cue Select Control â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        if (data.payload instanceof N.SoundCueSelectControl) {
          const ctrl = data.payload as N.SoundCueSelectControl;
          return (_props: any) => {
            const [search, setSearch] = React.useState('');
            const [open, setOpen] = React.useState(false);
            const [selected, setSelected] = React.useState(ctrl.displayName || '(none)');
            const containerRef = React.useRef<HTMLDivElement>(null);

            // Gather Sound Cues from the SoundLibrary singleton
            const cues: { id: string; name: string; info: string }[] = [];
            const lib = SoundLibrary.instance;
            if (lib) {
              for (const cue of lib.allCues) {
                const wpCount = (cue.nodes || []).filter((nd: any) => nd.type === 'wavePlayer').length;
                const nodeCount = (cue.nodes || []).length;
                cues.push({
                  id: cue.assetId,
                  name: cue.assetName,
                  info: `${wpCount} sound${wpCount !== 1 ? 's' : ''} Â· ${nodeCount} nodes`,
                });
              }
            }
            const filtered = search
              ? cues.filter(cu => cu.name.toLowerCase().includes(search.toLowerCase()))
              : cues;

            // Close on outside click
            React.useEffect(() => {
              if (!open) return;
              const handler = (e: MouseEvent) => {
                if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
                  setOpen(false);
                  setSearch('');
                }
              };
              document.addEventListener('mousedown', handler, true);
              return () => document.removeEventListener('mousedown', handler, true);
            }, [open]);

            React.useEffect(() => {
              setSelected(ctrl.displayName || '(none)');
            }, [ctrl.displayName]);

            const dropdownStyle: any = {
              position: 'absolute',
              top: '100%',
              left: 0,
              right: 0,
              maxHeight: 200,
              overflowY: 'auto',
              background: '#1a1a2e',
              border: '1px solid #4a9eff',
              borderRadius: '0 0 4px 4px',
              zIndex: 9999,
            };

            return React.createElement('div', {
              ref: containerRef,
              style: { position: 'relative', width: '100%', minWidth: 160 },
              onPointerDown: (e: any) => e.stopPropagation(),
            },
              // Button showing current selection
              React.createElement('div', {
                onClick: () => setOpen(!open),
                style: {
                  width: '100%',
                  padding: '4px 6px',
                  background: '#1e1e2e',
                  color: selected === '(none)' ? '#888' : '#e0e0e0',
                  border: open ? '1px solid #4a9eff' : '1px solid #3a3a5c',
                  borderRadius: open ? '4px 4px 0 0' : 4,
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: 'pointer',
                  boxSizing: 'border-box' as const,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  userSelect: 'none' as const,
                },
              },
                React.createElement('span', {
                  style: { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const, flex: 1 },
                }, selected),
                React.createElement('span', { style: { marginLeft: 4, fontSize: 10, color: '#888' }, dangerouslySetInnerHTML: { __html: open ? iconHTML(Icons.ChevronUp, 'xs') : iconHTML(Icons.ChevronDown, 'xs') } }),
              ),
              // Dropdown panel
              open && React.createElement('div', { style: dropdownStyle },
                // Search input
                React.createElement('input', {
                  type: 'text',
                  placeholder: 'Search sound cues...',
                  value: search,
                  autoFocus: true,
                  onChange: (e: any) => setSearch(e.target.value),
                  onPointerDown: (e: any) => e.stopPropagation(),
                  onKeyDown: (e: any) => e.stopPropagation(),
                  style: {
                    width: '100%',
                    padding: '5px 8px',
                    background: '#141422',
                    color: '#e0e0e0',
                    border: 'none',
                    borderBottom: '1px solid #333',
                    fontSize: 11,
                    outline: 'none',
                    boxSizing: 'border-box' as const,
                  },
                }),
                // Option: (none)
                React.createElement('div', {
                  onClick: () => {
                    ctrl.setValue('', '(none)');
                    setSelected('(none)');
                    setOpen(false);
                    setSearch('');
                    // Sync parent node soundCueId
                    const parentNode = (ctrl as any).__parentNode;
                    if (parentNode) parentNode.soundCueId = '';
                  },
                  style: {
                    padding: '5px 8px',
                    fontSize: 11,
                    color: '#888',
                    fontStyle: 'italic' as const,
                    cursor: 'pointer',
                    borderBottom: '1px solid #222',
                  },
                  onMouseEnter: (e: any) => { e.currentTarget.style.background = '#2a2a4a'; },
                  onMouseLeave: (e: any) => { e.currentTarget.style.background = 'transparent'; },
                }, '(none)'),
                // Sound Cue options
                ...filtered.map(cue =>
                  React.createElement('div', {
                    key: cue.id,
                    onClick: () => {
                      ctrl.setValue(cue.id, cue.name);
                      setSelected(cue.name);
                      setOpen(false);
                      setSearch('');
                      // Sync parent node soundCueId
                      const parentNode = (ctrl as any).__parentNode;
                      if (parentNode) parentNode.soundCueId = cue.id;
                    },
                    style: {
                      padding: '4px 8px',
                      fontSize: 11,
                      color: cue.id === ctrl.value ? '#4a9eff' : '#e0e0e0',
                      fontWeight: cue.id === ctrl.value ? 700 : 400,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                    },
                    onMouseEnter: (e: any) => { e.currentTarget.style.background = '#2a2a4a'; },
                    onMouseLeave: (e: any) => { e.currentTarget.style.background = 'transparent'; },
                  },
                    // Sound icon
                    React.createElement('span', {
                      style: { flexShrink: 0, display: 'flex', alignItems: 'center' },
                      dangerouslySetInnerHTML: { __html: iconHTML(Icons.Volume2, 14, cue.id === ctrl.value ? '#4a9eff' : '#888') },
                    }),
                    // Name + info
                    React.createElement('div', { style: { display: 'flex', flexDirection: 'column' as const, overflow: 'hidden' } },
                      React.createElement('span', {
                        style: { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const },
                      }, cue.name),
                      React.createElement('span', {
                        style: { fontSize: 9, color: '#666' },
                      }, cue.info),
                    ),
                  ),
                ),
                filtered.length === 0 && cues.length > 0 &&
                  React.createElement('div', { style: { padding: '8px', fontSize: 11, color: '#666', textAlign: 'center' as const } }, 'No matching sound cues'),
                cues.length === 0 &&
                  React.createElement('div', { style: { padding: '8px', fontSize: 11, color: '#666', textAlign: 'center' as const } }, 'No sound cues created yet'),
              ),
            );
          };
        }

        // â”€â”€ Widget Variable Selector Control â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        if (data.payload instanceof N.WidgetVariableSelectorControl) {
          const ctrl = data.payload as N.WidgetVariableSelectorControl;
          return (_props: any) => {
            const [, forceUpdate] = React.useReducer((x) => x + 1, 0);

            // Sync React re-renders when control value changes externally
            React.useEffect(() => {
              const checkValue = () => forceUpdate();
              const timer = setInterval(checkValue, 100);
              return () => clearInterval(timer);
            }, []);

            const variables = ctrl.availableVariables || [];
            const currentValue = ctrl.value || '';

            return React.createElement('select', {
              value: currentValue,
              onChange: (e: any) => {
                const newValue = e.target.value;
                ctrl.setValue(newValue);
                console.log(`[WidgetVariableSelector] Selected variable: "${newValue}"`);
                forceUpdate();
              },
              onPointerDown: (e: any) => e.stopPropagation(),
              style: {
                width: '100%',
                padding: '4px 6px',
                background: '#1e1e2e',
                color: currentValue ? '#e0e0e0' : '#888',
                border: '1px solid #3a3a5c',
                borderRadius: 4,
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer',
                outline: 'none',
              },
            },
              React.createElement('option', { key: '__none', value: '' }, '(select variable)'),
              ...variables.map((v: any) =>
                React.createElement('option', { key: v.name, value: v.name }, `${v.name} (${v.type})`),
              ),
              variables.length === 0 && React.createElement('option', { key: '__empty', value: '', disabled: true }, 'No variables available'),
            );
          };
        }

        // â”€â”€ Widget Function Selector Control â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        if (data.payload instanceof N.WidgetFunctionSelectorControl) {
          const ctrl = data.payload as N.WidgetFunctionSelectorControl;
          return (_props: any) => {
            const [, forceUpdate] = React.useReducer((x) => x + 1, 0);

            // Sync React re-renders when control value changes externally
            React.useEffect(() => {
              const checkValue = () => forceUpdate();
              const timer = setInterval(checkValue, 100);
              return () => clearInterval(timer);
            }, []);

            const functions = ctrl.availableFunctions || [];
            const currentValue = ctrl.value || '';

            return React.createElement('select', {
              value: currentValue,
              onChange: (e: any) => {
                const newValue = e.target.value;
                ctrl.setValue(newValue);
                console.log(`[WidgetFunctionSelector] Selected function: "${newValue}"`);

                // Rebuild node pins when function changes
                const parentNode = (ctrl as any)._parentNode;
                if (parentNode && parentNode instanceof N.CallWidgetFunctionNode) {
                  const selectedFunc = functions.find((f: any) => f.name === newValue);
                  if (selectedFunc) {
                    parentNode.rebuildPins(selectedFunc.inputs || [], selectedFunc.outputs || []);
                    console.log(`[WidgetFunctionSelector] Rebuilt pins for function "${newValue}"`);
                    area.update('node', parentNode.id);
                  }
                }

                forceUpdate();
              },
              onPointerDown: (e: any) => e.stopPropagation(),
              style: {
                width: '100%',
                padding: '4px 6px',
                background: '#1e1e2e',
                color: currentValue ? '#e0e0e0' : '#888',
                border: '1px solid #3a3a5c',
                borderRadius: 4,
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer',
                outline: 'none',
              },
            },
              React.createElement('option', { key: '__none', value: '' }, '(select function)'),
              ...functions.map((f: any) =>
                React.createElement('option', { key: f.name, value: f.name }, f.name),
              ),
              functions.length === 0 && React.createElement('option', { key: '__empty', value: '', disabled: true }, 'No functions available'),
            );
          };
        }

        // â”€â”€ Widget Event Selector Control â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        if (data.payload instanceof N.WidgetEventSelectorControl) {
          const ctrl = data.payload as N.WidgetEventSelectorControl;
          return (_props: any) => {
            const [, forceUpdate] = React.useReducer((x) => x + 1, 0);

            // Sync React re-renders when control value changes externally
            React.useEffect(() => {
              const checkValue = () => forceUpdate();
              const timer = setInterval(checkValue, 100);
              return () => clearInterval(timer);
            }, []);

            const events = ctrl.availableEvents || [];
            const currentValue = ctrl.value || '';

            return React.createElement('select', {
              value: currentValue,
              onChange: (e: any) => {
                const newValue = e.target.value;
                ctrl.setValue(newValue);
                console.log(`[WidgetEventSelector] Selected event: "${newValue}"`);

                // Rebuild node pins when event changes
                const parentNode = (ctrl as any)._parentNode;
                if (parentNode && parentNode instanceof N.CallWidgetEventNode) {
                  const selectedEvent = events.find((ev: any) => ev.name === newValue);
                  if (selectedEvent) {
                    parentNode.rebuildPins(selectedEvent.params || []);
                    console.log(`[WidgetEventSelector] Rebuilt pins for event "${newValue}"`);
                    area.update('node', parentNode.id);
                    onChanged();
                  }
                }

                forceUpdate();
              },
              onPointerDown: (e: any) => e.stopPropagation(),
              style: {
                width: '100%',
                padding: '4px 6px',
                background: '#1e1e2e',
                color: currentValue ? '#e0e0e0' : '#888',
                border: '1px solid #3a3a5c',
                borderRadius: 4,
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer',
                outline: 'none',
              },
            },
              React.createElement('option', { key: '__none', value: '' }, '(select event)'),
              ...events.map((ev: any) =>
                React.createElement('option', { key: ev.name, value: ev.name }, ev.name),
              ),
              events.length === 0 && React.createElement('option', { key: '__empty', value: '', disabled: true }, 'No events available'),
            );
          };
        }

        if (data.payload instanceof N.ActionMappingSelectControl) {
          const ctrl = data.payload as N.ActionMappingSelectControl;
          return (props: any) => {
            const [val, setVal] = React.useState(ctrl.value);
            const mappings = React.useMemo(() => {
              const mgr = InputMappingAssetManager.getInstance();
              const allActions = new Set<string>();
              for (const asset of mgr.assets) {
                for (const m of asset.actionMappings) allActions.add(m.name);
              }
              return Array.from(allActions);
            }, []);
            return React.createElement('select', {
              value: val,
              onChange: (e: any) => { ctrl.setValue(e.target.value); setVal(e.target.value); },
              onPointerDown: (e: any) => e.stopPropagation(),
              style: {
                width: '100%',
                padding: '4px 6px',
                background: '#1e1e2e',
                color: '#e0e0e0',
                border: '1px solid #3a3a5c',
                borderRadius: 4,
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer',
                outline: 'none',
              },
            },
              React.createElement('option', { key: '__none', value: '' }, '(select action)'),
              ...mappings.map(m =>
                React.createElement('option', { key: m, value: m }, m),
              ),
            );
          };
        }

        if (data.payload instanceof N.AxisMappingSelectControl) {
          const ctrl = data.payload as N.AxisMappingSelectControl;
          return (props: any) => {
            const [val, setVal] = React.useState(ctrl.value);
            const mappings = React.useMemo(() => {
              const mgr = InputMappingAssetManager.getInstance();
              const allAxes = new Set<string>();
              for (const asset of mgr.assets) {
                for (const m of asset.axisMappings) allAxes.add(m.name);
              }
              return Array.from(allAxes);
            }, []);
            return React.createElement('select', {
              value: val,
              onChange: (e: any) => { ctrl.setValue(e.target.value); setVal(e.target.value); },
              onPointerDown: (e: any) => e.stopPropagation(),
              style: {
                width: '100%',
                padding: '4px 6px',
                background: '#1e1e2e',
                color: '#e0e0e0',
                border: '1px solid #3a3a5c',
                borderRadius: 4,
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer',
                outline: 'none',
              },
            },
              React.createElement('option', { key: '__none', value: '' }, '(select axis)'),
              ...mappings.map(m =>
                React.createElement('option', { key: m, value: m }, m),
              ),
            );
          };
        }

        if (data.payload instanceof N.KeySelectControl) {
          const ctrl = data.payload as N.KeySelectControl;
          return (props: any) => {
            const [val, setVal] = React.useState(ctrl.value);
            return React.createElement('select', {
              value: val,
              onChange: (e: any) => { ctrl.setValue(e.target.value); setVal(e.target.value); },
              onPointerDown: (e: any) => e.stopPropagation(),
              style: {
                width: '100%',
                padding: '4px 6px',
                background: '#1e1e2e',
                color: '#e0e0e0',
                border: '1px solid #3a3a5c',
                borderRadius: 4,
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer',
                outline: 'none',
              },
            },
              ...N.INPUT_KEYS.map(k =>
                React.createElement('option', { key: k, value: k }, k),
              ),
            );
          };
        }
        if (data.payload instanceof N.EventSelectControl) {
          const ctrl = data.payload as N.EventSelectControl;
          return (_props: any) => {
            const [val, setVal] = React.useState(ctrl.value);
            const [, forceUpdate] = React.useReducer((x: number) => x + 1, 0);
            const options = ctrl.getOptions();
            return React.createElement('select', {
              value: val,
              onChange: (e: any) => {
                const newVal = e.target.value;
                const parentNode = (ctrl as any)._parentNode;
                if (parentNode) {
                  // Capture connections to dynamic pins before sync removes them
                  const conns = editor.getConnections().filter(
                    (c: any) => c.source === parentNode.id || c.target === parentNode.id
                  );
                  // setValue triggers syncPayloadPins() which rebuilds dynamic pins
                  ctrl.setValue(newVal);
                  setVal(newVal);
                  // Remove stale connections whose pins no longer exist
                  (async () => {
                    for (const c of conns) {
                      if (c.source === parentNode.id && !parentNode.outputs[c.sourceOutput]) {
                        try { await editor.removeConnection(c.id); } catch { /* ok */ }
                      }
                      if (c.target === parentNode.id && !parentNode.inputs[c.targetInput]) {
                        try { await editor.removeConnection(c.id); } catch { /* ok */ }
                      }
                    }
                    area.update('node', parentNode.id);
                    onChanged();
                  })();
                } else {
                  ctrl.setValue(newVal);
                  setVal(newVal);
                }
                forceUpdate();
              },
              onPointerDown: (e: any) => e.stopPropagation(),
              style: {
                width: '100%',
                padding: '4px 6px',
                background: '#1e1e2e',
                color: val ? '#ef4444' : '#666',
                border: '1px solid #3a3a5c',
                borderRadius: 4,
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer',
                outline: 'none',
                minWidth: 120,
              },
            },
              React.createElement('option', { value: '' }, '-- Select Event --'),
              ...options.map(o =>
                React.createElement('option', { key: o.id, value: o.id }, o.name),
              ),
            );
          };
        }
        if (data.payload instanceof N.BTSelectControl) {
          const ctrl = data.payload as N.BTSelectControl;
          return (_props: any) => {
            const [val, setVal] = React.useState(ctrl.value);
            const options = ctrl.getOptions();
            return React.createElement('select', {
              value: val,
              onChange: (e: any) => {
                const newVal = e.target.value;
                ctrl.setValue(newVal);
                setVal(newVal);
              },
              onPointerDown: (e: any) => e.stopPropagation(),
              style: {
                width: '100%',
                padding: '4px 6px',
                background: '#1e1e2e',
                color: val ? '#4fc3f7' : '#666',
                border: '1px solid #3a3a5c',
                borderRadius: 4,
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer',
                outline: 'none',
                minWidth: 140,
              },
            },
              React.createElement('option', { value: '' }, '-- Select Behavior Tree --'),
              ...options.map(o =>
                React.createElement('option', { key: o.id, value: o.id }, o.name),
              ),
            );
          };
        }
        if (data.payload instanceof N.WidgetSelectorControl) {
          const ctrl = data.payload as N.WidgetSelectorControl;
          return (props: any) => {
            // Use the control value directly as the source of truth, not local state
            // This ensures we always reflect the actual control value
            const [, forceUpdate] = React.useReducer((x) => x + 1, 0);

            // Sync React re-renders when control value changes externally
            React.useEffect(() => {
              const checkValue = () => forceUpdate();
              const timer = setInterval(checkValue, 100);
              return () => clearInterval(timer);
            }, []);

            const widgets = ctrl.availableWidgets || [];
            const currentValue = ctrl.value || '';

            return React.createElement('select', {
              value: currentValue,
              onChange: (e: any) => {
                const newValue = e.target.value;
                ctrl.setValue(newValue);
                console.log(`[WidgetSelector] Control value set to: "${newValue}"`);
                forceUpdate();
              },
              onPointerDown: (e: any) => e.stopPropagation(),
              style: {
                width: '100%',
                padding: '4px 6px',
                background: '#1e1e2e',
                color: widgets.length === 0 ? '#666' : (currentValue ? '#e0e0e0' : '#999'),
                border: '1px solid #3a3a5c',
                borderRadius: 4,
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer',
                outline: 'none',
              },
            },
              React.createElement('option', { value: '' }, widgets.length === 0 ? '(No widgets)' : '(Select Widget)'),
              ...widgets.map(w =>
                React.createElement('option', { key: w.name, value: w.name },
                  ctrl.widgetType ? `${w.name}` : `${w.name} (${w.type})`
                ),
              ),
            );
          };
        }
        if (data.payload instanceof ClassicPreset.InputControl) {
          const ctrl = data.payload as ClassicPreset.InputControl<'number' | 'text'>;
          return (props: any) => {
            const [val, setVal] = React.useState<string | number>(ctrl.value ?? (ctrl.type === 'number' ? 0 : ''));
            const debounceRef = React.useRef<any>(null);
            return React.createElement('input', {
              type: ctrl.type === 'number' ? 'number' : 'text',
              value: val,
              onChange: (e: any) => {
                const raw = e.target.value;
                const parsed = ctrl.type === 'number' ? (raw === '' ? 0 : Number(raw)) : raw;
                ctrl.setValue(parsed as any);
                setVal(raw);
                // Debounced auto-compile so InputControl values are persisted
                if (debounceRef.current) clearTimeout(debounceRef.current);
                debounceRef.current = setTimeout(() => onChanged(), 500);
              },
              onPointerDown: (e: any) => e.stopPropagation(),
              onDoubleClick: (e: any) => e.stopPropagation(),
              onKeyDown: (e: any) => e.stopPropagation(),
              style: {
                width: '100%',
                padding: '4px 6px',
                background: '#1e1e2e',
                color: '#e0e0e0',
                border: '1px solid #3a3a5c',
                borderRadius: 4,
                fontSize: 12,
                outline: 'none',
                boxSizing: 'border-box' as const,
              },
            });
          };
        }
        return null;
      },
    },
  }));
  connection.addPreset(ConnectionPresets.classic.setup());
  editor.use(area);
  area.use(connection);
  area.use(reactPlugin);

  // â”€â”€ Track last pointer position for connectiondrop menu placement â”€â”€
  let _lastPointerX = 0;
  let _lastPointerY = 0;
  container.addEventListener('pointermove', (e) => {
    const rect = container.getBoundingClientRect();
    _lastPointerX = e.clientX - rect.left;
    _lastPointerY = e.clientY - rect.top;
  }, true);

  // â”€â”€ Drag-from-pin context menu (UE-style) â”€â”€
  // When user drags a wire from a pin and drops on empty space,
  // show a context menu filtered to compatible nodes.
  // For ClassRef_<id> pins, show the target actor's variables, functions, events.
  connection.addPipe((ctx) => {
    if (ctx.type !== 'connectiondrop') return ctx;
    const { initial, socket, created } = ctx.data as {
      initial: { nodeId: string; side: 'input' | 'output'; key: string; element: HTMLElement };
      socket: { nodeId: string; side: string; key: string } | null;
      created: boolean;
    };
    // Only handle drops on empty space (no target socket, no connection created)
    if (socket || created) return ctx;

    // Find the source node and its socket
    const srcNode = editor.getNode(initial.nodeId);
    if (!srcNode) return ctx;

    let srcSocket: ClassicPreset.Socket | null = null;
    if (initial.side === 'output') {
      const out = srcNode.outputs[initial.key];
      srcSocket = out?.socket ?? null;
    } else {
      const inp = srcNode.inputs[initial.key];
      srcSocket = inp?.socket ?? null;
    }
    if (!srcSocket) return ctx;

    // Don't show menu for exec pins â€” they just want to wire to execution
    if (srcSocket.name === 'Exec') return ctx;

    // Determine screen position for the context menu
    const cx = _lastPointerX;
    const cy = _lastPointerY;

    // Determine if this is a typed class reference pin
    let targetActorId: string | null = null;
    let targetActorName: string | null = null;
    if (srcSocket.name.startsWith('ClassRef_')) {
      targetActorId = srcSocket.name.replace('ClassRef_', '');
    }
    // If it's a generic ObjectRef, we can still offer generic casting options
    const isObjectPin = srcSocket.name === 'ObjectRef' || srcSocket.name.startsWith('ClassRef_');

    // Look up the target actor's blueprint data if we have a class ref
    let targetBp: import('../BlueprintData').BlueprintData | null = null;
    let targetActorType: string | undefined;
    let targetComponents: ActorComponentData[] | undefined;
    let targetRootMeshType: string | undefined;
    if (targetActorId && getActorAssetMgr()) {
      const asset = getActorAssetMgr()!.assets.find(a => a.id === targetActorId);
      if (asset) {
        targetBp = asset.blueprintData;
        targetActorName = asset.name;
        targetActorType = asset.actorType;
        targetComponents = asset.components;
        targetRootMeshType = asset.rootMeshType;
      }
    }

    // Show the drag-from-pin context menu
    setTimeout(() => {
      showDragPinContextMenu(
        container, cx, cy,
        srcSocket!,
        initial,
        targetActorId,
        targetActorName,
        targetBp,
        isObjectPin,
        bp,
        graphType,
        async (node, connectToKey) => {
          // Add the node and position it
          await editor.addNode(node);
          const t = area.area.transform;
          await area.translate(node.id, { x: (cx - t.x) / t.k, y: (cy - t.y) / t.k });

          // Auto-connect: wire the new node to the original pin
          if (connectToKey) {
            try {
              if (initial.side === 'output') {
                // Dragged from an output â€” connect to the new node's input
                await editor.addConnection(
                  new ClassicPreset.Connection(srcNode, initial.key, node, connectToKey)
                );
              } else {
                // Dragged from an input â€” connect new node's output to the original input
                await editor.addConnection(
                  new ClassicPreset.Connection(node, connectToKey, srcNode, initial.key)
                );
              }
            } catch (e) {
              // Connection might fail if sockets are incompatible â€” that's OK
            }
          }
          onChanged();
        },
        targetActorType,
        targetComponents,
        targetRootMeshType,
      );
    }, 10);

    return ctx;
  });

  // â”€â”€ Selection state (declared early so area pipes can reference it) â”€â”€
  const selectedNodeIds = new Set<string>();
  let _lastPointerEvent: PointerEvent | null = null;
  container.addEventListener('pointerdown', (e) => {
    _lastPointerEvent = e;
  }, true);

  // â”€â”€ UE-style controls: block Rete's default left-click area pan â”€â”€
  let _leftMouseDown = false;
  container.addEventListener('pointerdown', (e) => {
    if (e.button === 0) _leftMouseDown = true;
  }, true);
  window.addEventListener('pointerup', (e) => {
    if (e.button === 0) _leftMouseDown = false;
  });

  // Right-click pan state (declared early so contextmenu handler can reference _rcMoved)
  let _rcDown = false;
  let _rcMoved = false;
  let _rcStartX = 0, _rcStartY = 0;
  let _rcStartTx = 0, _rcStartTy = 0;

  // â”€â”€ Connection wire coloring by socket type â”€â”€
  area.addPipe((ctx) => {
    if (ctx.type === 'rendered') {
      const d = ctx.data as any;
      if (d.type === 'connection' && d.data && d.element) {
        const conn = d.data;
        const el = d.element as HTMLElement;
        const srcNode = editor.getNode(conn.source);
        if (srcNode) {
          const output = srcNode.outputs[conn.sourceOutput];
          if (output?.socket) {
            const wireColor = N.socketColor(output.socket);
            const isExec = output.socket.name === 'Exec';
            const path = el.querySelector('path');
            if (path) {
              path.setAttribute('stroke', wireColor);
              path.setAttribute('stroke-width', isExec ? '3.5' : '2');
              if (isExec) path.classList.add('fe-exec-wire');
            }
          }
        }
      }
      // Add category + ID attributes to rendered node elements
      if (d.type === 'node' && d.data && d.element) {
        const nodeObj = d.data;
        const outerEl = d.element as HTMLElement;
        const cat = getNodeCategory(nodeObj);
        // Stamp on outer wrapper (NodeView.element)
        outerEl.setAttribute('data-node-category', cat);
        outerEl.setAttribute('data-node-id', nodeObj.id);
        // Also stamp on inner [data-testid="node"] React element
        const innerEl = outerEl.querySelector('[data-testid="node"]') as HTMLElement | null;
        if (innerEl) {
          innerEl.setAttribute('data-node-id', nodeObj.id);
        }
        // Apply initial selection state on BOTH elements
        const isSel = selectedNodeIds.has(nodeObj.id);
        outerEl.classList.toggle('fe-selected', isSel);
        outerEl.setAttribute('data-selected', isSel ? 'true' : 'false');
        if (innerEl) {
          innerEl.classList.toggle('fe-selected', isSel);
          innerEl.classList.toggle('selected', isSel);
        }
      }
    }
    return ctx;
  });

  // â”€â”€ Socket type-safety: auto-insert conversion nodes or block incompatible â”€â”€
  editor.addPipe((ctx) => {
    if (ctx.type === 'connectioncreate') {
      const { data } = ctx as any;
      const srcNode = editor.getNode(data.source);
      const tgtNode = editor.getNode(data.target);
      if (srcNode && tgtNode) {
        const srcOutput = srcNode.outputs[data.sourceOutput];
        const tgtInput  = tgtNode.inputs[data.targetInput];
        if (srcOutput?.socket && tgtInput?.socket) {
          if (!N.socketsCompatible(srcOutput.socket, tgtInput.socket)) {
            // Check for an auto-conversion
            const conv = N.getConversion(srcOutput.socket.name, tgtInput.socket.name);
            if (conv) {
              // Schedule auto-insertion asynchronously (pipe must return synchronously)
              setTimeout(async () => {
                try {
                  const convNode = conv.factory();
                  await editor.addNode(convNode);

                  // Position the conversion node between source and target
                  const srcView = area.nodeViews.get(srcNode.id);
                  const tgtView = area.nodeViews.get(tgtNode.id);
                  const sx = srcView?.position.x ?? 0;
                  const sy = srcView?.position.y ?? 0;
                  const tx = tgtView?.position.x ?? sx + 300;
                  const ty = tgtView?.position.y ?? sy;
                  await area.translate(convNode.id, {
                    x: (sx + tx) / 2,
                    y: (sy + ty) / 2,
                  });

                  const ca = new ClassicPreset.Connection(srcNode, data.sourceOutput, convNode, 'in');
                  await editor.addConnection(ca as any);
                  const cb = new ClassicPreset.Connection(convNode, 'out', tgtNode, data.targetInput);
                  await editor.addConnection(cb as any);
                } catch (err) {
                  console.error('[Feather] Auto-conversion failed:', err);
                }
              }, 0);

              return undefined as any; // block the original (incompatible) connection
            }

            console.warn(
              `[Feather] Blocked connection: ${srcOutput.socket.name} â†’ ${tgtInput.socket.name}`,
            );
            return undefined as any;           // block the connection
          }
        }
      }
    }
    return ctx;
  });

  // â”€â”€ Block Rete's built-in left-click area pan (UE-style: only right-click pans) â”€â”€
  area.addPipe((ctx) => {
    if (ctx.type === 'translate') {
      // Block area translate when left mouse is held (Rete's default drag-to-pan).
      // Programmatic translates (zoomAt, etc.) happen without mouse down so are allowed.
      if (_leftMouseDown) return undefined;
    }
    return ctx;
  });

  // Right-click context menu + pan
  container.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    // If the user was right-click-dragging to pan, don't show the menu
    if (_rcMoved) return;
    const rect = container.getBoundingClientRect();
    const cx = e.clientX - rect.left;
    const cy = e.clientY - rect.top;

    // Check if right-click is on a node â€” show node actions menu
    const targetEl = e.target as HTMLElement;
    const nodeEl = targetEl.closest('[data-testid="node"]') as HTMLElement | null;
    if (nodeEl) {
      // Find which node was right-clicked
      const clickedNode = editor.getNodes().find(n => {
        const view = area.nodeViews.get(n.id);
        if (!view) return false;
        const nodeContainer = (view as any).element as HTMLElement | undefined;
        return nodeContainer === nodeEl || nodeEl.contains(nodeContainer as Node) || (nodeContainer && nodeContainer.contains(nodeEl));
      });
      if (clickedNode || selectedNodeIds.size > 0) {
        const existingMenu = container.querySelector('.bp-context-menu');
        if (existingMenu) existingMenu.remove();
        const menu = document.createElement('div');
        menu.className = 'bp-context-menu fe-node-action-menu';
        menu.style.left = cx + 'px';
        menu.style.top = cy + 'px';
        const header = document.createElement('div');
        header.className = 'bp-context-header';
        header.textContent = 'Node Actions';
        menu.appendChild(header);
        // Disable/Enable
        const isDisabled = clickedNode ? (clickedNode as any).__disabled : false;
        const disableItem = document.createElement('div');
        disableItem.className = 'bp-context-item';
        disableItem.innerHTML = isDisabled ? iconHTML(Icons.Check, 12, ICON_COLORS.success) + ' Enable Node' : iconHTML(Icons.XCircle, 12, ICON_COLORS.warning) + ' Disable Node';
        disableItem.addEventListener('click', () => {
          const targets = selectedNodeIds.size > 0 ? editor.getNodes().filter(n => selectedNodeIds.has(n.id)) : (clickedNode ? [clickedNode] : []);
          for (const n of targets) {
            (n as any).__disabled = !(n as any).__disabled;
            // Update visual
            const view = area.nodeViews.get(n.id);
            if (view) {
              const el = (view as any).element as HTMLElement | undefined;
              if (el) el.classList.toggle('fe-node-disabled', !!(n as any).__disabled);
            }
          }
          menu.remove();
          onChanged();
        });
        menu.appendChild(disableItem);
        // Delete
        const deleteItem = document.createElement('div');
        deleteItem.className = 'bp-context-item';
        deleteItem.innerHTML = iconHTML(Icons.Trash2, 12, ICON_COLORS.error) + ' Delete';
        deleteItem.addEventListener('click', () => {
          const targets = selectedNodeIds.size > 0 ? [...selectedNodeIds] : (clickedNode ? [clickedNode.id] : []);
          pushUndo('Delete nodes');
          (async () => {
            for (const nid of targets) {
              const node = editor.getNode(nid);
              const conns = editor.getConnections().filter(c => c.source === nid || c.target === nid);
              for (const c of conns) { try { await editor.removeConnection(c.id); } catch { /* ok */ } }
              try { await editor.removeNode(nid); } catch { /* ok */ }
            }
          })();
          selectedNodeIds.clear();
          menu.remove();
        });
        menu.appendChild(deleteItem);
        // Duplicate
        const dupItem = document.createElement('div');
        dupItem.className = 'bp-context-item';
        dupItem.innerHTML = iconHTML(Icons.Copy, 12, ICON_COLORS.muted) + ' Duplicate';
        dupItem.addEventListener('click', () => {
          const targets = selectedNodeIds.size > 0 ? editor.getNodes().filter(n => selectedNodeIds.has(n.id)) : (clickedNode ? [clickedNode] : []);
          (async () => {
            const idMap = new Map<string, string>();
            for (const sn of targets) {
              const sd = { type: getNodeTypeName(sn), data: getNodeSerialData(sn) };
              const node = createNodeFromData(sd, bp);
              if (!node) continue;
              await editor.addNode(node);
              idMap.set(sn.id, node.id);
              const v = area.nodeViews.get(sn.id);
              await area.translate(node.id, { x: (v?.position.x ?? 0) + 40, y: (v?.position.y ?? 0) + 40 });
            }
          })();
          menu.remove();
        });
        menu.appendChild(dupItem);
        container.appendChild(menu);
        const closeHandler = (ev: MouseEvent) => { if (!menu.contains(ev.target as Node)) { menu.remove(); document.removeEventListener('mousedown', closeHandler); } };
        setTimeout(() => document.addEventListener('mousedown', closeHandler), 0);
        return;
      }
    }

    showContextMenu(container, cx, cy, bp, graphType, currentFuncId,
      async (entry) => {
        const node = entry.factory();
        await editor.addNode(node);
        const t = area.area.transform;
        await area.translate(node.id, { x: (cx - t.x) / t.k, y: (cy - t.y) / t.k });
      },
      async (v, mode) => {
        const sf = v.type.startsWith('Struct:') ? bp.structs.find(s => s.id === v.type.slice(7))?.fields : undefined;
        const node = mode === 'get'
          ? new N.GetVariableNode(v.id, v.name, v.type, sf)
          : new N.SetVariableNode(v.id, v.name, v.type, sf);
        await editor.addNode(node);
        const t = area.area.transform;
        await area.translate(node.id, { x: (cx - t.x) / t.k, y: (cy - t.y) / t.k });
      },
      async (fn) => {
        const node = new N.FunctionCallNode(fn.id, fn.name, fn.inputs, fn.outputs);
        await editor.addNode(node);
        const t = area.area.transform;
        await area.translate(node.id, { x: (cx - t.x) / t.k, y: (cy - t.y) / t.k });
      },
      async (m) => {
        const node = new N.MacroCallNode(m.id, m.name, m.inputs, m.outputs);
        await editor.addNode(node);
        const t = area.area.transform;
        await area.translate(node.id, { x: (cx - t.x) / t.k, y: (cy - t.y) / t.k });
      },
      async (evt) => {
        const node = new N.CallCustomEventNode(evt.id, evt.name, evt.params);
        await editor.addNode(node);
        const t = area.area.transform;
        await area.translate(node.id, { x: (cx - t.x) / t.k, y: (cy - t.y) / t.k });
      },
      async (lv, mode) => {
        const sf = lv.type.startsWith('Struct:') ? bp.structs.find(s => s.id === lv.type.slice(7))?.fields : undefined;
        const node = mode === 'get'
          ? new N.GetVariableNode(lv.id, lv.name, lv.type, sf)
          : new N.SetVariableNode(lv.id, lv.name, lv.type, sf);
        (node as any).__isLocal = true;
        await editor.addNode(node);
        const t = area.area.transform;
        await area.translate(node.id, { x: (cx - t.x) / t.k, y: (cy - t.y) / t.k });
      },
      async (s, mode) => {
        const node = mode === 'make'
          ? new N.MakeStructNode(s.id, s.name, s.fields)
          : new N.BreakStructNode(s.id, s.name, s.fields);
        await editor.addNode(node);
        const t = area.area.transform;
        await area.translate(node.id, { x: (cx - t.x) / t.k, y: (cy - t.y) / t.k });
      },
      (type) => {
        if (type === 'axis') {
          // Input Axis â€” create directly with default keys (user can modify in properties)
          (async () => {
            const node = new N.InputAxisNode('D', 'A');
            await editor.addNode(node);
            const t = area.area.transform;
            await area.translate(node.id, { x: (cx - t.x) / t.k, y: (cy - t.y) / t.k });
          })();
        } else {
          const title = type === 'event' ? 'Input Key Event' : 'Is Key Down';
          showKeySelectDialog(container, title, async (key) => {
            const node = type === 'event'
              ? new N.InputKeyEventNode(key)
              : new N.IsKeyDownNode(key);
            await editor.addNode(node);
            const t = area.area.transform;
            await area.translate(node.id, { x: (cx - t.x) / t.k, y: (cy - t.y) / t.k });
          });
        }
      },
      componentEntries,
    );
  });

  // Drop items from sidebar (variables, functions, macros, custom events)
  // Use capture phase so events fire before Rete's internal elements can block them
  container.addEventListener('dragover', (e) => {
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
  }, true);
  container.addEventListener('drop', async (e) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      const raw = e.dataTransfer!.getData('text/plain');
      if (!raw) return;
      const data = JSON.parse(raw);
      const rect = container.getBoundingClientRect();
      const t = area.area.transform;
      const dropX = (e.clientX - rect.left - t.x) / t.k;
      const dropY = (e.clientY - rect.top - t.y) / t.k;

      if (data.varId) {
        // Variable drop (global or local)
        const mode = e.ctrlKey ? 'set' : 'get';
        const vType: VarType = data.varType;
        const sf = vType.startsWith('Struct:') ? bp.structs.find(s => s.id === vType.slice(7))?.fields : undefined;
        const node = mode === 'get'
          ? new N.GetVariableNode(data.varId, data.varName, vType, sf)
          : new N.SetVariableNode(data.varId, data.varName, vType, sf);
        if (data.isLocal) (node as any).__isLocal = true;
        await editor.addNode(node);
        await area.translate(node.id, { x: dropX, y: dropY });
      } else if (data.dragType === 'function') {
        // Function drop â€” create FunctionCallNode
        const fn = bp.getFunction(data.funcId);
        if (fn) {
          const node = new N.FunctionCallNode(fn.id, fn.name, fn.inputs, fn.outputs);
          await editor.addNode(node);
          await area.translate(node.id, { x: dropX, y: dropY });
        }
      } else if (data.dragType === 'macro') {
        // Macro drop â€” create MacroCallNode
        const m = bp.getMacro(data.macroId);
        if (m) {
          const node = new N.MacroCallNode(m.id, m.name, m.inputs, m.outputs);
          await editor.addNode(node);
          await area.translate(node.id, { x: dropX, y: dropY });
        }
      } else if (data.dragType === 'customEvent') {
        // Custom event drop â€” create CallCustomEventNode
        const evt = bp.customEvents.find(e => e.id === data.eventId);
        const params = evt ? evt.params : [];
        const node = new N.CallCustomEventNode(data.eventId, data.eventName, params);
        await editor.addNode(node);
        await area.translate(node.id, { x: dropX, y: dropY });
      }
    } catch { /* not a drag item */ }
  }, true);

  // â”€â”€ Clipboard for copy/paste â”€â”€
  let _clipboard: { nodes: any[]; connections: any[]; offset: { x: number; y: number } } | null = null;

  // â”€â”€ Comment boxes â”€â”€
  const comments: CommentBox[] = [];
  const commentEls = new Map<string, HTMLElement>();
  const commentLayer = document.createElement('div');
  commentLayer.className = 'fe-comment-layer';
  container.appendChild(commentLayer);

  function createCommentEl(c: CommentBox): HTMLElement {
    const el = document.createElement('div');
    el.className = 'fe-comment-box';
    el.setAttribute('data-comment-id', c.id);
    el.style.cssText = `left:${c.position.x}px;top:${c.position.y}px;width:${c.size.width}px;height:${c.size.height}px;border-color:${c.color};`;
    el.innerHTML = `<div class="fe-comment-header" style="background:${c.color}"><span class="fe-comment-text" contenteditable="true">${c.text}</span><span class="fe-comment-close">${iconHTML(Icons.X, 'xs', ICON_COLORS.muted)}</span></div><div class="fe-comment-body"></div><div class="fe-comment-resize"></div>`;
    // Make header draggable
    const header = el.querySelector('.fe-comment-header')!;
    let dragging = false, startX = 0, startY = 0, origX = 0, origY = 0;
    header.addEventListener('pointerdown', (ev: any) => {
      if ((ev.target as HTMLElement).classList.contains('fe-comment-close') || (ev.target as HTMLElement).isContentEditable) return;
      dragging = true; startX = ev.clientX; startY = ev.clientY;
      origX = c.position.x; origY = c.position.y;
      const onMove = (me: PointerEvent) => {
        if (!dragging) return;
        c.position.x = origX + (me.clientX - startX) / (area.area.transform.k);
        c.position.y = origY + (me.clientY - startY) / (area.area.transform.k);
        el.style.left = c.position.x + 'px';
        el.style.top = c.position.y + 'px';
      };
      const onUp = () => { dragging = false; document.removeEventListener('pointermove', onMove); document.removeEventListener('pointerup', onUp); onChanged(); };
      document.addEventListener('pointermove', onMove);
      document.addEventListener('pointerup', onUp);
    });
    // Resize handle
    const resizeHandle = el.querySelector('.fe-comment-resize')!;
    resizeHandle.addEventListener('pointerdown', (ev: any) => {
      ev.stopPropagation();
      const rStartX = ev.clientX, rStartY = ev.clientY;
      const rOrigW = c.size.width, rOrigH = c.size.height;
      const onMove = (me: PointerEvent) => {
        c.size.width = Math.max(150, rOrigW + (me.clientX - rStartX) / (area.area.transform.k));
        c.size.height = Math.max(80, rOrigH + (me.clientY - rStartY) / (area.area.transform.k));
        el.style.width = c.size.width + 'px';
        el.style.height = c.size.height + 'px';
      };
      const onUp = () => { document.removeEventListener('pointermove', onMove); document.removeEventListener('pointerup', onUp); onChanged(); };
      document.addEventListener('pointermove', onMove);
      document.addEventListener('pointerup', onUp);
    });
    // Edit text
    const textEl = el.querySelector('.fe-comment-text') as HTMLElement;
    textEl.addEventListener('blur', () => { c.text = textEl.textContent || 'Comment'; onChanged(); });
    textEl.addEventListener('keydown', (e: any) => { if (e.key === 'Enter') { e.preventDefault(); textEl.blur(); } });
    // Close button
    el.querySelector('.fe-comment-close')!.addEventListener('click', () => {
      const idx = comments.findIndex(x => x.id === c.id);
      if (idx >= 0) comments.splice(idx, 1);
      el.remove(); commentEls.delete(c.id); onChanged();
    });
    commentLayer.appendChild(el);
    commentEls.set(c.id, el);
    return el;
  }

  function addComment(x: number, y: number) {
    const t = area.area.transform;
    const c: CommentBox = { id: commentUid(), text: 'Comment', position: { x: (x - t.x) / t.k, y: (y - t.y) / t.k }, size: { width: 300, height: 150 }, color: '#4455aa' };
    comments.push(c);
    createCommentEl(c);
    onChanged();
  }

  // â”€â”€ Undo / Redo Manager â”€â”€
  const undoMgr = new UndoManager();
  let _undoThrottle: ReturnType<typeof setTimeout> | null = null;
  function pushUndo(label: string) {
    if (_undoThrottle) clearTimeout(_undoThrottle);
    _undoThrottle = setTimeout(() => {
      const snap = serializeGraph(editor, area);
      undoMgr.push({ graphJson: snap, label });
    }, 100);
  }

  // â”€â”€ Snap to Grid (20px increments, always on â€” hold Alt to disable) â”€â”€
  const GRID_SIZE = 20;
  area.addPipe((ctx) => {
    if (ctx.type === 'nodetranslate') {
      const d = ctx.data as any;
      if (!(_lastPointerEvent?.altKey)) {
        d.position.x = Math.round(d.position.x / GRID_SIZE) * GRID_SIZE;
        d.position.y = Math.round(d.position.y / GRID_SIZE) * GRID_SIZE;
      }
    }
    return ctx;
  });

  // Sync comment layer transform with area pan/zoom
  area.addPipe((ctx) => {
    if (ctx.type === 'translated' || ctx.type === 'zoomed' || ctx.type === 'resized') {
      const t = area.area.transform;
      commentLayer.style.transform = `translate(${t.x}px, ${t.y}px) scale(${t.k})`;
    }
    return ctx;
  });

  // â”€â”€ Right-click drag pan (UE-style) â”€â”€
  container.addEventListener('pointerdown', (e) => {
    if (e.button === 2) {
      _rcDown = true;
      _rcMoved = false;
      _rcStartX = e.clientX;
      _rcStartY = e.clientY;
      _rcStartTx = area.area.transform.x;
      _rcStartTy = area.area.transform.y;
    }
  }, true);
  container.addEventListener('pointermove', (e) => {
    if (!_rcDown) return;
    const dx = e.clientX - _rcStartX;
    const dy = e.clientY - _rcStartY;
    if (!_rcMoved && (Math.abs(dx) > 3 || Math.abs(dy) > 3)) {
      _rcMoved = true;
    }
    if (_rcMoved) {
      // Directly update the area transform and DOM for smooth panning
      const t = area.area.transform;
      t.x = _rcStartTx + dx;
      t.y = _rcStartTy + dy;
      // Update the area's content element (first child of container is the rete area content)
      const areaContent = container.querySelector(':scope > div') as HTMLElement;
      if (areaContent) {
        areaContent.style.transform = `translate(${t.x}px, ${t.y}px) scale(${t.k})`;
      }
      // Sync comment layer
      commentLayer.style.transform = `translate(${t.x}px, ${t.y}px) scale(${t.k})`;
    }
  });
  window.addEventListener('pointerup', (e) => {
    if (e.button === 2 && _rcDown) {
      _rcDown = false;
    }
  });

  // â”€â”€ Box Select (drag rectangle on empty canvas) â”€â”€
  let _boxSelecting = false;
  let _boxStart = { x: 0, y: 0 };
  const boxSelRect = document.createElement('div');
  boxSelRect.className = 'fe-box-select';
  boxSelRect.style.display = 'none';
  container.appendChild(boxSelRect);

  container.addEventListener('pointerdown', (e) => {
    const target = e.target as HTMLElement;
    const isOnNode = target.closest('[data-testid="node"]') || target.closest('.node') || target.closest('[data-node-id]');
    const isOnComment = target.closest('.fe-comment-box');
    const isOnUI = target.closest('.bp-context-menu') || target.closest('.mybp-dialog-overlay') || target.closest('.fe-minimap');
    if (!isOnNode && !isOnComment && !isOnUI && e.button === 0) {
      // Left-click on empty canvas
      if (!e.shiftKey && !e.ctrlKey) { selectedNodeIds.clear(); syncSelectionVisuals(); }
      // Start box select
      _boxSelecting = true;
      const rect = container.getBoundingClientRect();
      _boxStart = { x: e.clientX - rect.left, y: e.clientY - rect.top };
      boxSelRect.style.left = _boxStart.x + 'px';
      boxSelRect.style.top = _boxStart.y + 'px';
      boxSelRect.style.width = '0px';
      boxSelRect.style.height = '0px';
      boxSelRect.style.display = 'none';
    }
  });
  container.addEventListener('pointermove', (e) => {
    if (!_boxSelecting) return;
    const rect = container.getBoundingClientRect();
    const cx = e.clientX - rect.left;
    const cy = e.clientY - rect.top;
    const x = Math.min(cx, _boxStart.x);
    const y = Math.min(cy, _boxStart.y);
    const w = Math.abs(cx - _boxStart.x);
    const h = Math.abs(cy - _boxStart.y);
    if (w > 4 || h > 4) {
      boxSelRect.style.display = 'block';
      boxSelRect.style.left = x + 'px';
      boxSelRect.style.top = y + 'px';
      boxSelRect.style.width = w + 'px';
      boxSelRect.style.height = h + 'px';
    }
  });
  container.addEventListener('pointerup', (e) => {
    if (!_boxSelecting) return;
    _boxSelecting = false;
    boxSelRect.style.display = 'none';
    // Select nodes within the rectangle
    const rect = container.getBoundingClientRect();
    const cx = e.clientX - rect.left;
    const cy = e.clientY - rect.top;
    const bx1 = Math.min(cx, _boxStart.x);
    const by1 = Math.min(cy, _boxStart.y);
    const bx2 = Math.max(cx, _boxStart.x);
    const by2 = Math.max(cy, _boxStart.y);
    if (bx2 - bx1 < 5 && by2 - by1 < 5) { syncSelectionVisuals(); return; } // too small, just sync
    const t = area.area.transform;
    for (const n of editor.getNodes()) {
      const v = area.nodeViews.get(n.id);
      if (!v) continue;
      // Convert node position to screen coords
      const nx = v.position.x * t.k + t.x;
      const ny = v.position.y * t.k + t.y;
      if (nx >= bx1 && nx <= bx2 && ny >= by1 && ny <= by2) {
        selectedNodeIds.add(n.id);
      }
    }
    syncSelectionVisuals();
    requestAnimationFrame(() => syncSelectionVisuals());
  });
  function syncSelectionVisuals() {
    // Apply .fe-selected on the outer wrapper (NodeView.element that has data-node-id).
    // Use the area's nodeViews to get ALL node outer elements reliably.
    // Also stamp data-selected attribute so CSS attribute selectors work even if
    // styled-components doesn't generate a .node class.
    for (const node of editor.getNodes()) {
      const view = area.nodeViews.get(node.id);
      if (!view) continue;
      const outerEl = view.element as HTMLElement;
      const isSel = selectedNodeIds.has(node.id);
      outerEl.classList.toggle('fe-selected', isSel);
      outerEl.setAttribute('data-selected', isSel ? 'true' : 'false');
      // Also mark the inner [data-testid="node"] element (styled-components node body)
      const innerEl = outerEl.querySelector('[data-testid="node"]') as HTMLElement | null;
      if (innerEl) {
        innerEl.classList.toggle('fe-selected', isSel);
        innerEl.classList.toggle('selected', isSel);
      }
    }
  }

  // â”€â”€ Prevent wheel events on UI overlays from zooming the canvas â”€â”€
  container.addEventListener('wheel', (e) => {
    const target = e.target as HTMLElement;
    if (target.closest('.bp-context-menu') || target.closest('.fe-minimap') || target.closest('.mybp-dialog-overlay') || target.closest('.fe-node-action-menu')) {
      e.stopPropagation();
    }
  }, true);

  // â”€â”€ Keyboard shortcut handler â”€â”€
  function handleKeyDown(e: KeyboardEvent) {
    const tag = (e.target as HTMLElement).tagName;
    const inInput = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (e.target as HTMLElement).isContentEditable;

    // Delete / Backspace â€” delete selected nodes
    if ((e.key === 'Delete' || e.key === 'Backspace') && !inInput) {
      if (selectedNodeIds.size > 0) {
        e.preventDefault();
        pushUndo('Delete nodes');
        const ids = [...selectedNodeIds];
        selectedNodeIds.clear();
        syncSelectionVisuals();
        (async () => {
          for (const nodeId of ids) {
            const node = editor.getNode(nodeId);
            const conns = editor.getConnections().filter(c => c.source === nodeId || c.target === nodeId);
            for (const c of conns) { try { await editor.removeConnection(c.id); } catch { /* ok */ } }
            try { await editor.removeNode(nodeId); } catch { /* ok */ }
          }
        })();
      }
    }

    // Ctrl+Z â€” undo
    if (e.key === 'z' && (e.ctrlKey || e.metaKey) && !e.shiftKey && !inInput) {
      e.preventDefault();
      const state = undoMgr.undo();
      if (state) {
        (async () => {
          // Clear current graph
          for (const c of editor.getConnections()) { try { await editor.removeConnection(c.id); } catch { /* ok */ } }
          for (const n of editor.getNodes()) { try { await editor.removeNode(n.id); } catch { /* ok */ } }
          // Restore from snapshot
          await deserializeGraph(editor, area, state.graphJson, bp);
        })();
      }
    }

    // Ctrl+Y or Ctrl+Shift+Z â€” redo
    if (((e.key === 'y' && (e.ctrlKey || e.metaKey)) || (e.key === 'z' && (e.ctrlKey || e.metaKey) && e.shiftKey)) && !inInput) {
      e.preventDefault();
      const state = undoMgr.redo();
      if (state) {
        (async () => {
          for (const c of editor.getConnections()) { try { await editor.removeConnection(c.id); } catch { /* ok */ } }
          for (const n of editor.getNodes()) { try { await editor.removeNode(n.id); } catch { /* ok */ } }
          await deserializeGraph(editor, area, state.graphJson, bp);
        })();
      }
    }

    // Ctrl+A â€” select all
    if (e.key === 'a' && (e.ctrlKey || e.metaKey) && !inInput) {
      e.preventDefault();
      for (const n of editor.getNodes()) selectedNodeIds.add(n.id);
      syncSelectionVisuals();
    }

    // F â€” frame selection (zoom to fit selected or all)
    if (e.key === 'f' && !inInput && !e.ctrlKey && !e.metaKey) {
      e.preventDefault();
      const selected = editor.getNodes().filter(n => selectedNodeIds.has(n.id));
      const targets = selected.length > 0 ? selected : editor.getNodes();
      if (targets.length > 0) AreaExtensions.zoomAt(area, targets);
    }

    // Ctrl+C â€” copy
    if (e.key === 'c' && (e.ctrlKey || e.metaKey) && !inInput) {
      if (selectedNodeIds.size > 0) {
        e.preventDefault();
        const selNodes = editor.getNodes().filter(n => selectedNodeIds.has(n.id));
        const selConns = editor.getConnections().filter(c => selectedNodeIds.has(c.source) && selectedNodeIds.has(c.target));
        // Find center of selection for offset
        let cx = 0, cy = 0;
        for (const n of selNodes) {
          const v = area.nodeViews.get(n.id);
          if (v) { cx += v.position.x; cy += v.position.y; }
        }
        cx /= selNodes.length; cy /= selNodes.length;
        _clipboard = {
          nodes: selNodes.map(n => ({ type: getNodeTypeName(n), data: getNodeSerialData(n), position: area.nodeViews.get(n.id)?.position || { x: 0, y: 0 } })),
          connections: selConns.map(c => ({ source: c.source, sourceOutput: c.sourceOutput, target: c.target, targetInput: c.targetInput })),
          offset: { x: cx, y: cy },
        };
      }
    }

    // Ctrl+V â€” paste
    if (e.key === 'v' && (e.ctrlKey || e.metaKey) && !inInput) {
      if (_clipboard && _clipboard.nodes.length > 0) {
        e.preventDefault();
        (async () => {
          const idMap = new Map<string, string>();
          const newIds: string[] = [];
          // Get viewport center as paste target
          const rect = container.getBoundingClientRect();
          const t = area.area.transform;
          const vcx = (rect.width / 2 - t.x) / t.k;
          const vcy = (rect.height / 2 - t.y) / t.k;
          for (const nd of _clipboard!.nodes) {
            const node = createNodeFromData(nd, bp);
            if (!node) continue;
            const oldPos = nd.position || { x: 0, y: 0 };
            await editor.addNode(node);
            idMap.set(nd.type + '_' + JSON.stringify(nd.data), node.id);
            const nx = vcx + (oldPos.x - _clipboard!.offset.x) + 30;
            const ny = vcy + (oldPos.y - _clipboard!.offset.y) + 30;
            await area.translate(node.id, { x: nx, y: ny });
            newIds.push(node.id);
          }
          selectedNodeIds.clear();
          for (const id of newIds) selectedNodeIds.add(id);
          syncSelectionVisuals();
        })();
      }
    }

    // Ctrl+D â€” duplicate
    if (e.key === 'd' && (e.ctrlKey || e.metaKey) && !inInput) {
      if (selectedNodeIds.size > 0) {
        e.preventDefault();
        (async () => {
          const selNodes = editor.getNodes().filter(n => selectedNodeIds.has(n.id));
          const selConns = editor.getConnections().filter(c => selectedNodeIds.has(c.source) && selectedNodeIds.has(c.target));
          const idMap = new Map<string, string>();
          const newIds: string[] = [];
          for (const sn of selNodes) {
            const serialData = { type: getNodeTypeName(sn), data: getNodeSerialData(sn) };
            const node = createNodeFromData(serialData, bp);
            if (!node) continue;
            await editor.addNode(node);
            idMap.set(sn.id, node.id);
            const v = area.nodeViews.get(sn.id);
            const pos = v ? { x: v.position.x + 40, y: v.position.y + 40 } : { x: 40, y: 40 };
            await area.translate(node.id, pos);
            newIds.push(node.id);
          }
          // Restore internal connections
          for (const c of selConns) {
            const ns = idMap.get(c.source);
            const nt = idMap.get(c.target);
            if (ns && nt) {
              const sn = editor.getNode(ns);
              const tn = editor.getNode(nt);
              if (sn && tn) { try { await editor.addConnection(new ClassicPreset.Connection(sn, c.sourceOutput, tn, c.targetInput)); } catch { /* ok */ } }
            }
          }
          selectedNodeIds.clear();
          for (const id of newIds) selectedNodeIds.add(id);
          syncSelectionVisuals();
        })();
      }
    }

    // Spacebar or Ctrl+F â€” quick search / node menu
    if ((e.key === ' ' || (e.key === 'f' && (e.ctrlKey || e.metaKey))) && !inInput) {
      if (e.key === ' ') {
        e.preventDefault();
        const rect = container.getBoundingClientRect();
        showContextMenu(container, rect.width / 2 - 140, rect.height / 2 - 210, bp, graphType, currentFuncId,
          async (entry) => {
            const node = entry.factory();
            await editor.addNode(node);
            const t = area.area.transform;
            await area.translate(node.id, { x: (-t.x + rect.width / 2) / t.k, y: (-t.y + rect.height / 2) / t.k });
          },
          async () => {}, async () => {}, async () => {}, async () => {}, async () => {},
          async (s, mode) => {
            const node = mode === 'make' ? new N.MakeStructNode(s.id, s.name, s.fields) : new N.BreakStructNode(s.id, s.name, s.fields);
            await editor.addNode(node); const t = area.area.transform;
            await area.translate(node.id, { x: (-t.x + rect.width / 2) / t.k, y: (-t.y + rect.height / 2) / t.k });
          },
          () => {},
          componentEntries,
        );
      }
    }

    // C â€” add comment box (when not in input)
    if (e.key === 'c' && !e.ctrlKey && !e.metaKey && !inInput) {
      const rect = container.getBoundingClientRect();
      addComment(rect.width / 2, rect.height / 2);
    }
  }
  container.setAttribute('tabindex', '0');
  container.style.outline = 'none';
  container.addEventListener('keydown', handleKeyDown);
  // Focus the container when clicking on it so key events work
  container.addEventListener('mousedown', () => {
    if (document.activeElement !== container) container.focus();
  });

  // Auto-compile on changes + push undo on structural changes
  editor.addPipe((ctx) => {
    if (['connectioncreated','connectionremoved','nodecreated','noderemoved'].includes(ctx.type)) {
      setTimeout(onChanged, 50);
      if (ctx.type === 'nodecreated' || ctx.type === 'noderemoved') pushUndo(ctx.type);
      if (ctx.type === 'connectioncreated' || ctx.type === 'connectionremoved') pushUndo(ctx.type);

      // Populate widget selectors for newly created nodes
      if (ctx.type === 'nodecreated' && widgetList && widgetList.length > 0) {
        const nodeData = ctx.data as { id: string };
        const node = editor.getNode(nodeData.id);
        if (node && (node as any).widgetSelector && (node as any).widgetSelector instanceof N.WidgetSelectorControl) {
          const selector = (node as any).widgetSelector as N.WidgetSelectorControl;
          selector.setAvailableWidgets(widgetList);
          // Trigger re-render
          setTimeout(() => area.update('node', node.id), 0);
        }
      }
    }
    return ctx;
  });

  // â”€â”€ Tooltips on nodes â€” show description on hover â”€â”€
  area.addPipe((ctx) => {
    if (ctx.type === 'rendered') {
      const d = ctx.data as any;
      if (d.type === 'node' && d.data && d.element) {
        const nodeObj = d.data as ClassicPreset.Node;
        const el = d.element as HTMLElement;
        const cat = getNodeCategory(nodeObj);
        const inputNames = Object.keys(nodeObj.inputs).filter(k => nodeObj.inputs[k]).map(k => `${k}: ${nodeObj.inputs[k]!.socket.name}`);
        const outputNames = Object.keys(nodeObj.outputs).filter(k => nodeObj.outputs[k]).map(k => `${k}: ${nodeObj.outputs[k]!.socket.name}`);
        const tipLines = [`${nodeObj.label} [${cat}]`];
        if (inputNames.length) tipLines.push(`In: ${inputNames.join(', ')}`);
        if (outputNames.length) tipLines.push(`Out: ${outputNames.join(', ')}`);
        el.title = tipLines.join('\n');
        // Apply disabled styling if node is marked disabled
        if ((nodeObj as any).__disabled) {
          el.classList.add('fe-node-disabled');
        }
      }
    }
    return ctx;
  });

  // Save positions when nodes are moved (debounced) + push undo on move
  let _positionSaveTimer: ReturnType<typeof setTimeout> | null = null;
  area.addPipe((ctx) => {
    if (ctx.type === 'nodetranslated') {
      if (_positionSaveTimer) clearTimeout(_positionSaveTimer);
      _positionSaveTimer = setTimeout(() => { onChanged(); pushUndo('move'); }, 300);
    }
    return ctx;
  });

  // Double-click detection on nodes
  {
    let lastPickedId: string | null = null;
    let lastPickedTime = 0;
    area.addPipe((ctx) => {
      if (ctx.type === 'nodepicked') {
        const now = Date.now();
        const nodeId = (ctx.data as any).id as string;
        if (onNodeDoubleClick && nodeId === lastPickedId && now - lastPickedTime < 400) {
          const node = editor.getNode(nodeId);
          if (node) onNodeDoubleClick(node);
          lastPickedId = null;
          lastPickedTime = 0;
        } else {
          lastPickedId = nodeId;
          lastPickedTime = now;
        }

        // Update selection tracking â€” Shift/Ctrl = multi-select, otherwise single select
        const isMulti = _lastPointerEvent?.shiftKey || _lastPointerEvent?.ctrlKey;
        if (!isMulti) selectedNodeIds.clear();
        selectedNodeIds.add(nodeId);
        syncSelectionVisuals();
        // Re-sync after a frame in case Rete re-renders the picked node (z-order change)
        requestAnimationFrame(() => syncSelectionVisuals());
      }
      return ctx;
    });
  }

  // Cleanup helper
  const _cleanup = () => {
    container.removeEventListener('keydown', handleKeyDown);
    commentLayer.remove();
    boxSelRect.remove();
  };
  (area as any).__cleanup = _cleanup;

  return { editor, area, comments, createCommentEl };
}
