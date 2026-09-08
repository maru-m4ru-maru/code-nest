/* Code Nest Dashboard V0.5.2 */
(() => {
  'use strict';

  const root = document.getElementById('projects');
  const searchInput = document.getElementById('projectSearch');
  const sortSelect = document.getElementById('projectSort');
  const toast = document.getElementById('dashboardToast');
  const nameModal = document.getElementById('projectNameModal');
  const nameForm = document.getElementById('projectNameForm');
  const nameInput = document.getElementById('projectNameInput');
  const nameHeading = document.getElementById('projectNameHeading');
  const nameDescription = document.getElementById('projectNameDescription');
  const nameSubmit = document.getElementById('projectNameSubmit');
  const nameCancel = document.getElementById('projectNameCancel');
  let dragId = null;
  let nameMode = 'create';
  let renameProjectId = null;
  let projectList = [];

  const esc = (value) => String(value).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));

  function showToast(message) {
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add('show');
    clearTimeout(showToast.timer);
    showToast.timer = setTimeout(() => toast.classList.remove('show'), 1600);
  }

  function niceDate(ts) {
    try {
      return new Date(ts).toLocaleString('ja-JP', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    } catch (_) { return ''; }
  }

  function normalize(list) {
    return [...list]
      .filter((p) => p?.id)
      .sort((a, b) => (Number.isFinite(a.order) ? a.order : 999999) - (Number.isFinite(b.order) ? b.order : 999999) || (a.createdAt || 0) - (b.createdAt || 0))
      .map((p, index) => ({ ...p, order: index }));
  }

  async function refreshProjects() {
    projectList = normalize(await CodeNestDB.listProjects());
    return projectList;
  }

  async function cellCount(id) {
    try {
      const notebook = await CodeNestDB.getNotebook(id);
      return Array.isArray(notebook?.cells) ? notebook.cells.length : 0;
    } catch (_) { return 0; }
  }

  async function filteredList() {
    const query = String(searchInput?.value || '').trim().toLowerCase();
    let list = [...projectList];
    if (query) list = list.filter((p) => String(p.title || '').toLowerCase().includes(query));
    const sort = sortSelect?.value || 'order';
    if (sort === 'updated') list.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
    if (sort === 'name') list.sort((a, b) => String(a.title || '').localeCompare(String(b.title || ''), 'ja'));
    return list;
  }

  async function render() {
    const list = await filteredList();
    if (!projectList.length) {
      root.innerHTML = '<div class="empty"><strong>まだプロジェクトがありません</strong><span>「新しいプロジェクト」から最初のNotebookを作ろう。</span><br><button class="new" data-create-empty>＋ 新しいプロジェクト</button></div>';
      return;
    }
    if (!list.length) {
      root.innerHTML = '<div class="empty"><strong>見つかりませんでした</strong><span>プロジェクト名を変えて検索してみてください。</span></div>';
      return;
    }

    const counts = await Promise.all(list.map((p) => cellCount(p.id)));
    root.innerHTML = list.map((p, index) => {
      const title = p.title || 'Untitled Project';
      return `<article class="card" draggable="true" data-project="${esc(p.id)}">
        <button class="drag-handle" type="button" title="ドラッグして順序を変更" aria-label="${esc(title)}の順序を変更">⋮⋮</button>
        <div class="icon">CN</div>
        <div class="name" title="${esc(title)}">${esc(title)}</div>
        <div class="meta">最終更新 ${esc(niceDate(p.updatedAt || p.createdAt || Date.now()))}</div>
        <div class="stats"><span class="stat">${counts[index]} cells</span><span class="stat">IndexedDB</span></div>
        <div class="actions">
          <button class="open" data-open="${esc(p.id)}">開く</button>
          <button class="rename" data-rename="${esc(p.id)}">名前変更</button>
          <button class="del" data-delete="${esc(p.id)}">削除</button>
        </div>
      </article>`;
    }).join('') + '<div class="hint">⋮⋮ をドラッグしてプロジェクトの順序を変更できます。順序とデータはIndexedDBに保存されます。</div>';
    bindDrag();
  }

  function closeNameDialog() {
    if (!nameModal) return;
    nameModal.hidden = true;
    if (nameInput) nameInput.value = '';
    renameProjectId = null;
  }

  function openNameDialog(mode, project) {
    nameMode = mode;
    renameProjectId = project?.id || null;
    const isRename = mode === 'rename';
    nameHeading.textContent = isRename ? 'プロジェクト名を変更' : '新しいプロジェクト';
    nameDescription.textContent = isRename ? '新しい名前を入力してください。' : 'プロジェクト名を入力してください。';
    nameInput.value = isRename ? (project?.title || '') : '';
    nameSubmit.textContent = isRename ? '変更' : '作成';
    nameModal.hidden = false;
    requestAnimationFrame(() => { nameInput.focus(); nameInput.select(); });
  }

  async function create(title) {
    const meta = await CodeNestDB.createProject(title);
    showToast('プロジェクトを作成しました');
    location.href = `./studio.html?project=${encodeURIComponent(meta.id)}`;
  }

  async function rename(id, title) {
    await CodeNestDB.renameProject(id, title);
    await refreshProjects();
    await render();
    showToast('プロジェクト名を変更しました');
  }

  async function removeProject(id) {
    const project = projectList.find((p) => p.id === id);
    if (!project) return;
    const title = project.title || 'Untitled Project';
    if (!window.confirm(`「${title}」を削除しますか？\nこのブラウザに保存されたプロジェクトデータも削除されます。`)) return;
    await CodeNestDB.deleteProject(id);
    await refreshProjects();
    await render();
    showToast('プロジェクトを削除しました');
  }

  function open(id) {
    location.href = `./studio.html?project=${encodeURIComponent(id)}`;
  }

  async function swapByDrag(fromId, toId) {
    if (!fromId || !toId || fromId === toId) return;
    const ordered = normalize(projectList);
    const from = ordered.findIndex((p) => p.id === fromId);
    const to = ordered.findIndex((p) => p.id === toId);
    if (from < 0 || to < 0) return;
    const [moved] = ordered.splice(from, 1);
    ordered.splice(to, 0, moved);
    ordered.forEach((p, index) => { p.order = index; });
    await CodeNestDB.reorderProjects(ordered);
    projectList = ordered;
    await render();
    showToast('並び順を保存しました');
  }

  function bindDrag() {
    root.querySelectorAll('.card[data-project]').forEach((card) => {
      card.addEventListener('dragstart', (event) => {
        dragId = card.dataset.project;
        card.classList.add('dragging');
        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData('text/plain', dragId);
      });
      card.addEventListener('dragend', () => {
        dragId = null;
        card.classList.remove('dragging');
        root.querySelectorAll('.drop-target').forEach((el) => el.classList.remove('drop-target'));
      });
      card.addEventListener('dragover', (event) => {
        event.preventDefault();
        if (card.dataset.project !== dragId) card.classList.add('drop-target');
        event.dataTransfer.dropEffect = 'move';
      });
      card.addEventListener('dragleave', () => card.classList.remove('drop-target'));
      card.addEventListener('drop', (event) => {
        event.preventDefault();
        card.classList.remove('drop-target');
        void swapByDrag(dragId || event.dataTransfer.getData('text/plain'), card.dataset.project);
      });
    });
  }

  nameForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const title = nameInput.value.trim();
    if (!title) { nameInput.focus(); return; }
    try {
      if (nameMode === 'rename' && renameProjectId) await rename(renameProjectId, title);
      else await create(title);
      closeNameDialog();
    } catch (error) {
      console.error('[Code Nest Dashboard] operation failed', error);
      showToast('保存に失敗しました');
    }
  });

  nameCancel?.addEventListener('click', closeNameDialog);
  nameModal?.addEventListener('click', (event) => { if (event.target === nameModal) closeNameDialog(); });
  document.addEventListener('keydown', (event) => { if (event.key === 'Escape' && nameModal && !nameModal.hidden) closeNameDialog(); });

  root.addEventListener('click', (event) => {
    const target = event.target;
    const openButton = target.closest('[data-open]');
    const renameButton = target.closest('[data-rename]');
    const deleteButton = target.closest('[data-delete]');
    const emptyCreate = target.closest('[data-create-empty]');
    if (openButton) return open(openButton.dataset.open);
    if (renameButton) {
      const project = projectList.find((p) => p.id === renameButton.dataset.rename);
      if (project) openNameDialog('rename', project);
      return;
    }
    if (deleteButton) { void removeProject(deleteButton.dataset.delete); return; }
    if (emptyCreate) { openNameDialog('create'); }
  });

  document.getElementById('newProject')?.addEventListener('click', () => openNameDialog('create'));
  document.getElementById('studioBtn')?.addEventListener('click', () => { location.href = './studio.html?project=default'; });
  searchInput?.addEventListener('input', () => void render());
  sortSelect?.addEventListener('change', () => void render());

  void (async () => {
    try {
      await CodeNestDB.ready;
      await refreshProjects();
      await render();
      console.log('[Code Nest Dashboard] V0.5.2 ready (IndexedDB)');
    } catch (error) {
      console.error('[Code Nest Dashboard] startup failed', error);
      root.innerHTML = '<div class="empty"><strong>プロジェクトを読み込めませんでした</strong><span>IndexedDBが利用できる環境で再読み込みしてください。</span></div>';
    }
  })();
})();
