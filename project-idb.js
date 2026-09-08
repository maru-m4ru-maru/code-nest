/* Code Nest IndexedDB Project Store V0.5.0 */
(() => {
  'use strict';

  const DB_NAME = 'CodeNestDB';
  const DB_VERSION = 1;
  const NOTEBOOK_STORE = 'notebooks';
  const PROJECT_META = 'projects';
  const PROJECT_META_KEY = 'codeNest.projects.v1';
  const PROJECT_PREFIX = 'codeNest.project.';
  const OLD_NOTEBOOK_KEY = 'code-nest-v02';
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

  function readProjectMeta() {
    try {
      const raw = localStorage.getItem(PROJECT_META_KEY);
      const list = raw ? JSON.parse(raw) : [];
      return Array.isArray(list) ? list : [];
    } catch (_) {
      return [];
    }
  }

  function writeProjectMeta(list) {
    try { localStorage.setItem(PROJECT_META_KEY, JSON.stringify(list)); } catch (_) {}
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
    const now = Date.now();
    try {
      await put(NOTEBOOK_STORE, { id: projectId, ...notebook, updatedAt: now });

      const meta = await get(PROJECT_META, projectId);
      if (meta) await put(PROJECT_META, {
        ...meta,
        title: notebook.title || meta.title || 'Untitled Project',
        updatedAt: now
      });

      const list = readProjectMeta();
      const index = list.findIndex((item) => item && item.id === projectId);
      if (index >= 0) {
        list[index] = {
          ...list[index],
          title: notebook.title || list[index].title || 'Untitled Project',
          updatedAt: now
        };
        writeProjectMeta(list);
      }
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
      [...cellsRoot.querySelectorAll('.cell')].forEach((cell) => cell.remove());

      const buttons = {
        code: document.getElementById('addCodeBtn'),
        markdown: document.getElementById('addMarkdownBtn'),
        terminal: document.getElementById('addTerminalBtn')
      };

      for (const saved of notebook.cells) {
        const type = saved.type === 'markdown' ? 'markdown' : saved.type === 'terminal' ? 'terminal' : 'code';
        const btn = buttons[type];
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
      const crumb = document.getElementById('crumbTitle');
      if (crumb) crumb.textContent = notebook.title || 'Untitled Project';
      lastSavedSignature = signature(currentNotebookFromDom());
    } finally {
      restoring = false;
    }
  }

  function legacyOwnerId() {
    const list = readProjectMeta().filter((item) => item && item.id);
    if (!list.length) return projectId;
    list.sort((a, b) => (a.order ?? Number.MAX_SAFE_INTEGER) - (b.order ?? Number.MAX_SAFE_INTEGER) || (a.createdAt || 0) - (b.createdAt || 0));
    return list[0].id;
  }

  async function bootstrap() {
    if (!('indexedDB' in window)) return;
    try {
      const stored = await get(NOTEBOOK_STORE, projectId);
      if (stored) {
        await restoreNotebook(stored);
      } else {
        // Legacy LocalStorage never contained a reliable project ID. Migrate it
        // only to the oldest project; every other project starts independently.
        const owner = legacyOwnerId();
        const legacy = projectId === owner ? (readLocal(`${PROJECT_PREFIX}${projectId}.notebook`) || readLocal(OLD_NOTEBOOK_KEY)) : null;
        const fallback = legacy && Array.isArray(legacy.cells)
          ? legacy
          : { title: document.getElementById('titleInput')?.value || 'Untitled Project', cells: starter };
        await put(NOTEBOOK_STORE, { id: projectId, ...fallback, updatedAt: Date.now() });
        lastSavedSignature = signature(fallback);
      }

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

      window.addEventListener('beforeunload', () => { saveNotebook(); });
      console.log('[Code Nest IndexedDB] V0.5.0 ready', { projectId });
    } catch (error) {
      console.warn('[Code Nest IndexedDB] bootstrap failed; existing storage remains active', error);
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bootstrap, { once: true });
  else bootstrap();
})();
