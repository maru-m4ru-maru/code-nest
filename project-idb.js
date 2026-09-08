/* Code Nest IndexedDB Project Store V0.5.0 */
(() => {
  'use strict';

  const DB_NAME = 'CodeNestDB';
  const DB_VERSION = 1;
  const NOTEBOOK_STORE = 'notebooks';
  const FS_STORE = 'filesystems';
  const PROJECT_META = 'projects';
  const PROJECT_PREFIX = 'codeNest.project.';
  const OLD_NOTEBOOK_KEY = 'code-nest-v02';
  const OLD_FS_KEY = 'code-nest-fs-v02';
  const params = new URLSearchParams(location.search);
  const projectId = (params.get('project') || 'default').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 80) || 'default';

  let dbPromise;
  let restoring = false;
  let saveTimer = null;
  let lastSavedSignature = '';

  const starter = [{
    type: 'code',
    name: 'cell.py',
    source: 'print("Hello from Code Nest!")\n\nx = 2 + 3\nprint("2 + 3 =", x)',
    output: ''
  }];

  function openDb() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(PROJECT_META)) db.createObjectStore(PROJECT_META, { keyPath: 'id' });
        if (!db.objectStoreNames.contains(NOTEBOOK_STORE)) db.createObjectStore(NOTEBOOK_STORE, { keyPath: 'id' });
        if (!db.objectStoreNames.contains(FS_STORE)) db.createObjectStore(FS_STORE, { keyPath: 'id' });
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error('IndexedDB open failed'));
    });
    return dbPromise;
  }

  async function get(storeName, id) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readonly');
      const req = tx.objectStore(storeName).get(id);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error || new Error('IndexedDB read failed'));
    });
  }

  async function put(storeName, value) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readwrite');
      tx.objectStore(storeName).put(value);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error || new Error('IndexedDB write failed'));
    });
  }

  function readLocal(key) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    } catch (_) {
      return null;
    }
  }

  function currentNotebookFromDom() {
    const title = document.getElementById('titleInput')?.value || 'Untitled Project';
    const cells = [...document.querySelectorAll('#cells .cell')].map((cell) => ({
      type: cell.dataset.type || 'code',
      name: cell.querySelector('.cell-name')?.value || '',
      source: cell.querySelector('textarea')?.value || '',
      output: cell.querySelector('.output')?.textContent || cell.querySelector('.terminal-output')?.textContent || ''
    }));
    return { title, cells };
  }

  function signature(value) {
    try { return JSON.stringify(value); } catch (_) { return ''; }
  }

  async function saveNotebook() {
    if (restoring) return;
    const notebook = currentNotebookFromDom();
    const nextSig = signature(notebook);
    if (!nextSig || nextSig === lastSavedSignature) return;
    lastSavedSignature = nextSig;
    try {
      await put(NOTEBOOK_STORE, { id: projectId, ...notebook, updatedAt: Date.now() });
      const meta = await get(PROJECT_META, projectId);
      if (meta) await put(PROJECT_META, { ...meta, title: notebook.title || meta.title || 'Untitled Project', updatedAt: Date.now() });
    } catch (error) {
      console.warn('[Code Nest IndexedDB] save failed', error);
    }
  }

  function scheduleSave() {
    if (restoring) return;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(saveNotebook, 260);
  }

  function fireInput(element) {
    if (!element) return;
    element.dispatchEvent(new Event('input', { bubbles: true }));
  }

  async function restoreNotebook(notebook) {
    if (!notebook || !Array.isArray(notebook.cells)) return;
    const cellsRoot = document.getElementById('cells');
    if (!cellsRoot) return;

    restoring = true;
    try {
      const existing = [...cellsRoot.querySelectorAll('.cell')];
      existing.forEach((cell) => cell.remove());

      const codeBtn = document.getElementById('addCodeBtn');
      const markdownBtn = document.getElementById('addMarkdownBtn');
      const terminalBtn = document.getElementById('addTerminalBtn');

      for (const saved of notebook.cells) {
        const type = saved.type === 'markdown' ? 'markdown' : saved.type === 'terminal' ? 'terminal' : 'code';
        const btn = type === 'code' ? codeBtn : type === 'markdown' ? markdownBtn : terminalBtn;
        if (!btn) continue;
        btn.click();
        const cell = cellsRoot.lastElementChild;
        if (!cell) continue;
        const name = cell.querySelector('.cell-name');
        const area = cell.querySelector('textarea');
        if (name) name.value = saved.name || 'cell.py';
        if (area) area.value = saved.source || '';
        const out = cell.querySelector('.output, .terminal-output');
        if (out && saved.output) {
          out.textContent = saved.output;
          out.classList.add('visible');
          if (type === 'terminal') out.dataset.history = saved.output;
        }
        if (name) fireInput(name);
        if (area) fireInput(area);
      }

      const title = document.getElementById('titleInput');
      if (title && notebook.title) {
        title.value = notebook.title;
        fireInput(title);
      }
      document.getElementById('crumbTitle')?.replaceChildren(document.createTextNode(notebook.title || 'Untitled Project'));
      lastSavedSignature = signature(currentNotebookFromDom());
    } finally {
      restoring = false;
    }
  }

  async function bootstrap() {
    if (!('indexedDB' in window)) return;
    try {
      const stored = await get(NOTEBOOK_STORE, projectId);
      if (stored) {
        await restoreNotebook(stored);
      } else {
        const scopedKey = `${PROJECT_PREFIX}${projectId}.notebook`;
        const local = readLocal(scopedKey) || (projectId === 'default' ? readLocal(OLD_NOTEBOOK_KEY) : null);
        const fallback = local && Array.isArray(local.cells)
          ? local
          : { title: document.getElementById('titleInput')?.value || 'Untitled Project', cells: starter };
        await put(NOTEBOOK_STORE, { id: projectId, ...fallback, updatedAt: Date.now() });
        lastSavedSignature = signature(fallback);
      }

      // Keep the active project title mirrored between Studio and Dashboard.
      const title = document.getElementById('titleInput');
      if (title && !title.dataset.idbStore) {
        title.dataset.idbStore = '1';
        title.addEventListener('input', scheduleSave);
        title.addEventListener('change', saveNotebook);
        title.addEventListener('blur', saveNotebook);
      }

      document.addEventListener('input', (event) => {
        if (restoring) return;
        if (event.target?.closest?.('#cells')) scheduleSave();
      }, true);

      document.addEventListener('click', (event) => {
        if (restoring) return;
        if (event.target?.closest?.('#cells, #addCodeBtn, #addMarkdownBtn, #addTerminalBtn, #bottomAddBtn')) scheduleSave();
      }, true);

      window.addEventListener('beforeunload', () => {
        // IndexedDB is async, so the scheduled save is flushed as early as possible.
        saveNotebook();
      });

      console.log('[Code Nest IndexedDB] V0.5.0 ready', { projectId });
    } catch (error) {
      console.warn('[Code Nest IndexedDB] bootstrap failed; existing storage remains active', error);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootstrap, { once: true });
  } else {
    bootstrap();
  }
})();
