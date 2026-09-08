/* Code Nest Project Manager V0.5.0 */
(() => {
  'use strict';

  const META_KEY = 'codeNest.projects.v1';
  const params = new URLSearchParams(location.search);
  const projectId = (params.get('project') || 'default').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 80) || 'default';

  function readProjects() {
    try {
      const value = localStorage.getItem(META_KEY);
      const list = value ? JSON.parse(value) : [];
      return Array.isArray(list) ? list : [];
    } catch (_) {
      return [];
    }
  }

  function saveProjects(list) {
    try { localStorage.setItem(META_KEY, JSON.stringify(list)); } catch (_) {}
  }

  function touchCurrentProject() {
    const list = readProjects();
    const next = list.map((item) => item && item.id === projectId
      ? { ...item, updatedAt: Date.now() }
      : item
    );
    saveProjects(next);
  }

  function currentMeta() {
    return readProjects().find((item) => item && item.id === projectId) || null;
  }

  function updateMeta(patch) {
    const list = readProjects();
    const index = list.findIndex((item) => item && item.id === projectId);
    if (index < 0) return;
    list[index] = { ...list[index], ...patch, updatedAt: Date.now() };
    saveProjects(list);
  }

  function goDashboard(event) {
    event?.preventDefault?.();
    event?.stopPropagation?.();
    touchCurrentProject();
    window.location.assign('./dashboard.html');
  }

  function wire() {
    const brand = document.querySelector('.sidebar .brand');
    if (brand && !brand.dataset.projectDashboard) {
      brand.dataset.projectDashboard = '1';
      brand.setAttribute('role', 'link');
      brand.setAttribute('tabindex', '0');
      brand.setAttribute('aria-label', 'Code Nest Dashboardへ');
      brand.title = 'ダッシュボードへ';
      brand.style.cursor = 'pointer';
      brand.addEventListener('click', goDashboard);
      brand.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') goDashboard(event);
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
      const syncTitle = () => {
        clearTimeout(timer);
        timer = setTimeout(() => updateMeta({ title: titleInput.value.trim() || 'Untitled Project' }), 180);
      };
      const syncTitleNow = () => {
        clearTimeout(timer);
        updateMeta({ title: titleInput.value.trim() || 'Untitled Project' });
      };
      titleInput.addEventListener('input', syncTitle);
      titleInput.addEventListener('change', syncTitleNow);
      titleInput.addEventListener('blur', syncTitleNow);
    }
  }

  document.addEventListener('click', (event) => {
    const brand = event.target?.closest?.('.sidebar .brand');
    if (!brand) return;
    goDashboard(event);
  }, true);

  window.addEventListener('beforeunload', () => {
    const title = document.getElementById('titleInput');
    if (title) updateMeta({ title: title.value.trim() || 'Untitled Project' });
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', wire, { once: true });
  } else {
    wire();
  }

  console.log('[Code Nest Project Manager] V0.5.0 ready', { projectId });
})();
