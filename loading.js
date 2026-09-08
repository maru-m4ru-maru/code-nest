// Code Nest runtime loader V0.6.3
(() => {
  'use strict';

  if (!document.querySelector('script[data-code-nest-preview-v4]')) {
    document.write('<script src="preview-v4.js?v=42" data-code-nest-preview-v4><\\/script>');
  }

  if (!document.querySelector('script[data-code-nest-cells-sandbox]')) {
    document.write('<script src="cell-sandbox.js?v=49" data-code-nest-cells-sandbox><\\/script>');
  }

  if (!document.querySelector('script[data-code-nest-project-idb]')) {
    document.write('<script src="project-idb.js?v=60" data-code-nest-project-idb><\\/script>');
  }
  if (!document.querySelector('script[data-code-nest-project-idb-runtime]')) {
    document.write('<script src="project-idb-runtime.js?v=60" data-code-nest-project-idb-runtime><\\/script>');
  }

  function loadDirectNotebookStore() {
    if (document.querySelector('script[data-code-nest-project-notebook]')) return;
    const script = document.createElement('script');
    script.src = 'project-notebook.js?v=61';
    script.dataset.codeNestProjectNotebook = '1';
    document.body.appendChild(script);
  }

  function setVersion() {
    document.querySelectorAll('.sidebar-footer span').forEach((el) => {
      if (/^V0\.3\.\d+$/i.test(el.textContent.trim()) || /^V0\.4\.\d+(?:\.\d+)?$/i.test(el.textContent.trim()) || /^V0\.5\.\d+(?:\.\d+)?$/i.test(el.textContent.trim()) || /^V0\.6\.\d+(?:\.\d+)?$/i.test(el.textContent.trim())) {
        el.textContent = 'V0.6.3';
      }
    });
  }

  function sharedPreviewUrl(url) {
    try {
      const share = new URL(url);
      const id = share.pathname.split('/').filter(Boolean).pop();
      if (!id) throw new Error('Share ID is missing');
      const safe = new URL('./shared-preview.html', location.href);
      safe.searchParams.set('id', id);
      return safe.href;
    } catch (_) {
      return new URL('./shared-preview.html', location.href).href;
    }
  }

  function shareSnapshot() {
    return {
      title: document.querySelector('#titleInput')?.value || 'Untitled Notebook',
      cells: [...document.querySelectorAll('.cell')].map((cell) => ({
        type: cell.dataset.type || 'code',
        name: cell.querySelector('.cell-name')?.value || '',
        source: cell.querySelector('textarea')?.value || '',
        output: cell.querySelector('.output')?.textContent || cell.querySelector('.terminal-output')?.textContent || ''
      }))
    };
  }

  async function runShareDirect(button) {
    const API = 'https://code-nest-worker.maru-0727.workers.dev';
    const original = button.innerHTML;
    button.disabled = true;
    button.textContent = '⏳ 共有中…';
    try {
      const data = shareSnapshot();
      if (!data.cells.length) throw new Error('共有するセルがありません');
      const response = await fetch(`${API}/share`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data)
      });
      if (!response.ok) {
        const detail = await response.text().catch(() => '');
        throw new Error(detail || `Share failed (${response.status})`);
      }
      const result = await response.json();
      if (!result.url) throw new Error('Worker did not return a share URL');
      const base = result.url;
      const codeUrl = `${base}${base.includes('?') ? '&' : '?'}view=code`;
      const previewUrl = sharedPreviewUrl(base);
      document.querySelector('#shareV43Result')?.remove();
      const box = document.createElement('div');
      box.id = 'shareV43Result';
      box.style.cssText = 'position:fixed;inset:0;z-index:2147483001;display:grid;place-items:center;background:rgba(15,18,30,.45);backdrop-filter:blur(8px);padding:20px';
      box.innerHTML = `<div style="width:min(640px,100%);background:#fff;color:#111827;border-radius:20px;padding:22px;box-shadow:0 24px 90px rgba(0,0,0,.3)">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:12px"><strong style="font-size:20px">Share your project</strong><button type="button" id="shareV43Close" style="border:0;background:none;font-size:26px;cursor:pointer">×</button></div>
        <p style="margin:6px 0 16px;color:#64748b;font-size:12px">共有URLを作成しました。プレビューは安全確認画面を経由します。</p>
        <label style="display:block;font-size:11px;font-weight:700;margin-top:10px">CODE<input readonly value="${codeUrl.replace(/"/g,'&quot;')}" style="display:block;width:100%;box-sizing:border-box;margin-top:5px;padding:10px;border:1px solid #ddd;border-radius:10px"></label>
        <label style="display:block;font-size:11px;font-weight:700;margin-top:10px">PREVIEW<input readonly value="${previewUrl.replace(/"/g,'&quot;')}" style="display:block;width:100%;box-sizing:border-box;margin-top:5px;padding:10px;border:1px solid #ddd;border-radius:10px"></label>
        <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:16px"><button type="button" id="shareV43Code" style="padding:9px 12px;border:1px solid #ddd;border-radius:10px;background:#fff;cursor:pointer">コードを開く</button><button type="button" id="shareV43Preview" style="padding:9px 12px;border:1px solid #ddd;border-radius:10px;background:#fff;cursor:pointer">プレビューを開く</button></div>
      </div>`;
      document.body.appendChild(box);
      box.querySelector('#shareV43Close').onclick = () => box.remove();
      box.querySelector('#shareV43Code').onclick = () => window.open(codeUrl, '_blank', 'noopener,noreferrer');
      box.querySelector('#shareV43Preview').onclick = () => window.open(previewUrl, '_blank', 'noopener,noreferrer');
      box.addEventListener('click', (event) => { if (event.target === box) box.remove(); });
      button.textContent = '✓ 共有済み';
    } catch (error) {
      console.error('[Code Nest Share V0.6.3] FAILED', error);
      alert(`共有に失敗しました\n${error?.message || error}`);
      button.innerHTML = original;
    } finally {
      setTimeout(() => {
        button.disabled = false;
        if (button.textContent === '⏳ 共有中…' || button.textContent === '✓ 共有済み') button.innerHTML = original;
      }, 1200);
    }
  }

  document.addEventListener('click', (event) => {
    const button = event.target?.closest?.('#shareBtn');
    if (!button) return;
    event.preventDefault(); event.stopPropagation(); event.stopImmediatePropagation();
    runShareDirect(button);
  }, true);

  // Studio per-cell Preview must preview by file type.
  // app.js routes the generic preview action through runCodeCell(),
  // which is correct for HTML/CSS/JS execution but sends Python files
  // to the Python runner. Capture the preview click first and route it
  // explicitly without replacing the existing app.js implementation.
  document.addEventListener('click', (event) => {
    const button = event.target?.closest?.('.cell .preview-icon');
    if (!button) return;

    const cell = button.closest('.cell');
    if (!cell || cell.dataset.type !== 'code') return;

    const name = (cell.querySelector('.cell-name')?.value || 'cell.py').trim().toLowerCase();
    const source = cell.querySelector('textarea')?.value || '';

    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();

    if (!source.trim()) {
      if (typeof window.showToast === 'function') window.showToast('プレビューするコードがありません');
      return;
    }

    if (name.endsWith('.html') || name.endsWith('.htm')) {
      if (typeof window.previewCodeCell === 'function') {
        window.previewCodeCell(cell);
      } else if (window.CodeNestPreviewV4?.open) {
        window.CodeNestPreviewV4.open('studio');
      }
      return;
    }

    if (name.endsWith('.css')) {
      if (typeof window.previewAssetCell === 'function') window.previewAssetCell(cell, 'css');
      else if (typeof window.showToast === 'function') window.showToast('CSSプレビュー機能を読み込めませんでした');
      return;
    }

    if (name.endsWith('.js') || name.endsWith('.mjs')) {
      if (typeof window.previewAssetCell === 'function') window.previewAssetCell(cell, 'js');
      else if (typeof window.showToast === 'function') window.showToast('JavaScriptプレビュー機能を読み込めませんでした');
      return;
    }

    if (typeof window.showToast === 'function') {
      window.showToast('プレビューはHTML / CSS / JavaScriptセルに対応しています');
    }
  }, true);

  async function runAllDirect(button) {
    if (!button || button.dataset.runAllBusy === '1') return;
    const codeCells = [...document.querySelectorAll('.cell[data-type="code"]')];
    if (!codeCells.length) {
      if (typeof window.showToast === 'function') window.showToast('実行するコードセルがありません');
      return;
    }
    button.dataset.runAllBusy = '1';
    const original = button.innerHTML;
    button.disabled = true; button.textContent = '⏳ 実行中…';
    try {
      for (const cell of codeCells) {
        if (typeof window.runCodeCell !== 'function') throw new Error('runCodeCell is not available');
        await window.runCodeCell(cell);
      }
      if (typeof window.showToast === 'function') window.showToast('コードセルをすべて実行しました');
    } catch (error) {
      console.error('[Code Nest RunAll V0.6.3] FAILED', error);
      if (typeof window.showToast === 'function') window.showToast('すべて実行中にエラーが発生しました');
    } finally {
      button.disabled = false; button.dataset.runAllBusy = '0'; button.innerHTML = original;
    }
  }

  document.addEventListener('click', (event) => {
    const button = event.target?.closest?.('#runAllBtn');
    if (!button) return;
    event.preventDefault(); event.stopPropagation(); event.stopImmediatePropagation();
    runAllDirect(button);
  }, true);

  const boot = () => {
    setVersion();
    loadDirectNotebookStore();
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();

  console.log('[Code Nest] runtime loader V0.6.3 ready');
})();