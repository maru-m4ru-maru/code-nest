/* Code Nest Preview V0.4.0 */
(() => {
  'use strict';

  const PREFIX = '[Code Nest Preview V0.4]';
  const log = (...args) => console.log(PREFIX, ...args);
  const warn = (...args) => console.warn(PREFIX, ...args);
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

  let activeUrl = null;
  let modal = null;

  function fileName(cell) {
    return (cell?.querySelector('.cell-name')?.value || '').trim();
  }

  function collectProject() {
    const files = new Map();
    $$('.cell[data-type="code"]').forEach((cell) => {
      const raw = fileName(cell).replace(/^\/+/, '');
      if (!raw) return;
      const clean = raw.split('/').filter(Boolean).join('/');
      if (!clean) return;
      const path = '/' + clean;
      files.set(path, {
        path,
        source: cell.querySelector('textarea')?.value || ''
      });
    });
    return files;
  }

  function resolvePath(fromFile, target) {
    const value = String(target || '').trim();
    if (!value) return null;
    if (/^(?:https?:|data:|blob:|javascript:|mailto:|tel:|#)/i.test(value)) return null;

    const clean = value.split(/[?#]/, 1)[0];
    const base = String(fromFile || '/').split('/').filter(Boolean);
    base.pop();

    const parts = (clean.startsWith('/')
      ? clean
      : '/' + base.concat(clean).join('/'))
      .split('/');

    const out = [];
    for (const part of parts) {
      if (!part || part === '.') continue;
      if (part === '..') out.pop();
      else out.push(part);
    }
    return '/' + out.join('/');
  }

  function escapeScript(source) {
    return String(source).replace(/<\/script/gi, '<\\/script');
  }

  function chooseHtml(files) {
    const html = [...files.values()].filter((file) => /\.html?$/i.test(file.path));
    return html.find((file) => /(^|\/)index\.html?$/i.test(file.path)) || html[0] || null;
  }

  function buildDocument() {
    log('BUILD START');
    const files = collectProject();
    const htmlFile = chooseHtml(files);

    log('PROJECT', [...files.keys()]);
    log('HTML', htmlFile?.path || null);

    if (!htmlFile) {
      return '<!doctype html><html lang="ja"><head><meta charset="utf-8"><title>Code Nest Preview</title></head><body style="font-family:system-ui,sans-serif;padding:32px"><h2>Code Nest Preview</h2><p>HTMLファイル（例: index.html）が必要です。</p></body></html>';
    }

    const doc = new DOMParser().parseFromString(htmlFile.source, 'text/html');
    const missing = [];

    // Project CSS -> inline <style>
    $$('link[href]', doc).forEach((link) => {
      const href = link.getAttribute('href');
      const target = resolvePath(htmlFile.path, href);
      const file = target && files.get(target);
      if (file && /\.css$/i.test(file.path)) {
        const style = doc.createElement('style');
        style.setAttribute('data-code-nest-project-file', file.path);
        style.textContent = file.source;
        link.replaceWith(style);
        log('CSS', href, '=>', target, 'OK');
      } else if (target) {
        missing.push(target);
        warn('CSS MISSING', href, '=>', target);
      }
    });

    // Project JS -> inline <script>
    $$('script[src]', doc).forEach((script) => {
      const src = script.getAttribute('src');
      const target = resolvePath(htmlFile.path, src);
      const file = target && files.get(target);
      if (file && /\.m?js$/i.test(file.path)) {
        const inline = doc.createElement('script');
        if (/\.mjs$/i.test(file.path)) inline.type = 'module';
        inline.setAttribute('data-code-nest-project-file', file.path);
        inline.textContent = escapeScript(file.source);
        script.replaceWith(inline);
        log('JS', src, '=>', target, 'OK');
      } else if (target) {
        missing.push(target);
        warn('JS MISSING', src, '=>', target);
      }
    });

    // Local HTML navigation: keep it inside the preview instead of trying to
    // request a GitHub Pages path that does not exist as a real file there.
    $$('[href]', doc).forEach((el) => {
      const href = el.getAttribute('href');
      const target = resolvePath(htmlFile.path, href);
      const file = target && files.get(target);
      if (file && /\.html?$/i.test(file.path)) {
        el.setAttribute('href', '#');
        el.addEventListener?.('click', (event) => event.preventDefault());
      }
    });

    const diagnostics = `\n<script>console.log('[Code Nest Preview V0.4] sandbox page loaded');${missing.length ? `console.warn('[Code Nest Preview V0.4] missing files', ${JSON.stringify([...new Set(missing)])});` : ''}</script>`;
    const html = '<!doctype html>' + doc.documentElement.outerHTML.replace(/<\/body>/i, diagnostics + '</body>');
    log('BUILD DONE', { bytes: html.length, missing: [...new Set(missing)] });
    return html;
  }

  function ensureModal() {
    if (modal && document.body.contains(modal)) return modal;

    modal = document.createElement('div');
    modal.id = 'codeNestPreviewV4';
    modal.setAttribute('aria-hidden', 'true');
    modal.innerHTML = `
      <div class="cnp4-backdrop" data-cnp4-close></div>
      <section class="cnp4-window" role="dialog" aria-modal="true" aria-labelledby="cnp4-title">
        <header class="cnp4-head">
          <div>
            <strong id="cnp4-title">ブラウザプレビュー</strong>
            <span>Code Nest V0.4</span>
          </div>
          <button type="button" class="cnp4-close" data-cnp4-close aria-label="閉じる">×</button>
        </header>
        <div class="cnp4-body">
          <iframe id="codeNestPreviewFrameV4" title="Code Nest V0.4 Preview" sandbox="allow-scripts" referrerpolicy="no-referrer"></iframe>
        </div>
        <footer class="cnp4-foot">
          <span id="cnp4-status">Ready</span>
          <button type="button" class="cnp4-btn" data-cnp4-close>閉じる</button>
        </footer>
      </section>`;

    const style = document.createElement('style');
    style.id = 'codeNestPreviewV4Style';
    style.textContent = `
      #codeNestPreviewV4{position:fixed!important;inset:0!important;z-index:2147483000!important;display:none!important;align-items:center!important;justify-content:center!important;padding:20px!important;box-sizing:border-box!important;visibility:visible!important;opacity:1!important}
      #codeNestPreviewV4.is-open{display:flex!important}
      #codeNestPreviewV4 .cnp4-backdrop{position:absolute!important;inset:0!important;background:rgba(8,12,22,.62)!important;backdrop-filter:blur(7px)!important}
      #codeNestPreviewV4 .cnp4-window{position:relative!important;width:min(1180px,96vw)!important;height:min(820px,92vh)!important;display:flex!important;flex-direction:column!important;background:#fff!important;color:#101727!important;border:1px solid rgba(0,0,0,.14)!important;border-radius:18px!important;overflow:hidden!important;box-shadow:0 30px 120px rgba(0,0,0,.4)!important}
      #codeNestPreviewV4 .cnp4-head{height:58px!important;flex:0 0 58px!important;display:flex!important;align-items:center!important;justify-content:space-between!important;padding:0 14px 0 18px!important;border-bottom:1px solid #e5e7eb!important;font:600 14px system-ui,sans-serif!important;background:#fff!important}
      #codeNestPreviewV4 .cnp4-head div{display:flex!important;flex-direction:column!important;gap:2px!important}
      #codeNestPreviewV4 .cnp4-head span{font:11px system-ui,sans-serif!important;color:#64748b!important}
      #codeNestPreviewV4 .cnp4-close{border:0!important;background:transparent!important;color:#334155!important;font-size:28px!important;line-height:1!important;cursor:pointer!important;padding:4px 8px!important;border-radius:8px!important}
      #codeNestPreviewV4 .cnp4-close:hover{background:#eef2f7!important}
      #codeNestPreviewV4 .cnp4-body{position:relative!important;flex:1 1 auto!important;min-height:0!important;background:#fff!important}
      #codeNestPreviewV4 iframe{display:block!important;width:100%!important;height:100%!important;border:0!important;background:#fff!important}
      #codeNestPreviewV4 .cnp4-foot{height:44px!important;flex:0 0 44px!important;display:flex!important;align-items:center!important;justify-content:space-between!important;padding:0 12px 0 16px!important;border-top:1px solid #e5e7eb!important;font:11px system-ui,sans-serif!important;color:#64748b!important;background:#fff!important}
      #codeNestPreviewV4 .cnp4-btn{border:1px solid #cbd5e1!important;background:#fff!important;color:#0f172a!important;border-radius:9px!important;padding:7px 11px!important;cursor:pointer!important}
    `;
    document.head.appendChild(style);
    document.body.appendChild(modal);

    $$('[data-cnp4-close]', modal).forEach((button) => button.addEventListener('click', closePreview));
    return modal;
  }

  function openPreview(source) {
    log('OPEN', source);
    const panel = ensureModal();
    const frame = $('#codeNestPreviewFrameV4', panel);
    const status = $('#cnp4-status', panel);

    if (activeUrl) {
      try { URL.revokeObjectURL(activeUrl); } catch (_) {}
      activeUrl = null;
    }

    let html;
    try {
      html = buildDocument();
      activeUrl = URL.createObjectURL(new Blob([html], { type: 'text/html;charset=utf-8' }));
    } catch (error) {
      console.error(PREFIX, 'OPEN FAILED', error);
      if (status) status.textContent = 'Preview error';
      return;
    }

    frame.onload = () => {
      log('IFRAME LOAD', frame.src);
      if (status) status.textContent = 'Loaded';
    };
    frame.onerror = (event) => {
      console.error(PREFIX, 'IFRAME ERROR', event);
      if (status) status.textContent = 'Iframe error';
    };
    frame.setAttribute('sandbox', 'allow-scripts');
    frame.setAttribute('referrerpolicy', 'no-referrer');
    frame.src = activeUrl;
    if (status) status.textContent = 'Loading…';

    panel.classList.add('is-open');
    panel.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
    log('VISIBLE', {
      className: panel.className,
      display: getComputedStyle(panel).display,
      zIndex: getComputedStyle(panel).zIndex,
      frame: !!frame,
      src: frame.src
    });
  }

  function closePreview() {
    if (!modal) return;
    log('CLOSE');
    modal.classList.remove('is-open');
    modal.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
    const frame = $('#codeNestPreviewFrameV4', modal);
    if (frame) frame.src = 'about:blank';
    if (activeUrl) {
      try { URL.revokeObjectURL(activeUrl); } catch (_) {}
      activeUrl = null;
    }
  }

  function isWebFile(name) {
    return /\.(?:html?|css|m?js)$/i.test(name);
  }

  document.addEventListener('click', (event) => {
    const button = event.target?.closest?.('button[data-act="preview"],button[data-act="run"]');
    if (!button) return;

    const cell = button.closest('.cell');
    if (!cell || cell.dataset.type !== 'code') return;

    const name = fileName(cell);
    const action = button.dataset.act;
    log('BUTTON', { action, name });

    if (action === 'preview') {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      if (!isWebFile(name)) {
        console.info(PREFIX, 'Preview ignored for non-web file:', name || '(unnamed)');
        return;
      }
      openPreview('preview button');
      return;
    }

    // Preserve normal Python execution. Only intercept Run for web files.
    if (action === 'run' && isWebFile(name)) {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      openPreview('run button');
    }
  }, true);

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') closePreview();
  });

  window.CodeNestPreviewV4 = Object.freeze({
    open: () => openPreview('console'),
    close: closePreview,
    inspect: () => ({
      modal: !!modal,
      open: !!modal?.classList.contains('is-open'),
      frame: !!$('#codeNestPreviewFrameV4'),
      files: [...collectProject().keys()]
    })
  });

  log('READY V0.4.0');
})();
