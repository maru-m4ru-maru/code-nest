/* Code Nest preview recovery V0.3.10 */
(() => {
  'use strict';

  let previewUrl = null;

  const $ = (s, root = document) => root.querySelector(s);
  const $$ = (s, root = document) => [...root.querySelectorAll(s)];

  function toast(message) {
    if (typeof window.showToast === 'function') {
      window.showToast(message);
      return;
    }
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
    return (cell.querySelector('.cell-name')?.value || '').trim();
  }

  function isWebName(name) {
    return /\.(?:html?|css|m?js)$/i.test(name);
  }

  function collectFiles() {
    const files = new Map();
    $$('.cell[data-type="code"]').forEach(cell => {
      const raw = currentName(cell).replace(/^\/+/, '');
      if (!raw) return;
      const path = '/' + raw.split('/').filter(Boolean).join('/');
      files.set(path, {
        path,
        source: cell.querySelector('textarea')?.value || ''
      });
    });
    return files;
  }

  function resolvePath(fromFile, target) {
    const value = String(target || '').trim();
    if (!value || /^(?:https?:|data:|blob:|javascript:|mailto:|#)/i.test(value)) return null;

    const baseParts = String(fromFile || '/').split('/').filter(Boolean);
    baseParts.pop();
    const rawParts = (value.startsWith('/') ? value : '/' + baseParts.concat(value).join('/')).split('/');
    const out = [];
    for (const part of rawParts) {
      if (!part || part === '.') continue;
      if (part === '..') out.pop();
      else out.push(part);
    }
    return '/' + out.join('/');
  }

  function escapeInlineScript(source) {
    return source.replace(/<\/script/gi, '<\\/script');
  }

  function buildPreviewDocument() {
    const files = collectFiles();
    const html = [...files.values()].find(f => /\.html?$/i.test(f.path));

    if (!html) {
      return '<!doctype html><html><body style="font-family:system-ui,sans-serif;padding:24px"><h2>Code Nest Preview</h2><p>HTMLファイル（例: index.html）を追加してください。</p></body></html>';
    }

    const doc = new DOMParser().parseFromString(html.source, 'text/html');
    const missing = [];

    // Inline project CSS files referenced by relative <link href="...">.
    $$('link[href]', doc).forEach(link => {
      const target = resolvePath(html.path, link.getAttribute('href'));
      const file = target && files.get(target);
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

    // Inline project JavaScript files referenced by relative <script src="...">.
    $$('script[src]', doc).forEach(script => {
      const target = resolvePath(html.path, script.getAttribute('src'));
      const file = target && files.get(target);
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

    // Keep external URLs intact, but make local project links work whenever possible.
    $$('[src],[href]', doc).forEach(el => {
      const attr = el.hasAttribute('src') ? 'src' : 'href';
      const value = el.getAttribute(attr);
      const target = resolvePath(html.path, value);
      const file = target && files.get(target);
      if (!file) return;

      if (attr === 'href' && /\.(?:html?|htm)$/i.test(file.path)) {
        // Prevent the preview from escaping to a non-existent project URL.
        el.setAttribute(attr, '#');
      }
    });

    const note = missing.length
      ? '<script>console.warn("Code Nest preview: missing project files", ' + JSON.stringify([...new Set(missing)]) + ');</script>'
      : '';

    return '<!doctype html>' + doc.documentElement.outerHTML.replace('</body>', note + '</body>');
  }

  function ensureModal() {
    let modal = $('#previewModal');
    if (modal) return modal;

    modal = document.createElement('div');
    modal.id = 'previewModal';
    modal.setAttribute('aria-hidden', 'true');
    modal.innerHTML = `
      <div data-preview-close class="preview-fix-backdrop"></div>
      <div class="preview-fix-window" role="dialog" aria-modal="true" aria-labelledby="previewFixTitle">
        <div class="preview-fix-head">
          <strong id="previewFixTitle">ブラウザプレビュー</strong>
          <button type="button" id="previewFixClose" aria-label="閉じる">×</button>
        </div>
        <div class="preview-fix-body"><iframe id="previewFrame" title="Code Nest Preview" sandbox="allow-scripts" referrerpolicy="no-referrer"></iframe></div>
      </div>`;

    const style = document.createElement('style');
    style.textContent = `
      #previewModal.preview-fix-visible{position:fixed;inset:0;z-index:50000;display:flex;align-items:center;justify-content:center;padding:24px;background:rgba(8,12,22,.55);backdrop-filter:blur(8px)}
      #previewModal.preview-fix-hidden{display:none}
      .preview-fix-window{width:min(1100px,96vw);height:min(760px,92vh);display:flex;flex-direction:column;background:#fff;border-radius:18px;overflow:hidden;box-shadow:0 30px 100px rgba(0,0,0,.35)}
      .preview-fix-head{height:52px;display:flex;align-items:center;justify-content:space-between;padding:0 14px 0 18px;border-bottom:1px solid #e5e7eb;font:600 14px system-ui,sans-serif}
      #previewFixClose{border:0;background:transparent;font-size:28px;line-height:1;cursor:pointer;padding:3px 8px}
      .preview-fix-body{flex:1;min-height:0;background:#fff}
      .preview-fix-body iframe{display:block;width:100%;height:100%;border:0;background:#fff}
    `;
    document.head.appendChild(style);
    document.body.appendChild(modal);
    modal.classList.add('preview-fix-hidden');

    $('#previewFixClose').addEventListener('click', closePreview);
    $('[data-preview-close]', modal).addEventListener('click', closePreview);
    return modal;
  }

  function openPreview() {
    const modal = ensureModal();
    const frame = $('#previewFrame', modal);
    const label = $('#previewLabel') || $('#previewFixTitle', modal);

    if (previewUrl) {
      try { URL.revokeObjectURL(previewUrl); } catch (_) {}
      previewUrl = null;
    }

    const html = buildPreviewDocument();
    previewUrl = URL.createObjectURL(new Blob([html], { type: 'text/html' }));
    frame.setAttribute('sandbox', 'allow-scripts');
    frame.setAttribute('referrerpolicy', 'no-referrer');
    frame.src = previewUrl;
    frame.dataset.previewUrl = previewUrl;

    modal.classList.remove('preview-fix-hidden');
    modal.classList.add('preview-fix-visible');
    modal.setAttribute('aria-hidden', 'false');
    if (label) label.textContent = 'ブラウザプレビュー';
  }

  function closePreview() {
    const modal = $('#previewModal');
    if (modal) {
      modal.classList.remove('preview-fix-visible');
      modal.classList.add('preview-fix-hidden');
      modal.setAttribute('aria-hidden', 'true');
    }
    const frame = $('#previewFrame');
    if (frame) frame.removeAttribute('src');
    if (previewUrl) {
      try { URL.revokeObjectURL(previewUrl); } catch (_) {}
      previewUrl = null;
    }
  }

  function isPreviewButton(button) {
    return button?.matches?.('button[data-act="run"],button[data-act="preview"]');
  }

  // Capture phase runs before app.js' per-cell click handler, so Preview cannot fall through to Python.
  document.addEventListener('click', event => {
    const button = event.target?.closest?.('button[data-act="run"],button[data-act="preview"]');
    if (!isPreviewButton(button)) return;

    const cell = button.closest('.cell');
    if (!cell || cell.dataset.type !== 'code') return;

    const name = currentName(cell);
    const action = button.dataset.act;

    if (action === 'preview') {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      if (!isWebName(name)) {
        toast('HTML / CSS / JS ファイルだけプレビューできます');
        return;
      }
      openPreview();
      return;
    }

    // Run button: web files preview, Python keeps the original executor.
    if (isWebName(name)) {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      openPreview();
    }
  }, true);

  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') closePreview();
  });

  // Re-apply the safe sandbox if the app recreates its iframe.
  new MutationObserver(() => {
    const frame = $('#previewFrame');
    if (frame) {
      frame.setAttribute('sandbox', 'allow-scripts');
      frame.setAttribute('referrerpolicy', 'no-referrer');
    }
  }).observe(document.documentElement, { childList: true, subtree: true });

  console.log('[Code Nest] Preview recovery V0.3.10 ready');
})();
