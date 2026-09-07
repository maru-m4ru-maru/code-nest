// Code Nest runtime loader V0.4.1
(() => {
  'use strict';

  // Preview is isolated in preview-v4.js. Share is isolated in share-v4.js.
  // Legacy functionality remains untouched.
  if (!document.querySelector('script[data-code-nest-preview-v4]')) {
    document.write('<script src="preview-v4.js?v=40" data-code-nest-preview-v4><\\/script>');
  }
  if (!document.querySelector('script[data-code-nest-share-v4]')) {
    document.write('<script src="share-v4.js?v=41" data-code-nest-share-v4><\\/script>');
  }

  function setVersion() {
    document.querySelectorAll('.sidebar-footer span').forEach((el) => {
      if (/^V0\.3\.\d+$/i.test(el.textContent.trim()) || /^V0\.4\.\d+$/i.test(el.textContent.trim())) {
        el.textContent = 'V0.4.1';
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setVersion, { once: true });
  } else {
    setVersion();
  }

  console.log('[Code Nest] runtime loader V0.4.1 ready');
})();
