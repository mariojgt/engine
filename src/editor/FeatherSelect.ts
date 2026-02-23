/**
 * FeatherSelect — Custom Select Replacement for Feather Engine
 *
 * Automatically upgrades all native <select> elements into custom-styled
 * dropdowns that look consistent across all operating systems.
 *
 * Usage: import once at entry point:
 *   import { initFeatherSelect } from './editor/FeatherSelect';
 *   initFeatherSelect();
 *
 * Every <select> in the DOM (existing and future) will be auto-wrapped.
 * The native <select> is hidden but still holds the real value — so all
 * existing `select.value`, `select.addEventListener('change', ...)` code
 * continues to work unchanged.
 */

const UPGRADED_ATTR = 'data-fe-select';
const WRAPPER_CLASS = 'fe-select';
const OPEN_CLASS = 'fe-select--open';
const DISABLED_CLASS = 'fe-select--disabled';
const DISPLAY_CLASS = 'fe-select__display';
const CHEVRON_CLASS = 'fe-select__chevron';
const DROPDOWN_CLASS = 'fe-select__dropdown';
const OPTION_CLASS = 'fe-select__option';
const OPTION_ACTIVE_CLASS = 'fe-select__option--active';
const OPTION_HIGHLIGHT_CLASS = 'fe-select__option--highlight';
const SEARCH_CLASS = 'fe-select__search';
const EMPTY_CLASS = 'fe-select__empty';
const DIVIDER_CLASS = 'fe-select__divider';
const GROUP_CLASS = 'fe-select__group-label';

// Minimum option count to show search (0 = always show)
const SEARCH_THRESHOLD = 0;

// SVG chevron icon
const CHEVRON_SVG = `<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>`;

// SVG check icon
const CHECK_SVG = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`;

// SVG search icon  
const SEARCH_SVG = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>`;

interface FeatherSelectInstance {
  wrapper: HTMLDivElement;
  display: HTMLDivElement;
  dropdown: HTMLDivElement | null;
  native: HTMLSelectElement;
  destroy: () => void;
}

const instances = new WeakMap<HTMLSelectElement, FeatherSelectInstance>();

/** Upgrade a single <select> into a FeatherSelect */
function upgradeSelect(native: HTMLSelectElement): void {
  // Skip if already upgraded
  if (native.hasAttribute(UPGRADED_ATTR)) return;
  // Skip selects explicitly flagged to stay native
  if (native.hasAttribute('data-native-select')) return;
  // Skip if inside a FeatherSelect (avoid recursion)
  if (native.closest(`.${WRAPPER_CLASS}`)) return;

  native.setAttribute(UPGRADED_ATTR, 'true');

  // ── Create wrapper ──
  const wrapper = document.createElement('div');
  wrapper.className = WRAPPER_CLASS;

  // Transfer some sizing from the native element
  if (native.style.flex) wrapper.style.flex = native.style.flex;
  if (native.style.width) wrapper.style.width = native.style.width;
  if (native.style.minWidth) wrapper.style.minWidth = native.style.minWidth;
  if (native.style.maxWidth) wrapper.style.maxWidth = native.style.maxWidth;

  // Copy relevant classes from native to wrapper for styling hooks
  const nativeClasses = Array.from(native.classList);
  for (const cls of nativeClasses) {
    if (cls.includes('select') || cls.includes('prop-') || cls.includes('wbp-') || cls.includes('cb-') || cls.includes('struct-') || cls.includes('enum-')) {
      wrapper.classList.add(`fe-${cls}`);
    }
  }

  // If native has flex:1 or similar, propagate
  const computedStyle = getComputedStyle(native);
  if (computedStyle.flex && computedStyle.flex !== '0 1 auto') {
    wrapper.style.flex = computedStyle.flex;
  }

  // ── Create display button ──
  const display = document.createElement('div');
  display.className = DISPLAY_CLASS;
  display.tabIndex = 0;

  const label = document.createElement('span');
  label.className = 'fe-select__label';

  const chevron = document.createElement('span');
  chevron.className = CHEVRON_CLASS;
  chevron.innerHTML = CHEVRON_SVG;

  display.appendChild(label);
  display.appendChild(chevron);

  // ── Hide native & insert wrapper ──
  native.style.position = 'absolute';
  native.style.opacity = '0';
  native.style.pointerEvents = 'none';
  native.style.width = '0';
  native.style.height = '0';
  native.style.overflow = 'hidden';
  native.style.border = 'none';
  native.style.padding = '0';
  native.style.margin = '0';
  native.tabIndex = -1;

  const parent = native.parentNode;
  if (!parent) return;

  parent.insertBefore(wrapper, native);
  wrapper.appendChild(display);
  wrapper.appendChild(native); // move native inside wrapper

  // ── Update display text ──
  function syncDisplay(): void {
    const selected = native.options[native.selectedIndex];
    label.textContent = selected ? selected.textContent || selected.value : '';
    if (native.disabled) {
      wrapper.classList.add(DISABLED_CLASS);
    } else {
      wrapper.classList.remove(DISABLED_CLASS);
    }
  }
  syncDisplay();

  // ── Option structure from native ──
  interface OptionItem {
    value: string;
    label: string;
    disabled: boolean;
    group?: string;
  }

  function getOptions(): OptionItem[] {
    const items: OptionItem[] = [];
    for (let i = 0; i < native.options.length; i++) {
      const opt = native.options[i];
      const parentEl = opt.parentElement;
      const group = parentEl?.tagName === 'OPTGROUP' ? (parentEl as HTMLOptGroupElement).label : undefined;
      items.push({
        value: opt.value,
        label: opt.textContent || opt.value,
        disabled: opt.disabled,
        group,
      });
    }
    return items;
  }

  // ── Build dropdown ──
  let dropdown: HTMLDivElement | null = null;
  let searchInput: HTMLInputElement | null = null;
  let highlightIndex = -1;
  let optionEls: HTMLDivElement[] = [];
  let allItems: OptionItem[] = [];

  function positionDropdown(): void {
    if (!dropdown) return;
    const rect = wrapper.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    const spaceAbove = rect.top;
    const dropHeight = Math.min(dropdown.scrollHeight, 280);

    if (spaceBelow < dropHeight && spaceAbove > spaceBelow) {
      // Open upward
      dropdown.style.bottom = `${rect.height + 2}px`;
      dropdown.style.top = 'auto';
      dropdown.classList.add('fe-select__dropdown--above');
    } else {
      // Open downward
      dropdown.style.top = `${rect.height + 2}px`;
      dropdown.style.bottom = 'auto';
      dropdown.classList.remove('fe-select__dropdown--above');
    }

    // Width — at least as wide as the trigger
    dropdown.style.minWidth = `${rect.width}px`;
  }

  function open(): void {
    if (native.disabled) return;
    if (dropdown) { close(); return; }

    allItems = getOptions();
    highlightIndex = native.selectedIndex;

    wrapper.classList.add(OPEN_CLASS);

    dropdown = document.createElement('div');
    dropdown.className = DROPDOWN_CLASS;

    // Search bar if many options
    if (allItems.length >= SEARCH_THRESHOLD) {
      const searchWrap = document.createElement('div');
      searchWrap.className = `${SEARCH_CLASS}-wrap`;

      const searchIcon = document.createElement('span');
      searchIcon.className = `${SEARCH_CLASS}-icon`;
      searchIcon.innerHTML = SEARCH_SVG;

      searchInput = document.createElement('input');
      searchInput.className = SEARCH_CLASS;
      searchInput.type = 'text';
      searchInput.placeholder = 'Search…';
      searchInput.autocomplete = 'off';
      searchInput.spellcheck = false;

      searchWrap.appendChild(searchIcon);
      searchWrap.appendChild(searchInput);
      dropdown.appendChild(searchWrap);

      searchInput.addEventListener('input', () => {
        filterOptions(searchInput!.value);
      });

      // Prevent dropdown from closing when clicking search
      searchInput.addEventListener('mousedown', (e) => e.stopPropagation());
    }

    const listWrap = document.createElement('div');
    listWrap.className = 'fe-select__list';
    dropdown.appendChild(listWrap);

    buildOptionList(listWrap, allItems, '');

    wrapper.appendChild(dropdown);

    // Position
    positionDropdown();

    // Scroll active into view
    requestAnimationFrame(() => {
      const activeEl = listWrap.querySelector(`.${OPTION_ACTIVE_CLASS}`);
      if (activeEl) {
        activeEl.scrollIntoView({ block: 'nearest' });
      }
      if (searchInput) searchInput.focus();
    });

    // Close on outside click (next frame so this click doesn't trigger)
    requestAnimationFrame(() => {
      document.addEventListener('mousedown', onOutsideClick, true);
      document.addEventListener('keydown', onKeyDown, true);
    });
  }

  function buildOptionList(container: HTMLElement, items: OptionItem[], filter: string): void {
    container.innerHTML = '';
    optionEls = [];
    let lastGroup = '';
    let visibleCount = 0;

    const lcFilter = filter.toLowerCase();

    for (let i = 0; i < items.length; i++) {
      const item = items[i];

      // Filter
      if (lcFilter && !item.label.toLowerCase().includes(lcFilter) && !item.value.toLowerCase().includes(lcFilter)) {
        continue;
      }

      // Group divider
      if (item.group && item.group !== lastGroup) {
        lastGroup = item.group;
        const grp = document.createElement('div');
        grp.className = GROUP_CLASS;
        grp.textContent = item.group;
        container.appendChild(grp);
      }

      const optDiv = document.createElement('div');
      optDiv.className = OPTION_CLASS;
      if (item.disabled) optDiv.classList.add('fe-select__option--disabled');
      if (i === native.selectedIndex) optDiv.classList.add(OPTION_ACTIVE_CLASS);
      if (i === highlightIndex) optDiv.classList.add(OPTION_HIGHLIGHT_CLASS);

      optDiv.setAttribute('data-index', String(i));
      optDiv.setAttribute('data-value', item.value);

      // Check mark for selected item
      const check = document.createElement('span');
      check.className = 'fe-select__check';
      check.innerHTML = i === native.selectedIndex ? CHECK_SVG : '';
      optDiv.appendChild(check);

      // Label text (with highlight if filtering)
      const optLabel = document.createElement('span');
      optLabel.className = 'fe-select__option-label';
      if (lcFilter && item.label.toLowerCase().includes(lcFilter)) {
        const idx = item.label.toLowerCase().indexOf(lcFilter);
        optLabel.innerHTML =
          escapeHtml(item.label.slice(0, idx)) +
          `<mark class="fe-select__match">${escapeHtml(item.label.slice(idx, idx + lcFilter.length))}</mark>` +
          escapeHtml(item.label.slice(idx + lcFilter.length));
      } else {
        optLabel.textContent = item.label;
      }
      optDiv.appendChild(optLabel);

      optDiv.addEventListener('mousedown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (item.disabled) return;
        selectOption(i);
      });

      optDiv.addEventListener('mouseenter', () => {
        setHighlight(optionEls.indexOf(optDiv));
      });

      container.appendChild(optDiv);
      optionEls.push(optDiv);
      visibleCount++;
    }

    // Empty state
    if (visibleCount === 0) {
      const empty = document.createElement('div');
      empty.className = EMPTY_CLASS;
      empty.textContent = filter ? 'No matches found' : 'No options';
      container.appendChild(empty);
    }
  }

  function filterOptions(query: string): void {
    if (!dropdown) return;
    const listWrap = dropdown.querySelector('.fe-select__list');
    if (!listWrap) return;
    buildOptionList(listWrap as HTMLElement, allItems, query);
    highlightIndex = 0;
    if (optionEls.length > 0) {
      setHighlight(0);
    }
  }

  function setHighlight(idx: number): void {
    optionEls.forEach(el => el.classList.remove(OPTION_HIGHLIGHT_CLASS));
    if (idx >= 0 && idx < optionEls.length) {
      highlightIndex = idx;
      optionEls[idx].classList.add(OPTION_HIGHLIGHT_CLASS);
      optionEls[idx].scrollIntoView({ block: 'nearest' });
    }
  }

  function selectOption(nativeIndex: number): void {
    if (nativeIndex < 0 || nativeIndex >= native.options.length) return;
    native.selectedIndex = nativeIndex;
    // Fire change event
    native.dispatchEvent(new Event('change', { bubbles: true }));
    syncDisplay();
    close();
  }

  function close(): void {
    if (!dropdown) return;
    wrapper.classList.remove(OPEN_CLASS);
    dropdown.classList.add('fe-select__dropdown--closing');
    const dd = dropdown;
    setTimeout(() => {
      dd.remove();
    }, 120);
    dropdown = null;
    searchInput = null;
    optionEls = [];
    document.removeEventListener('mousedown', onOutsideClick, true);
    document.removeEventListener('keydown', onKeyDown, true);
  }

  function onOutsideClick(e: MouseEvent): void {
    if (!wrapper.contains(e.target as Node)) {
      close();
    }
  }

  function onKeyDown(e: KeyboardEvent): void {
    if (!dropdown) return;

    switch (e.key) {
      case 'Escape':
        e.preventDefault();
        e.stopPropagation();
        close();
        display.focus();
        break;
      case 'ArrowDown':
        e.preventDefault();
        e.stopPropagation();
        setHighlight(Math.min(highlightIndex + 1, optionEls.length - 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        e.stopPropagation();
        setHighlight(Math.max(highlightIndex - 1, 0));
        break;
      case 'Enter':
      case ' ':
        if (searchInput && document.activeElement === searchInput && e.key === ' ') break;
        e.preventDefault();
        e.stopPropagation();
        if (highlightIndex >= 0 && highlightIndex < optionEls.length) {
          const idx = parseInt(optionEls[highlightIndex].getAttribute('data-index') || '0', 10);
          selectOption(idx);
        }
        break;
      case 'Tab':
        close();
        break;
    }
  }

  // ── Event Listeners ──
  display.addEventListener('mousedown', (e) => {
    e.preventDefault();
    e.stopPropagation();
    open();
  });

  display.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') {
      e.preventDefault();
      open();
    }
  });

  // Watch for programmatic changes to the native select
  const observer = new MutationObserver(() => {
    syncDisplay();
  });
  observer.observe(native, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['disabled', 'selected'],
  });

  // Also listen for 'change' events dispatched programmatically
  native.addEventListener('change', syncDisplay);

  // ── Store instance ──
  const instance: FeatherSelectInstance = {
    wrapper,
    display,
    dropdown: null,
    native,
    destroy: () => {
      observer.disconnect();
      native.removeEventListener('change', syncDisplay);
      document.removeEventListener('mousedown', onOutsideClick, true);
      document.removeEventListener('keydown', onKeyDown, true);
      close();
      // Restore native
      native.style.position = '';
      native.style.opacity = '';
      native.style.pointerEvents = '';
      native.style.width = '';
      native.style.height = '';
      native.style.overflow = '';
      native.style.border = '';
      native.style.padding = '';
      native.style.margin = '';
      native.tabIndex = 0;
      native.removeAttribute(UPGRADED_ATTR);
      parent.insertBefore(native, wrapper);
      wrapper.remove();
      instances.delete(native);
    }
  };
  instances.set(native, instance);
}

function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Upgrade all existing selects in a root */
function upgradeAll(root: ParentNode = document): void {
  const selects = root.querySelectorAll('select:not([data-fe-select]):not([data-native-select])');
  selects.forEach(sel => upgradeSelect(sel as HTMLSelectElement));
}

/** Global MutationObserver to auto-upgrade new selects */
let globalObserver: MutationObserver | null = null;

export function initFeatherSelect(): void {
  // Upgrade existing
  upgradeAll();

  // Watch for new selects
  if (globalObserver) return;

  globalObserver = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (node instanceof HTMLSelectElement) {
          // Small delay to ensure the select is fully populated with options
          requestAnimationFrame(() => upgradeSelect(node));
        } else if (node instanceof HTMLElement) {
          const selects = node.querySelectorAll('select:not([data-fe-select]):not([data-native-select])');
          if (selects.length) {
            requestAnimationFrame(() => {
              selects.forEach(sel => upgradeSelect(sel as HTMLSelectElement));
            });
          }
        }
      }
    }
  });

  globalObserver.observe(document.body, {
    childList: true,
    subtree: true,
  });
}

/** Manually upgrade a specific select (useful for dynamically created ones) */
export function featherSelect(el: HTMLSelectElement): void {
  upgradeSelect(el);
}

/** Destroy a specific FeatherSelect instance */
export function destroyFeatherSelect(el: HTMLSelectElement): void {
  const inst = instances.get(el);
  if (inst) inst.destroy();
}

/** Force refresh display text of a FeatherSelect (e.g., after programmatically changing options) */
export function refreshFeatherSelect(el: HTMLSelectElement): void {
  const inst = instances.get(el);
  if (inst) {
    const selected = el.options[el.selectedIndex];
    const label = inst.display.querySelector('.fe-select__label');
    if (label) {
      label.textContent = selected ? selected.textContent || selected.value : '';
    }
  }
}
