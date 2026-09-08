/* Code Nest IndexedDB Project Store V0.5.1 */
(() => {
  'use strict';

  const DB_NAME = 'CodeNestDB';
  const DB_VERSION = 2;
  const PROJECTS = 'projects';
  const NOTEBOOKS = 'notebooks';
  const FILESYSTEMS = 'filesystems';
  const META_KEY = 'codeNest.projects.v1';
  const OLD_NOTEBOOK_KEY = 'code-nest-v02';
  const OLD_FS_KEY = 'code-nest-fs-v02';
  const PREFIX = 'codeNest.project.';
  const APP_SCRIPT = 'app.js';
  const DEFAULT_FS = {
    '/readme.txt': 'Welcome to Code Nest!\nTry: help, ls, pwd, echo Hello > hello.txt',
    '/hello.txt': 'Hello, Code Nest!'
  };

  const params = new URLSearchParams(location.search);
  const projectId = (params.get('project') || 'default').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 80) || 'default';
  const inStudio = !!document.getElementById('cells') || location.pathname.endsWith('/studio.html') || location.pathname.endsWith('studio.html');

  let dbPromise;
  let notebookCache = null;
  let fsCache = null;
  let saveTimer = null;
  let appStarted = false;

  const starter = [{
    type: 'code',
    name: 'cell.py',
    source: 'print("Hello from Code Nest!")\n\nx = 2 + 3\nprint("2 + 3 =", x)',
    output: ''
  }];

  function clone(value) {
    try { return structuredClone(value); } catch (_) { return JSON.parse(JSON.stringify(value)); }
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

  function readLocal(key) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    } catch (_) {
      return null;
    }
  }

  function legacyProjectMeta() {
    try {
      const raw = localStorage.getItem(META_KEY);
      const list = raw ? JSON.parse(raw) : [];
      return Array.isArray(list) ? list.filter(Boolean) : [];
    } catch (_) {
      return [];
    }
  }

  async function migrateProjectsOnce() {
    const marker = await get(PROJECTS, '__migration_v051__');
    if (marker) return;

    const oldMeta = legacyProjectMeta();
    for (let index = 0; index < oldMeta.length; index++) {
      const item = oldMeta[index];
      if (!item?.id) continue;
      await put(PROJECTS, {
        ...item,
        order: Number.isFinite(item.order) ? item.order : index,
        title: item.title || 'Untitled Project'
      });
    }

    const now = Date.now();
    if (!oldMeta.some((item) => item?.id === 'default')) {
      const oldNotebook = readLocal(OLD_NOTEBOOK_KEY);
      await put(PROJECTS, {
        id: 'default',
        title: oldNotebook?.title || 'Welcome to Code Nest',
        createdAt: now,
        updatedAt: now,
        order: oldMeta.length
      });
    }

    const migratedProjects = [...oldMeta];
    if (!migratedProjects.some((item) => item?.id === 'default')) migratedProjects.push({ id: 'default' });
    for (const item of migratedProjects) {
      if (!item?.id) continue;
      const notebookKey = `${PREFIX}${item.id}.notebook`;
      const fsKey = `${PREFIX}${item.id}.fs`;
      const oldNotebook = readLocal(notebookKey) || (item.id === 'default' ? readLocal(OLD_NOTEBOOK_KEY) : null);
      const oldFs = readLocal(fsKey) || (item.id === 'default' ? readLocal(OLD_FS_KEY) : null);
      if (oldNotebook && Array.isArray(oldNotebook.cells)) {
        const existing = await get(NOTEBOOKS, item.id);
        if (!existing) await put(NOTEBOOKS, { id: item.id, ...oldNotebook, updatedAt: oldNotebook.updatedAt || now });
      }
      if (oldFs && typeof oldFs === 'object' && !Array.isArray(oldFs)) {
        const existing = await get(FILESYSTEMS, item.id);
        if (!existing) await put(FILESYSTEMS, { id: item.id, fs: oldFs, updatedAt: now });
      }
    }

    await put(PROJECTS, { id: '__migration_v051__', title: 'migration', createdAt: now, updatedAt: now, order: 0 });
  }

  async function ensureProject(id, title) {
    const current = await get(PROJECTS, id);
    if (current) return current;
    const now = Date.now();
    const projects = await listProjects();
    const meta = {
      id,
      title: title || 'Untitled Project',
      createdAt: now,
      updatedAt: now,
      order: projects.length
    };
    await put(PROJECTS, meta);
    return meta;
  }

  async function listProjects() {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(PROJECTS, 'readonly');
      const request = tx.objectStore(PROJECTS).getAll();
      request.onsuccess = () => resolve(request.result.filter((p) => p?.id && p.id !== '__migration_v051__'));
      request.onerror = () => reject(request.error || new Error('IndexedDB list failed'));
    });
  }

  async function readNotebook(id) {
    return get(NOTEBOOKS, id);
  }

  async function writeNotebook(id, notebook) {
    const now = Date.now();
    await put(NOTEBOOKS, { id, ...notebook, updatedAt: now });
    const meta = await get(PROJECTS, id);
    if (meta) await put(PROJECTS, { ...meta, title: notebook.title || meta.title || 'Untitled Project', updatedAt: now });
    return now;
  }

  async function writeFilesystem(id, fs) {
    await put(FILESYSTEMS, { id, fs: clone(fs), updatedAt: Date.now() });
  }

  async function renameProject(id, title) {
    const clean = String(title || '').trim() || 'Untitled Project';
    const now = Date.now();
    const meta = await get(PROJECTS, id);
    if (meta) await put(PROJECTS, { ...meta, title: clean, updatedAt: now });
    const notebook = await get(NOTEBOOKS, id);
    if (notebook) await put(NOTEBOOKS, { ...notebook, title: clean, updatedAt: now });
    if (inStudio && id === projectId) {
      const input = document.getElementById('titleInput');
      if (input) input.value = clean;
      const crumb = document.getElementById('crumbTitle');
      if (crumb) crumb.textContent = clean;
    }
  }

  async function deleteProject(id) {
    await remove(PROJECTS, id);
    await remove(NOTEBOOKS, id);
    await remove(FILESYSTEMS, id);
  }

  function projectScopedKey(key) {
    if (key === 'code-nest-v02') return 'notebook';
    if (key === 'code-nest-fs-v02') return 'fs';
    return null;
  }

  function installStorageBridge() {
    if (!inStudio || globalThis.__codeNestIDBStorageBridge) return;
    globalThis.__codeNestIDBStorageBridge = true;
    const nativeGet = Storage.prototype.getItem;
    const nativeSet = Storage.prototype.setItem;
    const nativeRemove = Storage.prototype.removeItem;

    Storage.prototype.getItem = function(key) {
      if (this === localStorage) {
        const scoped = projectScopedKey(key);
        if (scoped === 'notebook' && notebookCache != null) return JSON.stringify(notebookCache);
        if (scoped === 'fs' && fsCache != null) return JSON.stringify(fsCache);
      }
      return nativeGet.call(this, key);
    };

    Storage.prototype.setItem = function(key, value) {
      if (this === localStorage) {
        const scoped = projectScopedKey(key);
        if (scoped === 'notebook') {
          try { notebookCache = JSON.parse(value); } catch (_) { notebookCache = null; }
          queuePersistNotebook();
          return;
        }
        if (scoped === 'fs') {
          try { fsCache = JSON.parse(value); } catch (_) { fsCache = null; }
          queuePersistFs();
          return;
        }
      }
      return nativeSet.call(this, key, value);
    };

    Storage.prototype.removeItem = function(key) {
      if (this === localStorage) {
        const scoped = projectScopedKey(key);
        if (scoped === 'notebook') {
          notebookCache = null;
          void remove(NOTEBOOKS, projectId);
          return;
        }
        if (scoped === 'fs') {
          fsCache = null;
          void remove(FILESYSTEMS, projectId);
          return;
        }
      }
      return nativeRemove.call(this, key);
    };
  }

  function queuePersistNotebook() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(async () => {
      if (!notebookCache) return;
      try { await writeNotebook(projectId, clone(notebookCache)); } catch (error) { console.warn('[Code Nest IndexedDB] notebook save failed', error); }
    }, 120);
  }

  function queuePersistFs() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(async () => {
      if (!fsCache) return;
      try { await writeFilesystem(projectId, fsCache); } catch (error) { console.warn('[Code Nest IndexedDB] filesystem save failed', error); }
    }, 120);
  }

  async function loadCaches() {
    let notebook = await readNotebook(projectId);
    let filesystem = await get(FILESYSTEMS, projectId);

    if (!notebook) {
      const scoped = readLocal(`${PREFIX}${projectId}.notebook`);
      const legacy = projectId === 'default' ? readLocal(OLD_NOTEBOOK_KEY) : null;
      const migrated = scoped && Array.isArray(scoped.cells) ? scoped : legacy && Array.isArray(legacy.cells) ? legacy : null;
      notebook = migrated || {
        title: (await get(PROJECTS, projectId))?.title || 'Untitled Project',
        cells: clone(starter)
      };
      await writeNotebook(projectId, notebook);
    }

    if (!filesystem) {
      const scoped = readLocal(`${PREFIX}${projectId}.fs`);
      const legacy = projectId === 'default' ? readLocal(OLD_FS_KEY) : null;
      const migrated = scoped && typeof scoped === 'object' ? scoped : legacy && typeof legacy === 'object' ? legacy : clone(DEFAULT_FS);
      await writeFilesystem(projectId, migrated);
      filesystem = { id: projectId, fs: migrated };
    }

    notebookCache = clone(notebook);
    fsCache = clone(filesystem.fs || DEFAULT_FS);
  }

  async function startStudio() {
    await migrateProjectsOnce();
    const meta = await ensureProject(projectId, params.get('name') || undefined);
    await loadCaches();
    installStorageBridge();

    let app = document.querySelector('script[data-code-nest-app-runtime]');
    if (!app) {
      app = document.createElement('script');
      app.src = `${APP_SCRIPT}?idb=51`;
      app.dataset.codeNestAppRuntime = '1';
      document.body.appendChild(app);
    }

    const waitForApp = () => {
      if (appStarted) return;
      if (typeof window.addCell !== 'function' && typeof window.runCodeCell !== 'function') {
        requestAnimationFrame(waitForApp);
        return;
      }
      appStarted = true;
      const input = document.getElementById('titleInput');
      if (input && meta?.title) input.value = meta.title;
      const crumb = document.getElementById('crumbTitle');
      if (crumb) crumb.textContent = meta?.title || notebookCache?.title || 'Untitled Project';
      if (input && !input.dataset.codeNestIDBTitle) {
        input.dataset.codeNestIDBTitle = '1';
        input.addEventListener('input', () => {
          const clean = input.value.trim() || 'Untitled Project';
          if (notebookCache) notebookCache.title = clean;
          clearTimeout(input.__idbTimer);
          input.__idbTimer = setTimeout(() => {
            void writeNotebook(projectId, clone(notebookCache || { title: clean, cells: [] }));
          }, 160);
          if (crumb) crumb.textContent = clean;
        });
      }
      wireDashboardBrand();
      console.log('[Code Nest IndexedDB] Studio ready', { projectId, metaTitle: meta?.title });
    };
    requestAnimationFrame(waitForApp);
  }

  function wireDashboardBrand() {
    const brand = document.querySelector('.sidebar .brand');
    if (!brand || brand.dataset.idbDashboard) return;
    brand.dataset.idbDashboard = '1';
    brand.href = './dashboard.html';
  }

  globalThis.CodeNestDB = {
    DB_NAME,
    ready: openDb().then(async () => { await migrateProjectsOnce(); return true; }),
    listProjects,
    getProject: (id) => get(PROJECTS, id),
    getNotebook: readNotebook,
    getFilesystem: async (id) => get(FILESYSTEMS, id),
    createProject: async (title) => {
      const projects = await listProjects();
      const id = `p_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
      const now = Date.now();
      const meta = { id, title: String(title || '').trim() || 'Untitled Project', createdAt: now, updatedAt: now, order: projects.length };
      await put(PROJECTS, meta);
      await put(NOTEBOOKS, { id, title: meta.title, cells: clone(starter), updatedAt: now });
      await put(FILESYSTEMS, { id, fs: clone(DEFAULT_FS), updatedAt: now });
      return meta;
    },
    renameProject,
    deleteProject,
    reorderProjects: async (ordered) => {
      for (let index = 0; index < ordered.length; index++) {
        const item = await get(PROJECTS, ordered[index].id);
        if (item) await put(PROJECTS, { ...item, order: index });
      }
    }
  };

  if (inStudio) {
    void startStudio().catch((error) => console.error('[Code Nest IndexedDB] Studio startup failed', error));
  }
})();
