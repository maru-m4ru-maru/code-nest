/* Code Nest IndexedDB Project Store V0.5.3 */
(() => {
  'use strict';

  const DB_NAME = 'CodeNestDB';
  const DB_VERSION = 3;
  const PROJECTS = 'projects';
  const NOTEBOOKS = 'notebooks';
  const FILESYSTEMS = 'filesystems';
  const META_KEY = 'codeNest.projects.v1';
  const OLD_NOTEBOOK_KEY = 'code-nest-v02';
  const OLD_FS_KEY = 'code-nest-fs-v02';
  const PREFIX = 'codeNest.project.';
  const MIGRATION_MARKER = '__migration_v052__';
  const CACHE_PREFIX = '__codeNestIDB.';

  const params = new URLSearchParams(location.search);
  const projectId = (params.get('project') || 'default').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 80) || 'default';
  const inStudio = location.pathname.endsWith('/studio.html') || location.pathname.endsWith('studio.html');

  const starter = [{
    type: 'code',
    name: 'cell.py',
    source: 'print("Hello from Code Nest!")\n\nx = 2 + 3\nprint("2 + 3 =", x)',
    output: ''
  }];

  const defaultFs = {
    '/readme.txt': 'Welcome to Code Nest!\nTry: help, ls, pwd, echo Hello > hello.txt',
    '/hello.txt': 'Hello, Code Nest!'
  };

  let dbPromise;
  let notebookCache = null;
  let fsCache = null;
  let notebookTimer = null;
  let fsTimer = null;

  const cacheKey = (kind) => `${CACHE_PREFIX}${projectId}.${kind}`;

  function clone(value) {
    try { return structuredClone(value); } catch (_) { return JSON.parse(JSON.stringify(value)); }
  }

  function readLocal(key) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    } catch (_) {
      return null;
    }
  }

  function readSession(key) {
    try {
      const raw = sessionStorage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    } catch (_) {
      return null;
    }
  }

  function writeSession(key, value) {
    try { sessionStorage.setItem(key, JSON.stringify(value)); } catch (_) {}
  }

  function removeSession(key) {
    try { sessionStorage.removeItem(key); } catch (_) {}
  }

  function readLegacyMeta() {
    const value = readLocal(META_KEY);
    return Array.isArray(value) ? value.filter(Boolean) : [];
  }

  function openDb() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(PROJECTS)) db.createObjectStore(PROJECTS, { keyPath: 'id' });
        if (!db.objectStoreNames.contains(NOTEBOOKS)) db.createObjectStore(NOTEBOOKS, { keyPath: 'id' });
        if (!db.objectStoreNames.contains(FILESYSTEMS)) db.createObjectStore(FILESYSTEMS, { keyPath: 'id' });
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error('IndexedDB open failed'));
    });
    return dbPromise;
  }

  async function get(store, id) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(store, 'readonly');
      const req = tx.objectStore(store).get(id);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error || new Error('IndexedDB read failed'));
    });
  }

  async function getAll(store) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(store, 'readonly');
      const req = tx.objectStore(store).getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error || new Error('IndexedDB list failed'));
    });
  }

  async function put(store, value) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(store, 'readwrite');
      tx.objectStore(store).put(value);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error || new Error('IndexedDB write failed'));
    });
  }

  async function remove(store, id) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(store, 'readwrite');
      tx.objectStore(store).delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error || new Error('IndexedDB delete failed'));
    });
  }

  async function migrateOnce() {
    if (await get(PROJECTS, MIGRATION_MARKER)) return;

    const legacyMeta = readLegacyMeta();
    const existingProjects = (await getAll(PROJECTS)).filter((item) => item?.id && !item.id.startsWith('__migration_'));
    const projectMap = new Map(existingProjects.map((item) => [item.id, item]));
    const now = Date.now();

    for (let index = 0; index < legacyMeta.length; index++) {
      const item = legacyMeta[index];
      if (!item?.id) continue;
      const current = projectMap.get(item.id) || {};
      await put(PROJECTS, {
        ...current,
        ...item,
        title: item.title || current.title || 'Untitled Project',
        order: Number.isFinite(item.order) ? item.order : index,
        createdAt: item.createdAt || current.createdAt || now,
        updatedAt: item.updatedAt || current.updatedAt || now
      });
    }

    const hasDefault = legacyMeta.some((item) => item?.id === 'default') || projectMap.has('default');
    if (!hasDefault) {
      const oldNotebook = readLocal(OLD_NOTEBOOK_KEY);
      await put(PROJECTS, {
        id: 'default',
        title: oldNotebook?.title || 'Welcome to Code Nest',
        createdAt: now,
        updatedAt: now,
        order: legacyMeta.length
      });
    }

    const allProjects = (await getAll(PROJECTS)).filter((item) => item?.id && !item.id.startsWith('__migration_'));
    for (const meta of allProjects) {
      const scopedNotebook = readLocal(`${PREFIX}${meta.id}.notebook`);
      const scopedFs = readLocal(`${PREFIX}${meta.id}.fs`);
      const oldNotebook = meta.id === 'default' ? readLocal(OLD_NOTEBOOK_KEY) : null;
      const oldFs = meta.id === 'default' ? readLocal(OLD_FS_KEY) : null;
      const existingNotebook = await get(NOTEBOOKS, meta.id);
      const existingFs = await get(FILESYSTEMS, meta.id);

      const notebook = scopedNotebook && Array.isArray(scopedNotebook.cells)
        ? scopedNotebook
        : oldNotebook && Array.isArray(oldNotebook.cells)
          ? oldNotebook
          : existingNotebook || { title: meta.title || 'Untitled Project', cells: clone(starter) };

      const fs = scopedFs && typeof scopedFs === 'object' && !Array.isArray(scopedFs)
        ? scopedFs
        : oldFs && typeof oldFs === 'object' && !Array.isArray(oldFs)
          ? oldFs
          : existingFs?.fs || clone(defaultFs);

      await put(NOTEBOOKS, {
        id: meta.id,
        ...notebook,
        title: meta.title || notebook.title || 'Untitled Project',
        updatedAt: notebook.updatedAt || meta.updatedAt || now
      });
      await put(FILESYSTEMS, { id: meta.id, fs: clone(fs), updatedAt: existingFs?.updatedAt || now });
    }

    await put(PROJECTS, { id: MIGRATION_MARKER, title: 'migration', createdAt: now, updatedAt: now, order: -1 });
  }

  async function listProjects() {
    return (await getAll(PROJECTS)).filter((item) => item?.id && !item.id.startsWith('__migration_'));
  }

  async function ensureProject() {
    let meta = await get(PROJECTS, projectId);
    if (meta) return meta;
    const projects = await listProjects();
    const now = Date.now();
    meta = { id: projectId, title: params.get('name') || 'Untitled Project', createdAt: now, updatedAt: now, order: projects.length };
    await put(PROJECTS, meta);
    return meta;
  }

  async function loadProjectData() {
    let notebook = await get(NOTEBOOKS, projectId);
    let fsRecord = await get(FILESYSTEMS, projectId);
    const meta = await get(PROJECTS, projectId);

    if (!notebook) {
      const legacy = readLocal(`${PREFIX}${projectId}.notebook`) || (projectId === 'default' ? readLocal(OLD_NOTEBOOK_KEY) : null);
      notebook = legacy && Array.isArray(legacy.cells) ? legacy : { title: meta?.title || 'Untitled Project', cells: clone(starter) };
      await put(NOTEBOOKS, { id: projectId, ...notebook, title: meta?.title || notebook.title || 'Untitled Project', updatedAt: Date.now() });
    }

    if (!fsRecord) {
      const legacy = readLocal(`${PREFIX}${projectId}.fs`) || (projectId === 'default' ? readLocal(OLD_FS_KEY) : null);
      const fs = legacy && typeof legacy === 'object' && !Array.isArray(legacy) ? legacy : clone(defaultFs);
      await put(FILESYSTEMS, { id: projectId, fs, updatedAt: Date.now() });
      fsRecord = { id: projectId, fs };
    }

    return { meta, notebook, fs: fsRecord.fs || defaultFs };
  }

  function cacheReady() {
    try { return sessionStorage.getItem(cacheKey('ready')) === '1'; } catch (_) { return false; }
  }

  function setCacheReady() {
    try { sessionStorage.setItem(cacheKey('ready'), '1'); } catch (_) {}
  }

  function installStorageBridge() {
    if (!inStudio || globalThis.__codeNestIDBStorageBridge) return;
    globalThis.__codeNestIDBStorageBridge = true;
    const nativeGet = Storage.prototype.getItem;
    const nativeSet = Storage.prototype.setItem;
    const nativeRemove = Storage.prototype.removeItem;

    Storage.prototype.getItem = function(key) {
      if (this === localStorage) {
        if (key === 'code-nest-v02' && notebookCache != null) return JSON.stringify(notebookCache);
        if (key === 'code-nest-fs-v02' && fsCache != null) return JSON.stringify(fsCache);
      }
      return nativeGet.call(this, key);
    };

    Storage.prototype.setItem = function(key, value) {
      if (this === localStorage) {
        if (key === 'code-nest-v02') {
          try { notebookCache = JSON.parse(value); } catch (_) { notebookCache = null; }
          writeSession(cacheKey('notebook'), notebookCache);
          queuePersistNotebook();
          return;
        }
        if (key === 'code-nest-fs-v02') {
          try { fsCache = JSON.parse(value); } catch (_) { fsCache = null; }
          writeSession(cacheKey('fs'), fsCache);
          queuePersistFs();
          return;
        }
      }
      return nativeSet.call(this, key, value);
    };

    Storage.prototype.removeItem = function(key) {
      if (this === localStorage) {
        if (key === 'code-nest-v02') {
          notebookCache = null;
          removeSession(cacheKey('notebook'));
          void remove(NOTEBOOKS, projectId);
          return;
        }
        if (key === 'code-nest-fs-v02') {
          fsCache = null;
          removeSession(cacheKey('fs'));
          void remove(FILESYSTEMS, projectId);
          return;
        }
      }
      return nativeRemove.call(this, key);
    };
  }

  function queuePersistNotebook() {
    clearTimeout(notebookTimer);
    notebookTimer = setTimeout(async () => {
      if (!notebookCache) return;
      try {
        const now = Date.now();
        await put(NOTEBOOKS, { id: projectId, ...clone(notebookCache), updatedAt: now });
        const meta = await get(PROJECTS, projectId);
        if (meta) await put(PROJECTS, { ...meta, title: notebookCache.title || meta.title || 'Untitled Project', updatedAt: now });
      } catch (error) {
        console.warn('[Code Nest IndexedDB] notebook save failed', error);
      }
    }, 80);
  }

  function queuePersistFs() {
    clearTimeout(fsTimer);
    fsTimer = setTimeout(async () => {
      if (!fsCache) return;
      try { await put(FILESYSTEMS, { id: projectId, fs: clone(fsCache), updatedAt: Date.now() }); }
      catch (error) { console.warn('[Code Nest IndexedDB] filesystem save failed', error); }
    }, 80);
  }

  function updateStorageLabel() {
    const label = document.getElementById('storageState');
    if (label) label.textContent = 'IndexedDB';
  }

  async function bootstrapStudio() {
    await migrateOnce();
    const data = await loadProjectData();
    const meta = await ensureProject();
    const cachedNotebook = readSession(cacheKey('notebook'));
    const cachedFs = readSession(cacheKey('fs'));

    // This one-time reload puts the asynchronous IndexedDB data into a synchronous
    // per-project runtime cache before app.js performs its initial synchronous read.
    if (!cacheReady() || !cachedNotebook || !cachedFs) {
      notebookCache = clone(data.notebook);
      fsCache = clone(data.fs);
      writeSession(cacheKey('notebook'), notebookCache);
      writeSession(cacheKey('fs'), fsCache);
      setCacheReady();
      location.reload();
      return;
    }

    notebookCache = cachedNotebook;
    fsCache = cachedFs;
    installStorageBridge();
    updateStorageLabel();

    // Dashboard and Studio share one title record in IndexedDB.
    if (meta?.title && notebookCache && notebookCache.title !== meta.title) {
      notebookCache.title = meta.title;
      writeSession(cacheKey('notebook'), notebookCache);
      await put(NOTEBOOKS, { id: projectId, ...clone(notebookCache), updatedAt: Date.now() });
    }

    const input = document.getElementById('titleInput');
    const crumb = document.getElementById('crumbTitle');
    const cleanTitle = meta?.title || notebookCache?.title || 'Untitled Project';
    if (input) input.value = cleanTitle;
    if (crumb) crumb.textContent = cleanTitle;

    console.log('[Code Nest IndexedDB] Studio storage ready', { projectId });
  }

  async function bootstrapDashboard() {
    await migrateOnce();
    console.log('[Code Nest IndexedDB] Dashboard storage ready');
  }

  async function createProject(title) {
    await migrateOnce();
    const projects = await listProjects();
    const id = `p_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
    const now = Date.now();
    const clean = String(title || '').trim() || 'Untitled Project';
    const meta = { id, title: clean, createdAt: now, updatedAt: now, order: projects.length };
    await put(PROJECTS, meta);
    await put(NOTEBOOKS, { id, title: clean, cells: clone(starter), updatedAt: now });
    await put(FILESYSTEMS, { id, fs: clone(defaultFs), updatedAt: now });
    return meta;
  }

  async function renameProject(id, title) {
    const clean = String(title || '').trim() || 'Untitled Project';
    const now = Date.now();
    const meta = await get(PROJECTS, id);
    if (meta) await put(PROJECTS, { ...meta, title: clean, updatedAt: now });
    const notebook = await get(NOTEBOOKS, id);
    if (notebook) await put(NOTEBOOKS, { ...notebook, title: clean, updatedAt: now });
    if (id === projectId) {
      try {
        const cached = readSession(cacheKey('notebook'));
        if (cached) { cached.title = clean; writeSession(cacheKey('notebook'), cached); }
      } catch (_) {}
    }
  }

  async function deleteProject(id) {
    await remove(PROJECTS, id);
    await remove(NOTEBOOKS, id);
    await remove(FILESYSTEMS, id);
  }

  async function reorderProjects(ordered) {
    for (let index = 0; index < ordered.length; index++) {
      const item = await get(PROJECTS, ordered[index].id);
      if (item) await put(PROJECTS, { ...item, order: index });
    }
  }

  globalThis.CodeNestDB = {
    DB_NAME,
    ready: openDb().then(migrateOnce),
    listProjects,
    getProject: (id) => get(PROJECTS, id),
    getNotebook: (id) => get(NOTEBOOKS, id),
    getFilesystem: (id) => get(FILESYSTEMS, id),
    createProject,
    renameProject,
    deleteProject,
    reorderProjects
  };

  if (inStudio) {
    void bootstrapStudio().catch((error) => console.error('[Code Nest IndexedDB] Studio bootstrap failed', error));
  } else {
    void bootstrapDashboard().catch((error) => console.error('[Code Nest IndexedDB] Dashboard bootstrap failed', error));
  }
})();
