/**
 * popout-entry.ts — Entry point running inside each popped-out panel window.
 *
 * Responsibilities:
 *  1. Read `panelId` from the URL search params
 *  2. Build the popout shell (toolbar with title + re-dock button)
 *  3. Listen for content updates from the main window via Tauri events
 *  4. Render the received HTML into the content area
 *  5. Forward user input events (click, input) back to the main window
 *  6. Handle the re-dock button (signal main window, close self)
 */

// Import the same styles used by the main editor so panel content looks identical
import './styles.css';
import 'dockview-core/dist/styles/dockview.css';

import { listen, emit } from '@tauri-apps/api/event';
import { getCurrentWindow } from '@tauri-apps/api/window';

/* ────────────────────────────────────────────────────────────────────
 *  Initialisation
 * ──────────────────────────────────────────────────────────────────── */

const params = new URLSearchParams(window.location.search);
const panelId = params.get('panelId') ?? 'unknown';
const currentWindow = getCurrentWindow();

// References to key DOM elements
const titleEl = document.getElementById('popout-title')!;
const contentEl = document.getElementById('popout-content')!;
const redockBtn = document.getElementById('popout-redock')!;

/* ────────────────────────────────────────────────────────────────────
 *  Title bar drag — let the OS handle it for multi-monitor support
 * ──────────────────────────────────────────────────────────────────── */

const headerEl = document.getElementById('popout-header')!;
headerEl.addEventListener('mousedown', async (e: MouseEvent) => {
  // Don't drag when clicking buttons inside the header
  if ((e.target as HTMLElement).closest('button')) return;
  if (e.button !== 0) return;
  try { await currentWindow.startDragging(); } catch (_) {}
});

/* ────────────────────────────────────────────────────────────────────
 *  Re-dock button
 * ──────────────────────────────────────────────────────────────────── */

redockBtn.addEventListener('click', async () => {
  await emit(`panel-redock-${panelId}`, { panelId });
});

/* ────────────────────────────────────────────────────────────────────
 *  Receive content from main window
 * ──────────────────────────────────────────────────────────────────── */

listen(`panel-content-${panelId}`, (event: any) => {
  const { html, title } = event.payload;
  if (title) {
    titleEl.textContent = title;
    document.title = `${title} — Feather Engine`;
  }
  if (html != null) {
    contentEl.innerHTML = html;
  }
});

/* ────────────────────────────────────────────────────────────────────
 *  Forward user input events back to the main window
 *
 *  We attach delegated listeners on the content area.  When the user
 *  clicks or types in the popout, we identify the target by computing
 *  its CSS selector path and forward that to the main window, which
 *  replays the event on the real (hidden) panel DOM.
 * ──────────────────────────────────────────────────────────────────── */

function selectorPath(el: Element, root: Element): string {
  const parts: string[] = [];
  let cur: Element | null = el;
  while (cur && cur !== root) {
    let seg = cur.tagName.toLowerCase();
    if (cur.id) {
      seg += `#${cur.id}`;
      parts.unshift(seg);
      break;                   // id is unique — no need to go higher
    }
    const parent = cur.parentElement;
    if (parent) {
      const siblings = Array.from(parent.children).filter(
        (c) => c.tagName === cur!.tagName,
      );
      if (siblings.length > 1) {
        seg += `:nth-of-type(${siblings.indexOf(cur) + 1})`;
      }
    }
    parts.unshift(seg);
    cur = cur.parentElement;
  }
  return parts.join(' > ');
}

// Delegate click events
contentEl.addEventListener('click', (e: MouseEvent) => {
  const target = e.target as Element;
  if (!target || target === contentEl) return;
  const selector = selectorPath(target, contentEl);
  emit(`panel-input-${panelId}`, { type: 'click', selector }).catch(() => {});
});

// Delegate input events (text fields, checkboxes, etc.)
contentEl.addEventListener('input', (e: Event) => {
  const target = e.target as HTMLInputElement | HTMLTextAreaElement;
  if (!target) return;
  const selector = selectorPath(target, contentEl);
  emit(`panel-input-${panelId}`, {
    type: 'input',
    selector,
    value: target.value,
  }).catch(() => {});
});

/* ────────────────────────────────────────────────────────────────────
 *  Window close override — ask main window to re-dock instead of
 *  just disappearing.
 * ──────────────────────────────────────────────────────────────────── */

currentWindow.listen('tauri://close-requested', async () => {
  await emit(`panel-redock-${panelId}`, { panelId });
});

/* ────────────────────────────────────────────────────────────────────
 *  Announce readiness
 * ──────────────────────────────────────────────────────────────────── */

emit(`panel-popout-ready-${panelId}`, { panelId }).catch(() => {});

console.log(`[Popout] Panel "${panelId}" initialised`);
