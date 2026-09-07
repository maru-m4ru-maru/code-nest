/* Code Nest preview diagnostics V0.3.11 */
(() => {
  'use strict';

  const log = (...args) => console.log('[Code Nest Preview]', ...args);
  const warn = (...args) => console.warn('[Code Nest Preview]', ...args);
  const error = (...args) => console.error('[Code Nest Preview]', ...args);
  const $ = (s, root = document) => root.querySelector(s);
  const $$ = (s, root = document) => [...root.querySelectorAll(s)];
  let previewUrl = null;

  log('runtime-fix loaded', {
    readyState: document.readyState,
    previewModal: !!$('#previewModal'),
    previewFrame: !!$('#previewFrame'),
    codeCells: $$('.cell[data-type="code"]').length,
    href: location.href
  });

  function toast(message) {
    log('toast:', message);
    if (typeof window.showToast === 'function') return window.showToast(message);
    let el = $('#previewFixToast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'previewFixToast';
      el.style.cssText = 'position:fixed;left:50%;bottom:54px;transform:translateX(-50%);z-index:99999;padding:10px 14px;border-radius:10px;background:#111827;color:#fff;font:13px system-ui,sans-serif;box-shadow:0 8px 30px rgba(0,0,0,.25);pointer-events:none';
      document.body.appendChild(el);
    }
    el.textContent = message;
    clearTimeout(el._timer);
    el._timer = setTimeout(() => el.remove(), 1800);
  }

  function currentName(cell) {
    return (cell?.querySelector('.cell-name')?.value || '').trim();
  }

  function isWebName(name) { return /\.(?:html?|css|m?js)$/i.test(name); }

  function collectFiles() {
    const files = new Map();
    $$('.cell[data-type="code"]').forEach((cell, index) => {
      const raw = currentName(cell).replace(/^\/+/, '');
      const source = cell.querySelector('textarea')?.value || '';
      if (!raw) return;
      const path = '/' + raw.split('/').filter(Boolean).join('/');
      files.set(path, { path, source });
      log('file[' + index + ']', path, source.length + ' chars');
    });
    return files;
  }

  function resolvePath(fromFile, target) {
    const value = String(target || '').trim();
    if (!value || /^(?:https?:|data:|blob:|javascript:|mailto:|#)/i.test(value)) return null;
    const clean = value.split(/[?#]/, 1)[0];
    const baseParts = String(fromFile || '/').split('/').filter(Boolean);
    baseParts.pop();
    const rawParts = (clean.startsWith('/') ? clean : '/' + baseParts.concat(clean).join('/')).split('/');
    const out = [];
    for (const part of rawParts) {
      if (!part || part === '.') continue;
      if (part === '..') out.pop(); else out.push(part);
    }
    return '/' + out.join('/');
  }

  function escapeInlineScript(source) {
    return source.replace(/<\/script/gi, '<\\/script');
  }

  function buildPreviewDocument() {
    log('buildPreviewDocument START');
    const files = collectFiles();
    const htmlFiles = [...files.values()].filter(f => /\.html?$/i.test(f.path));
    const html = htmlFiles.find(f => /(^|\/)index\.html?$/i.test(f.path)) || htmlFiles[0];
    log('HTML candidates:', htmlFiles.map(f => f.path), 'selected:', html?.path || null);

    if (!html) {
      warn('No HTML file found');
      return '<!doctype html><html><body style="font-family:system-ui,sans-serif;padding:24px"><h2>Code Nest Preview</h2><p>HTMLファイル（例: index.html）を追加してください。</p></body></html>';
    }

    const doc = new DOMParser().parseFromString(html.source, 'text/html');
    const missing = [];

    $$('link[href]', doc).forEach(link => {
      const href = link.getAttribute('href');
      const target = resolvePath(html.path, href);
      const file = target && files.get(target);
      log('CSS ref:', href, '=>', target, file ? 'FOUND' : 'MISSING');
      if (!file) {
        if (target) missing.push(target);
        return;
      }
      if (!/\.css$/i.test(file.path)) return;
      const style = doc.createElement('style');
      style.setAttribute('data-code-nest-path', file.path);
      style.textContent = file.source;
      link.replaceWith(style);
    });

    $$('script[src]', doc).forEach(script => {
      const src = script.getAttribute('src');
      const target = resolvePath(html.path, src);
      const file = target && files.get(target);
      log('JS ref:', src, '=>', target, file ? 'FOUND' : 'MISSING');
      if (!file) {
        if (target) missing.push(target);
        return;
      }
      if (!/\.m?js$/i.test(file.path)) return;
      const inline = doc.createElement('script');
      if (/\.mjs$/i.test(file.path)) inline.type = 'module';
      inline.setAttribute('data-code-nest-path', file.path);
      inline.textContent = escapeInlineScript(file.source);
      script.replaceWith(inline);
    });

    if (missing.length) {
      warn('Missing project files:', [...new Set(missing)]);
    }

    const htmlText = '<!doctype html>' + doc.documentElement.outerHTML;
    log('buildPreviewDocument DONE', { bytes: htmlText.length, missing: [...new Set(missing)] });
    return htmlText;
  }

  function ensureModal() {
    let modal = $('#previewModal');
    if (modal) {
      log('using existing previewModal');
      return modal;
    }

    warn('previewModal missing; creating fallback modal');
    modal = document.createElement('div');
    modal.id = 'previewModal';
    modal.setAttribute('aria-hidden', 'true');
    modal.innerHTML = '<div data-preview-close class="preview-fix-backdrop"></div><div class="preview-fix-window" role="dialog" aria-modal="true"><div class="preview-fix-head"><strong>ブラウザプレビュー</strong><button type="button" id="previewFixClose">×</button></div><div class="preview-fix-body"><iframe id="previewFrame" title="Code Nest Preview" sandbox="allow-scripts" referrerpolicy="no-referrer"></iframe></div></div>';
    const style = document.createElement('style');
    style.textContent = '#previewModal.preview-fix-visible{position:fixed;inset:0;z-index:50000;display:flex;align-items:center;justify-content:center;padding:24px;background:rgba(8,12,22,.55)}#previewModal.preview-fix-hidden{display:none}.preview-fix-window{width:min(1100px,96vw);height:min(760px,92vh);display:flex;flex-direction:column;background:#fff;border-radius:18px;overflow:hidden;box-shadow:0 30px 100px rgba(0,0,0,.35)}.preview-fix-head{height:52px;display:flex;align-items:center;justify-content:space-between;padding:0 14px 0 18px}.preview-fix-body{flex:1;min-height:0}.preview-fix-body iframe{width:100%;height:100%;border:0}';
    document.head.appendChild(style);
    document.body.appendChild(modal);
    modal.classList.add('preview-fix-hidden');
    $('#previewFixClose', modal).addEventListener('click', () => closePreview('fallback close'));
    $('[data-preview-close]', modal).addEventListener('click', () => closePreview('fallback backdrop'));
    return modal;
  }

  function openPreview(source = 'unknown') {
    log('openPreview START', source);
    const modal = ensureModal();
    const frame = $('#previewFrame', modal);
    log('preview nodes', { modal: !!modal, frame: !!frame });
    if (!frame) {
      error('previewFrame missing after ensureModal');
      toast('プレビュー iframe がありません');
      return;
    }

    let html;
    try {
      html = buildPreviewDocument();
    } catch (e) {
      error('buildPreviewDocument FAILED', e);
      toast('プレビュー生成中にエラーが発生しました');
      return;
    }

    if (previewUrl) {
      try { URL.revokeObjectURL(previewUrl); } catch (e) { warn('old blob revoke failed', e); }
      previewUrl = null;
    }

    try {
      previewUrl = URL.createObjectURL(new Blob([html], { type: 'text/html' }));
    } catch (e) {
      error('createObjectURL FAILED', e);
      toast('プレビューURLを作れませんでした');
      return;
    }

    log('blob created', previewUrl, 'html bytes:', html.length);
    frame.onload = () => log('iframe LOAD', { src: frame.src });
    frame.onerror = e => error('iframe ERROR', e);
    frame.setAttribute('sandbox', 'allow-scripts');
    frame.setAttribute('referrerpolicy', 'no-referrer');
    frame.src = previewUrl;

    modal.classList.remove('preview-fix-hidden');
    modal.classList.add('preview-fix-visible');
    modal.setAttribute('aria-hidden', 'false');
    const label = $('#previewLabel') || $('#previewFixTitle', modal);
    if (label) label.textContent = 'ブラウザプレビュー';

    log('openPreview DONE', {
      modalClass: modal.className,
      ariaHidden: modal.getAttribute('aria-hidden'),
      iframeSrc: frame.src,
      iframeSandbox: frame.getAttribute('sandbox')
    });
  }

  function closePreview(source = 'unknown') {
    log('closePreview', source);
    const modal = $('#previewModal');
    if (modal) {
      modal.classList.remove('preview-fix-visible');
      modal.classList.add('preview-fix-hidden');
      modal.setAttribute('aria-hidden', 'true');
    }
    const frame = $('#previewFrame');
    if (frame) frame.removeAttribute('src');
    if (previewUrl) {
      try { URL.revokeObjectURL(previewUrl); } catch (e) { warn('revoke failed', e); }
      previewUrl = null;
    }
  }

  window.__codeNestPreviewDebug = {
    version: 'V0.3.11',
    open: () => openPreview('console command'),
    close: () => closePreview('console command'),
    inspect: () => {
      const info = {
        modal: !!$('#previewModal'),
        frame: !!$('#previewFrame'),
        codeCells: $$('.cell[data-type="code"]').length,
        files: [...collectFiles().keys()]
      };
      log('inspect()', info);
      return info;
    },
    build: () => buildPreviewDocument()
  };

  document.addEventListener('click', event => {
    const button = event.target?.closest?.('button[data-act="run"],button[data-act="preview"]');
    if (!button) return;
    const cell = button.closest('.cell');
    log('BUTTON CLICK', {
      action: button.dataset.act,
      cellFound: !!cell,
      cellType: cell?.dataset.type || null,
      cellName: cell ? currentName(cell) : null
    });
    if (!cell || cell.dataset.type !== 'code') return;

    const name = currentName(cell);
    const action = button.dataset.act;

    if (action === 'preview') {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      if (!isWebName(name)) {
        warn('Preview rejected non-web file:', name);
        toast('HTML / CSS / JS ファイルだけプレビューできます');
        return;
      }
      openPreview('cell preview button');
      return;
    }

    if (isWebName(name)) {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      openPreview('cell run button');
    }
  }, true);

  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') closePreview('Escape');
  });

  const observer = new MutationObserver(() => {
    const frame = $('#previewFrame');
    if (frame) {
      frame.setAttribute('sandbox', 'allow-scripts');
      frame.setAttribute('referrerpolicy', 'no-referrer');
    }
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });

  log('diagnostics READY', 'V0.3.11');
})();
