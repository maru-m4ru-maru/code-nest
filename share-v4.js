/* Code Nest Share V0.4.1 - reliable button binding */
(() => {
  'use strict';

  const API = 'https://code-nest-worker.maru-0727.workers.dev';
  const PREFIX = '[Code Nest Share V0.4]';
  const log = (...a) => console.log(PREFIX, ...a);
  const error = (...a) => console.error(PREFIX, ...a);

  function getButton() {
    return document.getElementById('shareBtn');
  }

  function snapshot() {
    const cells = [...document.querySelectorAll('.cell')].map((el) => ({
      type: el.dataset.type || 'code',
      name: el.querySelector('.cell-name')?.value || '',
      source: el.querySelector('textarea')?.value || '',
      output: el.querySelector('.output')?.textContent || el.querySelector('.terminal-output')?.textContent || ''
    }));
    return {
      title: document.getElementById('titleInput')?.value || 'Untitled Notebook',
      cells
    };
  }

  async function createShare(data) {
    log('POST /share START', { cells: data.cells.length });
    const res = await fetch(`${API}/share`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    log('POST /share RESPONSE', res.status);
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      throw new Error(detail || `Share failed (${res.status})`);
    }
    const result = await res.json();
    if (!result.url) throw new Error('Worker did not return a share URL');
    return result.url;
  }

  function closeResult(box) {
    box?.remove();
  }

  function showResult(url) {
    document.getElementById('shareV4Result')?.remove();
    const codeUrl = `${url}${url.includes('?') ? '&' : '?'}view=code`;
    const previewUrl = `${url}${url.includes('?') ? '&' : '?'}view=preview`;

    const box = document.createElement('div');
    box.id = 'shareV4Result';
    box.style.cssText = 'position:fixed;inset:0;z-index:2147482000;display:grid;place-items:center;background:rgba(15,18,30,.45);backdrop-filter:blur(8px);padding:20px';
    box.innerHTML = `<div style="width:min(640px,100%);background:#fff;color:#111827;border-radius:20px;padding:22px;box-shadow:0 24px 90px rgba(0,0,0,.3)">
      <div style="display:flex;justify-content:space-between;align-items:center"><strong style="font-size:20px">Share your project</strong><button type="button" id="shareV4Close">×</button></div>
      <p style="margin:6px 0 16px;color:#64748b;font-size:12px">共有URLを作成しました。</p>
      <label style="display:block;font-size:11px;font-weight:700;margin-top:10px">CODE<input readonly value="${codeUrl.replace(/"/g,'&quot;')}" style="display:block;width:100%;box-sizing:border-box;margin-top:5px;padding:10px;border:1px solid #ddd;border-radius:10px"></label>
      <label style="display:block;font-size:11px;font-weight:700;margin-top:10px">PREVIEW<input readonly value="${previewUrl.replace(/"/g,'&quot;')}" style="display:block;width:100%;box-sizing:border-box;margin-top:5px;padding:10px;border:1px solid #ddd;border-radius:10px"></label>
      <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:16px"><button type="button" id="shareV4Code">コードを開く</button><button type="button" id="shareV4Preview">プレビューを開く</button></div>
    </div>`;
    document.body.appendChild(box);
    box.querySelector('#shareV4Close').onclick = () => closeResult(box);
    box.querySelector('#shareV4Code').onclick = () => window.open(codeUrl, '_blank', 'noopener,noreferrer');
    box.querySelector('#shareV4Preview').onclick = () => window.open(previewUrl, '_blank', 'noopener,noreferrer');
    box.addEventListener('click', (e) => { if (e.target === box) closeResult(box); });
  }

  async function runShare(event) {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
    }

    const button = getButton();
    if (!button || button.dataset.shareBusy === '1') return;
    button.dataset.shareBusy = '1';
    const original = button.innerHTML;
    button.disabled = true;
    button.textContent = '⏳ 共有中…';
    log('START');

    try {
      const data = snapshot();
      log('SNAPSHOT', { title: data.title, cells: data.cells.length });
      if (!data.cells.length) throw new Error('共有するセルがありません');
      const url = await createShare(data);
      log('CREATED', url);
      showResult(url);
      button.textContent = '✓ 共有済み';
    } catch (e) {
      error('FAILED', e);
      alert(`共有に失敗しました\n${e?.message || e}`);
      button.innerHTML = original;
    } finally {
      setTimeout(() => {
        button.disabled = false;
        button.dataset.shareBusy = '0';
        button.innerHTML = original;
      }, 1500);
    }
  }

  let bound = false;

  function bind() {
    if (bound) return true;
    const button = getButton();
    if (!button) return false;

    bound = true;
    button.dataset.shareV4Bound = '1';
    button.addEventListener('click', runShare, true);
    log('BOUND DIRECT', button);
    return true;
  }

  // Direct binding when the toolbar is already present.
  if (!bind()) {
    document.addEventListener('DOMContentLoaded', bind, { once: true });
  }

  // Delegated capture fallback: survives unusual script/load timing.
  document.addEventListener('click', (event) => {
    const button = event.target?.closest?.('#shareBtn');
    if (!button) return;
    log('CLICK CAPTURE', { bound, buttonFound: true });
    bind();
    if (!button.dataset.shareDelegatedHandled) {
      button.dataset.shareDelegatedHandled = '1';
      runShare(event).finally(() => delete button.dataset.shareDelegatedHandled);
    }
  }, true);

  window.CodeNestShareV4 = Object.freeze({ snapshot, share: runShare });
  log('READY');
})();
