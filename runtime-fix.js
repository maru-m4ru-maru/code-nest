/* Code Nest preview core V0.3.14 */
(() => {
  'use strict';

  const log = (...a) => console.log('[Code Nest Preview]', ...a);
  const err = (...a) => console.error('[Code Nest Preview]', ...a);
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  let blobUrl = null;

  function nameOf(cell) {
    return (cell?.querySelector('.cell-name')?.value || '').trim();
  }

  function isWeb(name) {
    return /\.(?:html?|css|m?js)$/i.test(name);
  }

  function files() {
    const map = new Map();
    $$('.cell[data-type="code"]').forEach((cell, i) => {
      const raw = nameOf(cell).replace(/^\/+/, '');
      if (!raw) return;
      const path = '/' + raw.split('/').filter(Boolean).join('/');
      const source = cell.querySelector('textarea')?.value || '';
      map.set(path, { path, source });
      log('file', i, path, source.length + ' chars');
    });
    return map;
  }

  function resolve(from, target) {
    const v = String(target || '').trim();
    if (!v || /^(?:https?:|data:|blob:|javascript:|mailto:|#)/i.test(v)) return null;
    const clean = v.split(/[?#]/, 1)[0];
    const base = String(from || '/').split('/').filter(Boolean);
    base.pop();
    const parts = (clean.startsWith('/') ? clean : '/' + base.concat(clean).join('/')).split('/');
    const out = [];
    for (const p of parts) {
      if (!p || p === '.') continue;
      if (p === '..') out.pop(); else out.push(p);
    }
    return '/' + out.join('/');
  }

  function inlineScript(s) {
    return s.replace(/<\/script/gi, '<\\/script');
  }

  function build() {
    log('BUILD START');
    const map = files();
    const htmls = [...map.values()].filter(f => /\.html?$/i.test(f.path));
    const html = htmls.find(f => /(^|\/)index\.html?$/i.test(f.path)) || htmls[0];
    if (!html) return '<!doctype html><html><body><h2>Code Nest Preview</h2><p>HTMLファイルを追加してください。</p></body></html>';
    const doc = new DOMParser().parseFromString(html.source, 'text/html');

    $$('link[href]', doc).forEach(link => {
      const ref = link.getAttribute('href');
      const file = map.get(resolve(html.path, ref));
      log('CSS', ref, file ? 'FOUND' : 'MISS');
      if (!file || !/\.css$/i.test(file.path)) return;
      const style = doc.createElement('style');
      style.textContent = file.source;
      link.replaceWith(style);
    });

    $$('script[src]', doc).forEach(script => {
      const ref = script.getAttribute('src');
      const file = map.get(resolve(html.path, ref));
      log('JS', ref, file ? 'FOUND' : 'MISS');
      if (!file || !/\.m?js$/i.test(file.path)) return;
      const inline = doc.createElement('script');
      if (/\.mjs$/i.test(file.path)) inline.type = 'module';
      inline.textContent = inlineScript(file.source);
      script.replaceWith(inline);
    });

    const result = '<!doctype html>' + doc.documentElement.outerHTML;
    log('BUILD DONE', { bytes: result.length });
    return result;
  }

  function ensureVisible(modal) {
    modal.classList.add('open');
    modal.style.setProperty('display', 'flex', 'important');
    modal.style.setProperty('visibility', 'visible', 'important');
    modal.style.setProperty('opacity', '1', 'important');
    modal.style.setProperty('pointer-events', 'auto', 'important');
    modal.style.setProperty('z-index', '50000', 'important');
    modal.setAttribute('aria-hidden', 'false');
    const card = modal.querySelector('.preview-card');
    if (card) {
      card.style.setProperty('display', 'flex', 'important');
      card.style.setProperty('visibility', 'visible', 'important');
      card.style.setProperty('opacity', '1', 'important');
    }
    log('VISIBLE', {
      className: modal.className,
      display: getComputedStyle(modal).display,
      visibility: getComputedStyle(modal).visibility,
      opacity: getComputedStyle(modal).opacity,
      zIndex: getComputedStyle(modal).zIndex
    });
  }

  function openPreview(source) {
    const modal = $('#previewModal');
    const frame = $('#previewFrame');
    log('OPEN', source, { modal: !!modal, frame: !!frame });
    if (!modal || !frame) {
      err('PREVIEW DOM MISSING');
      return;
    }
    try {
      if (blobUrl) URL.revokeObjectURL(blobUrl);
      const html = build();
      blobUrl = URL.createObjectURL(new Blob([html], { type: 'text/html' }));
      frame.setAttribute('sandbox', 'allow-scripts');
      frame.setAttribute('referrerpolicy', 'no-referrer');
      frame.onload = () => log('IFRAME LOAD');
      frame.onerror = e => err('IFRAME ERROR', e);
      frame.src = blobUrl;
      ensureVisible(modal);
      requestAnimationFrame(() => ensureVisible(modal));
      setTimeout(() => ensureVisible(modal), 0);
      log('OPEN DONE', { src: frame.src });
    } catch (e) {
      err('OPEN FAILED', e);
    }
  }

  function closePreview() {
    const modal = $('#previewModal');
    if (modal) {
      modal.classList.remove('open');
      modal.style.removeProperty('display');
      modal.style.removeProperty('visibility');
      modal.style.removeProperty('opacity');
      modal.style.removeProperty('pointer-events');
      modal.setAttribute('aria-hidden', 'true');
    }
    const frame = $('#previewFrame');
    if (frame) frame.removeAttribute('src');
    if (blobUrl) {
      try { URL.revokeObjectURL(blobUrl); } catch {}
      blobUrl = null;
    }
  }

  document.addEventListener('click', e => {
    const b = e.target?.closest?.('button[data-act="preview"],button[data-act="run"]');
    if (!b) return;
    const cell = b.closest('.cell');
    log('BUTTON', { action: b.dataset.act, cell: !!cell, type: cell?.dataset.type, name: nameOf(cell) });
    if (!cell || cell.dataset.type !== 'code') return;
    if (!isWeb(nameOf(cell))) return;
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
    openPreview(b.dataset.act);
  }, true);

  $('#previewClose')?.addEventListener('click', closePreview, true);
  document.addEventListener('click', e => {
    if (e.target?.matches?.('[data-close="previewModal"]')) closePreview();
  }, true);
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') closePreview();
  });

  window.__codeNestPreviewDebug = { open: () => openPreview('console'), close: closePreview, build, inspect: () => ({ modal: !!$('#previewModal'), frame: !!$('#previewFrame'), cells: $$('.cell[data-type="code"]').length }) };
  log('CORE READY V0.3.14');
})();
