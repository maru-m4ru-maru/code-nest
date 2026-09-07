// Code Nest runtime loader V0.3.11
(() => {
  'use strict';

  // Parser-blocking load so the preview diagnostics click handler is installed
  // before app.js attaches its own cell click handler.
  if (!document.querySelector('script[data-code-nest-runtime-fix]')) {
    document.write('<script src="runtime-fix.js?v=11" data-code-nest-runtime-fix><\\/script>');
  }

  function setVersion() {
    document.querySelectorAll('.sidebar-footer span').forEach((el) => {
      if (/^V0\.3\.\d+$/i.test(el.textContent.trim())) el.textContent = 'V0.3.11';
    });
  }

  function hardenPreviewFrame() {
    const frame = document.getElementById('previewFrame');
    if (!frame) return;
    frame.setAttribute('sandbox', 'allow-scripts');
    frame.setAttribute('referrerpolicy', 'no-referrer');
    frame.setAttribute('allow', '');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      hardenPreviewFrame();
      setVersion();
    }, { once: true });
  } else {
    hardenPreviewFrame();
    setVersion();
  }

  new MutationObserver(() => hardenPreviewFrame())
    .observe(document.documentElement, { childList: true, subtree: true });

  console.log('[Code Nest Preview] loader V0.3.11 ready');
})();
