/* Code Nest Project Storage V0.4.8 */
(() => {
  'use strict';

  const META_KEY = 'codeNest.projects.v1';
  const OLD_NOTEBOOK_KEY = 'code-nest-v02';
  const OLD_FS_KEY = 'code-nest-fs-v02';
  const PROJECT_PREFIX = 'codeNest.project.';

  const params = new URLSearchParams(location.search);
  const rawId = params.get('project') || 'default';
  const projectId = rawId.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 80) || 'default';

  function scoped(type) {
    return `${PROJECT_PREFIX}${projectId}.${type}`;
  }

  function readJson(key, fallback) {
    try {
      const value = localStorage.getItem(key);
      return value ? JSON.parse(value) : fallback;
    } catch (_) {
      return fallback;
    }
  }

  function writeJson(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (error) {
      console.warn('[Code Nest Project Storage] write failed', error);
    }
  }

  function projects() {
    return readJson(META_KEY, []);
  }

  function saveProjects(list) {
    writeJson(META_KEY, Array.isArray(list) ? list : []);
  }

  function ensureMeta() {
    const list = projects();
    const now = Date.now();
    let meta = list.find((item) => item && item.id === projectId);

    if (!meta) {
      let title = 'Welcome to Code Nest';
      if (projectId !== 'default') {
        title = new URLSearchParams(location.search).get('name') || 'Untitled Project';
      }

      if (projectId === 'default' && localStorage.getItem(OLD_NOTEBOOK_KEY)) {
        title = readJson(OLD_NOTEBOOK_KEY, {}).title || title;
      }

      meta = {
        id: projectId,
        title,
        createdAt: now,
        updatedAt: now
      };
      list.push(meta);
      saveProjects(list);
    }

    return meta;
  }

  // Migrate the old single-project LocalStorage only into the default project.
  if (projectId === 'default') {
    if (!localStorage.getItem(scoped('notebook')) && localStorage.getItem(OLD_NOTEBOOK_KEY)) {
      const oldNotebook = localStorage.getItem(OLD_NOTEBOOK_KEY);
      localStorage.setItem(scoped('notebook'), oldNotebook);
    }
    if (!localStorage.getItem(scoped('fs')) && localStorage.getItem(OLD_FS_KEY)) {
      const oldFs = localStorage.getItem(OLD_FS_KEY);
      localStorage.setItem(scoped('fs'), oldFs);
    }
  }

  ensureMeta();

  const originalGetItem = Storage.prototype.getItem;
  const originalSetItem = Storage.prototype.setItem;
  const originalRemoveItem = Storage.prototype.removeItem;

  if (!globalThis.__codeNestProjectStorageWrapped) {
    Storage.prototype.getItem = function(key) {
      if (key === OLD_NOTEBOOK_KEY) return originalGetItem.call(this, scoped('notebook'));
      if (key === OLD_FS_KEY) return originalGetItem.call(this, scoped('fs'));
      return originalGetItem.call(this, key);
    };

    Storage.prototype.setItem = function(key, value) {
      if (key === OLD_NOTEBOOK_KEY) {
        originalSetItem.call(this, scoped('notebook'), value);
        return;
      }
      if (key === OLD_FS_KEY) {
        originalSetItem.call(this, scoped('fs'), value);
        return;
      }
      originalSetItem.call(this, key, value);
    };

    Storage.prototype.removeItem = function(key) {
      if (key === OLD_NOTEBOOK_KEY) {
        originalRemoveItem.call(this, scoped('notebook'));
        return;
      }
      if (key === OLD_FS_KEY) {
        originalRemoveItem.call(this, scoped('fs'));
        return;
      }
      originalRemoveItem.call(this, key);
    };

    globalThis.__codeNestProjectStorageWrapped = true;
  }

  globalThis.CodeNestProjects = {
    META_KEY,
    projectId,
    storageKeys: {
      notebook: scoped('notebook'),
      fs: scoped('fs')
    },
    getAll() {
      return projects();
    },
    getCurrent() {
      return ensureMeta();
    },
    upsert(meta) {
      const list = projects();
      const index = list.findIndex((item) => item && item.id === meta.id);
      if (index >= 0) list[index] = { ...list[index], ...meta, updatedAt: meta.updatedAt || Date.now() };
      else list.push({ ...meta, createdAt: meta.createdAt || Date.now(), updatedAt: meta.updatedAt || Date.now() });
      saveProjects(list);
      return list.find((item) => item && item.id === meta.id);
    },
    remove(id) {
      const list = projects().filter((item) => item && item.id !== id);
      saveProjects(list);
      try {
        localStorage.removeItem(`${PROJECT_PREFIX}${id}.notebook`);
        localStorage.removeItem(`${PROJECT_PREFIX}${id}.fs`);
      } catch (_) {}
    }
  };

  console.log('[Code Nest Project Storage] V0.4.8 ready', { projectId });
})();
