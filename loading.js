// Code Nest runtime loader V0.3.10
(() => {
  'use strict';

  // runtime-fix must be loaded deterministically. It installs its click capture
  // handler before app.js' cell handlers get a chance to route Preview to Python.
  if (!document.querySelector('script[data-code-nest-runtime-fix]')) {
    document.write('<script src="runtime-fix.js?v=10" data-code-nest-runtime-fix><\\/script>');
  }

  function setVersion() {
    document.querySelectorAll('.sidebar-footer span').forEach((el) => {
      if (/^V0\.3\.\d+$/i.test(el.textContent.trim())) el.textContent = 'V0.3.10';
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

  console.log('[Code Nest] V0.3.10 runtime loader ready');
})();
