/* Code Nest IndexedDB synchronous runtime bridge V0.5.5 */
(() => {
  'use strict';

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

  let notebookTimer = null;
  let fsTimer = null;
  let lastNotebook = notebook;
  let lastFs = filesystem;

  function persistNotebook() {
    clearTimeout(notebookTimer);
    notebookTimer = setTimeout(async () => {
      try {
        const now = Date.now();
        await put(NOTEBOOKS, { id: projectId, ...lastNotebook, updatedAt: now });
        const meta = await getProject();
        if (meta) {
          await put(PROJECTS, {
            ...meta,
            title: lastNotebook.title || meta.title || 'Untitled Project',
            updatedAt: now
          });
        }
      } catch (error) {
        console.warn('[Code Nest IndexedDB] runtime notebook save failed', error);
      }
    }, 90);
  }

  function persistFs() {
    clearTimeout(fsTimer);
    fsTimer = setTimeout(() => {
      put(FILESYSTEMS, { id: projectId, fs: lastFs, updatedAt: Date.now() })
        .catch((error) => console.warn('[Code Nest IndexedDB] runtime filesystem save failed', error));
    }, 90);
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
          lastNotebook = notebook;
          sessionStorage.setItem(notebookKey, JSON.stringify(notebook));
          persistNotebook();
        } catch (_) {}
        return;
      }
      if (key === 'code-nest-fs-v02') {
        try {
          filesystem = JSON.parse(value);
          lastFs = filesystem;
          sessionStorage.setItem(fsKey, JSON.stringify(filesystem));
          persistFs();
        } catch (_) {}
        return;
      }
    }
    return nativeSet.call(this, key, value);
  };

  Storage.prototype.removeItem = function(key) {
    if (this === localStorage) {
      if (key === 'code-nest-v02') {
        notebook = null;
        sessionStorage.removeItem(notebookKey);
        return;
      }
      if (key === 'code-nest-fs-v02') {
        filesystem = null;
        sessionStorage.removeItem(fsKey);
        return;
      }
    }
    return nativeRemove.call(this, key);
  };

  globalThis.__codeNestIDBStorageBridge = true;
  console.log('[Code Nest IndexedDB] synchronous runtime bridge ready', { projectId });
})();