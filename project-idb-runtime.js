/* Code Nest IndexedDB synchronous runtime bridge V0.5.4 */
(() => {
  'use strict';

  // app.js has a synchronous localStorage API. IndexedDB is asynchronous, so
  // project-idb.js prepares a per-project session cache during the first load.
  // On every subsequent load this tiny bridge must be installed BEFORE app.js.
  const params = new URLSearchParams(location.search);
  const projectId = (params.get('project') || 'default').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 80) || 'default';
  const CACHE_PREFIX = '__codeNestIDB.';
  const notebookKey = `${CACHE_PREFIX}${projectId}.notebook`;
  const fsKey = `${CACHE_PREFIX}${projectId}.fs`;

  function read(key) {
    try {
      const raw = sessionStorage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    } catch (_) {
      return null;
    }
  }

  const notebook = read(notebookKey);
  const filesystem = read(fsKey);
  if (!notebook || !filesystem || globalThis.__codeNestIDBStorageBridge) return;

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
          const next = JSON.parse(value);
          sessionStorage.setItem(notebookKey, JSON.stringify(next));
          globalThis.__codeNestIDBRuntimeNotebook = next;
        } catch (_) {}
        // project-idb.js owns the actual IndexedDB persistence queue.
        return;
      }
      if (key === 'code-nest-fs-v02') {
        try {
          const next = JSON.parse(value);
          sessionStorage.setItem(fsKey, JSON.stringify(next));
          globalThis.__codeNestIDBRuntimeFs = next;
        } catch (_) {}
        return;
      }
    }
    return nativeSet.call(this, key, value);
  };

  Storage.prototype.removeItem = function(key) {
    if (this === localStorage) {
      if (key === 'code-nest-v02') {
        sessionStorage.removeItem(notebookKey);
        return;
      }
      if (key === 'code-nest-fs-v02') {
        sessionStorage.removeItem(fsKey);
        return;
      }
    }
    return nativeRemove.call(this, key);
  };

  globalThis.__codeNestIDBStorageBridge = true;
  console.log('[Code Nest IndexedDB] synchronous runtime bridge ready', { projectId });
})();
