/* Code Nest Dashboard V0.4.9 */
(() => {
  'use strict';

  const META_KEY = 'codeNest.projects.v1';
  const PREFIX = 'codeNest.project.';
  const root = document.getElementById('projects');
  const searchInput = document.getElementById('projectSearch');
  const sortSelect = document.getElementById('projectSort');
  const toast = document.getElementById('dashboardToast');
  let dragId = null;

  const esc = (value) => String(value).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));

  function read() {
    try {
      const value = localStorage.getItem(META_KEY);
      const list = value ? JSON.parse(value) : [];
      return Array.isArray(list) ? list.filter(Boolean) : [];
    } catch (_) {
      return [];
    }
  }

  function write(list) {
    localStorage.setItem(META_KEY, JSON.stringify(list));
  }

  function orderValue(project, index) {
    return Number.isFinite(project.order) ? project.order : index;
  }

  function normalizeOrder(list) {
    return [...list]
      .sort((a, b) => orderValue(a, list.indexOf(a)) - orderValue(b, list.indexOf(b)))
      .map((project, index) => ({ ...project, order: index }));
  }

  function saveOrdered(list) {
    write(normalizeOrder(list));
  }

  function niceDate(ts) {
    try {
      return new Date(ts).toLocaleString('ja-JP', {
        year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
      });
    } catch (_) {
      return '';
    }
  }

  function projectNotebook(id) {
    try {
      const raw = localStorage.getItem(`${PREFIX}${id}.notebook`);
      const value = raw ? JSON.parse(raw) : null;
      return value && typeof value === 'object' ? value : null;
    } catch (_) {
      return null;
    }
  }

  function cellCount(id) {
    const notebook = projectNotebook(id);
    return Array.isArray(notebook?.cells) ? notebook.cells.length : 0;
  }

  function showToast(message) {
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add('show');
    clearTimeout(showToast.timer);
    showToast.timer = setTimeout(() => toast.classList.remove('show'), 1600);
  }

  function filteredList() {
    const query = String(searchInput?.value || '').trim().toLowerCase();
    let list = normalizeOrder(read());
    if (query) list = list.filter((p) => String(p.title || '').toLowerCase().includes(query));

    const sort = sortSelect?.value || 'order';
    if (sort === 'updated') list.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
    if (sort === 'name') list.sort((a, b) => String(a.title || '').localeCompare(String(b.title || ''), 'ja'));
    return list;
  }

  function render() {
    const list = filteredList();
    const total = read().length;

    if (!total) {
      root.innerHTML = '<div class="empty"><strong>まだプロジェクトがありません</strong><span>「新しいプロジェクト」から最初のNotebookを作ろう。</span><br><button class="new" data-create-empty>＋ 新しいプロジェクト</button></div>';
      return;
    }

    if (!list.length) {
      root.innerHTML = '<div class="empty"><strong>見つかりませんでした</strong><span>プロジェクト名を変えて検索してみてください。</span></div>';
      return;
    }

    const cards = list.map((p) => {
      const title = p.title || 'Untitled Project';
      const cells = cellCount(p.id);
      return `<article class="card" draggable="true" data-project="${esc(p.id)}">
        <button class="drag-handle" type="button" title="ドラッグして順序を変更" aria-label="${esc(title)}の順序を変更">⋮⋮</button>
        <div class="icon">CN</div>
        <div class="name" data-name="${esc(p.id)}" title="${esc(title)}">${esc(title)}</div>
        <div class="meta">最終更新 ${esc(niceDate(p.updatedAt || p.createdAt || Date.now()))}</div>
        <div class="stats"><span class="stat">${cells} cells</span><span class="stat">Local</span></div>
        <div class="actions">
          <button class="open" data-open="${esc(p.id)}">開く</button>
          <button class="rename" data-rename="${esc(p.id)}">名前変更</button>
          <button class="del" data-delete="${esc(p.id)}">削除</button>
        </div>
      </article>`;
    }).join('');

    root.innerHTML = cards + '<div class="hint">⋮⋮ をドラッグしてプロジェクトの順序を変更できます。順序はこのブラウザに保存されます。</div>';
    bindDrag();
  }

  function makeId() {
    return `p_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
  }

  function create() {
    const title = window.prompt('プロジェクト名を入力してください', 'Untitled Project');
    if (title === null) return;
    const clean = title.trim() || 'Untitled Project';
    const id = makeId();
    const list = normalizeOrder(read());
    const now = Date.now();
    list.push({ id, title: clean, createdAt: now, updatedAt: now, order: list.length });
    write(list);
    location.href = `./studio.html?project=${encodeURIComponent(id)}&name=${encodeURIComponent(clean)}`;
  }

  function rename(id) {
    const list = read();
    const project = list.find((p) => p.id === id);
    if (!project) return;
    const title = window.prompt('新しいプロジェクト名', project.title || 'Untitled Project');
    if (title === null) return;
    project.title = title.trim() || 'Untitled Project';
    project.updatedAt = Date.now();
    write(normalizeOrder(list));
    render();
    showToast('プロジェクト名を変更しました');
  }

  function remove(id) {
    const list = read();
    const project = list.find((p) => p.id === id);
    if (!project) return;
    const title = project.title || 'Untitled Project';
    if (!window.confirm(`「${title}」を削除しますか？\nこのブラウザに保存されたプロジェクトデータも削除されます。`)) return;
    write(normalizeOrder(list.filter((p) => p.id !== id)));
    localStorage.removeItem(`${PREFIX}${id}.notebook`);
    localStorage.removeItem(`${PREFIX}${id}.fs`);
    render();
    showToast('プロジェクトを削除しました');
  }

  function open(id) {
    location.href = `./studio.html?project=${encodeURIComponent(id)}`;
  }

  function swapByDrag(fromId, toId) {
    if (!fromId || !toId || fromId === toId) return;
    const list = normalizeOrder(read());
    const from = list.findIndex((p) => p.id === fromId);
    const to = list.findIndex((p) => p.id === toId);
    if (from < 0 || to < 0) return;
    const [moved] = list.splice(from, 1);
    list.splice(to, 0, moved);
    list.forEach((p, index) => { p.order = index; p.updatedAt = p.updatedAt || Date.now(); });
    write(list);
    render();
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
        root.querySelectorAll('.drop-target').forEach((el) => el.classList.remove('drop-target'));
        card.classList.remove('dragging');
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
        const fromId = dragId || event.dataTransfer.getData('text/plain');
        swapByDrag(fromId, card.dataset.project);
      });
    });
  }

  root.addEventListener('click', (event) => {
    const target = event.target;
    const openButton = target.closest('[data-open]');
    const renameButton = target.closest('[data-rename]');
    const deleteButton = target.closest('[data-delete]');
    const emptyCreate = target.closest('[data-create-empty]');
    if (openButton) return open(openButton.dataset.open);
    if (renameButton) return rename(renameButton.dataset.rename);
    if (deleteButton) return remove(deleteButton.dataset.delete);
    if (emptyCreate) return create();
  });

  document.getElementById('newProject')?.addEventListener('click', create);
  document.getElementById('studioBtn')?.addEventListener('click', () => { location.href = './studio.html'; });
  searchInput?.addEventListener('input', render);
  sortSelect?.addEventListener('change', render);

  // Persist the currently known order, adding order fields to projects made by older versions.
  saveOrdered(read());
  render();
  console.log('[Code Nest Dashboard] V0.4.9 ready');
})();
