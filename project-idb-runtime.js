/* Code Nest IndexedDB synchronous runtime bridge V0.5.7 */
(() => {
  'use strict';

  // app.js still uses a synchronous localStorage API. The actual source of
  // truth is IndexedDB; this bridge gives app.js a project-local synchronous
  // view and independently watches the DOM so saves do not depend on app.js's
  // legacy save implementation.
  const DB_NAME = 'CodeNestDB';
  const DB_VERSION = 3;
  const NOTEBOOKS = 'notebooks';
  const FILESYSTEMS = 'filesystems';
  const PROJECTS = 'projects';
  const params = new URLSearchParams(location.search);
  const projectId = (params.get('project') || 'default').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 80) || 'default';
  const CACHE_PREFIX = '__codeNestIDB.';
  const notebookKey = `${CACHE_PREFIX}${projectId}.notebook`;
  const fsKey = `${CACHE_PREFIX}${projectId}.fs`;

  function readSession(key) {
    try {
      const raw = sessionStorage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    } catch (_) {
      return null;
    }
  }

  let notebook = readSession(notebookKey);
  let filesystem = readSession(fsKey);
  if (!notebook || !filesystem || globalThis.__codeNestIDBStorageBridge) return;

  let dbPromise = null;
  function db() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error || new Error('IndexedDB open failed'));
    });
    return dbPromise;
  }

  function put(store, value) {
    return db().then((database) => new Promise((resolve, reject) => {
      const tx = database.transaction(store, 'readwrite');
      tx.objectStore(store).put(value);
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error || new Error('IndexedDB write failed'));
      tx.onabort = () => reject(tx.error || new Error('IndexedDB transaction aborted'));
    }));
  }

  function getProject() {
    return db().then((database) => new Promise((resolve, reject) => {
      const tx = database.transaction(PROJECTS, 'readonly');
      const req = tx.objectStore(PROJECTS).get(projectId);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error || new Error('IndexedDB project read failed'));
    }));
  }

  function clone(value) {
    try { return structuredClone(value); } catch (_) { return JSON.parse(JSON.stringify(value)); }
  }

  function domNotebook() {
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

  function signature(value) {
    try { return JSON.stringify(value); } catch (_) { return ''; }
  }

  let notebookTimer = null;
  let fsTimer = null;
  let notebookSavePromise = null;
  let fsSavePromise = null;
  let lastNotebook = clone(notebook);
  let lastFs = clone(filesystem);
  let lastDomSignature = '';
  let observing = false;

  async function saveNotebookNow(value) {
    const data = clone(value || lastNotebook);
    if (!data) return;
    lastNotebook = data;
    try { sessionStorage.setItem(notebookKey, JSON.stringify(lastNotebook)); } catch (_) {}

    const now = Date.now();
    try {
      await put(NOTEBOOKS, { id: projectId, ...data, updatedAt: now });
      const meta = await getProject();
      if (meta) {
        await put(PROJECTS, {
          ...meta,
          title: data.title || meta.title || 'Untitled Project',
          updatedAt: now
        });
      }
      const title = document.getElementById('titleInput');
      const crumb = document.getElementById('crumbTitle');
      const cleanTitle = data.title || 'Untitled Project';
      if (title && title.value !== cleanTitle && document.activeElement !== title) title.value = cleanTitle;
      if (crumb && crumb.textContent !== cleanTitle) crumb.textContent = cleanTitle;
    } catch (error) {
      console.warn('[Code Nest IndexedDB] notebook save failed', error);
    }
  }

  async function saveFsNow() {
    if (!lastFs) return;
    try { await put(FILESYSTEMS, { id: projectId, fs: clone(lastFs), updatedAt: Date.now() }); }
    catch (error) { console.warn('[Code Nest IndexedDB] filesystem save failed', error); }
  }

  function queueNotebookSave(value) {
    lastNotebook = clone(value);
    clearTimeout(notebookTimer);
    notebookTimer = setTimeout(() => {
      notebookSavePromise = saveNotebookNow(lastNotebook);
    }, 80);
  }

  function queueFsSave() {
    clearTimeout(fsTimer);
    fsTimer = setTimeout(() => {
      fsSavePromise = saveFsNow();
    }, 80);
  }

  const nativeGet = Storage.prototype.getItem;
  const nativeSet = Storage.prototype.setItem;
  const nativeRemove = Storage.prototype.removeItem;

  Storage.prototype.getItem = function(key) {
    if (this === localStorage) {
      if (key === 'code-nest-v02') return JSON.stringify(notebook);
      if (key === 'code-nest-fs-v02') return JSON.stringify(filesystem);
    }
    return nativeGet.call(this, key);
  };

  Storage.prototype.setItem = function(key, value) {
    if (this === localStorage) {
      if (key === 'code-nest-v02') {
        try {
          notebook = JSON.parse(value);
          queueNotebookSave(notebook);
        } catch (error) {
          console.warn('[Code Nest IndexedDB] notebook bridge parse failed', error);
        }
        return;
      }
      if (key === 'code-nest-fs-v02') {
        try {
          filesystem = JSON.parse(value);
          lastFs = filesystem;
          try { sessionStorage.setItem(fsKey, JSON.stringify(filesystem)); } catch (_) {}
          queueFsSave();
        } catch (error) {
          console.warn('[Code Nest IndexedDB] filesystem bridge parse failed', error);
        }
        return;
      }
    }
    return nativeSet.call(this, key, value);
  };

  Storage.prototype.removeItem = function(key) {
    if (this === localStorage) {
      if (key === 'code-nest-v02') {
        notebook = null;
        lastNotebook = null;
        clearTimeout(notebookTimer);
        sessionStorage.removeItem(notebookKey);
        return;
      }
      if (key === 'code-nest-fs-v02') {
        filesystem = null;
        lastFs = null;
        clearTimeout(fsTimer);
        sessionStorage.removeItem(fsKey);
        return;
      }
    }
    return nativeRemove.call(this, key);
  };

  function syncDomToNotebook() {
    if (!observing) return;
    const next = domNotebook();
    const nextSig = signature(next);
    if (!nextSig || nextSig === lastDomSignature) return;
    lastDomSignature = nextSig;
    notebook = next;
    queueNotebookSave(next);
  }

  function installDomPersistence() {
    if (!document.getElementById('cells') || observing) return;
    observing = true;

    const cells = document.getElementById('cells');
    const observer = new MutationObserver(() => syncDomToNotebook());
    observer.observe(cells, { childList: true, subtree: true, characterData: true });

    document.addEventListener('input', (event) => {
      if (event.target?.id === 'titleInput' || event.target?.closest?.('#cells')) syncDomToNotebook();
    }, true);
    document.addEventListener('change', (event) => {
      if (event.target?.id === 'titleInput' || event.target?.closest?.('#cells')) syncDomToNotebook();
    }, true);

    // Capture the exact post-app.js state after the DOM has finished booting.
    requestAnimationFrame(() => requestAnimationFrame(syncDomToNotebook));
  }

  function flush() {
    clearTimeout(notebookTimer);
    clearTimeout(fsTimer);
    if (lastNotebook) notebookSavePromise = saveNotebookNow(lastNotebook);
    if (lastFs) fsSavePromise = saveFsNow();
  }

  window.addEventListener('pagehide', flush, { capture: true });
  window.addEventListener('beforeunload', flush, { capture: true });

  globalThis.__codeNestIDBStorageBridge = true;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', installDomPersistence, { once: true });
  } else {
    installDomPersistence();
  }

  console.log('[Code Nest IndexedDB] V0.5.7 bridge + DOM persistence ready', { projectId });
})();