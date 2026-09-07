/* Code Nest runtime recovery V0.3.9 */
(() => {
  'use strict';

  const $ = (s) => document.querySelector(s);
  const $$ = (s) => [...document.querySelectorAll(s)];
  let previewUrl = null;

  function toast(message) {
    if (typeof window.showToast === 'function') {
      window.showToast(message);
      return;
    }
    let el = $('#runtimeFixToast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'runtimeFixToast';
      el.style.cssText = 'position:fixed;left:50%;bottom:54px;transform:translateX(-50%);z-index:20000;padding:9px 13px;border-radius:10px;background:#111827;color:#fff;font:12px system-ui,sans-serif;pointer-events:none;opacity:0;transition:opacity .18s';
      document.body.appendChild(el);
    }
    el.textContent = message;
    el.style.opacity = '1';
    clearTimeout(el._timer);
    el._timer = setTimeout(() => { el.style.opacity = '0'; }, 1600);
  }

  function fileName(cell) {
    return (cell?.querySelector('.cell-name')?.value || 'cell.py').trim().toLowerCase();
  }

  function isWebFile(name) {
    return /\.(?:html?|css|m?js)$/i.test(name);
  }

  function projectFiles() {
    const files = new Map();
    $$('.cell[data-type="code"]').forEach((cell) => {
      const name = (cell.querySelector('.cell-name')?.value || '').trim().replace(/^\/+/, '');
      const source = cell.querySelector('textarea')?.value || '';
      if (!name) return;
      files.set('/' + name.split('/').filter(Boolean).join('/'), { path: '/' + name.split('/').filter(Boolean).join('/'), source });
    });
    return files;
  }

  function normalize(basePath, target) {
    const base = String(basePath || '/').split('/').filter(Boolean);
    base.pop();
    const raw = String(target || '');
    const parts = (raw.startsWith('/') ? raw : '/' + base.concat(raw).join('/')).split('/');
    const out = [];
    for (const p of parts) {
      if (!p || p === '.') continue;
      if (p === '..') out.pop();
      else out.push(p);
    }
    return '/' + out.join('/');
  }

  function buildHtml() {
    const files = projectFiles();
    const htmlFile = [...files.values()].find((f) => /\.html?$/i.test(f.path));
    if (!htmlFile) {
      return '<!doctype html><html><body style="font-family:system-ui;padding:24px"><h2>Code Nest Preview</h2><p>HTMLファイル（例: index.html）を追加してください。</p></body></html>';
    }

    const doc = new DOMParser().parseFromString(htmlFile.source, 'text/html');

    for (const link of doc.querySelectorAll('link[href]')) {
      const href = link.getAttribute('href');
      const path = normalize(htmlFile.path, href);
      const file = files.get(path);
      if (file && /\.css$/i.test(file.path)) {
        const style = doc.createElement('style');
        style.textContent = file.source;
        link.replaceWith(style);
      }
    }

    for (const script of doc.querySelectorAll('script[src]')) {
      const src = script.getAttribute('src');
      const path = normalize(htmlFile.path, src);
      const file = files.get(path);
      if (file && /\.m?js$/i.test(file.path)) {
        const inline = doc.createElement('script');
        if (/\.mjs$/i.test(file.path)) inline.type = 'module';
        inline.textContent = file.source.replace(/<\/(script)/gi, '<\\/$1');
        script.replaceWith(inline);
      }
    }

    return '<!doctype html>' + doc.documentElement.outerHTML;
  }

  function openPreview() {
    const frame = $('#previewFrame');
    const modal = $('#previewModal');
    if (!frame || !modal) {
      toast('プレビュー画面を読み込めませんでした');
      return;
    }
    if (previewUrl) {
      try { URL.revokeObjectURL(previewUrl); } catch (_) {}
    }
    previewUrl = URL.createObjectURL(new Blob([buildHtml()], { type: 'text/html' }));
    frame.src = previewUrl;
    frame.dataset.previewUrl = previewUrl;
    modal.classList.add('open');
    modal.setAttribute('aria-hidden', 'false');
    const label = $('#previewLabel');
    if (label) label.textContent = 'ブラウザプレビュー';
  }

  function closePreview() {
    const modal = $('#previewModal');
    if (modal) {
      modal.classList.remove('open');
      modal.setAttribute('aria-hidden', 'true');
    }
    if (previewUrl) {
      try { URL.revokeObjectURL(previewUrl); } catch (_) {}
      previewUrl = null;
    }
  }

  // Capture before app.js cell handlers: guarantees buttons work.
  document.addEventListener('click', (event) => {
    const button = event.target.closest?.('button[data-act="run"],button[data-act="preview"]');
    if (!button) return;
    const cell = button.closest('.cell');
    if (!cell) return;

    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();

    const action = button.dataset.act;
    const type = cell.dataset.type;
    if (action === 'preview') {
      if (type !== 'code') return toast('Markdown / Terminalはプレビュー対象ではありません');
      const name = fileName(cell);
      if (!isWebFile(name)) return toast('このファイル形式はプレビュー対象ではありません');
      openPreview();
      return;
    }

    if (type === 'code') {
      const name = fileName(cell);
      if (isWebFile(name)) {
        openPreview();
      } else if (typeof window.runPythonCell === 'function') {
        window.runPythonCell(cell);
      } else {
        toast('Python実行環境を読み込めませんでした');
      }
      return;
    }

    if (type === 'markdown' && typeof window.renderMarkdown === 'function') {
      window.renderMarkdown(cell);
    } else if (type === 'terminal' && typeof window.runTerminal === 'function') {
      window.runTerminal(cell);
    }
  }, true);

  // Reliable toolbar Share wiring.
  const shareButton = $('#shareBtn');
  if (shareButton && typeof window.CodeNestShare?.shareNotebook === 'function') {
    shareButton.addEventListener('click', async () => {
      if (shareButton.dataset.runtimeFixBound) return;
      shareButton.dataset.runtimeFixBound = '1';
      shareButton.disabled = true;
      const old = shareButton.innerHTML;
      shareButton.textContent = '⏳ 共有中…';
      try {
        const data = window.CodeNestShare.snapshotForShare();
        const url = await window.CodeNestShare.shareNotebook(data);
        const codeUrl = url + (url.includes('?') ? '&' : '?') + 'view=code';
        const previewShareUrl = url + (url.includes('?') ? '&' : '?') + 'view=preview';
        const box = document.createElement('div');
        box.style.cssText = 'position:fixed;inset:0;z-index:21000;display:grid;place-items:center;background:rgba(15,18,30,.45);backdrop-filter:blur(8px);padding:20px';
        box.innerHTML = `<div style="width:min(640px,100%);background:#fff;color:#111827;border-radius:20px;padding:22px;box-shadow:0 25px 90px rgba(0,0,0,.25)">
          <div style="display:flex;justify-content:space-between;align-items:center"><strong style="font-size:20px">Share your project</strong><button id="runtimeShareClose" style="border:0;background:none;font-size:24px;cursor:pointer">×</button></div>
          <p style="opacity:.65;font-size:12px">コードとプレビューのURLを作成しました。</p>
          <label style="display:block;margin-top:12px;font-size:11px;font-weight:700">CODE<input readonly value="${codeUrl.replace(/"/g,'&quot;')}" style="display:block;width:100%;box-sizing:border-box;margin-top:5px;padding:10px;border:1px solid #ddd;border-radius:10px"></label>
          <label style="display:block;margin-top:12px;font-size:11px;font-weight:700">PREVIEW<input readonly value="${previewShareUrl.replace(/"/g,'&quot;')}" style="display:block;width:100%;box-sizing:border-box;margin-top:5px;padding:10px;border:1px solid #ddd;border-radius:10px"></label>
          <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:16px"><button id="runtimeCodeOpen" style="padding:9px 12px;border:1px solid #ddd;border-radius:10px;background:#fff;cursor:pointer">コードを開く</button><button id="runtimePreviewOpen" style="padding:9px 12px;border:1px solid #ddd;border-radius:10px;background:#fff;cursor:pointer">プレビューを開く</button></div>
        </div>`;
        document.body.appendChild(box);
        $('#runtimeShareClose').onclick = () => box.remove();
        $('#runtimeCodeOpen').onclick = () => window.open(codeUrl, '_blank', 'noopener,noreferrer');
        $('#runtimePreviewOpen').onclick = () => window.open(previewShareUrl, '_blank', 'noopener,noreferrer');
      } catch (e) {
        console.error('[Code Nest Share]', e);
        toast('共有に失敗しました: ' + (e?.message || e));
      } finally {
        shareButton.disabled = false;
        shareButton.innerHTML = old;
        delete shareButton.dataset.runtimeFixBound;
      }
    }, true);
  }

  $('#previewClose')?.addEventListener('click', closePreview, true);
  document.addEventListener('click', (event) => {
    if (event.target.matches?.('[data-close="previewModal"]') || event.target.classList?.contains('modal-backdrop')) {
      if (event.target.closest?.('#previewModal')) closePreview();
    }
  }, true);
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') closePreview();
  });

  console.log('[Code Nest] runtime recovery V0.3.9 ready');
})();
