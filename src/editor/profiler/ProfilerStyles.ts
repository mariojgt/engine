// ============================================================
//  ProfilerStyles — Injects the complete profiler CSS into
//  the document. Called once when the profiler panel mounts.
//  Dark industrial AAA-grade theme.
// ============================================================

let _injected = false;

export function injectProfilerStyles(): void {
  if (_injected) return;
  _injected = true;

  const style = document.createElement('style');
  style.id = 'profiler-styles';
  style.textContent = PROFILER_CSS;
  document.head.appendChild(style);
}

const PROFILER_CSS = /* css */ `
/* ═══════════════════════════════════════════════════════════
   PROFILER — Root
   ═══════════════════════════════════════════════════════════ */

.profiler-root {
  width: 100%; height: 100%;
  display: flex; flex-direction: column;
  background: #0d0d0d;
  color: #ccc;
  font-family: 'JetBrains Mono', 'Fira Code', 'Cascadia Code', 'Consolas', monospace;
  font-size: 11px;
  overflow: hidden;
  user-select: none;
  position: relative;
}

/* ═══════════════════════════════════════════════════════════
   TOP BAR — Recording Controls + Global Search
   ═══════════════════════════════════════════════════════════ */

.profiler-topbar {
  display: flex; align-items: center; gap: 8px;
  padding: 6px 10px;
  background: #111;
  border-bottom: 1px solid #222;
  flex-shrink: 0;
  min-height: 36px;
}

.profiler-topbar-title {
  font-size: 12px; font-weight: 600;
  color: #e0e0e0;
  letter-spacing: 0.5px;
  white-space: nowrap;
}

.profiler-rec-btn {
  display: flex; align-items: center; gap: 5px;
  padding: 4px 12px;
  border: 1px solid #333;
  border-radius: 4px;
  font-family: inherit; font-size: 11px;
  cursor: pointer;
  transition: all 0.15s ease;
  color: #ccc;
  background: #1a1a1a;
}
.profiler-rec-btn:hover { background: #252525; border-color: #444; }
.profiler-rec-btn.recording {
  background: #3a1111;
  border-color: #e74c3c;
  color: #ff6b6b;
}
.profiler-rec-btn.recording:hover { background: #4a1818; }

.profiler-rec-dot {
  width: 8px; height: 8px;
  border-radius: 50%;
  background: #e74c3c;
  animation: profiler-pulse 1s ease-in-out infinite;
}
@keyframes profiler-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.3; }
}

.profiler-session-label {
  color: #888;
  font-size: 10px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 180px;
}

.profiler-global-search {
  margin-left: auto;
  display: flex; align-items: center;
  background: #1a1a1a;
  border: 1px solid #2a2a2a;
  border-radius: 4px;
  padding: 3px 8px;
  gap: 5px;
  min-width: 200px;
}
.profiler-global-search input {
  background: transparent; border: none; outline: none;
  color: #ccc; font-family: inherit; font-size: 11px;
  width: 100%;
}
.profiler-global-search input::placeholder { color: #555; }
.profiler-global-search svg { opacity: 0.4; flex-shrink: 0; }

/* ═══════════════════════════════════════════════════════════
   METRICS BAR — Live Gauges
   ═══════════════════════════════════════════════════════════ */

.profiler-metrics-bar {
  display: flex; gap: 4px;
  padding: 5px 10px;
  background: #0f0f0f;
  border-bottom: 1px solid #1e1e1e;
  flex-shrink: 0;
  overflow-x: auto;
  scrollbar-width: none;
}
.profiler-metrics-bar::-webkit-scrollbar { display: none; }

.profiler-metric-card {
  display: flex; flex-direction: column;
  padding: 5px 10px;
  background: #151515;
  border: 1px solid #222;
  border-radius: 4px;
  min-width: 110px;
  flex: 1;
  position: relative;
  overflow: hidden;
  transition: border-color 0.3s ease;
}
.profiler-metric-card.warn { border-color: #f39c12; }
.profiler-metric-card.critical { border-color: #e74c3c; }

.profiler-metric-label {
  font-size: 9px; font-weight: 500;
  color: #666;
  text-transform: uppercase;
  letter-spacing: 0.8px;
  margin-bottom: 2px;
}
.profiler-metric-value {
  font-size: 16px; font-weight: 700;
  color: #e0e0e0;
  line-height: 1.1;
  transition: color 0.3s ease;
}
.profiler-metric-card.warn .profiler-metric-value { color: #f39c12; }
.profiler-metric-card.critical .profiler-metric-value { color: #e74c3c; }

.profiler-sparkline {
  position: absolute; bottom: 0; left: 0; right: 0;
  height: 18px;
  opacity: 0.3;
}
.profiler-sparkline svg { width: 100%; height: 100%; }

/* ═══════════════════════════════════════════════════════════
   BODY — Main Content Area (tabs + sidebar)
   ═══════════════════════════════════════════════════════════ */

.profiler-body {
  display: flex; flex: 1;
  overflow: hidden;
  min-height: 0;
  position: relative;
}

/* ── Sessions Sidebar ─────────────────────────────────── */

.profiler-sidebar {
  width: 200px; min-width: 160px;
  background: #111;
  border-right: 1px solid #222;
  display: flex; flex-direction: column;
  flex-shrink: 0;
  min-height: 0;
}
.profiler-sidebar-header {
  padding: 8px 10px;
  font-size: 10px; font-weight: 600;
  color: #888;
  text-transform: uppercase;
  letter-spacing: 1px;
  border-bottom: 1px solid #1e1e1e;
}
.profiler-sidebar-list {
  flex: 1; overflow-y: auto;
  min-height: 0;
  scrollbar-width: thin;
  scrollbar-color: #333 transparent;
}
.profiler-session-item {
  display: flex; flex-direction: column;
  padding: 6px 10px;
  border-bottom: 1px solid #1a1a1a;
  cursor: pointer;
  transition: background 0.1s ease;
}
.profiler-session-item:hover { background: #1a1a1a; }
.profiler-session-item.active { background: #1a2a1a; border-left: 2px solid #2ecc71; }
.profiler-session-item-name {
  font-size: 11px; font-weight: 500;
  color: #ccc;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.profiler-session-item-meta {
  font-size: 9px; color: #555;
  margin-top: 2px;
}
.profiler-session-actions {
  display: flex; gap: 4px; margin-top: 4px;
}
.profiler-session-actions button {
  padding: 1px 6px;
  font-size: 9px;
  background: #1a1a1a;
  border: 1px solid #2a2a2a;
  border-radius: 3px;
  color: #888;
  cursor: pointer;
  font-family: inherit;
  transition: all 0.1s ease;
}
.profiler-session-actions button:hover { background: #252525; color: #ccc; }
.profiler-session-actions .delete:hover { color: #e74c3c; border-color: #e74c3c; }

/* ── Main Tab Area ────────────────────────────────────── */

.profiler-main {
  flex: 1; display: flex; flex-direction: column;
  overflow: hidden;
  min-height: 0;
  position: relative;
}

/* Tab strip */
.profiler-tabs {
  display: flex; gap: 0;
  background: #111;
  border-bottom: 1px solid #222;
  flex-shrink: 0;
}
.profiler-tab {
  padding: 7px 14px;
  font-size: 11px; font-weight: 500;
  color: #666;
  cursor: pointer;
  border-bottom: 2px solid transparent;
  transition: all 0.15s ease;
  white-space: nowrap;
}
.profiler-tab:hover { color: #aaa; background: #151515; }
.profiler-tab.active {
  color: #e0e0e0;
  border-bottom-color: #3498db;
  background: #151515;
}

/* Tab search bar */
.profiler-tab-search {
  display: flex; align-items: center;
  padding: 5px 10px;
  background: #111;
  border-bottom: 1px solid #1e1e1e;
  gap: 6px;
  flex-shrink: 0;
}
.profiler-tab-search input {
  background: #1a1a1a; border: 1px solid #2a2a2a;
  border-radius: 4px;
  color: #ccc; font-family: inherit; font-size: 11px;
  padding: 4px 8px; flex: 1; outline: none;
}
.profiler-tab-search input:focus { border-color: #3498db; }

/* Tab content */
.profiler-tab-content {
  flex: 1; overflow-y: auto;
  min-height: 0;
  scrollbar-width: thin;
  scrollbar-color: #333 transparent;
}

/* ═══════════════════════════════════════════════════════════
   DATA TABLE — Shared table styling
   ═══════════════════════════════════════════════════════════ */

.profiler-table {
  width: 100%; border-collapse: collapse;
  font-size: 11px;
}
.profiler-table thead {
  position: sticky; top: 0; z-index: 2;
  background: #151515;
}
.profiler-table th {
  padding: 6px 8px;
  text-align: left;
  font-weight: 600;
  color: #777;
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  border-bottom: 1px solid #252525;
  cursor: pointer;
  white-space: nowrap;
  user-select: none;
  transition: color 0.1s ease;
}
.profiler-table th:hover { color: #bbb; }
.profiler-table th.sorted { color: #3498db; }
.profiler-table th .sort-arrow { margin-left: 3px; font-size: 8px; }

.profiler-table td {
  padding: 4px 8px;
  border-bottom: 1px solid #1a1a1a;
  color: #bbb;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 200px;
  transition: background 0.15s ease;
}
.profiler-table tr { cursor: pointer; transition: background 0.1s ease; }
.profiler-table tbody tr:hover { background: #1a1a1a; }
.profiler-table tbody tr.selected { background: #1a2433; }

/* Newly spawned actor flash */
.profiler-table tbody tr.newly-spawned {
  animation: profiler-spawn-flash 2s ease-out;
}
@keyframes profiler-spawn-flash {
  0% { background: rgba(46, 204, 113, 0.3); }
  100% { background: transparent; }
}

/* ═══════════════════════════════════════════════════════════
   STATUS BADGES
   ═══════════════════════════════════════════════════════════ */

.profiler-badge {
  display: inline-block;
  padding: 1px 6px;
  border-radius: 3px;
  font-size: 9px;
  font-weight: 600;
  letter-spacing: 0.5px;
  text-transform: uppercase;
}
.profiler-badge.active { background: rgba(46,204,113,0.15); color: #2ecc71; }
.profiler-badge.idle { background: rgba(149,165,166,0.15); color: #95a5a6; }
.profiler-badge.spawning { background: rgba(243,156,18,0.15); color: #f39c12; }
.profiler-badge.destroying { background: rgba(231,76,60,0.15); color: #e74c3c; }

/* Event type badges */
.profiler-event-badge {
  display: inline-block;
  padding: 1px 6px;
  border-radius: 3px;
  font-size: 9px;
  font-weight: 600;
  color: #fff;
}

/* Node type badges */
.profiler-node-type {
  display: inline-block;
  padding: 1px 6px;
  border-radius: 3px;
  font-size: 9px;
  font-weight: 600;
}
.profiler-node-type.entry { background: rgba(231,76,60,0.2); color: #e74c3c; }
.profiler-node-type.action { background: rgba(52,152,219,0.2); color: #3498db; }
.profiler-node-type.condition { background: rgba(243,156,18,0.2); color: #f39c12; }
.profiler-node-type.event { background: rgba(155,89,182,0.2); color: #9b59b6; }
.profiler-node-type.math { background: rgba(46,204,113,0.2); color: #2ecc71; }
.profiler-node-type.custom { background: rgba(149,165,166,0.2); color: #95a5a6; }
/* Extended node categories */
.profiler-node-type.flow { background: rgba(26,188,156,0.2); color: #1abc9c; }
.profiler-node-type.function { background: rgba(99,102,241,0.2); color: #6366f1; }
.profiler-node-type.movement { background: rgba(14,165,233,0.2); color: #0ea5e9; }
.profiler-node-type.transform { background: rgba(245,158,11,0.2); color: #f59e0b; }
.profiler-node-type.physics { background: rgba(239,68,68,0.2); color: #ef4444; }
.profiler-node-type.audio { background: rgba(236,72,153,0.2); color: #ec4899; }
.profiler-node-type.ui { background: rgba(6,182,212,0.2); color: #06b6d4; }
.profiler-node-type.timer { background: rgba(132,204,22,0.2); color: #84cc16; }
.profiler-node-type.variable { background: rgba(100,116,139,0.2); color: #94a3b8; }
.profiler-node-type.ai { background: rgba(139,92,246,0.2); color: #8b5cf6; }
.profiler-node-type.animation { background: rgba(217,70,239,0.2); color: #d946ef; }
.profiler-node-type.camera { background: rgba(16,185,129,0.2); color: #10b981; }
.profiler-node-type.debug { background: rgba(249,115,22,0.2); color: #f97316; }
.profiler-node-type.scene { background: rgba(244,63,94,0.2); color: #f43f5e; }
.profiler-node-type.savegame { background: rgba(163,230,53,0.2); color: #a3e635; }
.profiler-node-type.input { background: rgba(71,85,105,0.2); color: #94a3b8; }
.profiler-node-type.light { background: rgba(234,179,8,0.2); color: #eab308; }

/* ═══════════════════════════════════════════════════════════
   MINI BAR CHART — inline sparkline in table cells
   ═══════════════════════════════════════════════════════════ */

.profiler-mini-bar {
  display: inline-flex; align-items: flex-end;
  gap: 1px; height: 14px;
  vertical-align: middle;
  margin-left: 4px;
}
.profiler-mini-bar-seg {
  width: 2px;
  background: #3498db;
  border-radius: 1px 1px 0 0;
  opacity: 0.6;
  transition: height 0.1s ease;
}

/* ═══════════════════════════════════════════════════════════
   DETAIL SIDE PANEL — slides in from the right
   ═══════════════════════════════════════════════════════════ */

.profiler-detail-panel {
  position: absolute;
  top: 0; right: 0; bottom: 0;
  width: 340px;
  background: #111;
  border-left: 1px solid #2a2a2a;
  display: flex; flex-direction: column;
  transform: translateX(100%);
  transition: transform 0.2s ease;
  z-index: 10;
  overflow: hidden;
}
.profiler-detail-panel.open {
  transform: translateX(0);
}

.profiler-detail-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 8px 12px;
  background: #151515;
  border-bottom: 1px solid #222;
  flex-shrink: 0;
}
.profiler-detail-title {
  font-size: 12px; font-weight: 600; color: #e0e0e0;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.profiler-detail-close {
  background: none; border: none;
  color: #666; font-size: 16px;
  cursor: pointer; padding: 2px 6px;
  border-radius: 3px;
  transition: all 0.1s ease;
}
.profiler-detail-close:hover { color: #ccc; background: #222; }

.profiler-detail-body {
  flex: 1; overflow-y: auto; padding: 10px;
  scrollbar-width: thin;
  scrollbar-color: #333 transparent;
}

.profiler-detail-section {
  margin-bottom: 14px;
}
.profiler-detail-section-title {
  font-size: 10px; font-weight: 600;
  color: #666; text-transform: uppercase;
  letter-spacing: 0.8px;
  margin-bottom: 6px;
  padding-bottom: 4px;
  border-bottom: 1px solid #1e1e1e;
}

.profiler-detail-row {
  display: flex; justify-content: space-between;
  padding: 3px 0;
  font-size: 11px;
}
.profiler-detail-row-label { color: #777; }
.profiler-detail-row-value { color: #ccc; font-weight: 500; }

/* Component tree in detail panel */
.profiler-comp-tree { list-style: none; padding: 0; margin: 0; }
.profiler-comp-tree-item {
  display: flex; align-items: center; gap: 6px;
  padding: 3px 0 3px 12px;
  font-size: 11px; color: #bbb;
  border-left: 1px solid #2a2a2a;
}
.profiler-comp-tree-item::before {
  content: '├'; color: #444; font-size: 10px;
}
.profiler-comp-tree-icon {
  display: inline-block;
  width: 6px; height: 6px;
  border-radius: 2px;
  flex-shrink: 0;
}

/* Call chain list */
.profiler-call-chain { list-style: none; padding: 0; margin: 0; }
.profiler-call-chain-item {
  display: flex; align-items: center; gap: 6px;
  padding: 3px 0 3px 8px;
  font-size: 11px; color: #bbb;
}
.profiler-call-chain-item::before {
  content: '→'; color: #3498db; font-weight: bold; font-size: 10px;
}

/* ═══════════════════════════════════════════════════════════
   VIEWPORT ACTOR OVERLAYS
   ═══════════════════════════════════════════════════════════ */

.profiler-overlay-container {
  position: absolute;
  top: 0; left: 0;
  width: 100%; height: 100%;
  pointer-events: none;
  z-index: 100;
  overflow: hidden;
}
.profiler-actor-label {
  position: absolute;
  background: rgba(13,13,13,0.85);
  border: 1px solid #333;
  border-radius: 3px;
  padding: 2px 6px;
  font-family: 'JetBrains Mono', monospace;
  font-size: 9px;
  color: #ccc;
  white-space: nowrap;
  pointer-events: auto;
  cursor: pointer;
  transition: border-color 0.15s ease;
  display: flex; align-items: center; gap: 4px;
}
.profiler-actor-label:hover {
  border-color: #3498db;
  background: rgba(13,13,13,0.95);
}
.profiler-actor-label .status-dot {
  width: 5px; height: 5px;
  border-radius: 50%;
  flex-shrink: 0;
}
.profiler-actor-label .actor-name { color: #e0e0e0; font-weight: 600; }
.profiler-actor-label .actor-class { color: #666; margin-left: 4px; }

/* ═══════════════════════════════════════════════════════════
   SEARCH HIGHLIGHT
   ═══════════════════════════════════════════════════════════ */

.profiler-highlight {
  background: rgba(52, 152, 219, 0.3);
  border-radius: 2px;
  padding: 0 1px;
}

/* ═══════════════════════════════════════════════════════════
   EMPTY STATE
   ═══════════════════════════════════════════════════════════ */

.profiler-empty {
  display: flex; flex-direction: column;
  align-items: center; justify-content: center;
  height: 100%;
  color: #444;
  font-size: 12px;
  gap: 8px;
}
.profiler-empty-icon { font-size: 32px; opacity: 0.2; }

/* ═══════════════════════════════════════════════════════════
   SCROLLBAR
   ═══════════════════════════════════════════════════════════ */

.profiler-root ::-webkit-scrollbar { width: 6px; height: 6px; }
.profiler-root ::-webkit-scrollbar-track { background: transparent; }
.profiler-root ::-webkit-scrollbar-thumb {
  background: #333; border-radius: 3px;
}
.profiler-root ::-webkit-scrollbar-thumb:hover { background: #444; }

/* ═══════════════════════════════════════════════════════════
   RESIZE HANDLE (between sidebar and main)
   ═══════════════════════════════════════════════════════════ */

.profiler-resize-handle {
  width: 4px;
  cursor: col-resize;
  background: transparent;
  transition: background 0.15s ease;
  flex-shrink: 0;
}
.profiler-resize-handle:hover { background: #3498db; }

/* ═══════════════════════════════════════════════════════════
   REPLAY BANNER
   ═══════════════════════════════════════════════════════════ */

.profiler-replay-banner {
  display: flex; align-items: center; gap: 8px;
  padding: 4px 10px;
  background: #1a2a1a;
  border-bottom: 1px solid #2ecc71;
  color: #2ecc71;
  font-size: 11px; font-weight: 500;
  flex-shrink: 0;
}
.profiler-replay-banner button {
  padding: 2px 8px;
  background: transparent;
  border: 1px solid #2ecc71;
  border-radius: 3px;
  color: #2ecc71;
  font-family: inherit; font-size: 10px;
  cursor: pointer;
  transition: all 0.1s ease;
}
.profiler-replay-banner button:hover {
  background: #2ecc71; color: #111;
}
`;
