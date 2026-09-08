/* Code Nest Project Manager V0.4.8 */
(() => {
  'use strict';

  const META_KEY = 'codeNest.projects.v1';
  const params = new URLSearchParams(location.search);
  const projectId = params.get('project') || 'default';

  function readProjects() {
    try {
      const value = localStorage.getItem(META_KEY);
      const list = value ? JSON.parse(value) : [];
      return Array.isArray(list) ? list : [];
    } catch (_) {
      return [];
    }
  }

  function currentMeta() {
    return readProjects().find((item) => item && item.id === projectId) || null;
  }

  function updateMeta(patch) {
    try {
      const list = readProjects();
      const index = list.findIndex((item) => item && item.id === projectId);
      if (index < 0) return;
      list[index] = { ...list[index], ...patch, updatedAt: Date.now() };
      localStorage.setItem(META_KEY, JSON.stringify(list));
    } catch (error) {
      console.warn('[Code Nest Project Manager] metadata update failed', error);
    }
  }

  function wire() {
    const brand = document.querySelector('.sidebar .brand');
    if (brand && !brand.dataset.projectDashboard) {
      brand.dataset.projectDashboard = '1';
      brand.setAttribute('role', 'link');
      brand.setAttribute('tabindex', '0');
      brand.title = 'ダッシュボードへ';
      brand.style.cursor = 'pointer';
      const go = () => {
        try { localStorage.setItem(META_KEY, JSON.stringify(readProjects().map((item) => item.id === projectId ? { ...item, updatedAt: Date.now() } : item))); } catch (_) {}
        location.href = './dashboard.html';
      };
      brand.addEventListener('click', (event) => {
        event.preventDefault();
        go();
      });
      brand.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          go();
        }
      });
    }

    const titleInput = document.getElementById('titleInput');
    if (titleInput && !titleInput.dataset.projectManager) {
      titleInput.dataset.projectManager = '1';

      const meta = currentMeta();
      if (meta?.title) {
        titleInput.value = meta.title;
        const crumb = document.getElementById('crumbTitle');
        if (crumb) crumb.textContent = meta.title;
      }

      let timer = null;
      titleInput.addEventListener('input', () => {
        clearTimeout(timer);
        timer = setTimeout(() => updateMeta({ title: titleInput.value.trim() || 'Untitled Project' }), 250);
      });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', wire, { once: true });
  } else {
    wire();
  }

  console.log('[Code Nest Project Manager] V0.4.8 ready', { projectId });
})();
