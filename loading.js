// Code Nest runtime loader V0.3.13
(() => {
  'use strict';

  if (!document.querySelector('script[data-code-nest-runtime-fix]')) {
    document.write('<script src="runtime-fix.js?v=13" data-code-nest-runtime-fix><\\/script>');
  }
  if (!document.querySelector('script[data-code-nest-preview-hotfix]')) {
    document.write('<script src="preview-hotfix.js?v=13" data-code-nest-preview-hotfix><\\/script>');
  }

  function setVersion() {
    document.querySelectorAll('.sidebar-footer span').forEach((el) => {
      if (/^V0\.3\.\d+$/i.test(el.textContent.trim())) el.textContent = 'V0.3.13';
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

  console.log('[Code Nest Preview] loader V0.3.13 ready');
})();
