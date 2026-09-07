/* Code Nest Share V0.4.1 - isolated from Preview */
(() => {
  'use strict';
  const API = 'https://code-nest-worker.maru-0727.workers.dev';
  const log = (...a) => console.log('[Code Nest Share V0.4]', ...a);
  const $ = (s) => document.querySelector(s);

  function snapshot() {
    return {
      title: $('#titleInput')?.value || 'Untitled Notebook',
      cells: [...document.querySelectorAll('.cell')].map((el) => ({
        type: el.dataset.type || 'code',
        name: el.querySelector('.cell-name')?.value || '',
        source: el.querySelector('textarea')?.value || '',
        output: el.querySelector('.output')?.textContent || el.querySelector('.terminal-output')?.textContent || ''
      }))
    };
  }

  async function createShare(data) {
    const res = await fetch(`${API}/share`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    if (!res.ok) throw new Error((await res.text().catch(() => '')) || `Share failed (${res.status})`);
    const result = await res.json();
    if (!result.url) throw new Error('Worker did not return a share URL');
    return result.url;
  }

  async function runShare() {
    const button = $('#shareBtn');
    if (!button || button.dataset.shareBusy === '1') return;
    button.dataset.shareBusy = '1';
    button.disabled = true;
    const original = button.innerHTML;
    button.textContent = '⏳ 共有中…';
    log('START');
    try {
      const data = snapshot();
      log('SNAPSHOT', data.cells.length);
      if (!data.cells.length) throw new Error('共有するセルがありません');
      const url = await createShare(data);
      log('CREATED', url);
      const codeUrl = `${url}${url.includes('?') ? '&' : '?'}view=code`;
      const previewUrl = `${url}${url.includes('?') ? '&' : '?'}view=preview`;
      const box = document.createElement('div');
      box.id = 'shareV4Result';
      box.style.cssText = 'position:fixed;inset:0;z-index:2147482000;display:grid;place-items:center;background:rgba(15,18,30,.45);backdrop-filter:blur(8px);padding:20px';
      box.innerHTML = `<div style="width:min(640px,100%);background:#fff;color:#111827;border-radius:20px;padding:22px;box-shadow:0 24px 90px rgba(0,0,0,.3)">
        <div style="display:flex;justify-content:space-between;align-items:center"><strong style="font-size:20px">Share your project</strong><button type="button" id="shareV4Close" style="border:0;background:none;font-size:26px;cursor:pointer">×</button></div>
        <p style="margin:6px 0 16px;color:#64748b;font-size:12px">共有URLを作成しました。</p>
        <label style="display:block;font-size:11px;font-weight:700;margin-top:10px">CODE<input readonly value="${codeUrl.replace(/"/g,'&quot;')}" style="display:block;width:100%;box-sizing:border-box;margin-top:5px;padding:10px;border:1px solid #ddd;border-radius:10px"></label>
        <label style="display:block;font-size:11px;font-weight:700;margin-top:10px">PREVIEW<input readonly value="${previewUrl.replace(/"/g,'&quot;')}" style="display:block;width:100%;box-sizing:border-box;margin-top:5px;padding:10px;border:1px solid #ddd;border-radius:10px"></label>
        <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:16px"><button type="button" id="shareV4Code" style="padding:9px 12px;border:1px solid #ddd;border-radius:10px;background:#fff;cursor:pointer">コードを開く</button><button type="button" id="shareV4Preview" style="padding:9px 12px;border:1px solid #ddd;border-radius:10px;background:#fff;cursor:pointer">プレビューを開く</button></div>
      </div>`;
      document.body.appendChild(box);
      $('#shareV4Close').onclick = () => box.remove();
      $('#shareV4Code').onclick = () => window.open(codeUrl, '_blank', 'noopener,noreferrer');
      $('#shareV4Preview').onclick = () => window.open(previewUrl, '_blank', 'noopener,noreferrer');
      box.addEventListener('click', (e) => { if (e.target === box) box.remove(); });
      button.textContent = '✓ 共有済み';
    } catch (e) {
      console.error('[Code Nest Share V0.4]', e);
      alert(`共有に失敗しました\n${e?.message || e}`);
      button.innerHTML = original;
    } finally {
      setTimeout(() => { button.disabled = false; button.dataset.shareBusy = '0'; if (button.textContent === '⏳ 共有中…' || button.textContent === '✓ 共有済み') button.innerHTML = original; }, 1200);
    }
  }

  function init() {
    const button = $('#shareBtn');
    if (!button) { log('share button not found'); return; }
    if (button.dataset.shareV4Bound === '1') return;
    button.dataset.shareV4Bound = '1';
    button.addEventListener('click', runShare);
    log('READY');
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
  window.CodeNestShareV4 = Object.freeze({ snapshot, share: runShare });
})();
