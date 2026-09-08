/* Code Nest Project Notebook Store V0.6.1 */
(() => {
  'use strict';

  const DB = 'CodeNestDB';
  const DB_VERSION = 3;
  const NOTEBOOKS = 'notebooks';
  const PROJECTS = 'projects';
  const params = new URLSearchParams(location.search);
  const projectId = (params.get('project') || 'default').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 80) || 'default';
  const starter = [{
    type: 'code',
    name: 'cell.py',
    source: 'print("Hello from Code Nest!")\n\nx = 2 + 3\nprint("2 + 3 =", x)',
    output: ''
  }];

  let dbPromise = null;
  let saveTimer = null;
  let restoring = false;

  function clone(value) {
    try { return structuredClone(value); }
    catch (_) { return JSON.parse(JSON.stringify(value)); }
  }

  function openDb() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(PROJECTS)) db.createObjectStore(PROJECTS, { keyPath: 'id' });
        if (!db.objectStoreNames.contains(NOTEBOOKS)) db.createObjectStore(NOTEBOOKS, { keyPath: 'id' });
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error('IndexedDB open failed'));
    });
    return dbPromise;
  }

  function get(store, id) {
    return openDb().then((db) => new Promise((resolve, reject) => {
      const tx = db.transaction(store, 'readonly');
      const request = tx.objectStore(store).get(id);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error || new Error('IndexedDB read failed'));
    }));
  }

  function put(store, value) {
    return openDb().then((db) => new Promise((resolve, reject) => {
      const tx = db.transaction(store, 'readwrite');
      tx.objectStore(store).put(value);
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error || new Error('IndexedDB write failed'));
      tx.onabort = () => reject(tx.error || new Error('IndexedDB transaction aborted'));
    }));
  }

  function snapshotDom() {
    return {
      title: document.getElementById('titleInput')?.value || 'Untitled Project',
      cells: [...document.querySelectorAll('#cells .cell')].map((cell) => ({
        type: cell.dataset.type || 'code',
        name: cell.querySelector('.cell-name')?.value || '',
        source: cell.querySelector('textarea')?.value || '',
        output: cell.querySelector('.output')?.textContent || cell.querySelector('.terminal-output')?.textContent || ''
      }))
    };
  }

  async function ensureProject() {
    let meta = await get(PROJECTS, projectId);
    if (meta) return meta;
    const now = Date.now();
    meta = {
      id: projectId,
      title: params.get('name') || 'Untitled Project',
      createdAt: now,
      updatedAt: now,
      order: 0
    };
    await put(PROJECTS, meta);
    return meta;
  }

  async function saveNow() {
    if (restoring) return;
    const notebook = snapshotDom();
    const now = Date.now();
    try {
      const meta = await ensureProject();
      await put(NOTEBOOKS, {
        id: projectId,
        title: notebook.title || meta.title || 'Untitled Project',
        cells: clone(notebook.cells),
        updatedAt: now
      });
      await put(PROJECTS, {
        ...meta,
        title: notebook.title || meta.title || 'Untitled Project',
        updatedAt: now
      });
      const state = document.getElementById('saveState');
      if (state) state.textContent = '保存済み';
      console.log('[Code Nest Project Notebook] saved', { projectId, cells: notebook.cells.length });
    } catch (error) {
      const state = document.getElementById('saveState');
      if (state) state.textContent = '保存失敗';
      console.error('[Code Nest Project Notebook] save failed', error);
    }
  }

  function scheduleSave() {
    if (restoring) return;
    const state = document.getElementById('saveState');
    if (state) state.textContent = '保存中…';
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => { void saveNow(); }, 180);
  }

  function setCellValue(cell, saved) {
    const name = cell?.querySelector('.cell-name');
    const area = cell?.querySelector('textarea');
    const out = cell?.querySelector('.output, .terminal-output');
    if (name && saved.type === 'code') {
      name.value = saved.name || 'cell.py';
      if (typeof window.updateCellLanguage === 'function') window.updateCellLanguage(cell);
    }
    if (area) area.value = saved.source || '';
    if (out && saved.output) {
      out.textContent = saved.output;
      out.classList.add('visible');
      if (saved.type === 'terminal') out.dataset.history = saved.output;
    }
  }

  async function restoreNotebook() {
    const stored = await get(NOTEBOOKS, projectId);
    const notebook = stored && Array.isArray(stored.cells)
      ? stored
      : { title: (await ensureProject()).title || 'Untitled Project', cells: clone(starter) };

    const cellsRoot = document.getElementById('cells');
    if (!cellsRoot) return;

    restoring = true;
    try {
      cellsRoot.querySelectorAll('.cell').forEach((cell) => cell.remove());
      for (const saved of notebook.cells) {
        const type = saved.type === 'markdown' ? 'markdown' : saved.type === 'terminal' ? 'terminal' : 'code';
        let cell = null;
        if (typeof window.addCell === 'function') {
          cell = window.addCell(type, '', '', saved.name || 'cell.py');
        } else {
          const button = document.getElementById(type === 'code' ? 'addCodeBtn' : type === 'markdown' ? 'addMarkdownBtn' : 'addTerminalBtn');
          button?.click();
          cell = cellsRoot.lastElementChild;
        }
        setCellValue(cell, { ...saved, type });
      }

      const title = document.getElementById('titleInput');
      if (title) title.value = notebook.title || 'Untitled Project';
      const crumb = document.getElementById('crumbTitle');
      if (crumb) crumb.textContent = notebook.title || 'Untitled Project';
      if (typeof window.updateStats === 'function') window.updateStats();
    } finally {
      restoring = false;
    }
  }

  document.addEventListener('input', (event) => {
    if (restoring) return;
    const target = event.target;
    if (target?.closest?.('#cells') || target?.closest?.('#titleInput')) scheduleSave();
  }, true);

  document.addEventListener('click', (event) => {
    if (restoring) return;
    const target = event.target;
    if (target?.closest?.('#cells [data-act], #addCodeBtn, #addMarkdownBtn, #addTerminalBtn, #bottomAddBtn, #starterBtn')) {
      setTimeout(() => scheduleSave(), 30);
    }
  }, true);

  // Save as early as possible when leaving the project, especially when
  // clicking the Studio brand button that immediately navigates to Dashboard.
  document.addEventListener('pointerdown', (event) => {
    if (restoring) return;
    if (event.target?.closest?.('.sidebar .brand')) {
      clearTimeout(saveTimer);
      void saveNow();
    }
  }, true);

  window.addEventListener('pagehide', () => { void saveNow(); });
  window.addEventListener('beforeunload', () => { void saveNow(); });

  async function main() {
    try {
      await restoreNotebook();
      const state = document.getElementById('saveState');
      if (state) state.textContent = '保存済み';
      const storage = document.getElementById('storageState');
      if (storage) storage.textContent = 'IndexedDB';
      console.log('[Code Nest Project Notebook] V0.6.1 ready', { projectId });
    } catch (error) {
      console.error('[Code Nest Project Notebook] startup failed', error);
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', main, { once: true });
  else void main();
})();
